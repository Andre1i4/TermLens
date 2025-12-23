# TermLens - Privacy Auditor Chrome Extension

**Repository Maintainers:** Andre1i4

**Event:** PoliHack 2025

## 📂 Overview

TermLens is a sophisticated Chrome extension designed to empower users with transparent, real-time insights into website privacy practices. The extension operates through a three-layered analysis system that detects trackers, scans Terms & Conditions, and leverages AI to identify contradictions between claimed privacy behavior and actual tracking practices.

**Core Mission:** Expose privacy violations and help users understand what websites are actually doing with their data.

---

## 🎯 Key Features

### 1. **Real-Time Tracker Detection**
- Monitors network requests via Chrome's `webRequest` API
- Identifies 50+ known tracking domains across categories:
  - Analytics (Google Analytics, Mixpanel)
  - Advertising (Facebook Pixel, Criteo, TikTok Ads)
  - Session Recording (Hotjar, Clarity.ms)
  - Social Tracking (LinkedIn, Twitter, Instagram)
  - Local Trackers (Romanian-specific: 2Performant, TraficRO)
- Visual badge feedback: **"!"** (red) for detected trackers, **"✓"** (green) for clean pages

### 2. **Quick T&C Scan**
- Extracts and analyzes website Terms & Conditions text
- Keyword frequency analysis: privacy, cookies, third-party sharing, data selling
- Character and word count statistics for quick assessment
- Results stored per-tab for instant recall

### 3. **AI-Powered Deep Analysis**
- Integrates OpenAI API to compare claimed privacy policies against detected behavior
- System prompt frames analysis as a "lie detector" identifying contradictions
- Generates user-friendly reports highlighting:
  - **Trustworthiness rating**: TRUSTWORTHY | MISLEADING | DECEPTIVE
  - Specific claims vs. actual tracking behavior
  - Potential GDPR/privacy violations

---

## 🏗️ Architecture

### Component Overview

```
┌─────────────────┐         ┌──────────────────┐
│  popup.js       │◄────────┤ chrome.storage   │
│  (UI/UX)        │         │  (Results Cache) │
└────────┬────────┘         └──────────────────┘
         │
         │ Message
         │ Protocol
         ▼
┌─────────────────────────────────────────────┐
│     background.js (Service Worker)          │
│ ┌──────────────┐  ┌──────────────────────┐  │
│ │ webRequest   │  │ OpenAI Integration   │  │
│ │ Listener     │  │ (T&C Analysis)       │  │
│ │ (Trackers)   │  │                      │  │
│ └──────────────┘  └──────────────────────┘  │
└──────────────┬──────────────────────────────┘
               │ Message
               │ Protocol
               ▼
        ┌─────────────────┐
        │  content.js     │
        │  (In-Page)      │
        │  T&C Extractor  │
        └─────────────────┘
```

### Data Flow: Deep Scan Example

1. **User clicks "Deep Scan"** in popup
2. **popup.js** sends `{action: "deepScan"}` to background service worker
3. **background.js** retrieves:
   - Current tab URL and active trackers from `tabStorage[tabId]`
   - Injects **content.js** if not present
4. **content.js** extracts T&C via:
   - Tier 1: Searches for T&C links matching `termsKeywords` (terms, conditions, privacy, legal, etc.)
   - Tier 2: Fetches and parses external T&C page, removes non-content DOM (script, style, nav, footer)
   - Tier 3: Falls back to current page text extraction
5. **background.js** calls OpenAI API with:
   - System prompt (HARDCODED_PROMPT): Framing as privacy "lie detector"
   - User message: Extracted T&C text + summary of detected trackers
6. **Results persisted** to `chrome.storage.local` as `deep_scan_<tabId>`
7. **popup.js** retrieves and displays AI analysis with human-friendly formatting

### Storage Schema

```javascript
// Per-tab tracker statistics (real-time)
stats_<tabId>: {
  count: number,
  trackers: [{domain: string, category: string}, ...]
}

// Deep scan results (persisted until tab reload)
deep_scan_<tabId>: {
  aiResponse: string,
  tcData: {found: boolean, text: string, source: string, url: string},
  trackerData: {count: number, trackers: [...]},
  websiteUrl: string,
  websiteDomain: string,
  createdAt: number
}

// Quick scan results (text statistics)
quick_scan_<tabId>: {
  totalCharacters: number,
  totalWords: number,
  keywords: {
    privacy: number,
    cookies: number,
    thirdParty: number,
    sellData: number,
    shareData: number
  }
}
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Extension API** | Chrome Manifest v3, Service Workers |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend/Analysis** | OpenAI API (GPT-4) |
| **Storage** | Chrome `chrome.storage.local` |
| **Network Monitoring** | Chrome `webRequest` API |
| **Content Parsing** | DOM Parser, native Fetch API |

---

## 📋 Project Structure

```
TermLens/
├── manifest.json          # Manifest v3 configuration
├── background.js          # Service Worker: tracker detection + OpenAI orchestration
├── content.js             # In-page script: T&C extraction logic
├── popup.js               # Popup UI controller and state management
├── popup.html             # Popup interface markup
├── style.css              # Popup styling
├── icons/                 # Extension icons (16x16 to 128x128 PNG)
├── .github/
│   └── copilot-instructions.md  # AI agent guidelines
├── HOW_IT_WORKS.md        # Detailed flow documentation
└── README.md              # This file
```

---

## 🚀 Installation & Testing

### Prerequisites
- Google Chrome (version 90+)
- OpenAI API key with valid quota (placed in `background.js`)

### Local Setup

1. **Clone or download the repository**
   ```bash
   git clone <repository-url>
   cd TermLens
   ```

2. **Load extension in Chrome**
   - Navigate to `chrome://extensions/`
   - Enable **Developer Mode** (top-right toggle)
   - Click **Load unpacked**
   - Select the `TermLens/` folder

