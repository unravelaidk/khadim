//! Khadim Plugin: DuckDuckGo Web Search
//!
//! Provides a `web_search` tool that queries DuckDuckGo and returns
//! structured results the agent can use for grounding.
//!
//! Compiled to `wasm32-unknown-unknown` and loaded by the Khadim host.

// ── Host imports ─────────────────────────────────────────────────────

#[link(wasm_import_module = "host-http")]
extern "C" {
    /// Send an HTTP request. Returns the response body length, or -1 on error.
    fn fetch(request_json_ptr: i32, request_json_len: i32) -> i32;
    /// Copy the response body into the guest buffer. Returns bytes copied.
    fn read_body(buf_ptr: i32, buf_cap: i32) -> i32;
    /// Return the HTTP status code of the last response.
    fn status() -> i32;
}

#[link(wasm_import_module = "host-log")]
extern "C" {
    fn info(ptr: i32, len: i32);
    fn warn(ptr: i32, len: i32);
}

// ── Allocator export ─────────────────────────────────────────────────

/// Simple bump allocator the host calls to write data into guest memory.
/// In a real plugin SDK this would be more sophisticated; for a single-
/// threaded WASM module a global bump is fine.
use core::sync::atomic::{AtomicUsize, Ordering};
use core::ptr::addr_of;

const ARENA_SIZE: usize = 512 * 1024; // 512 KiB

#[repr(align(8))]
#[allow(dead_code)]
struct Arena([u8; ARENA_SIZE]);

static mut ARENA: Arena = Arena([0u8; ARENA_SIZE]);
static ARENA_OFFSET: AtomicUsize = AtomicUsize::new(0);

#[no_mangle]
pub extern "C" fn __alloc(size: i32) -> i32 {
    let align = 8;
    let current = ARENA_OFFSET.load(Ordering::Relaxed);
    let offset = (current + align - 1) & !(align - 1);
    let end = offset + size as usize;
    if end > ARENA_SIZE {
        return 0; // OOM
    }
    ARENA_OFFSET.store(end, Ordering::Relaxed);
    unsafe { (addr_of!(ARENA) as *const u8).add(offset) as i32 }
}

fn arena_reset() {
    ARENA_OFFSET.store(0, Ordering::Relaxed);
}

// ── Helpers ──────────────────────────────────────────────────────────

fn log_info(msg: &str) {
    unsafe { info(msg.as_ptr() as i32, msg.len() as i32) }
}

fn log_warn(msg: &str) {
    unsafe { warn(msg.as_ptr() as i32, msg.len() as i32) }
}

/// Pack (ptr, len) into a single i64 for the host ABI.
fn pack(ptr: i32, len: i32) -> i64 {
    ((ptr as i64) << 32) | (len as u32 as i64)
}

/// Write a string into the arena and return its (ptr, len).
fn arena_write(s: &str) -> (i32, i32) {
    let ptr = __alloc(s.len() as i32);
    if ptr == 0 {
        return (0, 0);
    }
    unsafe {
        core::ptr::copy_nonoverlapping(s.as_ptr(), ptr as *mut u8, s.len());
    }
    (ptr, s.len() as i32)
}

/// Perform an HTTP GET and return the response body as a String.
fn http_get(url: &str) -> Result<(u16, String), String> {
    // Build the request JSON by hand to avoid needing serde
    let mut req = String::with_capacity(url.len() + 40);
    req.push_str("{\"url\":\"");
    // Escape the URL (only quotes and backslashes need escaping)
    for ch in url.chars() {
        match ch {
            '"' => req.push_str("\\\""),
            '\\' => req.push_str("\\\\"),
            c => req.push(c),
        }
    }
    req.push_str("\",\"method\":\"GET\"}");

    let body_len = unsafe { fetch(req.as_ptr() as i32, req.len() as i32) };

    let status_code = unsafe { status() } as u16;

    if body_len < 0 {
        // Read the error message from the body buffer anyway
        let err_len = 256i32;
        let err_ptr = __alloc(err_len);
        if err_ptr != 0 {
            let n = unsafe { read_body(err_ptr, err_len) };
            if n > 0 {
                let slice = unsafe { core::slice::from_raw_parts(err_ptr as *const u8, n as usize) };
                if let Ok(s) = core::str::from_utf8(slice) {
                    return Err(s.to_string());
                }
            }
        }
        return Err(format!("HTTP fetch failed (status {})", status_code));
    }

    let buf_ptr = __alloc(body_len);
    if buf_ptr == 0 {
        return Err("out of memory reading HTTP response".into());
    }
    let n = unsafe { read_body(buf_ptr, body_len) };
    let slice = unsafe { core::slice::from_raw_parts(buf_ptr as *const u8, n as usize) };
    match core::str::from_utf8(slice) {
        Ok(s) => Ok((status_code, s.to_string())),
        Err(_) => Err("response body is not valid UTF-8".into()),
    }
}

