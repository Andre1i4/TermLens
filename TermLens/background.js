// =================================================================
// TERMLENS ENGINE
// =================================================================

// OpenAI Configuration
const OPENAI_API_KEY = "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";
const HARDCODED_PROMPT = `You are a privacy "LIE DETECTOR" analyzing website terms and conditions against their actual behavior.

Your task:
1. Review what the Terms & Conditions CLAIM about data collection, selling, and third-party sharing.
2. Compare these claims against the ACTUAL TRACKING BEHAVIOR detected on the website.
3. Identify any CONTRADICTIONS or LIES where they say one thing but do another.
4. Rate the trustworthiness: TRUSTWORTHY, MISLEADING, or DECEPTIVE.

Respond in a clear, user‑friendly way using short paragraphs and bullet points. Start with a 1–2 sentence summary that a non‑technical person can understand, then give more detail.`;

const TRACKER_MAP = new Map([
    ["google-analytics.com", "Analytics"], ["googletagmanager.com", "Analytics"],
    ["googleadservices.com", "Ads"], ["doubleclick.net", "Ads"],
    ["facebook.net", "Social Tracking"], ["facebook.com/tr", "Pixel"],
    ["connect.facebook.net", "Social"], ["tiktok.com", "Social"],
    ["criteo.com", "Retargeting"], ["hotjar.com", "Screen Recording"]
    // ... (Lista ta completă rămâne aici)
]);

const TRACKING_PATTERN = /pixel_id=|session_id=|uid=|userid=|adv_id=|tracker_id=|\/collect\?|gclid=|fbclid=/i;
const BAD_COOKIES = ["_ga", "_fbp", "uid", "criteo", "datr"];

let tabStorage = {}; 
let saveTimers = {}; 

function getDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

function updateBadge(tabId) {
    if (tabStorage[tabId]) {
        const count = tabStorage[tabId].count;
        if (count > 0) {
            chrome.action.setBadgeText({ text: "!", tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: "#FF0000", tabId: tabId });
        } else {
            chrome.action.setBadgeText({ text: "✓", tabId: tabId });
            chrome.action.setBadgeBackgroundColor({ color: "#10b981", tabId: tabId });
        }
    }
}

function saveDataForPopup(tabId) {
    if (saveTimers[tabId]) clearTimeout(saveTimers[tabId]);
    saveTimers[tabId] = setTimeout(() => {
        if (tabStorage[tabId]) {
            chrome.storage.local.set({ ["stats_" + tabId]: tabStorage[tabId] });
            delete saveTimers[tabId];
        }
    }, 200);
}

chrome.webRequest.onBeforeRequest.addListener(
    function(details) {
        const tabId = details.tabId;
        if (tabId === -1) return;
        if (!tabStorage[tabId]) tabStorage[tabId] = { count: 0, trackers: [] };

        const url = details.url;
        const reqDomain = getDomain(url);
        let detected = false;
        let category = "Unknown";

        if (TRACKER_MAP.has(reqDomain) || TRACKING_PATTERN.test(url)) {
            detected = true;
            category = TRACKER_MAP.get(reqDomain) || "Suspicious Query";
        }

        if (detected) {
            tabStorage[tabId].count++;
            // Logica simplificata pentru demo
            if (tabStorage[tabId].trackers.length < 50) {
                 tabStorage[tabId].trackers.push({ domain: reqDomain, category: category });
                 saveDataForPopup(tabId);
            }
            updateBadge(tabId);
        }
    },
    { urls: ["<all_urls>"] }
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
        tabStorage[tabId] = { count: 0, trackers: [] };
        updateBadge(tabId);
        chrome.storage.local.remove([
            "stats_" + tabId,
            "deep_scan_" + tabId
        ]);
    }
});

