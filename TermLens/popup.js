let currentTabId = null;
let globalData = null; 
let aiAnalysisData = null; // Store AI response 

document.addEventListener('DOMContentLoaded', function() {
    // 1. Preluăm datele dar NU le afișăm încă
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs || tabs.length === 0) return;
        currentTabId = tabs[0].id;
        const storageKey = "stats_" + currentTabId;

        chrome.storage.local.get([storageKey], function(result) {
            globalData = result[storageKey] || { count: 0, piiLeaks: 0, trackers: [] };

            const deepKey = "deep_scan_" + currentTabId;
            const quickKey = "quick_scan_" + currentTabId;

            chrome.storage.local.get([deepKey, quickKey], function(res2) {
                const savedDeep = res2[deepKey];
                const savedQuick = res2[quickKey];

                const detailsCard = document.getElementById('details-card');
                const btnQuick = document.getElementById('btn-quick');
                const btnDeep = document.getElementById('btn-deep');

                // Prefer restoring Deep Scan if it exists
                if (savedDeep && savedDeep.aiResponse) {
                    aiAnalysisData = savedDeep.aiResponse;

                    if (detailsCard) detailsCard.style.opacity = "1";
                    if (btnQuick && btnDeep) {
                        btnQuick.classList.remove('active');
                        btnDeep.classList.add('active');
                    }

                    updateHumanUI(globalData, 'deep', aiAnalysisData);

                    // If we also have a Quick Scan saved, append its summary bullets
                    if (savedQuick && savedQuick.stats) {
                        appendQuickStatsToList(savedQuick.stats, globalData);
                    }
                } else if (savedQuick && savedQuick.stats) {
                    // Only Quick Scan exists – restore that state
                    if (detailsCard) detailsCard.style.opacity = "1";
                    if (btnQuick && btnDeep) {
                        btnDeep.classList.remove('active');
                        btnQuick.classList.add('active');
                    }

                    updateHumanUI(globalData, 'quick');
                    appendQuickStatsToList(savedQuick.stats, globalData);
                }
            });
        });
    });

    setupButtons();
});

function setupButtons() {
    const btnQuick = document.getElementById('btn-quick');
    const btnDeep = document.getElementById('btn-deep');
    const detailsCard = document.getElementById('details-card');

    function resetButtonStyles() {
        [btnQuick, btnDeep].forEach(b => b.classList.remove('active'));
    }

    // --- QUICK SCAN ---
    btnQuick.addEventListener('click', async () => {
        resetButtonStyles();
        btnQuick.classList.add('active');
        
        startScanEffect('quick', async () => {
            const quickStats = await runQuickTextScan();
            updateHumanUI(globalData, 'quick');
            if (quickStats) {
                appendQuickStatsToList(quickStats, globalData);
            }
            detailsCard.style.opacity = "1";
        });
    });

    // --- DEEP SCAN ---
    btnDeep.addEventListener('click', async () => {
        resetButtonStyles();
        btnDeep.classList.add('active');

        startScanEffect('deep', async () => {
            // Call OpenAI API
            const aiResult = await callOpenAI();
            aiAnalysisData = aiResult;
            updateHumanUI(globalData, 'deep', aiAnalysisData);
            detailsCard.style.opacity = "1";

            // Stop the shield scanning animation once deep scan is done
            const shieldWrap = document.getElementById('shield-icon');
            if (shieldWrap) shieldWrap.classList.remove('scanning');
        });
    });
}

// Send message to background script to call OpenAI
async function callOpenAI() {
    return new Promise((resolve, reject) => {
        console.log("📨 Sending Deep Scan request to service worker...");
        chrome.runtime.sendMessage({ action: "deepScan" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("❌ Message error:", chrome.runtime.lastError);
                resolve(null); // Resolve with null instead of rejecting to prevent UI break
            } else if (response.success) {
                console.log("✅ Response received from service worker");
                console.log("AI Analysis:", response.data);
                console.log("Check the Service Worker console for detailed logs!");
                resolve(response.data);
            } else {
                console.error("❌ Deep scan failed:", response.error);
                resolve(null); // Resolve with null instead of rejecting
            }
        });
    });
}

// Simularea vizuală a scanării
function startScanEffect(mode, callback) {
    const hero = document.getElementById('hero-bg');
    const shieldWrap = document.getElementById('shield-icon');
    const symbol = document.getElementById('shield-symbol');
    const title = document.getElementById('verdict-title');
    const desc = document.getElementById('verdict-desc');

    // Stare de Loading
    shieldWrap.classList.add('scanning'); // Porneste inelul
    symbol.innerText = "⏳"; 
    
    if (mode === 'quick') {
        title.innerText = "Quick Scanning...";
        desc.innerText = "Checking trackers and cookies.";
        hero.style.background = "#3b82f6"; // Albastru
    } else {
        title.innerText = "Deep AI Analysis...";
        desc.innerText = "Reading agreements & analyzing patterns.";
        hero.style.background = "#7c3aed"; // Violet
    }

    // Delay artificial
    const delay = mode === 'quick' ? 600 : 1500;

    setTimeout(() => {
        if (mode === 'quick') {
            // For quick scan we fully finish the animation here
            shieldWrap.classList.remove('scanning');
        }
        // For deep scan we keep the scanning class until the async work finishes
        callback();
    }, delay);
}