// ── Minimal JSON helpers (no serde needed) ───────────────────────────

/// Extract the value of a JSON string field: `"key": "value"`.
fn json_str_field<'a>(json: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("\"{}\"", key);
    let pos = json.find(&needle)?;
    let after_key = &json[pos + needle.len()..];
    // skip optional whitespace and colon
    let after_colon = after_key.trim_start().strip_prefix(':')?;
    let after_ws = after_colon.trim_start();
    if !after_ws.starts_with('"') {
        return None;
    }
    let content = &after_ws[1..];
    // find the closing quote (handle escaped quotes)
    let mut end = 0;
    let bytes = content.as_bytes();
    while end < bytes.len() {
        if bytes[end] == b'\\' {
            end += 2; // skip escaped char
            continue;
        }
        if bytes[end] == b'"' {
            return Some(&content[..end]);
        }
        end += 1;
    }
    None
}

/// Extract all objects from a JSON array field.
fn json_array_objects<'a>(json: &'a str, key: &str) -> Vec<&'a str> {
    let needle = format!("\"{}\"", key);
    let pos = match json.find(&needle) {
        Some(p) => p,
        None => return Vec::new(),
    };
    let after_key = &json[pos + needle.len()..];
    let after_colon = match after_key.find('[') {
        Some(p) => &after_key[p + 1..],
        None => return Vec::new(),
    };

    let mut results = Vec::new();
    let mut rest = after_colon;

    loop {
        // Find the next object start
        let obj_start = match rest.find('{') {
            Some(p) => p,
            None => break,
        };
        // Check if we hit the end of the array first
        if let Some(arr_end) = rest.find(']') {
            if arr_end < obj_start {
                break;
            }
        }

        let obj_body = &rest[obj_start..];
        // Find the matching closing brace (handle nesting)
        let mut depth = 0i32;
        let mut end = 0;
        for (i, b) in obj_body.bytes().enumerate() {
            match b {
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = i + 1;
                        break;
                    }
                }
                _ => {}
            }
        }
        if end == 0 {
            break;
        }
        results.push(&obj_body[..end]);
        rest = &obj_body[end..];
    }

    results
}

/// Unescape basic JSON string escapes.
fn json_unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') => out.push('\n'),
                Some('t') => out.push('\t'),
                Some('r') => out.push('\r'),
                Some('"') => out.push('"'),
                Some('\\') => out.push('\\'),
                Some('/') => out.push('/'),
                Some(other) => {
                    out.push('\\');
                    out.push(other);
                }
                None => out.push('\\'),
            }
        } else {
            out.push(c);
        }
    }
    out
}

// ── DuckDuckGo search ────────────────────────────────────────────────

struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

/// Query the DuckDuckGo HTML Lite endpoint and parse results.
fn duckduckgo_search(query: &str, max_results: usize) -> Result<Vec<SearchResult>, String> {
    // URL-encode the query
    let encoded_query = url_encode(query);
    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        encoded_query
    );
    let (_status, body) = http_get(&url)?;

    let mut results = Vec::new();

    // Parse the HTML response — DuckDuckGo HTML results look like:
    //   <a rel="nofollow" class="result__a" href="URL">TITLE</a>
    //   <a class="result__snippet" href="...">SNIPPET</a>
    let mut search_pos = 0;
    while results.len() < max_results {
        // Find result link
        let link_marker = "class=\"result__a\"";
        let marker_pos = match body[search_pos..].find(link_marker) {
            Some(p) => search_pos + p,
            None => break,
        };

        // Extract href
        let before_marker = &body[..marker_pos];
        let href_start = match before_marker.rfind("href=\"") {
            Some(p) => p + 6,
            None => {
                search_pos = marker_pos + link_marker.len();
                continue;
            }
        };
        let href_end = match body[href_start..].find('"') {
            Some(p) => href_start + p,
            None => {
                search_pos = marker_pos + link_marker.len();
                continue;
            }
        };
        let raw_url = &body[href_start..href_end];

        // The URL is sometimes a DuckDuckGo redirect — extract the actual URL
        let url = if raw_url.contains("uddg=") {
            // Extract from //duckduckgo.com/l/?uddg=ENCODED_URL&...
            let uddg_pos = raw_url.find("uddg=").unwrap() + 5;
            let end_pos = raw_url[uddg_pos..]
                .find('&')
                .map(|p| uddg_pos + p)
                .unwrap_or(raw_url.len());
            url_decode(&raw_url[uddg_pos..end_pos])
        } else {
            html_unescape(raw_url)
        };

        // Extract title (content between > and </a>)
        let after_marker = &body[marker_pos + link_marker.len()..];
        let title_start = match after_marker.find('>') {
            Some(p) => marker_pos + link_marker.len() + p + 1,
            None => {
                search_pos = marker_pos + link_marker.len();
                continue;
            }
        };
        let title_end = match body[title_start..].find("</a>") {
            Some(p) => title_start + p,
            None => {
                search_pos = marker_pos + link_marker.len();
                continue;
            }
        };
        let title = strip_html_tags(&html_unescape(&body[title_start..title_end]));

        // Extract snippet
        search_pos = title_end;
        let snippet_marker = "class=\"result__snippet\"";
        let snippet = if let Some(sp) = body[search_pos..].find(snippet_marker) {
            let snippet_area = &body[search_pos + sp + snippet_marker.len()..];
            if let Some(gt) = snippet_area.find('>') {
                let content_start = &snippet_area[gt + 1..];
                if let Some(end) = content_start.find("</a>").or_else(|| content_start.find("</td>")) {
                    strip_html_tags(&html_unescape(&content_start[..end])).trim().to_string()
                } else {
                    String::new()
                }
            } else {
                String::new()
            }
        } else {
            String::new()
        };

        if !url.is_empty() && !title.is_empty() {
            results.push(SearchResult {
                title: title.trim().to_string(),
                url,
                snippet,
            });
        }
    }

    // If HTML parsing yielded nothing, fall back to the Instant Answer API
    if results.is_empty() {
        return duckduckgo_instant_answer(query, max_results);
    }

    Ok(results)
}