// =================================================================
// OPENAI DEEP SCAN
// =================================================================

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "deepScan") {
        console.log("🚀 Deep Scan initiated from popup");
        
        // First, get the current tab
        chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
            if (!tabs || tabs.length === 0) {
                sendResponse({ success: false, error: "No active tab found" });
                return;
            }
            
            const tabId = tabs[0].id;
            const websiteUrl = tabs[0].url;
            const websiteDomain = new URL(websiteUrl).hostname.replace(/^www\./, "");
            console.log("📄 Current tab:", websiteUrl);
            console.log("🌐 Domain:", websiteDomain);
            
            try {
                // Get tracker data for this tab
                const trackerData = tabStorage[tabId] || { count: 0, trackers: [] };
                console.log("📊 Tracker data:", trackerData.count, "trackers detected");

                // Helper to request T&C extraction from the content script
                const requestExtraction = () => {
                    return new Promise((resolve, reject) => {
                        chrome.tabs.sendMessage(tabId, { action: 'extractTC' }, (response) => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                resolve(response);
                            }
                        });
                    });
                };

                // Extract T&C from the page
                console.log("📨 Requesting T&C extraction from content script...");
                let tcData;
                try {
                    tcData = await requestExtraction();
                } catch (err) {
                    // If there is no content script yet, inject it dynamically and retry once
                    if (err && err.message && err.message.includes("Could not establish connection")) {
                        console.warn("⚠️ No content script found in tab. Injecting content.js and retrying...");
                        await chrome.scripting.executeScript({
                            target: { tabId },
                            files: ["content.js"]
                        });
                        tcData = await requestExtraction();
                    } else {
                        throw err;
                    }
                }
                
                console.log("📋 T&C extraction result:", tcData.found ? "Found" : "Not found");
                
                // Call OpenAI with the extracted text AND tracker data
                const aiResponse = await callOpenAI(tcData, websiteUrl, websiteDomain, trackerData);

                // Persist deep scan result for this tab so popup can restore it
                const deepKey = "deep_scan_" + tabId;
                chrome.storage.local.set({
                    [deepKey]: {
                        aiResponse,
                        tcData,
                        trackerData,
                        websiteUrl,
                        websiteDomain,
                        createdAt: Date.now()
                    }
                });

                sendResponse({ success: true, data: aiResponse, tcData: tcData, trackerData: trackerData });
                
            } catch (error) {
                console.error("❌ Error during deep scan:", error);
                sendResponse({ success: false, error: error.message });
            }
        });
        
        return true; // Keep channel open for async response
    }
});