function updateHumanUI(data, mode, aiAnalysis = null) {
    const hero = document.getElementById('hero-bg');
    const title = document.getElementById('verdict-title');
    const desc = document.getElementById('verdict-desc');
    const symbol = document.getElementById('shield-symbol');
    const list = document.getElementById('simple-reasons');
    const countBadge = document.getElementById('tracker-count');

    // Resetăm background-ul inline pus de loading si folosim clasele CSS
    hero.style.background = ""; 
    hero.className = "hero-section";

    let status = "safe";

    // Normalize AI object coming from background (JSON: summary, verdict, details, raw)
    let summaryText = "";
    let detailsText = "";
    let fullText = "";
    let verdict = "";

    if (aiAnalysis) {
        if (typeof aiAnalysis === "string") {
            // Legacy: raw string from model
            fullText = aiAnalysis.trim();
            summaryText = fullText;
            detailsText = "";
        } else if (typeof aiAnalysis === "object") {
            verdict = aiAnalysis.verdict || "";
            summaryText = (aiAnalysis.summary || "").trim();
            detailsText = (aiAnalysis.details || "").trim();
            fullText = (aiAnalysis.raw || (summaryText + "\n\n" + detailsText)).trim();

            // Fallbacks if summary/details are missing
            if (!summaryText && fullText) summaryText = fullText;
            if (!detailsText && fullText) detailsText = fullText;
        }
    }

    // For deep scan with AI, determine status from AI verdict
    if (mode === 'deep' && aiAnalysis && fullText) {
        const combined = (summaryText + " " + detailsText + " " + verdict).toLowerCase();

        if (combined.includes('deceptive') || verdict.toUpperCase().includes('DECEPTIVE')) {
            status = "danger";
        } else if (combined.includes('misleading') || verdict.toUpperCase().includes('MISLEADING') || combined.includes('warning') || data.count > 0) {
            status = "warn";
        } else {
            status = "safe";
        }
    } else {
        // Original logic for quick scan
        if (data.piiLeaks > 0) status = "danger";
        else if (data.count > 0) status = "warn";
    }

    hero.classList.add(`hero-${status}`);

    countBadge.innerText = data.count;
    list.innerHTML = ""; 

    // Update hero section based on mode and status
    if (mode === 'deep' && aiAnalysis) {
        // Deep scan with AI results
        if (status === "danger") {
            symbol.innerText = "🚨";
            title.innerText = "Deceptive Practices Detected";
            desc.innerText = "Claims don't match behavior!";
        } else if (status === "warn") {
            symbol.innerText = "⚠️";
            title.innerText = "Misleading Claims Found";
            desc.innerText = `${data.count} trackers detected.`;
        } else {
            symbol.innerText = "✅";
            title.innerText = "Trustworthy";
            desc.innerText = "Claims match behavior.";
        }
    } else {
        // Original status messages
        if (status === "danger") {
            symbol.innerText = "🚨";
            title.innerText = "Critical Risk Found";
            desc.innerText = "Data leakage detected on this page.";
        } else if (status === "warn") {
            symbol.innerText = "⚠️";
            title.innerText = "Potential Risks";
            desc.innerText = `${data.count} trackers found.`;
        } else {
            symbol.innerText = "🛡️";
            title.innerText = "System Secure";
            desc.innerText = "No threats found.";
        }
    }

    // Populate the list
    if (mode === 'deep' && aiAnalysis && fullText) {
        // Helper for safe HTML
        const escapeHtml = (str) =>
            str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // Extract intro + bullet lines from AI details (if any)
        let introLines = [];
        let bulletLines = [];
        if (detailsText && detailsText.trim().length > 0) {
            const lines = detailsText.split("\n").map((l) => l.trim()).filter(Boolean);
            lines.forEach((line) => {
                if (/^[-•]/.test(line)) {
                    bulletLines.push(line.replace(/^[-•]\s*/, ""));
                } else if (!/^key concerns[:：]/i.test(line)) {
                    introLines.push(line);
                }
            });
        }

        // 1) Short AI summary (always visible)
        const summaryItem = document.createElement("li");
        summaryItem.style.marginBottom = "8px";
        summaryItem.style.lineHeight = "1.5";

        const baseSummary = summaryText || "No summary available.";

        // Derive a very short, user-friendly display summary
        let displaySummary = baseSummary;
        if (displaySummary.length > 220) {
            const sentenceMatch = displaySummary.match(/^(.{0,220}[\.!\?])[\s\S]*/);
            if (sentenceMatch) {
                displaySummary = sentenceMatch[1].trim();
            } else {
                displaySummary = displaySummary.slice(0, 220).trim() + "…";
            }
        }

        // Build top-level bullet points: use AI "Key concerns" bullets if we have them,
        // otherwise fall back to a single bullet from the summary sentence.
        const keyBullets = [];
        if (bulletLines.length) {
            bulletLines.slice(0, 3).forEach((b) => keyBullets.push(b));
        }
        if (!keyBullets.length) {
            keyBullets.push(displaySummary);
        }
        const bulletsHtml = keyBullets
            .map((b) => {
                const safe = escapeHtml(b).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
                return `<li>${safe}</li>`;
            })
            .join("");

        // Verdict badge styling (AI brain + label)
        const verdictLabel = (verdict || "").toUpperCase();
        const verdictColor =
            verdictLabel === "TRUSTWORTHY"
                ? "#16a34a" // green when everything is OK
                : "#dc2626"; // red when there is any risk / not clearly trustworthy

        const verdictText =
            verdictLabel && verdictLabel !== "UNKNOWN"
                ? verdictLabel
                : "LIE DETECTOR RESULT";

        summaryItem.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:4px;">
            <span style="font-size:11px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:${verdictColor}; display:flex; align-items:center; gap:4px;">
              <span>🧠</span>
              <span>${verdictText}</span>
            </span>
            <ul style="margin:0; padding-left:18px;">
              ${bulletsHtml}
            </ul>
          </div>
        `;
        list.appendChild(summaryItem);

        // 2) Optional expandable details (show full explanation on demand)
        if (detailsText && detailsText.trim().length > 0 && detailsText.trim() !== baseSummary.trim()) {
            const detailsItem = document.createElement("li");
            detailsItem.style.marginBottom = "4px";

            const toggleBtn = document.createElement("button");
            toggleBtn.type = "button";
            toggleBtn.textContent = "View more details";
            toggleBtn.style.border = "none";
            toggleBtn.style.background = "transparent";
            toggleBtn.style.color = "#6366f1";
            toggleBtn.style.cursor = "pointer";
            toggleBtn.style.padding = "0";
            toggleBtn.style.fontSize = "12px";
            toggleBtn.style.fontWeight = "500";

            const detailsBox = document.createElement("div");
            detailsBox.style.display = "none";
            detailsBox.style.marginTop = "6px";
            detailsBox.style.lineHeight = "1.6";

            // Build user-friendly bullet points for the expanded view
            let htmlParts = [];

            if (introLines.length) {
                const intro = escapeHtml(introLines.join(" "))
                    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
                htmlParts.push(`<div style="margin-bottom:6px;">${intro}</div>`);
            }

            if (bulletLines.length) {
                const bulletsHtml = bulletLines
                    .map((b) => {
                        const safe = escapeHtml(b).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
                        return `<li>${safe}</li>`;
                    })
                    .join("");
                htmlParts.push(`<ul style="padding-left:18px; margin:0;">${bulletsHtml}</ul>`);
            }

            detailsBox.innerHTML = htmlParts.join("");

            let expanded = false;
            toggleBtn.addEventListener("click", () => {
                expanded = !expanded;
                detailsBox.style.display = expanded ? "block" : "none";
                toggleBtn.textContent = expanded ? "Hide details" : "View more details";
            });

            detailsItem.appendChild(toggleBtn);
            detailsItem.appendChild(detailsBox);
            list.appendChild(detailsItem);
        }

    } else if (mode === 'deep') {
        // Deep scan but no AI response (error or no credits)
        const aiMessage = document.createElement("li");
        aiMessage.innerHTML = "🧠 <b>AI Analysis:</b> Analyzing T&C... (Check console for status)";
        aiMessage.style.color = "#6366f1";
        list.appendChild(aiMessage);
    }

    // Add tracker information
    let messages = new Set();
    
    if (data.piiLeaks > 0) messages.add("❌ <b>Data Leak:</b> Email/Password exposed.");
    
    data.trackers.forEach(t => {
        if (t.category.includes("Ads")) messages.add("📢 <b>Ads:</b> User profiling active.");
        if (t.category.includes("Analytics")) messages.add("📊 <b>Analytics:</b> Behavior tracking.");
        if (t.category.includes("Social")) messages.add("👤 <b>Social:</b> Cross-site tracking.");
    });

    if (messages.size > 0) {
        // Section header for technical signals
        const headerItem = document.createElement("li");
        headerItem.style.marginTop = "4px";
        headerItem.style.marginBottom = "2px";
        headerItem.style.fontSize = "11px";
        headerItem.style.fontWeight = "600";
        headerItem.style.color = "#6b7280";
        headerItem.innerHTML = "Technical signals detected:";
        list.appendChild(headerItem);

        messages.forEach(msg => {
            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.alignItems = "center";
            li.style.gap = "6px";

            // Extract leading emoji (if present) so it aligns nicely
            const emojiMatch = msg.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*(.*)$/u);
            if (emojiMatch) {
                const emojiSpan = document.createElement("span");
                emojiSpan.textContent = emojiMatch[1];
                const textSpan = document.createElement("span");
                textSpan.innerHTML = emojiMatch[2];
                li.appendChild(emojiSpan);
                li.appendChild(textSpan);
            } else {
                li.innerHTML = msg;
            }

            list.appendChild(li);
        });
    } else {
        if(list.innerHTML === "") {
             list.innerHTML = "<li class='empty-state'>✅ Connection is private.</li>";
        }
    }
}

// --- QUICK SCAN TEXT ANALYSIS ---

async function runQuickTextScan() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) {
                resolve(null);
                return;
            }
            const tabId = tabs[0].id;

            const sendRequest = () => {
                chrome.tabs.sendMessage(tabId, { action: "quickScanText" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("❌ QuickScan message error:", chrome.runtime.lastError);
                        resolve(null);
                    } else if (response && response.success) {
                        const stats = response.stats;
                        // Persist Quick Scan result for this tab
                        const quickKey = "quick_scan_" + tabId;
                        chrome.storage.local.set({
                            [quickKey]: {
                                stats,
                                createdAt: Date.now()
                            }
                        });
                        resolve(stats);
                    } else {
                        console.error("❌ QuickScan failed:", response && response.error);
                        resolve(null);
                    }
                });
            };

            // Try once; if no content script, inject and retry
            chrome.tabs.sendMessage(tabId, { action: "quickScanText" }, async (response) => {
                if (chrome.runtime.lastError && chrome.runtime.lastError.message.includes("Could not establish connection")) {
                    console.warn("⚠️ No content script in tab for Quick Scan. Injecting content.js and retrying...");
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId },
                            files: ["content.js"]
                        });
                        sendRequest();
                    } catch (e) {
                        console.error("❌ Failed to inject content.js for Quick Scan:", e);
                        resolve(null);
                    }
                } else if (chrome.runtime.lastError) {
                    console.error("❌ QuickScan initial message error:", chrome.runtime.lastError);
                    resolve(null);
                } else if (response && response.success) {
                    const stats = response.stats;
                    const quickKey = "quick_scan_" + tabId;
                    chrome.storage.local.set({
                        [quickKey]: {
                            stats,
                            createdAt: Date.now()
                        }
                    });
                    resolve(stats);
                } else {
                    console.error("❌ QuickScan failed:", response && response.error);
                    resolve(null);
                }
            });
        });
    });
}

function appendQuickStatsToList(stats, data) {
    try {
        const list = document.getElementById("simple-reasons");
        if (!list || !stats) return;

        const { keywords } = stats;
        const totalTrackers = data && typeof data.count === "number" ? data.count : 0;

        const points = [];

        const privacyHits =
            (keywords.privacy || 0) +
            (keywords.cookies || 0) +
            (keywords.thirdParty || 0) +
            (keywords.sellData || 0) +
            (keywords.shareData || 0);

        if (privacyHits === 0) {
            points.push("The text does not clearly talk about privacy or how your data is used.");
        } else if (privacyHits <= 3) {
            points.push("Privacy and data use are mentioned a few times in the text.");
        } else {
            points.push("Privacy and data use are a frequent topic in the text.");
        }

        if (totalTrackers === 0) {
            points.push("No tracking requests were detected while loading this page.");
        } else if (totalTrackers <= 5) {
            points.push("A few tracking requests were detected (analytics/ads).");
        } else {
            points.push("Many tracking requests were detected from analytics and advertising services.");
        }

        // Render Quick Scan section as simple bullet list
        if (points.length > 0) {
            const headerItem = document.createElement("li");
            headerItem.style.marginTop = "6px";
            headerItem.style.marginBottom = "2px";
            headerItem.style.fontSize = "11px";
            headerItem.style.fontWeight = "600";
            headerItem.style.color = "#6b7280";
            headerItem.innerHTML = "Quick scan summary:";
            list.appendChild(headerItem);

            points.forEach((p) => {
                const li = document.createElement("li");
                li.textContent = p;
                list.appendChild(li);
            });
        }
    } catch (e) {
        console.error("❌ Failed to append quick stats:", e);
    }
}