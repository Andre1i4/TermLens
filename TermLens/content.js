// =================================================================
// TERMLENS CONTENT SCRIPT - T&C TEXT EXTRACTOR
// =================================================================

// Function to find T&C links on the page
function findTermsLinks() {
    const allLinks = document.querySelectorAll('a[href]');
    const termsKeywords = [
        'terms', 'conditions', 'terms-of-service', 'tos', 
        'terms-and-conditions', 'legal', 'terms-of-use',
        'user-agreement', 'service-terms'
    ];
    
    const found = [];
    allLinks.forEach(link => {
        const href = link.href.toLowerCase();
        const text = link.textContent.toLowerCase();
        
        // Check if link contains terms-related keywords
        const matchesKeyword = termsKeywords.some(keyword => 
            href.includes(keyword) || text.includes(keyword)
        );
        
        if (matchesKeyword) {
            found.push({
                url: link.href,
                text: link.textContent.trim()
            });
        }
    });
    
    console.log("🔍 Found T&C links:", found);
    return found;
}

// Function to extract text from current page
function extractPageText() {
    // Remove script tags, style tags, and other non-content elements
    const clone = document.body.cloneNode(true);
    
    // Remove unwanted elements
    ['script', 'style', 'noscript', 'iframe', 'nav', 'header', 'footer'].forEach(tag => {
        clone.querySelectorAll(tag).forEach(el => el.remove());
    });
    
    // Get all text content
    let text = clone.innerText || clone.textContent;
    
    // Clean up the text
    text = text
        .replace(/\s+/g, ' ')           // Replace multiple spaces with single space
        .replace(/\n{3,}/g, '\n\n')     // Replace 3+ newlines with 2
        .trim();
    
    console.log("📄 Extracted text length:", text.length, "characters");
    return text;
}

// Function to fetch and extract text from a URL
async function fetchTermsContent(url) {
    try {
        console.log("🌐 Fetching T&C from:", url);
        const response = await fetch(url);
        const html = await response.text();
        
        // Parse HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Remove unwanted elements
        ['script', 'style', 'noscript', 'iframe', 'nav', 'header', 'footer'].forEach(tag => {
            doc.querySelectorAll(tag).forEach(el => el.remove());
        });
        
        let text = doc.body.innerText || doc.body.textContent;
        text = text
            .replace(/\s+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        
        console.log("✅ Fetched text length:", text.length, "characters");
        return text;
    } catch (error) {
        console.error("❌ Error fetching T&C:", error);
        throw error;
    }
}

// Main function to extract T&C
async function extractTermsAndConditions() {
    console.log("🔍 Starting T&C extraction...");
    
    // Step 1: Try to find T&C links
    const links = findTermsLinks();
    
    if (links.length > 0) {
        console.log(`✅ Found ${links.length} potential T&C link(s)`);
        
        // Try to fetch the first T&C link
        try {
            const text = await fetchTermsContent(links[0].url);
            return {
                found: true,
                text: text,
                source: 'external_link',
                url: links[0].url,
                linkText: links[0].text
            };
        } catch (error) {
            console.warn("⚠️ Could not fetch external T&C, falling back to current page");
        }
    }
    
    // Step 2: If no links or fetch failed, extract from current page
    console.log("📄 Extracting text from current page...");
    const text = extractPageText();
    
    // Check if the current page seems to be a T&C page
    const textLower = text.toLowerCase();
    const seemsLikeTC = textLower.includes('terms') || 
                        textLower.includes('conditions') || 
                        textLower.includes('privacy policy');
    
    if (text.length > 200) {
        return {
            found: true,
            text: text,
            source: 'current_page',
            url: window.location.href,
            isTCPage: seemsLikeTC
        };
    }
    
    return {
        found: false,
        text: "",
        source: 'none',
        url: window.location.href
    };
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractTC") {
        extractTermsAndConditions()
            .then(result => {
                console.log("✅ T&C extraction complete:", result.found ? "Success" : "No content found");
                sendResponse(result);
            })
            .catch(error => {
                console.error("❌ Error extracting T&C:", error);
                sendResponse({ 
                    found: false, 
                    text: "", 
                    error: error.message 
                });
            });
        return true; // Keep channel open for async response
    }
    else if (request.action === "findTerms") {
        const links = findTermsLinks();
        sendResponse({ success: true, links: links });
    } 
    else if (request.action === "extractCurrentPage") {
        const text = extractPageText();
        sendResponse({ success: true, text: text });
    }
    else if (request.action === "fetchTermsPage") {
        fetchTermsContent(request.url)
            .then(text => {
                sendResponse({ success: true, text: text });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep channel open for async response
    }
    else if (request.action === "quickScanText") {
        try {
            const text = extractPageText();
            const lower = text.toLowerCase();

            const countMatches = (regex) => {
                const m = lower.match(regex);
                return m ? m.length : 0;
            };

            const stats = {
                totalCharacters: text.length,
                totalWords: text.split(/\s+/).filter(Boolean).length,
                keywords: {
                    privacy: countMatches(/\bprivacy\b/g),
                    cookies: countMatches(/\bcookies?\b/g),
                    thirdParty: countMatches(/third[-\s]?party/g),
                    sellData: countMatches(/sell(ing)? (my|our|your) data|sale of .*data/g),
                    shareData: countMatches(/share(ing)? (my|our|your) data|sharing .*data/g)
                }
            };

            sendResponse({ success: true, stats });
        } catch (e) {
            console.error("❌ Quick text scan failed:", e);
            sendResponse({ success: false, error: e.message });
        }
        return true;
    }
});

console.log("✅ TermLens content script loaded");