// OpenAI API Call Function
async function callOpenAI(tcData, websiteUrl, websiteDomain, trackerData) {
    try {
        console.log("=".repeat(60));
        console.log("🤖 CALLING OPENAI API");
        console.log("=".repeat(60));
        
        // Build tracker summary
        let trackerSummary = "None detected";
        let trackerDetails = "";
        
        if (trackerData && trackerData.count > 0) {
            const categories = {};
            trackerData.trackers.forEach(t => {
                if (!categories[t.category]) categories[t.category] = [];
                if (!categories[t.category].includes(t.domain)) {
                    categories[t.category].push(t.domain);
                }
            });
            
            trackerSummary = `${trackerData.count} tracking requests detected`;
            trackerDetails = Object.keys(categories).map(cat => {
                return `  • ${cat}: ${categories[cat].join(', ')}`;
            }).join('\n');
            
            console.log("🔍 Tracker categories found:", Object.keys(categories).join(', '));
        }
        
        // Build the prompt based on whether we found T&C
        let fullPrompt = "";
        
        if (tcData && tcData.found && tcData.text) {
            console.log("✅ Including extracted T&C text in prompt");
            console.log(`📏 Text length: ${tcData.text.length} characters`);
            console.log(`🔗 Source: ${tcData.source === 'current_page' ? 'Current page' : tcData.url}`);

            // Use full text as‑is (no truncation)
            const tcText = tcData.text;

            fullPrompt = `${HARDCODED_PROMPT}

WEBSITE: ${websiteDomain}
URL: ${websiteUrl}

WHAT THEY CLAIM (from Terms & Conditions):
---
${tcText}
---

WHAT THEY ACTUALLY DO (detected behavior):
${trackerSummary}
${trackerDetails}

Now compare their CLAIMS vs REALITY and provide your verdict.`;
        } else {
            console.log("⚠️ No T&C text found, using tracker data only");
            fullPrompt = `${HARDCODED_PROMPT}

WEBSITE: ${websiteDomain}
URL: ${websiteUrl}

WHAT THEY ACTUALLY DO (detected behavior):
${trackerSummary}
${trackerDetails}

Note: Could not extract Terms & Conditions text. Please provide an analysis based on the tracking behavior detected.`;
        }
        
        console.log("📝 Prompt prepared (first 200 chars):", fullPrompt.substring(0, 200) + "...");
        console.log("-".repeat(60));
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-5.1",
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "tc_lie_detector_summary",
                        strict: true,
                        schema: {
                            type: "object",
                            properties: {
                                summary: { type: "string" },
                                verdict: { type: "string", enum: ["TRUSTWORTHY", "MISLEADING", "DECEPTIVE"] },
                                details: { type: "string" }
                            },
                            required: ["summary", "verdict", "details"],
                            additionalProperties: false
                        }
                    }
                },
                messages: [
                    {
                        role: "system",
                        content: "You are a privacy 'LIE DETECTOR' expert. Compare what websites claim in their Terms & Conditions versus their actual tracking behavior. Be direct, concise and user‑friendly. Follow the style requested in the user prompt. Always respond as JSON matching the provided schema (summary, verdict, details)."
                    },
                    {
                        role: "user",
                        content: fullPrompt
                    }
                ],
                temperature: 0.2,
                max_completion_tokens: 400
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ API Request Failed:");
            console.error("Status:", response.status, response.statusText);
            console.error("Response:", errorText);
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const choice = data.choices && data.choices[0] ? data.choices[0] : null;
        const message = choice && choice.message ? choice.message : {};

        // With response_format: "json_schema", gpt‑5.1 may put the parsed JSON
        // into message.parsed while leaving message.content empty.
        let parsed = null;
        if (message.parsed) {
            parsed = message.parsed;
        } else if (typeof message.content === "string" && message.content.trim().length > 0) {
            try {
                parsed = JSON.parse(message.content);
            } catch (e) {
                console.warn("⚠️ Failed to JSON.parse message.content, using raw string.", e);
            }
        }

        const rawContent =
            typeof message.content === "string" && message.content.trim().length > 0
                ? message.content
                : parsed
                ? JSON.stringify(parsed)
                : "";

        const primaryResponse = {
            summary: parsed && typeof parsed.summary === "string" ? parsed.summary : rawContent,
            verdict: parsed && typeof parsed.verdict === "string" ? parsed.verdict : "UNKNOWN",
            details: parsed && typeof parsed.details === "string" ? parsed.details : rawContent,
            raw: rawContent
        };

        console.log("=".repeat(60));
        console.log("✅ OPENAI RESPONSE RECEIVED (gpt‑5.1)");
        console.log("=".repeat(60));
        console.log("🔹 Parsed AI response (primary):", primaryResponse);
        console.log("-".repeat(60));
        console.log("📊 Full API Response:");
        console.log(JSON.stringify(data, null, 2));
        console.log("=".repeat(60));

        const hasSummary =
            primaryResponse.summary &&
            typeof primaryResponse.summary === "string" &&
            primaryResponse.summary.trim().length > 0;

        // If gpt‑5.1 gave us nothing usable, fall back to a simpler text model
        // just so the user always sees some conclusion in the UI.
        if (!hasSummary) {
            console.warn("⚠️ gpt‑5.1 returned empty summary. Falling back to gpt‑4.1‑mini for text output.");

            const fbResponse = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: "gpt-4.1-mini",
                    messages: [
                        {
                            role: "system",
                            content:
                                "You are a privacy 'LIE DETECTOR' expert. Compare what websites claim in their Terms & Conditions versus their actual tracking behavior. Be direct, concise and user‑friendly. Start with a 1–2 sentence summary, then add a few bullet points with key concerns."
                        },
                        {
                            role: "user",
                            content: fullPrompt
                        }
                    ],
                    temperature: 0.3,
                    max_completion_tokens: 600
                })
            });

            if (!fbResponse.ok) {
                const fbErrText = await fbResponse.text();
                console.error("❌ Fallback API Request Failed (gpt‑4.1‑mini):");
                console.error("Status:", fbResponse.status, fbResponse.statusText);
                console.error("Response:", fbErrText);
                // Even if fallback fails, return the primary (possibly empty) response so UI doesn't crash
                return primaryResponse;
            }

            const fbData = await fbResponse.json();
            const fbContent =
                fbData.choices &&
                fbData.choices[0] &&
                fbData.choices[0].message &&
                typeof fbData.choices[0].message.content === "string"
                    ? fbData.choices[0].message.content
                    : "";

            console.log("=".repeat(60));
            console.log("✅ OPENAI RESPONSE RECEIVED (fallback gpt‑4.1‑mini)");
            console.log("=".repeat(60));
            console.log("🔹 Raw fallback content:");
            console.log(fbContent);
            console.log("-".repeat(60));

            // Return raw text; popup can show it as résumé
            return {
                summary: fbContent,
                verdict: "UNKNOWN",
                details: fbContent,
                raw: fbContent
            };
        }

        return primaryResponse;
    } catch (error) {
        console.error("=".repeat(60));
        console.error("❌ ERROR CALLING OPENAI API");
        console.error("=".repeat(60));
        console.error("Error:", error);
        console.error("Error Message:", error.message);
        console.error("=".repeat(60));
        throw error;
    }
}