/// Fallback: DuckDuckGo Instant Answer JSON API.
fn duckduckgo_instant_answer(query: &str, max_results: usize) -> Result<Vec<SearchResult>, String> {
    let encoded_query = url_encode(query);
    let url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1",
        encoded_query
    );
    let (_status, body) = http_get(&url)?;

    let mut results = Vec::new();

    // Check for an abstract
    if let Some(abstract_text) = json_str_field(&body, "AbstractText") {
        if !abstract_text.is_empty() {
            let abstract_url = json_str_field(&body, "AbstractURL").unwrap_or("");
            let abstract_source = json_str_field(&body, "AbstractSource").unwrap_or("DuckDuckGo");
            results.push(SearchResult {
                title: format!("{} ({})", json_unescape(abstract_source), "Summary"),
                url: json_unescape(abstract_url),
                snippet: json_unescape(abstract_text),
            });
        }
    }

    // Parse RelatedTopics
    let topics = json_array_objects(&body, "RelatedTopics");
    for topic in topics {
        if results.len() >= max_results {
            break;
        }
        let text = json_str_field(topic, "Text").unwrap_or("");
        let first_url = json_str_field(topic, "FirstURL").unwrap_or("");
        if text.is_empty() || first_url.is_empty() {
            continue;
        }
        // Text often starts with the title in bold, followed by description
        let (title, snippet) = if let Some(dash_pos) = text.find(" - ") {
            (&text[..dash_pos], &text[dash_pos + 3..])
        } else {
            (text, "")
        };
        results.push(SearchResult {
            title: json_unescape(title),
            url: json_unescape(first_url),
            snippet: json_unescape(snippet),
        });
    }

    // Parse Results array
    let result_objects = json_array_objects(&body, "Results");
    for obj in result_objects {
        if results.len() >= max_results {
            break;
        }
        let text = json_str_field(obj, "Text").unwrap_or("");
        let first_url = json_str_field(obj, "FirstURL").unwrap_or("");
        if !text.is_empty() && !first_url.is_empty() {
            results.push(SearchResult {
                title: json_unescape(text),
                url: json_unescape(first_url),
                snippet: String::new(),
            });
        }
    }

    Ok(results)
}

// ── String utilities ─────────────────────────────────────────────────

fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            b' ' => out.push('+'),
            _ => {
                out.push('%');
                out.push(HEX_CHARS[(b >> 4) as usize] as char);
                out.push(HEX_CHARS[(b & 0xF) as usize] as char);
            }
        }
    }
    out
}

const HEX_CHARS: &[u8; 16] = b"0123456789ABCDEF";

fn url_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = hex_val(bytes[i + 1]);
            let lo = hex_val(bytes[i + 2]);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push((h << 4 | l) as char);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(' ');
        } else {
            out.push(bytes[i] as char);
        }
        i += 1;
    }
    out
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'A'..=b'F' => Some(b - b'A' + 10),
        b'a'..=b'f' => Some(b - b'a' + 10),
        _ => None,
    }
}

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

fn strip_html_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

/// Escape a string for use inside a JSON string value.
fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                // Control characters
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out
}