3. **Verify installation**
   - TermLens icon appears in Chrome toolbar
   - Click the icon to open popup on any website

### Testing Workflows

#### Test Tracker Detection
1. Open any website (e.g., google.com, facebook.com)
2. Extension badge shows tracker count
3. Open Service Worker console:
   - Go to `chrome://extensions/`
   - Find TermLens, click **Service worker** link
   - Watch real-time tracker detections logged with 🚀 emoji

#### Test T&C Extraction
1. Open a website with Terms & Conditions (e.g., amazon.com)
2. Click **Quick Scan** in popup
3. Extension searches for T&C links, displays keyword frequency
4. Check console logs for extraction steps (🔍 Finding links, 🌐 Fetching, etc.)

#### Test Deep Scan (AI Analysis)
1. Open website with trackers and readable T&C
2. Click **Deep Scan** in popup
3. Loading animation displays while:
   - T&C text is extracted
   - OpenAI API processes the prompt
4. Results appear in popup with trustworthiness rating
5. Service Worker console shows full API request/response for debugging

---

## 🔐 Security & Privacy Notes

### Current Implementation
- **API Key Location**: Hardcoded in `background.js` (development only)
- **Storage**: All results stored locally in `chrome.storage.local`, not synced to cloud
- **Network**: OpenAI API calls made directly from Service Worker

### Production Recommendations
1. Move API key to secure backend proxy (avoid embedding in extension code)
2. Implement rate limiting to prevent quota abuse
3. Consider differential privacy techniques for sensitive T&C data
4. Add user consent prompts before sending T&C text to OpenAI
5. Implement result encryption in chrome.storage.local

---

## 📊 Tracker Map & Detection Logic

The `TRACKER_MAP` in `background.js` contains 50+ domains across 12 categories:

| Category | Examples |
|----------|----------|
| **Analytics** | google-analytics.com, mixpanel.com, newrelic.com |
| **Advertising** | googleadservices.com, criteo.com, rubiconproject.com |
| **Social Tracking** | facebook.net, linkedin.com/px, tiktok.com |
| **Session Recording** | hotjar.com, crazyegg.com, clarity.ms |
| **Ad Tech** | pubmatic.com, appnexus.com, openx.net |
| **Affiliate (Romania)** | 2performant.com, profitshare.ro |

**Detection Methods:**
- Exact domain matching (case-insensitive, `www.` prefix ignored)
- Regex pattern for suspicious query parameters: `pixel_id`, `gclid`, `fbclid`, `uid`, etc.

---

## 🐛 Debugging Guide

### Service Worker Console (Primary Debug Location)
Access via `chrome://extensions/` → TermLens → **Service worker** link

**Common Log Patterns:**
```
🚀 Deep Scan initiated from popup
📄 Current tab: https://example.com
📨 Requesting T&C extraction from content script...
📋 T&C extraction result: Found
============================================================
🤖 CALLING OPENAI API
============================================================
✅ OPENAI RESPONSE RECEIVED
[AI Analysis output...]
```

### Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Badge not showing trackers | `TRACKER_MAP` domain mismatch or `getDomain()` normalization issue | Check Service Worker console for detected domains; compare with `TRACKER_MAP` keys |
| "Could not establish connection" error | Content script not injected in target tab | Background auto-injects via `chrome.scripting.executeScript()`. Verify manifest `content_scripts` entry. |
| T&C not found | Link keywords don't match page, or extracted text < 200 chars | Inspect page for T&C link text; check `termsKeywords` array in content.js |
| OpenAI API fails silently | Invalid API key, quota exceeded, or network error | Check Service Worker console for error logs; verify API key in background.js |

---

## 🔄 Development Workflow

### Adding New Trackers
Edit `TRACKER_MAP` in `background.js`:
```javascript
const TRACKER_MAP = new Map([
    // ... existing entries ...
    ["my-new-tracker.com", "Advertising"],
    // ...
]);
```

Reload extension at `chrome://extensions/` and test on a page using that tracker.

### Customizing AI Prompt
Edit `HARDCODED_PROMPT` in `background.js` to change how OpenAI analyzes T&C text.

### Extending T&C Link Detection
Modify `termsKeywords` array in `content.js` to search for additional link patterns.

---

## 📝 License & Attribution

This project was developed for **PoliHack 2025** as an open-source privacy auditing tool.

---

## 📚 Additional Resources

- [Chrome Manifest v3 Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [How It Works - Detailed Flow](./HOW_IT_WORKS.md)
- [AI Agent Guidelines](./github/copilot-instructions.md)

---

**Questions or Issues?** Check the Service Worker console logs for detailed debugging information, or refer to the troubleshooting section above.
