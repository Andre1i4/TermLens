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

            // 2. Verificăm dacă există deja un rezultat Deep Scan salvat pentru acest tab
            const deepKey = "deep_scan_" + currentTabId;
            chrome.storage.local.get([deepKey], function(res2) {
                const savedDeep = res2[deepKey];
                if (savedDeep && savedDeep.aiResponse) {
                    // Restaurăm ultimul rezultat AI pentru acest tab
                    aiAnalysisData = savedDeep.aiResponse;

                    const detailsCard = document.getElementById('details-card');
                    const btnQuick = document.getElementById('btn-quick');
                    const btnDeep = document.getElementById('btn-deep');

                    if (detailsCard) detailsCard.style.opacity = "1";
                    if (btnQuick && btnDeep) {
                        btnQuick.classList.remove('active');
                        btnDeep.classList.add('active');
                    }

                    // Randăm din nou UI-ul ca și cum Deep Scan tocmai s-ar fi terminat
                    updateHumanUI(globalData, 'deep', aiAnalysisData);
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
    btnQuick.addEventListener('click', () => {
        resetButtonStyles();
        btnQuick.classList.add('active');
        
        startScanEffect('quick', () => {
            updateHumanUI(globalData, 'quick');
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
        shieldWrap.classList.remove('scanning');
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
        // 1) Short summary (always visible)
        const summaryItem = document.createElement("li");
        summaryItem.style.marginBottom = "6px";
        summaryItem.style.lineHeight = "1.5";

        const safeSummary = summaryText || "No summary available.";
        summaryItem.innerHTML = `<b>🧠 Lie Detector:</b> ${safeSummary}`;
        list.appendChild(summaryItem);

        // 2) Optional expandable details
        if (detailsText && detailsText.trim().length > 0 && detailsText.trim() !== safeSummary.trim()) {
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
            detailsBox.style.whiteSpace = "pre-line";

            let formattedDetails = detailsText
                .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
                .replace(/^• /gm, "• ");

            detailsBox.innerHTML = formattedDetails;

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
        messages.forEach(msg => {
            const li = document.createElement("li");
            li.innerHTML = msg; 
            list.appendChild(li);
        });
    } else {
        if(list.innerHTML === "") {
             list.innerHTML = "<li class='empty-state'>✅ Connection is private.</li>";
        }
    }
}