//! Khadim Plugin: Calendar
//!
//! Provides four agent tools that read/write calendar events via the
//! host-store KV store (backed by {plugin_dir}/store.json).
//! After every mutation the plugin emits a `calendar_updated` UI event so
//! the frontend panel refreshes without polling.
//!
//! Events JSON shape stored at key "events":
//!   [{ "id": "...", "title": "...", "start": "ISO8601", "end": "ISO8601",
//!      "description": "...", "all_day": bool }]

// ── Host imports ──────────────────────────────────────────────────────

#[link(wasm_import_module = "host-store")]
extern "C" {
    fn store_set(key_ptr: i32, key_len: i32, val_ptr: i32, val_len: i32) -> i32;
    fn store_get(key_ptr: i32, key_len: i32) -> i32;
    fn store_read(buf_ptr: i32, buf_cap: i32) -> i32;
}

#[link(wasm_import_module = "host-ui")]
extern "C" {
    fn emit_event(name_ptr: i32, name_len: i32, data_ptr: i32, data_len: i32) -> i32;
}

#[link(wasm_import_module = "host-log")]
extern "C" {
    fn info(ptr: i32, len: i32);
    fn warn(ptr: i32, len: i32);
}

// ── Allocator ─────────────────────────────────────────────────────────

use core::sync::atomic::{AtomicUsize, Ordering};
use core::ptr::addr_of;

const ARENA_SIZE: usize = 512 * 1024;

#[repr(align(8))]
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
        return 0;
    }
    ARENA_OFFSET.store(end, Ordering::Relaxed);
    unsafe { (addr_of!(ARENA) as *const u8).add(offset) as i32 }
}

fn arena_reset() {
    ARENA_OFFSET.store(0, Ordering::Relaxed);
}

// ── Helpers ───────────────────────────────────────────────────────────

fn log_info(msg: &str) {
    unsafe { info(msg.as_ptr() as i32, msg.len() as i32) }
}

fn pack(ptr: i32, len: i32) -> i64 {
    ((ptr as i64) << 32) | (len as u32 as i64)
}

fn arena_write(s: &str) -> (i32, i32) {
    let ptr = __alloc(s.len() as i32);
    if ptr == 0 { return (0, 0); }
    // __alloc returns an absolute WASM address — use it directly.
    unsafe {
        core::ptr::copy_nonoverlapping(s.as_ptr(), ptr as *mut u8, s.len());
    }
    (ptr, s.len() as i32)
}

// ── Store helpers ─────────────────────────────────────────────────────

const EVENTS_KEY: &str = "events";

fn store_get_str(key: &str) -> Option<String> {
    let len = unsafe { store_get(key.as_ptr() as i32, key.len() as i32) };
    if len < 0 { return None; }
    let buf_ptr = __alloc(len);
    if buf_ptr == 0 { return None; }
    let copied = unsafe { store_read(buf_ptr, len) };
    if copied < 0 { return None; }
    let bytes: Vec<u8> = unsafe {
        core::slice::from_raw_parts(buf_ptr as *const u8, copied as usize).to_vec()
    };
    String::from_utf8(bytes).ok()
}

fn store_set_str(key: &str, value: &str) -> bool {
    let r = unsafe {
        store_set(
            key.as_ptr() as i32,
            key.len() as i32,
            value.as_ptr() as i32,
            value.len() as i32,
        )
    };
    r == 0
}

fn emit_ui(name: &str, data: &str) {
    unsafe {
        emit_event(
            name.as_ptr() as i32,
            name.len() as i32,
            data.as_ptr() as i32,
            data.len() as i32,
        );
    }
}

// ── Minimal JSON helpers (no_std) ────────────────────────────────────

fn json_str(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn json_bool(b: bool) -> &'static str {
    if b { "true" } else { "false" }
}

/// Extract a string value for `key` from a flat JSON object string.
/// Very naive — only works for simple string values with no nesting.
fn json_get_str<'a>(obj: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("\"{}\"", key);
    let start = obj.find(&needle)?;
    let after_key = &obj[start + needle.len()..];
    let colon = after_key.find(':')? + 1;
    let rest = after_key[colon..].trim_start();
    if rest.starts_with('"') {
        let inner = &rest[1..];
        let end = inner.find('"')?;
        Some(&inner[..end])
    } else {
        None
    }
}

fn json_get_bool(obj: &str, key: &str) -> bool {
    let needle = format!("\"{}\"", key);
    let Some(start) = obj.find(&needle) else { return false };
    let after_key = &obj[start + needle.len()..];
    let Some(colon) = after_key.find(':') else { return false };
    let rest = after_key[colon + 1..].trim_start();
    rest.starts_with("true")
}

// ── Event struct (simple string-based) ───────────────────────────────

struct CalEvent {
    id: String,
    title: String,
    start: String,
    end: String,
    description: String,
    all_day: bool,
}

