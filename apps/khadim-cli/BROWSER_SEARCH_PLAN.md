# Plan: Headless Browser Web Search

## Problem
DuckDuckGo blocks all programmatic HTTP access with image CAPTCHAs. The current `web_search` tool using `reqwest` + HTML scraping is effectively dead.

## Solution
Use a real headless browser (Chrome/Chromium via `chromiumoxide`) to perform searches. A real browser:
- Executes JavaScript
- Has a proper DOM
- Sends realistic headers, cookies, and TLS fingerprint
- Much harder to distinguish from a real user

## Architecture

```
web_search execute()
├── Try Browser Search (Chrome-based)
│   ├── Launch headless Chrome
│   ├── Navigate to DuckDuckGo
│   ├── Type query + submit
│   ├── Wait for results to load
│   ├── Extract results via DOM evaluation
│   └── Close browser
├── If Chrome not available or browser fails
│   └── Fall back to existing HTTP scraper
└── Return results
```

## Implementation Details

### 1. Dependency
Add `chromiumoxide` to `khadim-coding-agent/Cargo.toml`:
```toml
chromiumoxide = { version = "0.9", default-features = false, features = ["tokio-runtime"] }
```

### 2. Browser Launch
- Use `Browser::launch(BrowserConfig::builder().build()?)`
- Headless by default
- Need to handle case where Chrome binary is not found

### 3. Navigation & Search
- Create a new page
- Navigate to `https://duckduckgo.com`
- Wait for the search input (`#search_form_input_homepage`)
- Type the query
- Submit the form (or click the search button)
- Wait for results to load

### 4. Result Extraction
Use JavaScript evaluation to extract results from the DOM:
```javascript
Array.from(document.querySelectorAll('[data-result]')).map(r => ({
    title: r.querySelector('a')?.textContent?.trim() || '',
    url: r.querySelector('a')?.href || '',
    snippet: r.querySelector('.result__snippet, [data-result="snippet"]')?.textContent?.trim() || ''
}))
```

### 5. Stealth Considerations
DuckDuckGo may still detect automation. Techniques:
- Use `--disable-blink-features=AutomationControlled`
- Set a realistic viewport
- Use a non-headless user agent if possible, but run headless
- Add small random delays between actions

### 6. Error Handling
- If Chrome is not installed → fallback to HTTP
- If navigation fails → fallback to HTTP
- If CAPTCHA still appears → detect in browser output and report
- Always kill the browser process (use `kill_on_drop` / timeout)

### 7. Performance
- Browser launch takes ~1-3 seconds
- Each search adds page load time (~2-5 seconds)
- Total per search: ~3-8 seconds
- Add a 20-second timeout for the entire browser operation

## Files to Modify
- `crates/khadim-coding-agent/Cargo.toml` — add dependency
- `crates/khadim-coding-agent/src/tools.rs` — replace WebSearchTool implementation

## Fallback Strategy
Keep the existing `reqwest`-based implementation as a lightweight fallback when:
- Chrome is not installed
- Browser fails to launch
- User explicitly opts out (future feature)
