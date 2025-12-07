# TermLens T&C Analysis - How It Works

## 🔄 Flow Overview

When you click the **Deep Scan** button, here's what happens:

### 1. **Popup (popup.js)**
- User clicks "Deep Scan" button
- Sends message to background script: `{ action: "deepScan" }`
- Shows loading animation

### 2. **Background Script (background.js)**
- Receives the deepScan message
- Gets the current active tab
- Sends message to **content script**: `{ action: "extractTC" }`
- Waits for T&C text extraction

### 3. **Content Script (content.js)**
- Runs in the webpage context
- Tries to find Terms & Conditions:
  - **Option A**: Finds T&C links (searches for keywords: "terms", "conditions", "privacy", etc.)
  - **Option B**: If T&C link found, fetches that page and extracts text
  - **Option C**: If no link found, extracts text from current page
- Returns extracted text to background script

### 4. **OpenAI Analysis (background.js)**
- Receives the extracted T&C text
- Builds a prompt that includes:
  - Your hardcoded instruction prompt
  - The actual T&C text from the website
- Sends to OpenAI API
- Logs everything in **Service Worker console**

### 5. **Results**
- OpenAI response logged in Service Worker console
- Can be used to update the UI with actual AI analysis

---

## 🔍 What Gets Extracted

The content script looks for:
- Links containing keywords: `terms`, `conditions`, `privacy`, `legal`, `tos`, etc.
- Fetches and extracts clean text from those pages
- Removes scripts, styles, nav, headers, footers
- Cleans up whitespace

---

## 📊 Console Logs

### Service Worker Console (Main logs):
```
🚀 Deep Scan initiated from popup
📄 Current tab: [URL]
📨 Requesting T&C extraction from content script...
📋 T&C extraction result: Found
============================================================
🤖 CALLING OPENAI API
============================================================
✅ Including extracted T&C text in prompt
📏 Text length: XXXX characters
🔗 Source: [URL or Current page]
📝 Prompt prepared (first 200 chars): ...
------------------------------------------------------------
============================================================
✅ OPENAI RESPONSE RECEIVED
============================================================
[AI Analysis here]
------------------------------------------------------------
📊 Full API Response:
[Full JSON]
============================================================
```

### Popup Console:
```
📨 Sending Deep Scan request to service worker...
✅ Response received from service worker
Check the Service Worker console for detailed logs!
```

### Page Console (content script):
```
✅ TermLens content script loaded
🔍 Starting T&C extraction...
✅ Found X potential T&C link(s)
🌐 Fetching T&C from: [URL]
✅ Fetched text length: XXXX characters
✅ T&C extraction complete: Success
```

---

## 🚀 How to Test

1. **Reload the extension** in `chrome://extensions/`
2. **Open Service Worker console** by clicking "service worker" link
3. **Navigate to any website** (e.g., google.com, facebook.com)
4. **Open the extension popup**
5. **Click "Deep Scan"**
6. **Watch the logs** in Service Worker console!

---

## 🔧 Customization

### Change the AI Prompt
Edit `background.js` line 7:
```javascript
const HARDCODED_PROMPT = "Your custom prompt here...";
```

### Change the AI Model
Edit `background.js` line 175:
```javascript
model: "gpt-4",  // or "gpt-3.5-turbo"
```

### Adjust Max Tokens
Edit `background.js` line 183:
```javascript
max_tokens: 800,  // Increase for longer responses
```

---

## ⚠️ Current Issue

You're seeing a **429 error** because:
- Your OpenAI API key has no credits/quota
- Need to add billing at: https://platform.openai.com/account/billing

Once you add billing, everything will work! 🎉