impl CalEvent {
    fn to_json(&self) -> String {
        format!(
            "{{\"id\":{},\"title\":{},\"start\":{},\"end\":{},\"description\":{},\"all_day\":{}}}",
            json_str(&self.id),
            json_str(&self.title),
            json_str(&self.start),
            json_str(&self.end),
            json_str(&self.description),
            json_bool(self.all_day),
        )
    }
}

fn events_to_json(events: &[CalEvent]) -> String {
    let parts: Vec<String> = events.iter().map(|e| e.to_json()).collect();
    format!("[{}]", parts.join(","))
}

/// Parse the events array from the store. Returns Vec<CalEvent>.
/// We do a very simple parse: split on `},{` to get individual objects.
fn load_events() -> Vec<CalEvent> {
    let raw = store_get_str(EVENTS_KEY).unwrap_or_else(|| "[]".to_string());
    let trimmed = raw.trim();
    if trimmed == "[]" || trimmed.is_empty() {
        return Vec::new();
    }
    // Strip outer [ ]
    let inner = trimmed.trim_start_matches('[').trim_end_matches(']');
    if inner.trim().is_empty() {
        return Vec::new();
    }
    // Split by "},{" to get individual event JSON objects
    let mut events = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    let chars: Vec<char> = inner.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    let obj: String = chars[start..=i].iter().collect();
                    let id = json_get_str(&obj, "id").unwrap_or("").to_string();
                    let title = json_get_str(&obj, "title").unwrap_or("").to_string();
                    let start_t = json_get_str(&obj, "start").unwrap_or("").to_string();
                    let end_t = json_get_str(&obj, "end").unwrap_or("").to_string();
                    let desc = json_get_str(&obj, "description").unwrap_or("").to_string();
                    let all_day = json_get_bool(&obj, "all_day");
                    events.push(CalEvent { id, title, start: start_t, end: end_t, description: desc, all_day });
                    start = i + 1;
                    // skip comma separator
                    while start < chars.len() && (chars[start] == ',' || chars[start] == ' ') {
                        start += 1;
                    }
                }
            }
            _ => {}
        }
    }
    events
}

fn save_events(events: &[CalEvent]) {
    let json = events_to_json(events);
    store_set_str(EVENTS_KEY, &json);
}

fn next_id() -> String {
    // Use current event count + timestamp approximation via arena offset as entropy
    let n = ARENA_OFFSET.load(Ordering::Relaxed);
    format!("evt_{:x}", n)
}

// ── Plugin info ───────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn khadim_info() -> i64 {
    arena_reset();
    let info_json = r#"{"name":"Calendar","version":"0.1.0","description":"Shared calendar — agent and user manage events together","author":"Khadim","license":"MIT"}"#;
    let (ptr, len) = arena_write(info_json);
    pack(ptr, len)
}

// ── Tool list ─────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn khadim_list_tools() -> i64 {
    arena_reset();
    let tools = r#"[
  {
    "name": "calendar_add_event",
    "description": "Add a new event to the user's calendar. Use this when the user mentions scheduling something, a meeting, deadline, appointment, or any time-based plan.",
    "params": [
      {"name":"title","description":"Short title for the event","param_type":"string","required":true,"default_value":null},
      {"name":"start","description":"Start date/time in ISO 8601 format (e.g. 2025-04-15T09:00:00)","param_type":"string","required":true,"default_value":null},
      {"name":"end","description":"End date/time in ISO 8601 format","param_type":"string","required":true,"default_value":null},
      {"name":"description","description":"Optional longer description or notes","param_type":"string","required":false,"default_value":"\"\""},
      {"name":"all_day","description":"true if this is an all-day event","param_type":"boolean","required":false,"default_value":"false"}
    ],
    "prompt_snippet": "Use calendar_add_event to schedule events, meetings, deadlines, appointments, or reminders."
  },
  {
    "name": "calendar_list_events",
    "description": "List all calendar events, optionally filtered to a date range.",
    "params": [
      {"name":"from","description":"Optional start of filter range (ISO 8601 date)","param_type":"string","required":false,"default_value":"\"\""},
      {"name":"to","description":"Optional end of filter range (ISO 8601 date)","param_type":"string","required":false,"default_value":"\"\""}
    ],
    "prompt_snippet": "Use calendar_list_events to see what's on the calendar before scheduling or when the user asks about upcoming plans."
  },
  {
    "name": "calendar_delete_event",
    "description": "Delete a calendar event by its ID.",
    "params": [
      {"name":"id","description":"The event ID to delete","param_type":"string","required":true,"default_value":null}
    ],
    "prompt_snippet": "Use calendar_delete_event to remove a cancelled or unwanted event."
  },
  {
    "name": "calendar_update_event",
    "description": "Update an existing calendar event's fields.",
    "params": [
      {"name":"id","description":"The event ID to update","param_type":"string","required":true,"default_value":null},
      {"name":"title","description":"New title (omit to keep current)","param_type":"string","required":false,"default_value":"\"\""},
      {"name":"start","description":"New start ISO 8601 (omit to keep current)","param_type":"string","required":false,"default_value":"\"\""},
      {"name":"end","description":"New end ISO 8601 (omit to keep current)","param_type":"string","required":false,"default_value":"\"\""},
      {"name":"description","description":"New description (omit to keep current)","param_type":"string","required":false,"default_value":"\"\""}
    ],
    "prompt_snippet": "Use calendar_update_event to reschedule or edit details of an existing event."
  }
]"#;
    let (ptr, len) = arena_write(tools);
    pack(ptr, len)
}

