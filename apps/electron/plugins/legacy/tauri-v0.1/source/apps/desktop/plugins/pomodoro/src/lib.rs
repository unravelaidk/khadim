//! Khadim Plugin: Pomodoro
//!
//! Provides agent tools for managing study tasks with time estimates
//! and controlling the pomodoro timer. The agent can:
//!   - Add tasks with AI-estimated durations
//!   - List/delete/update tasks
//!   - Start/stop/pause the timer for a specific task
//!
//! Tasks JSON shape stored at key "tasks":
//!   [{ "id": "...", "title": "...", "description": "...",
//!      "estimated_minutes": u32, "elapsed_seconds": u32,
//!      "completed": bool, "pomodoros_done": u32 }]
//!
//! Timer state stored at key "timer":
//!   { "status": "idle"|"running"|"paused"|"break",
//!     "task_id": "...", "remaining_seconds": u32,
//!     "session_minutes": u32, "break_minutes": u32 }

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
    if end > ARENA_SIZE { return 0; }
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
    unsafe { core::ptr::copy_nonoverlapping(s.as_ptr(), ptr as *mut u8, s.len()); }
    (ptr, s.len() as i32)
}

// ── Store helpers ─────────────────────────────────────────────────────

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
        store_set(key.as_ptr() as i32, key.len() as i32, value.as_ptr() as i32, value.len() as i32)
    };
    r == 0
}

fn emit_ui(name: &str, data: &str) {
    unsafe {
        emit_event(name.as_ptr() as i32, name.len() as i32, data.as_ptr() as i32, data.len() as i32);
    }
}

// ── Minimal JSON helpers ─────────────────────────────────────────────

fn json_str(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

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

fn json_get_num(obj: &str, key: &str) -> Option<u32> {
    let needle = format!("\"{}\"", key);
    let start = obj.find(&needle)?;
    let after_key = &obj[start + needle.len()..];
    let colon = after_key.find(':')? + 1;
    let rest = after_key[colon..].trim_start();
    let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
    rest[..end].parse::<u32>().ok()
}

fn json_get_bool(obj: &str, key: &str) -> bool {
    let needle = format!("\"{}\"", key);
    let Some(start) = obj.find(&needle) else { return false };
    let after_key = &obj[start + needle.len()..];
    let Some(colon) = after_key.find(':') else { return false };
    let rest = after_key[colon + 1..].trim_start();
    rest.starts_with("true")
}

// ── Task ──────────────────────────────────────────────────────────────

const TASKS_KEY: &str = "tasks";
const TIMER_KEY: &str = "timer";

struct Task {
    id: String,
    title: String,
    description: String,
    estimated_minutes: u32,
    elapsed_seconds: u32,
    completed: bool,
    pomodoros_done: u32,
}

impl Task {
    fn to_json(&self) -> String {
        format!(
            "{{\"id\":{},\"title\":{},\"description\":{},\"estimated_minutes\":{},\"elapsed_seconds\":{},\"completed\":{},\"pomodoros_done\":{}}}",
            json_str(&self.id),
            json_str(&self.title),
            json_str(&self.description),
            self.estimated_minutes,
            self.elapsed_seconds,
            if self.completed { "true" } else { "false" },
            self.pomodoros_done,
        )
    }
}

fn tasks_to_json(tasks: &[Task]) -> String {
    let parts: Vec<String> = tasks.iter().map(|t| t.to_json()).collect();
    format!("[{}]", parts.join(","))
}

fn parse_objects(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed == "[]" || trimmed.is_empty() { return Vec::new(); }
    let inner = trimmed.trim_start_matches('[').trim_end_matches(']');
    if inner.trim().is_empty() { return Vec::new(); }
    let mut objects = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    let chars: Vec<char> = inner.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    objects.push(chars[start..=i].iter().collect());
                    start = i + 1;
                    while start < chars.len() && (chars[start] == ',' || chars[start] == ' ') { start += 1; }
                }
            }
            _ => {}
        }
    }
    objects
}

fn load_tasks() -> Vec<Task> {
    let raw = store_get_str(TASKS_KEY).unwrap_or_else(|| "[]".to_string());
    parse_objects(&raw).iter().map(|obj| {
        Task {
            id: json_get_str(obj, "id").unwrap_or("").to_string(),
            title: json_get_str(obj, "title").unwrap_or("").to_string(),
            description: json_get_str(obj, "description").unwrap_or("").to_string(),
            estimated_minutes: json_get_num(obj, "estimated_minutes").unwrap_or(25),
            elapsed_seconds: json_get_num(obj, "elapsed_seconds").unwrap_or(0),
            completed: json_get_bool(obj, "completed"),
            pomodoros_done: json_get_num(obj, "pomodoros_done").unwrap_or(0),
        }
    }).collect()
}

