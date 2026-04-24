# Known Issues: `glob` and `grep` Tools

## 1. `glob` Tool

### Problem: Unbounded directory traversal
- `collect_files()` recursively walks the **entire** directory tree and stores **every** file path in a `Vec<String>` **before** applying the glob filter.
- On large repositories (or those containing `node_modules`, `.git`, `target`, etc.) this can collect **hundreds of thousands** or **millions** of paths.
- Consequences:
  - **Context window overflow** – the un-truncated output is injected straight into the model context.
  - **Memory bloat** – the `Vec` grows without bound.
  - **Slow performance** – we visit directories we immediately throw away.

### Problem: No exclusion of common noise directories
- `GrepTool` already skips `.git`, `node_modules`, `target`, `dist`, `build`, `.next`, and `coverage`.
- `GlobTool` skips **none** of them, so a pattern like `**/*.rs` still descends into `node_modules`.

### Problem: No output truncation
- Even after filtering, a broad pattern (e.g. `**/*`) can match thousands of files.
- There is no `truncate_output()` call, so every match is returned raw.

## 2. `grep` Tool

### Problem: Frequently returns "No matches found" when matches exist
- When `path` is a **single file** and `include` is provided, `grep --include` does **not** apply to individual file arguments. `grep` silently skips the file, yielding zero results.
- The `-R` flag follows symlinks, which can cause cyclic traversal or permission errors in some environments, again producing empty output.
- No case-insensitive option (`-i`) is used, so searches for `Foo` miss `foo`.
- Only `-m 100` matches per file are returned; on very large generated files this can hide legitimate results without telling the user.
- The "No matches found" message gives no context about *where* the tool searched, making debugging impossible.

## 3. `web_search` Tool

### Problem: No redirect following
- `reqwest::Client::builder()` does **not** follow redirects by default. DuckDuckGo frequently returns 302 responses; without following them we fetch an empty or error page.

### Problem: No HTTP status check
- When DuckDuckGo blocks the request (403 Forbidden, 429 Too Many Requests) or returns any non-2xx status, the tool still tries to parse the response body and reports "No search results found", giving the user no clue that the engine blocked them.

### Problem: Fragile line-by-line HTML parsing
- The parser iterates `html.lines()` and assumes every tag and its content fit on a single line. Real-world HTML from DuckDuckGo wraps tags across lines, so `class="result__a"` and its `href`/`title` are often split across multiple lines. This causes extraction to silently fail.

### Problem: Result URL missing from output
- Even when parsing succeeds, only the title and snippet are returned. The actual destination URL is never shown, making the results far less useful.

### Problem: No blocking/CAPTCHA detection
- DuckDuckGo serves "You are sending automated queries" or empty result pages when it detects scraping. The tool never detects these cases and always reports a generic "no results" message.

## Proposed Fixes

### `glob`
1. ✅ Skip common noise directories during traversal (`.git`, `node_modules`, `target`, `dist`, `build`, `.next`, `coverage`).
2. ✅ Apply the glob filter **while traversing** instead of collecting all files first.
3. ✅ Cap the total number of returned paths at 1 000.
4. ✅ Apply `truncate_output()` to the final string.

### `grep`
1. ✅ When `path` resolves to a single file, **omit** `--include` and pass the file directly.
2. ✅ Use `-r` instead of `-R` to avoid following symlinks.
3. ✅ Add `-i` for case-insensitive matching.
4. ✅ Keep `-m` limit per file, but add proper exit-code handling (grep returns 1 for no matches).
5. ✅ Include the searched directory/file path in the "No matches found" message.
6. ✅ Surface stderr when grep fails unexpectedly.

### `web_search`
1. ✅ Enable redirect following on the HTTP client (`reqwest::redirect::Policy::limited(10)`).
2. ✅ Check `response.status().is_success()` before parsing; report non-2xx status codes clearly.
3. ✅ Replace line-by-line parsing with block-based parsing: split the HTML by `<div class="result"` and extract fields from each block independently of line breaks.
4. ✅ Include the resolved URL in every result line.
5. ✅ Detect common blocking indicators ("automated queries", "CAPTCHA", "anomaly-modal", "bots use DuckDuckGo") and surface them to the user.

---

## Current Reality (April 2026)

**DuckDuckGo now blocks all programmatic access** to `html.duckduckgo.com` and `lite.duckduckgo.com` with image-based CAPTCHAs ("Select all squares containing a duck"). Both endpoints were tested and return the same challenge page. This means `web_search` will almost always return:

> "Search engine (DuckDuckGo) detected automated access and served a block/CAPTCHA page. Web search is currently unavailable."

### Recommended next steps
1. **Add support for API-key-based search providers** (Bing Web Search, Brave Search API, Google Custom Search, SerpAPI). These require user configuration but are reliable.
2. **Add SearXNG fallback** – some public SearXNG instances still work without keys, though they are rate-limited and change frequently.
3. **Document the limitation** in the tool description so users know web search may not work and should rely on local files / `read` / `grep` instead.

The parsing and error-handling improvements above are still valuable if/when a working search endpoint is added.