// ── Plugin exports ───────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn khadim_info() -> i64 {
    arena_reset();
    let json = r#"{"name":"Web Search","version":"0.1.0","description":"Search the web using DuckDuckGo","author":"Khadim","license":"MIT","homepage":null,"min_host_version":null}"#;
    let (ptr, len) = arena_write(json);
    pack(ptr, len)
}

#[no_mangle]
pub extern "C" fn khadim_initialize(_config_ptr: i32, _config_len: i32) -> i32 {
    log_info("web-search plugin initialized");
    0 // success
}

#[no_mangle]
pub extern "C" fn khadim_list_tools() -> i64 {
    arena_reset();
    let json = r#"[{"name":"web_search","description":"Search the web using DuckDuckGo. Returns titles, URLs, and snippets for the top results. Use this when you need up-to-date information, facts, documentation, or anything not in your training data.","params":[{"name":"query","description":"The search query string","param_type":"string","required":true,"default_value":null},{"name":"max_results","description":"Maximum number of results to return (default: 8)","param_type":"integer","required":false,"default_value":"8"}],"prompt_snippet":"- web_search: Search the web via DuckDuckGo for up-to-date information"}]"#;
    let (ptr, len) = arena_write(json);
    pack(ptr, len)
}

#[no_mangle]
pub extern "C" fn khadim_execute_tool(
    name_ptr: i32,
    name_len: i32,
    args_ptr: i32,
    args_len: i32,
) -> i64 {
    arena_reset();

    // Read tool name
    let name = unsafe {
        let slice = core::slice::from_raw_parts(name_ptr as *const u8, name_len as usize);
        core::str::from_utf8_unchecked(slice)
    };

    if name != "web_search" {
        let err = r#"{"content":"Unknown tool","is_error":true,"metadata":null}"#;
        let (ptr, len) = arena_write(err);
        return pack(ptr, len);
    }

    // Read args JSON
    let args_str = unsafe {
        let slice = core::slice::from_raw_parts(args_ptr as *const u8, args_len as usize);
        core::str::from_utf8_unchecked(slice)
    };

    let query = match json_str_field(args_str, "query") {
        Some(q) => json_unescape(q),
        None => {
            let err = r#"{"content":"Missing required parameter: query","is_error":true,"metadata":null}"#;
            let (ptr, len) = arena_write(err);
            return pack(ptr, len);
        }
    };

    // Parse max_results — look for the numeric value
    let max_results = json_str_field(args_str, "max_results")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or_else(|| {
            // Also try as a bare number: "max_results": 5
            extract_json_number(args_str, "max_results").unwrap_or(8)
        });

    log_info(&format!("Searching DuckDuckGo for: {}", query));

    match duckduckgo_search(&query, max_results) {
        Ok(results) if results.is_empty() => {
            let content = format!("No results found for: {}", query);
            let resp = format!(
                "{{\"content\":\"{}\",\"is_error\":false,\"metadata\":null}}",
                json_escape(&content)
            );
            let (ptr, len) = arena_write(&resp);
            pack(ptr, len)
        }
        Ok(results) => {
            // Format results as readable text
            let mut content = format!("## Search Results for: {}\n\n", query);
            for (i, result) in results.iter().enumerate() {
                content.push_str(&format!("### {}. {}\n", i + 1, result.title));
                content.push_str(&format!("**URL:** {}\n", result.url));
                if !result.snippet.is_empty() {
                    content.push_str(&format!("{}\n", result.snippet));
                }
                content.push('\n');
            }

            let resp = format!(
                "{{\"content\":\"{}\",\"is_error\":false,\"metadata\":\"{{\\\"result_count\\\":{},\\\"query\\\":\\\"{}\\\"}}\"}}",
                json_escape(&content),
                results.len(),
                json_escape(&query),
            );
            let (ptr, len) = arena_write(&resp);
            pack(ptr, len)
        }
        Err(err) => {
            log_warn(&format!("Search failed: {}", err));
            let resp = format!(
                "{{\"content\":\"Search failed: {}\",\"is_error\":true,\"metadata\":null}}",
                json_escape(&err)
            );
            let (ptr, len) = arena_write(&resp);
            pack(ptr, len)
        }
    }
}

/// Extract a bare JSON number for a given key.
fn extract_json_number(json: &str, key: &str) -> Option<usize> {
    let needle = format!("\"{}\"", key);
    let pos = json.find(&needle)?;
    let after_key = &json[pos + needle.len()..];
    let after_colon = after_key.trim_start().strip_prefix(':')?;
    let after_ws = after_colon.trim_start();
    // Read digits
    let end = after_ws
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(after_ws.len());
    if end == 0 {
        return None;
    }
    after_ws[..end].parse().ok()
}