fn save_tasks(tasks: &[Task]) {
    store_set_str(TASKS_KEY, &tasks_to_json(tasks));
}

fn next_id() -> String {
    let n = ARENA_OFFSET.load(Ordering::Relaxed);
    format!("task_{:x}", n)
}

// ── Plugin info ───────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn khadim_info() -> i64 {
    arena_reset();
    let info_json = r#"{"name":"Pomodoro","version":"0.1.0","description":"Pomodoro timer with study tasks — AI estimates time and controls the timer","author":"Khadim","license":"MIT"}"#;
    let (ptr, len) = arena_write(info_json);
    pack(ptr, len)
}

// ── Tool list ─────────────────────────────────────────────────────────

#[no_mangle]
pub extern "C" fn khadim_list_tools() -> i64 {
    arena_reset();
    let tools = r#"[
  {
    "name": "pomodoro_add_task",
    "description": "Add a study task with an AI-estimated duration. Estimate how many minutes the task will take based on its complexity, then add it to the task list. The user can then start a pomodoro session for this task.",
    "params": [
      {"name":"title","description":"Short title for the study task","param_type":"string","required":true,"default_value":null},
      {"name":"description","description":"What the task involves — topics, chapters, exercises, etc.","param_type":"string","required":false,"default_value":"\"\""},
      {"name":"estimated_minutes","description":"Your estimate of how many minutes this task will take. Use your judgment: light reading ~15-20min, chapter study ~30-45min, problem sets ~45-60min, deep study ~60-90min.","param_type":"number","required":true,"default_value":null}
    ],
    "prompt_snippet": "When the user mentions studying, homework, revision, reading, practice problems, or learning — use pomodoro_add_task to create a task with your time estimate. Break large tasks into smaller focused sessions."
  },
  {
    "name": "pomodoro_list_tasks",
    "description": "List all study tasks with their status, time estimates, and progress.",
    "params": [
      {"name":"show_completed","description":"Include completed tasks","param_type":"boolean","required":false,"default_value":"false"}
    ],
    "prompt_snippet": "Use pomodoro_list_tasks to show the user their study queue and progress."
  },
  {
    "name": "pomodoro_delete_task",
    "description": "Delete a study task by ID.",
    "params": [
      {"name":"id","description":"The task ID to delete","param_type":"string","required":true,"default_value":null}
    ],
    "prompt_snippet": "Use pomodoro_delete_task to remove a task the user no longer needs."
  },
  {
    "name": "pomodoro_update_task",
    "description": "Update a task's title, description, or time estimate.",
    "params": [
      {"name":"id","description":"The task ID to update","param_type":"string","required":true,"default_value":null},
      {"name":"title","description":"New title (omit to keep current)","param_type":"string","required":false,"default_value":"\"\""},
      {"name":"description","description":"New description (omit to keep current)","param_type":"string","required":false,"default_value":"\"\""},
      {"name":"estimated_minutes","description":"New time estimate in minutes (omit to keep current)","param_type":"number","required":false,"default_value":"0"}
    ],
    "prompt_snippet": "Use pomodoro_update_task to adjust a task's details or re-estimate its duration."
  },
  {
    "name": "pomodoro_complete_task",
    "description": "Mark a study task as completed.",
    "params": [
      {"name":"id","description":"The task ID to mark complete","param_type":"string","required":true,"default_value":null}
    ],
    "prompt_snippet": "Use pomodoro_complete_task when the user says they finished a task."
  },
  {
    "name": "pomodoro_start_timer",
    "description": "Start the pomodoro timer for a specific task. This will begin a focused study session. If no task_id is given, start a generic 25-minute session. The timer runs in the UI — this tool signals the frontend to start.",
    "params": [
      {"name":"task_id","description":"Task ID to associate the timer with (optional — omit for a generic session)","param_type":"string","required":false,"default_value":"\"\""},
      {"name":"session_minutes","description":"Duration of the focus session in minutes","param_type":"number","required":false,"default_value":"25"},
      {"name":"break_minutes","description":"Duration of the break after the session","param_type":"number","required":false,"default_value":"5"}
    ],
    "prompt_snippet": "When the user says 'start studying', 'let's go', 'begin timer', 'focus time', or similar — use pomodoro_start_timer. If they have a specific task, include the task_id."
  },
  {
    "name": "pomodoro_stop_timer",
    "description": "Stop/pause the currently running pomodoro timer.",
    "params": [],
    "prompt_snippet": "Use pomodoro_stop_timer when the user asks to stop, pause, or take a break from the current session."
  },
  {
    "name": "pomodoro_timer_status",
    "description": "Get the current timer status — whether it's running, paused, on break, or idle.",
    "params": [],
    "prompt_snippet": "Use pomodoro_timer_status to check what the user is currently working on."
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

    let name = unsafe {
        core::str::from_utf8(core::slice::from_raw_parts(name_ptr as *const u8, name_len as usize))
            .unwrap_or("").to_string()
    };
    let args = unsafe {
        core::str::from_utf8(core::slice::from_raw_parts(args_ptr as *const u8, args_len as usize))
            .unwrap_or("{}").to_string()
    };

    log_info(&format!("pomodoro tool: {name}"));

    match name.as_str() {
        "pomodoro_add_task" => tool_add_task(&args),
        "pomodoro_list_tasks" => tool_list_tasks(&args),
        "pomodoro_delete_task" => tool_delete_task(&args),
        "pomodoro_update_task" => tool_update_task(&args),
        "pomodoro_complete_task" => tool_complete_task(&args),
        "pomodoro_start_timer" => tool_start_timer(&args),
        "pomodoro_stop_timer" => tool_stop_timer(),
        "pomodoro_timer_status" => tool_timer_status(),
        _ => err_result(&format!("Unknown tool: {name}")),
    }
}

// ── Tool implementations ──────────────────────────────────────────────

fn tool_add_task(args: &str) -> i64 {
    let title = json_get_str(args, "title").unwrap_or("").to_string();
    let description = json_get_str(args, "description").unwrap_or("").to_string();
    let estimated_minutes = json_get_num(args, "estimated_minutes").unwrap_or(25);

    if title.is_empty() {
        return err_result("title is required");
    }

    let id = next_id();
    let task = Task {
        id: id.clone(), title: title.clone(), description,
        estimated_minutes, elapsed_seconds: 0, completed: false, pomodoros_done: 0,
    };

    let mut tasks = load_tasks();
    tasks.push(task);
    save_tasks(&tasks);
    emit_ui("pomodoro_updated", "{}");

    ok_result(&format!("Added task '{}' (id: {}, estimated: {} min)", title, id, estimated_minutes))
}

fn tool_list_tasks(args: &str) -> i64 {
    let show_completed = json_get_bool(args, "show_completed");
    let tasks = load_tasks();
    let filtered: Vec<&Task> = tasks.iter().filter(|t| show_completed || !t.completed).collect();

    if filtered.is_empty() {
        return ok_result("No tasks found. Add some study tasks to get started!");
    }

    let lines: Vec<String> = filtered.iter().map(|t| {
        let status = if t.completed { "✅" } else { "📋" };
        let progress = if t.estimated_minutes > 0 {
            let pct = (t.elapsed_seconds as f32 / (t.estimated_minutes as f32 * 60.0) * 100.0) as u32;
            format!(" ({}% done, {} pomodoros)", pct.min(100), t.pomodoros_done)
        } else { String::new() };
        format!("{} [{}] {} — {} min{}{}", status, t.id, t.title, t.estimated_minutes, progress,
            if t.description.is_empty() { String::new() } else { format!("\n    {}", t.description) })
    }).collect();

    ok_result(&lines.join("\n"))
}

fn tool_delete_task(args: &str) -> i64 {
    let id = json_get_str(args, "id").unwrap_or("").to_string();
    if id.is_empty() { return err_result("id is required"); }

    let mut tasks = load_tasks();
    let before = tasks.len();
    tasks.retain(|t| t.id != id);
    if tasks.len() == before { return err_result(&format!("No task with id '{}'", id)); }

    save_tasks(&tasks);
    emit_ui("pomodoro_updated", "{}");
    ok_result(&format!("Deleted task {}", id))
}

fn tool_update_task(args: &str) -> i64 {
    let id = json_get_str(args, "id").unwrap_or("").to_string();
    if id.is_empty() { return err_result("id is required"); }

    let mut tasks = load_tasks();
    let Some(t) = tasks.iter_mut().find(|t| t.id == id) else {
        return err_result(&format!("No task with id '{}'", id));
    };

    if let Some(title) = json_get_str(args, "title") { if !title.is_empty() { t.title = title.to_string(); } }
    if let Some(desc) = json_get_str(args, "description") { if !desc.is_empty() { t.description = desc.to_string(); } }
    let mins = json_get_num(args, "estimated_minutes").unwrap_or(0);
    if mins > 0 { t.estimated_minutes = mins; }

    save_tasks(&tasks);
    emit_ui("pomodoro_updated", "{}");
    ok_result(&format!("Updated task {}", id))
}

fn tool_complete_task(args: &str) -> i64 {
    let id = json_get_str(args, "id").unwrap_or("").to_string();
    if id.is_empty() { return err_result("id is required"); }

    let mut tasks = load_tasks();
    let Some(idx) = tasks.iter().position(|t| t.id == id) else {
        return err_result(&format!("No task with id '{}'", id));
    };
    tasks[idx].completed = true;
    let title = tasks[idx].title.clone();

    save_tasks(&tasks);
    emit_ui("pomodoro_updated", "{}");
    ok_result(&format!("Marked task '{}' as complete! 🎉", title))
}

fn tool_start_timer(args: &str) -> i64 {
    let task_id = json_get_str(args, "task_id").unwrap_or("").to_string();
    let session_minutes = json_get_num(args, "session_minutes").unwrap_or(25);
    let break_minutes = json_get_num(args, "break_minutes").unwrap_or(5);

    // If task_id given, verify it exists
    if !task_id.is_empty() {
        let tasks = load_tasks();
        if !tasks.iter().any(|t| t.id == task_id) {
            return err_result(&format!("No task with id '{}'", task_id));
        }
    }

    let timer_json = format!(
        "{{\"status\":\"running\",\"task_id\":{},\"remaining_seconds\":{},\"session_minutes\":{},\"break_minutes\":{}}}",
        json_str(&task_id), session_minutes * 60, session_minutes, break_minutes
    );
    store_set_str(TIMER_KEY, &timer_json);
    emit_ui("pomodoro_timer", &timer_json);

    let msg = if task_id.is_empty() {
        format!("Started a {} minute pomodoro session. Focus time! 🍅", session_minutes)
    } else {
        let tasks = load_tasks();
        let title = tasks.iter().find(|t| t.id == task_id).map(|t| t.title.as_str()).unwrap_or("Unknown");
        format!("Started a {} minute pomodoro for '{}'. Let's go! 🍅", session_minutes, title)
    };
    ok_result(&msg)
}

fn tool_stop_timer() -> i64 {
    let timer_json = r#"{"status":"idle","task_id":"","remaining_seconds":0,"session_minutes":25,"break_minutes":5}"#;
    store_set_str(TIMER_KEY, timer_json);
    emit_ui("pomodoro_timer", timer_json);
    ok_result("Timer stopped. Take a breather! ☕")
}

fn tool_timer_status() -> i64 {
    let raw = store_get_str(TIMER_KEY).unwrap_or_else(|| {
        r#"{"status":"idle","task_id":"","remaining_seconds":0,"session_minutes":25,"break_minutes":5}"#.to_string()
    });
    let status = json_get_str(&raw, "status").unwrap_or("idle");
    let task_id = json_get_str(&raw, "task_id").unwrap_or("");
    let remaining = json_get_num(&raw, "remaining_seconds").unwrap_or(0);

    let msg = match status {
        "running" => {
            let mins = remaining / 60;
            let secs = remaining % 60;
            if task_id.is_empty() {
                format!("Timer running: {}:{:02} remaining", mins, secs)
            } else {
                let tasks = load_tasks();
                let title = tasks.iter().find(|t| t.id == task_id).map(|t| t.title.as_str()).unwrap_or("Unknown");
                format!("Timer running for '{}': {}:{:02} remaining", title, mins, secs)
            }
        }
        "paused" => format!("Timer paused with {}:{:02} remaining", remaining / 60, remaining % 60),
        "break" => format!("On break! {}:{:02} remaining", remaining / 60, remaining % 60),
        _ => "Timer is idle. Start a session to begin studying!".to_string(),
    };
    ok_result(&msg)
}