// ── Tool execution ────────────────────────────────────────────────────

fn ok_result(content: &str) -> i64 {
    let json = format!("{{\"content\":{},\"is_error\":false,\"metadata\":null}}", json_str(content));
    let (ptr, len) = arena_write(&json);
    pack(ptr, len)
}

fn err_result(content: &str) -> i64 {
    let json = format!("{{\"content\":{},\"is_error\":true,\"metadata\":null}}", json_str(content));
    let (ptr, len) = arena_write(&json);
    pack(ptr, len)
}

#[no_mangle]
pub extern "C" fn khadim_execute_tool(
    name_ptr: i32, name_len: i32,
    args_ptr: i32, args_len: i32,
) -> i64 {
    arena_reset();

    // name_ptr / args_ptr are absolute WASM addresses written by the host.
    let name = unsafe {
        core::str::from_utf8(core::slice::from_raw_parts(name_ptr as *const u8, name_len as usize))
            .unwrap_or("")
            .to_string()
    };

    let args = unsafe {
        core::str::from_utf8(core::slice::from_raw_parts(args_ptr as *const u8, args_len as usize))
            .unwrap_or("{}")
            .to_string()
    };

    log_info(&format!("calendar tool: {name}"));

    match name.as_str() {
        "calendar_add_event" => tool_add_event(&args),
        "calendar_list_events" => tool_list_events(&args),
        "calendar_delete_event" => tool_delete_event(&args),
        "calendar_update_event" => tool_update_event(&args),
        _ => err_result(&format!("Unknown tool: {name}")),
    }
}

// ── Tool implementations ──────────────────────────────────────────────

fn tool_add_event(args: &str) -> i64 {
    let title = json_get_str(args, "title").unwrap_or("").to_string();
    let start = json_get_str(args, "start").unwrap_or("").to_string();
    let end = json_get_str(args, "end").unwrap_or("").to_string();
    let description = json_get_str(args, "description").unwrap_or("").to_string();
    let all_day = json_get_bool(args, "all_day");

    if title.is_empty() || start.is_empty() || end.is_empty() {
        return err_result("title, start and end are required");
    }

    let id = next_id();
    let event = CalEvent { id: id.clone(), title: title.clone(), start, end, description, all_day };

    let mut events = load_events();
    events.push(event);
    save_events(&events);

    emit_ui("calendar_updated", "{}");

    ok_result(&format!("Added event '{}' (id: {})", title, id))
}

fn tool_list_events(args: &str) -> i64 {
    let from = json_get_str(args, "from").unwrap_or("").to_string();
    let to   = json_get_str(args, "to").unwrap_or("").to_string();

    let events = load_events();
    let filtered: Vec<&CalEvent> = events.iter().filter(|e| {
        let after_from = from.is_empty() || e.start >= from;
        let before_to  = to.is_empty()   || e.start <= to;
        after_from && before_to
    }).collect();

    if filtered.is_empty() {
        return ok_result("No events found");
    }

    let lines: Vec<String> = filtered.iter().map(|e| {
        format!("• [{}] {} ({} → {}){}", e.id, e.title, e.start, e.end,
            if e.description.is_empty() { String::new() } else { format!(": {}", e.description) })
    }).collect();

    ok_result(&lines.join("\n"))
}

fn tool_delete_event(args: &str) -> i64 {
    let id = json_get_str(args, "id").unwrap_or("").to_string();
    if id.is_empty() {
        return err_result("id is required");
    }

    let mut events = load_events();
    let before = events.len();
    events.retain(|e| e.id != id);

    if events.len() == before {
        return err_result(&format!("No event with id '{}'", id));
    }

    save_events(&events);
    emit_ui("calendar_updated", "{}");

    ok_result(&format!("Deleted event {}", id))
}

fn tool_update_event(args: &str) -> i64 {
    let id = json_get_str(args, "id").unwrap_or("").to_string();
    if id.is_empty() {
        return err_result("id is required");
    }

    let mut events = load_events();
    let Some(ev) = events.iter_mut().find(|e| e.id == id) else {
        return err_result(&format!("No event with id '{}'", id));
    };

    if let Some(t) = json_get_str(args, "title") { if !t.is_empty() { ev.title = t.to_string(); } }
    if let Some(s) = json_get_str(args, "start") { if !s.is_empty() { ev.start = s.to_string(); } }
    if let Some(e) = json_get_str(args, "end") { if !e.is_empty() { ev.end = e.to_string(); } }
    if let Some(d) = json_get_str(args, "description") { if !d.is_empty() { ev.description = d.to_string(); } }

    save_events(&events);
    emit_ui("calendar_updated", "{}");

    ok_result(&format!("Updated event {}", id))
}
