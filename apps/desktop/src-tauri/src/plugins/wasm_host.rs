use crate::error::AppError;
use crate::plugins::manifest::{PluginPermissions, ResolvedPlugin};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use wasmtime::{Caller, Engine, Instance, Linker, Memory, Module, Store};

// ── Types mirroring the WIT interface ────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmToolDef {
    pub name: String,
    pub description: String,
    pub params: Vec<WasmToolParam>,
    pub prompt_snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmToolParam {
    pub name: String,
    pub description: String,
    pub param_type: String,
    pub required: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmToolResult {
    pub content: String,
    pub is_error: bool,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WasmPluginInfo {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub license: Option<String>,
    pub homepage: Option<String>,
    pub min_host_version: Option<String>,
}

// ── Host state available to the plugin ───────────────────────────────

/// Per-plugin host state passed into WASM calls.
pub struct PluginHostState {
    pub plugin_name: String,
    pub workspace_root: PathBuf,
    pub permissions: PluginPermissions,
    pub config: HashMap<String, String>,
    pub store: Arc<Mutex<HashMap<String, String>>>,
    /// Buffer holding the most recent filesystem read/list result.
    pub fs_response_buf: Vec<u8>,
    /// Buffer holding the most recent HTTP response body.
    pub http_response_buf: Vec<u8>,
    /// HTTP status code of the most recent response.
    pub http_response_status: u16,
}

// ── The WASM plugin instance ─────────────────────────────────────────

/// A loaded and initialized WASM plugin.
pub struct WasmPlugin {
    pub info: WasmPluginInfo,
    pub tools: Vec<WasmToolDef>,
    pub resolved: ResolvedPlugin,
    // We keep these alive for the plugin's lifetime
    store: Mutex<Store<PluginHostState>>,
    instance: Instance,
}

// Safety: wasmtime Store is Send when the host state is Send.
// We protect it with a Mutex so only one call at a time.
unsafe impl Send for WasmPlugin {}
unsafe impl Sync for WasmPlugin {}

impl WasmPlugin {
    /// Load and initialize a plugin from a resolved manifest.
    pub fn load(
        resolved: &ResolvedPlugin,
        workspace_root: &Path,
        config: HashMap<String, String>,
    ) -> Result<Self, AppError> {
        let engine = Engine::default();
        let wasm_bytes = std::fs::read(&resolved.wasm_path).map_err(|e| {
            AppError::io(format!(
                "Failed to read WASM file {}: {e}",
                resolved.wasm_path.display()
            ))
        })?;

        let module = Module::new(&engine, &wasm_bytes).map_err(|e| {
            AppError::invalid_input(format!(
                "Failed to compile WASM module {}: {e}",
                resolved.wasm_path.display()
            ))
        })?;

        let permissions = resolved.manifest.permissions.clone();
        let plugin_name = resolved.manifest.plugin.name.clone();
        let plugin_store = Arc::new(Mutex::new(HashMap::<String, String>::new()));

        let host_state = PluginHostState {
            plugin_name: plugin_name.clone(),
            workspace_root: workspace_root.to_path_buf(),
            permissions: permissions.clone(),
            config: config.clone(),
            store: plugin_store,
            fs_response_buf: Vec::new(),
            http_response_buf: Vec::new(),
            http_response_status: 0,
        };

        let mut store = Store::new(&engine, host_state);

        // Build the linker with host functions
        let mut linker = Linker::new(&engine);
        register_host_functions(&mut linker, &permissions)?;

        let instance = linker.instantiate(&mut store, &module).map_err(|e| {
            AppError::invalid_input(format!("Failed to instantiate plugin {plugin_name}: {e}"))
        })?;

        // Call `info` export
        let info = call_info(&instance, &mut store, &plugin_name)?;

        // Call `initialize` export with config
        call_initialize(&instance, &mut store, &plugin_name, &config)?;

        // Call `list_tools` export
        let tools = call_list_tools(&instance, &mut store, &plugin_name)?;

        Ok(Self {
            info,
            tools,
            resolved: resolved.clone(),
            store: Mutex::new(store),
            instance,
        })
    }

    /// Execute a tool by name with JSON arguments.
    pub fn execute_tool(&self, tool_name: &str, args: &Value) -> Result<WasmToolResult, AppError> {
        let mut store = self.store.lock().map_err(|e| {
            AppError::backend_busy(format!("Plugin store lock poisoned: {e}"))
        })?;

        let args_json = serde_json::to_string(args).unwrap_or_else(|_| "{}".to_string());

        call_execute_tool(&self.instance, &mut store, tool_name, &args_json)
    }
}

// ── Host function registration ───────────────────────────────────────

fn register_host_functions(
    linker: &mut Linker<PluginHostState>,
    permissions: &PluginPermissions,
) -> Result<(), AppError> {
    let fs_allowed = permissions.fs;
    let http_allowed = permissions.http;
    let allowed_hosts = permissions.allowed_hosts.clone();
    let _store_allowed = permissions.store;

    // ─── host-fs ─────────────────────────────────────────────────
    //
    // Two-phase protocol mirroring host-http:
    //   1. Guest calls read-file / list-dir -> host stores bytes in fs_response_buf
    //   2. Guest calls read-result(buf_ptr, buf_cap) to copy bytes into guest memory
    //   3. write-file / append-file return 0 on success, -1 on failure

    linker
        .func_wrap(
            "host-fs",
            "read-file",
            move |mut caller: Caller<'_, PluginHostState>, path_ptr: i32, path_len: i32| -> i32 {
                if !fs_allowed {
                    caller.data_mut().fs_response_buf = b"Filesystem permission denied".to_vec();
                    return -1;
                }

                let rel_path = match read_guest_string(&mut caller, path_ptr, path_len) {
                    Some(path) => path,
                    None => {
                        caller.data_mut().fs_response_buf = b"Invalid path".to_vec();
                        return -1;
                    }
                };

                let resolved = match resolve_workspace_path(&caller.data().workspace_root, &rel_path) {
                    Ok(path) => path,
                    Err(err) => {
                        caller.data_mut().fs_response_buf = err.into_bytes();
                        return -1;
                    }
                };

                match std::fs::read(&resolved) {
                    Ok(bytes) => {
                        let len = bytes.len() as i32;
                        caller.data_mut().fs_response_buf = bytes;
                        len
                    }
                    Err(err) => {
                        caller.data_mut().fs_response_buf = format!(
                            "Failed to read {}: {err}",
                            resolved.display()
                        )
                        .into_bytes();
                        -1
                    }
                }
            },
        )
        .ok();

    linker
        .func_wrap(
            "host-fs",
            "read-result",
            |mut caller: Caller<'_, PluginHostState>, buf_ptr: i32, buf_cap: i32| -> i32 {
                let body = caller.data().fs_response_buf.clone();
                copy_bytes_to_guest(&mut caller, &body, buf_ptr, buf_cap)
            },
        )
        .ok();

    linker
        .func_wrap(
            "host-fs",
            "write-file",
            move |mut caller: Caller<'_, PluginHostState>, path_ptr: i32, path_len: i32, content_ptr: i32, content_len: i32| -> i32 {
                if !fs_allowed {
                    caller.data_mut().fs_response_buf = b"Filesystem permission denied".to_vec();
                    return -1;
                }

                let rel_path = match read_guest_string(&mut caller, path_ptr, path_len) {
                    Some(path) => path,
                    None => {
                        caller.data_mut().fs_response_buf = b"Invalid path".to_vec();
                        return -1;
                    }
                };
                let content = match read_guest_bytes(&mut caller, content_ptr, content_len) {
                    Some(bytes) => bytes,
                    None => {
                        caller.data_mut().fs_response_buf = b"Invalid content buffer".to_vec();
                        return -1;
                    }
                };

                let resolved = match resolve_workspace_path(&caller.data().workspace_root, &rel_path) {
                    Ok(path) => path,
                    Err(err) => {
                        caller.data_mut().fs_response_buf = err.into_bytes();
                        return -1;
                    }
                };

                if let Some(parent) = resolved.parent() {
                    if let Err(err) = std::fs::create_dir_all(parent) {
                        caller.data_mut().fs_response_buf = format!(
                            "Failed to create parent directory {}: {err}",
                            parent.display()
                        )
                        .into_bytes();
                        return -1;
                    }
                }

                match std::fs::write(&resolved, &content) {
                    Ok(()) => {
                        caller.data_mut().fs_response_buf = format!(
                            "Wrote {} bytes to {}",
                            content.len(),
                            resolved.display()
                        )
                        .into_bytes();
                        0
                    }
                    Err(err) => {
                        caller.data_mut().fs_response_buf = format!(
                            "Failed to write {}: {err}",
                            resolved.display()
                        )
                        .into_bytes();
                        -1
                    }
                }
            },
        )
        .ok();

    linker
        .func_wrap(
            "host-fs",
            "append-file",
            move |mut caller: Caller<'_, PluginHostState>, path_ptr: i32, path_len: i32, content_ptr: i32, content_len: i32| -> i32 {
                if !fs_allowed {
                    caller.data_mut().fs_response_buf = b"Filesystem permission denied".to_vec();
                    return -1;
                }

                let rel_path = match read_guest_string(&mut caller, path_ptr, path_len) {
                    Some(path) => path,
                    None => {
                        caller.data_mut().fs_response_buf = b"Invalid path".to_vec();
                        return -1;
                    }
                };
                let content = match read_guest_bytes(&mut caller, content_ptr, content_len) {
                    Some(bytes) => bytes,
                    None => {
                        caller.data_mut().fs_response_buf = b"Invalid content buffer".to_vec();
                        return -1;
                    }
                };

                let resolved = match resolve_workspace_path(&caller.data().workspace_root, &rel_path) {
                    Ok(path) => path,
                    Err(err) => {
                        caller.data_mut().fs_response_buf = err.into_bytes();
                        return -1;
                    }
                };

                if let Some(parent) = resolved.parent() {
                    if let Err(err) = std::fs::create_dir_all(parent) {
                        caller.data_mut().fs_response_buf = format!(
                            "Failed to create parent directory {}: {err}",
                            parent.display()
                        )
                        .into_bytes();
                        return -1;
                    }
                }

                match std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&resolved)
                    .and_then(|mut file| std::io::Write::write_all(&mut file, &content))
                {
                    Ok(()) => {
                        caller.data_mut().fs_response_buf = format!(
                            "Appended {} bytes to {}",
                            content.len(),
                            resolved.display()
                        )
                        .into_bytes();
                        0
                    }
                    Err(err) => {
                        caller.data_mut().fs_response_buf = format!(
                            "Failed to append {}: {err}",
                            resolved.display()
                        )
                        .into_bytes();
                        -1
                    }
                }
            },
        )
        .ok();

    linker
        .func_wrap(
            "host-fs",
            "list-dir",
            move |mut caller: Caller<'_, PluginHostState>, path_ptr: i32, path_len: i32| -> i32 {
                if !fs_allowed {
                    caller.data_mut().fs_response_buf = b"Filesystem permission denied".to_vec();
                    return -1;
                }

                let rel_path = match read_guest_string(&mut caller, path_ptr, path_len) {
                    Some(path) => path,
                    None => {
                        caller.data_mut().fs_response_buf = b"Invalid path".to_vec();
                        return -1;
                    }
                };

                let resolved = match resolve_workspace_path(&caller.data().workspace_root, &rel_path) {
                    Ok(path) => path,
                    Err(err) => {
                        caller.data_mut().fs_response_buf = err.into_bytes();
                        return -1;
                    }
                };

                let mut entries = match std::fs::read_dir(&resolved) {
                    Ok(entries) => entries
                        .flatten()
                        .filter_map(|entry| {
                            let file_type = entry.file_type().ok()?;
                            let name = entry.file_name().to_string_lossy().to_string();
                            Some((file_type.is_dir(), name))
                        })
                        .collect::<Vec<_>>(),
                    Err(err) => {
                        caller.data_mut().fs_response_buf = format!(
                            "Failed to list {}: {err}",
                            resolved.display()
                        )
                        .into_bytes();
                        return -1;
                    }
                };

                entries.sort_by(|a, b| a.1.cmp(&b.1));
                let payload = entries
                    .into_iter()
                    .map(|(is_dir, name)| format!("{}\t{}", if is_dir { "D" } else { "F" }, name))
                    .collect::<Vec<_>>()
                    .join("\n");
                let bytes = payload.into_bytes();
                let len = bytes.len() as i32;
                caller.data_mut().fs_response_buf = bytes;
                len
            },
        )
        .ok();

    linker
        .func_wrap(
            "host-fs",
            "path-exists",
            move |mut caller: Caller<'_, PluginHostState>, path_ptr: i32, path_len: i32| -> i32 {
                if !fs_allowed {
                    caller.data_mut().fs_response_buf = b"Filesystem permission denied".to_vec();
                    return -1;
                }

                let rel_path = match read_guest_string(&mut caller, path_ptr, path_len) {
                    Some(path) => path,
                    None => {
                        caller.data_mut().fs_response_buf = b"Invalid path".to_vec();
                        return -1;
                    }
                };

                match resolve_workspace_path(&caller.data().workspace_root, &rel_path) {
                    Ok(path) => {
                        caller.data_mut().fs_response_buf.clear();
                        if path.exists() { 1 } else { 0 }
                    }
                    Err(err) => {
                        caller.data_mut().fs_response_buf = err.into_bytes();
                        -1
                    }
                }
            },
        )
        .ok();

    // ─── host-http ───────────────────────────────────────────────
    //
    // Two-phase protocol:
    //   1. Guest calls `fetch(request_json_ptr, request_json_len) -> i32`
    //      Host makes the HTTP request, stores the response body in
    //      PluginHostState, and returns the body length (or -1 on error).
    //   2. Guest calls `read_body(buf_ptr, buf_cap) -> i32`
    //      Host copies the stored response body into guest memory.
    //   3. Guest calls `status() -> i32` for the HTTP status code.

    let http_allowed_fetch = http_allowed;
    let allowed_hosts_fetch = allowed_hosts.clone();

    linker
        .func_wrap(
            "host-http",
            "fetch",
            move |mut caller: Caller<'_, PluginHostState>, req_ptr: i32, req_len: i32| -> i32 {
                if !http_allowed_fetch {
                    log::warn!(
                        "[plugin:{}] HTTP fetch denied – permission not granted",
                        caller.data().plugin_name
                    );
                    // Store an error so the guest can still read_body for an error message
                    caller.data_mut().http_response_status = 0;
                    caller.data_mut().http_response_buf =
                        b"HTTP permission denied".to_vec();
                    return -1;
                }

                // Read the request JSON from guest memory
                let memory = match caller.get_export("memory") {
                    Some(wasmtime::Extern::Memory(m)) => m,
                    _ => return -1,
                };
                let data = memory.data(&caller);
                let start = req_ptr as usize;
                let end = start + req_len as usize;
                if end > data.len() {
                    return -1;
                }
                let req_json = match std::str::from_utf8(&data[start..end]) {
                    Ok(s) => s.to_owned(),
                    Err(_) => return -1,
                };

                // Parse {"url": "...", "method": "GET", "headers": {...}, "body": "..."}
                let req_val: Value = match serde_json::from_str(&req_json) {
                    Ok(v) => v,
                    Err(_) => return -1,
                };

                let url = match req_val.get("url").and_then(|v| v.as_str()) {
                    Some(u) => u.to_owned(),
                    None => return -1,
                };

                // Enforce allowed_hosts
                if !allowed_hosts_fetch.is_empty() {
                    let host_ok = if let Ok(parsed) = url::Url::parse(&url) {
                        if let Some(host) = parsed.host_str() {
                            allowed_hosts_fetch.iter().any(|pattern| {
                                if pattern.starts_with("*.") {
                                    let suffix = &pattern[1..]; // ".example.com"
                                    host.ends_with(suffix) || host == &pattern[2..]
                                } else {
                                    host == pattern
                                }
                            })
                        } else {
                            false
                        }
                    } else {
                        false
                    };
                    if !host_ok {
                        log::warn!(
                            "[plugin:{}] HTTP fetch blocked – host not in allowed_hosts: {url}",
                            caller.data().plugin_name
                        );
                        caller.data_mut().http_response_status = 0;
                        caller.data_mut().http_response_buf =
                            format!("Host not allowed: {url}").into_bytes();
                        return -1;
                    }
                }

                let method = req_val
                    .get("method")
                    .and_then(|v| v.as_str())
                    .unwrap_or("GET")
                    .to_uppercase();

                let body = req_val
                    .get("body")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_owned());

                let headers: Vec<(String, String)> = req_val
                    .get("headers")
                    .and_then(|v| v.as_object())
                    .map(|map| {
                        map.iter()
                            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_owned())))
                            .collect()
                    })
                    .unwrap_or_default();

                let plugin_name = caller.data().plugin_name.clone();

                // Perform the blocking HTTP request
                let result = std::thread::spawn(move || -> Result<(u16, Vec<u8>), String> {
                    let client = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(30))
                        .build()
                        .map_err(|e| e.to_string())?;

                    let mut builder = match method.as_str() {
                        "POST" => client.post(&url),
                        "PUT" => client.put(&url),
                        "DELETE" => client.delete(&url),
                        "PATCH" => client.patch(&url),
                        "HEAD" => client.head(&url),
                        _ => client.get(&url),
                    };

                    for (key, value) in &headers {
                        builder = builder.header(key.as_str(), value.as_str());
                    }

                    if let Some(body) = body {
                        builder = builder.body(body);
                    }

                    let response = builder.send().map_err(|e| e.to_string())?;
                    let status = response.status().as_u16();
                    let bytes = response.bytes().map_err(|e| e.to_string())?;
                    Ok((status, bytes.to_vec()))
                })
                .join();

                match result {
                    Ok(Ok((status, bytes))) => {
                        let len = bytes.len() as i32;
                        caller.data_mut().http_response_status = status;
                        caller.data_mut().http_response_buf = bytes;
                        log::debug!(
                            "[plugin:{plugin_name}] HTTP fetch OK – status={status} len={len}"
                        );
                        len
                    }
                    Ok(Err(err)) => {
                        log::warn!("[plugin:{plugin_name}] HTTP fetch error: {err}");
                        caller.data_mut().http_response_status = 0;
                        caller.data_mut().http_response_buf = err.into_bytes();
                        -1
                    }
                    Err(_) => {
                        log::error!("[plugin:{plugin_name}] HTTP fetch thread panicked");
                        caller.data_mut().http_response_status = 0;
                        caller.data_mut().http_response_buf =
                            b"internal host error".to_vec();
                        -1
                    }
                }
            },
        )
        .ok();

    linker
        .func_wrap(
            "host-http",
            "read_body",
            |mut caller: Caller<'_, PluginHostState>, buf_ptr: i32, buf_cap: i32| -> i32 {
                let body = caller.data().http_response_buf.clone();
                let to_copy = body.len().min(buf_cap as usize);

                let memory = match caller.get_export("memory") {
                    Some(wasmtime::Extern::Memory(m)) => m,
                    _ => return -1,
                };
                let data = memory.data_mut(&mut caller);
                let start = buf_ptr as usize;
                let end = start + to_copy;
                if end > data.len() {
                    return -1;
                }
                data[start..end].copy_from_slice(&body[..to_copy]);
                to_copy as i32
            },
        )
        .ok();

    linker
        .func_wrap(
            "host-http",
            "status",
            |caller: Caller<'_, PluginHostState>| -> i32 {
                caller.data().http_response_status as i32
            },
        )
        .ok();

    // ─── host-log ────────────────────────────────────────────────

    linker
        .func_wrap("host-log", "info", |mut caller: Caller<'_, PluginHostState>, ptr: i32, len: i32| {
            let msg = read_guest_string(&mut caller, ptr, len).unwrap_or_default();
            let name = &caller.data().plugin_name;
            log::info!("[plugin:{name}] {msg}");
        })
        .ok();

    linker
        .func_wrap("host-log", "debug", |mut caller: Caller<'_, PluginHostState>, ptr: i32, len: i32| {
            let msg = read_guest_string(&mut caller, ptr, len).unwrap_or_default();
            let name = &caller.data().plugin_name;
            log::debug!("[plugin:{name}] {msg}");
        })
        .ok();

    linker
        .func_wrap("host-log", "warn", |mut caller: Caller<'_, PluginHostState>, ptr: i32, len: i32| {
            let msg = read_guest_string(&mut caller, ptr, len).unwrap_or_default();
            let name = &caller.data().plugin_name;
            log::warn!("[plugin:{name}] {msg}");
        })
        .ok();

    linker
        .func_wrap("host-log", "error", |mut caller: Caller<'_, PluginHostState>, ptr: i32, len: i32| {
            let msg = read_guest_string(&mut caller, ptr, len).unwrap_or_default();
            let name = &caller.data().plugin_name;
            log::error!("[plugin:{name}] {msg}");
        })
        .ok();

    Ok(())
}

/// Read raw bytes from guest memory via a Caller.
fn read_guest_bytes(caller: &mut Caller<'_, PluginHostState>, ptr: i32, len: i32) -> Option<Vec<u8>> {
    let memory = match caller.get_export("memory") {
        Some(wasmtime::Extern::Memory(m)) => m,
        _ => return None,
    };
    let data = memory.data(&*caller);
    let start = ptr as usize;
    let end = start + len as usize;
    if end > data.len() {
        return None;
    }
    Some(data[start..end].to_vec())
}

/// Read a UTF-8 string from guest memory via a Caller.
fn read_guest_string(caller: &mut Caller<'_, PluginHostState>, ptr: i32, len: i32) -> Option<String> {
    read_guest_bytes(caller, ptr, len)
        .and_then(|bytes| std::str::from_utf8(&bytes).ok().map(|s| s.to_owned()))
}

fn copy_bytes_to_guest(
    caller: &mut Caller<'_, PluginHostState>,
    bytes: &[u8],
    buf_ptr: i32,
    buf_cap: i32,
) -> i32 {
    let to_copy = bytes.len().min(buf_cap.max(0) as usize);
    let memory = match caller.get_export("memory") {
        Some(wasmtime::Extern::Memory(m)) => m,
        _ => return -1,
    };
    let data = memory.data_mut(caller);
    let start = buf_ptr as usize;
    let end = start + to_copy;
    if end > data.len() {
        return -1;
    }
    data[start..end].copy_from_slice(&bytes[..to_copy]);
    to_copy as i32
}

fn resolve_workspace_path(workspace_root: &Path, requested: &str) -> Result<PathBuf, String> {
    if requested.trim().is_empty() {
        return Ok(workspace_root.to_path_buf());
    }

    let requested_path = Path::new(requested);
    if requested_path.is_absolute() {
        return Err("Absolute paths are not allowed".to_string());
    }

    let mut resolved = workspace_root.to_path_buf();
    for component in requested_path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(part) => resolved.push(part),
            Component::ParentDir => {
                if !resolved.pop() || !resolved.starts_with(workspace_root) {
                    return Err(format!(
                        "Path escapes workspace root: {}",
                        requested
                    ));
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(format!("Unsupported path: {}", requested));
            }
        }
    }

    if !resolved.starts_with(workspace_root) {
        return Err(format!("Path escapes workspace root: {}", requested));
    }

    Ok(resolved)
}

// ── Calling plugin exports ───────────────────────────────────────────
//
// These use a JSON-over-memory convention:
//   1. Call `__alloc(size)` in the guest to get a pointer
//   2. Write JSON bytes into guest memory at that pointer
//   3. Call the export with (ptr, len)
//   4. Read the result from guest memory
//
// For the initial implementation, we use a simpler approach:
// plugins export functions that work with the WASM memory directly.

fn read_string_from_memory(store: &Store<PluginHostState>, memory: &Memory, ptr: i32, len: i32) -> Result<String, AppError> {
    let data = memory.data(store);
    let start = ptr as usize;
    let end = start + len as usize;
    if end > data.len() {
        return Err(AppError::invalid_input("Plugin returned invalid memory range"));
    }
    String::from_utf8(data[start..end].to_vec())
        .map_err(|e| AppError::invalid_input(format!("Plugin returned invalid UTF-8: {e}")))
}

fn write_string_to_memory(
    store: &mut Store<PluginHostState>,
    instance: &Instance,
    s: &str,
) -> Result<(i32, i32), AppError> {
    let alloc = instance
        .get_typed_func::<i32, i32>(&mut *store, "__alloc")
        .or_else(|_| instance.get_typed_func::<i32, i32>(&mut *store, "alloc"))
        .map_err(|e| AppError::invalid_input(format!("Plugin missing __alloc export: {e}")))?;

    let bytes = s.as_bytes();
    let len = bytes.len() as i32;
    let ptr = alloc.call(&mut *store, len)
        .map_err(|e| AppError::invalid_input(format!("Plugin alloc failed: {e}")))?;

    let memory = instance
        .get_memory(&mut *store, "memory")
        .ok_or_else(|| AppError::invalid_input("Plugin missing memory export"))?;

    let data = memory.data_mut(&mut *store);
    let start = ptr as usize;
    let end = start + bytes.len();
    if end > data.len() {
        return Err(AppError::invalid_input("Plugin memory too small for write"));
    }
    data[start..end].copy_from_slice(bytes);

    Ok((ptr, len))
}

/// Unpack a packed i64 into (ptr, len) — high 32 bits = ptr, low 32 bits = len.
fn unpack_i64(packed: i64) -> (i32, i32) {
    let ptr = (packed >> 32) as i32;
    let len = (packed & 0xFFFF_FFFF) as i32;
    (ptr, len)
}

fn call_info(
    instance: &Instance,
    store: &mut Store<PluginHostState>,
    plugin_name: &str,
) -> Result<WasmPluginInfo, AppError> {
    let info_fn = instance.get_typed_func::<(), i64>(&mut *store, "khadim_info");

    match info_fn {
        Ok(func) => {
            let packed = func.call(&mut *store, ())
                .map_err(|e| AppError::invalid_input(format!("Plugin {plugin_name} info() failed: {e}")))?;
            let (ptr, len) = unpack_i64(packed);

            let memory = instance
                .get_memory(&mut *store, "memory")
                .ok_or_else(|| AppError::invalid_input("Plugin missing memory export"))?;

            let json_str = read_string_from_memory(store, &memory, ptr, len)?;
            serde_json::from_str(&json_str).map_err(|e| {
                AppError::invalid_input(format!("Plugin {plugin_name} returned invalid info JSON: {e}"))
            })
        }
        Err(_) => {
            let manifest = &store.data().plugin_name;
            Ok(WasmPluginInfo {
                name: manifest.clone(),
                version: "0.0.0".to_string(),
                description: String::new(),
                author: String::new(),
                license: None,
                homepage: None,
                min_host_version: None,
            })
        }
    }
}

fn call_initialize(
    instance: &Instance,
    store: &mut Store<PluginHostState>,
    plugin_name: &str,
    config: &HashMap<String, String>,
) -> Result<(), AppError> {
    let init_fn = instance.get_typed_func::<(i32, i32), i32>(&mut *store, "khadim_initialize");

    match init_fn {
        Ok(func) => {
            let config_json = serde_json::to_string(config).unwrap_or_else(|_| "{}".to_string());
            let (ptr, len) = write_string_to_memory(store, instance, &config_json)?;
            let result = func.call(&mut *store, (ptr, len))
                .map_err(|e| AppError::invalid_input(format!("Plugin {plugin_name} initialize() failed: {e}")))?;
            if result != 0 {
                return Err(AppError::invalid_input(format!(
                    "Plugin {plugin_name} initialize() returned error code {result}"
                )));
            }
            Ok(())
        }
        Err(_) => Ok(()), // No initialize export — that's fine
    }
}

fn call_list_tools(
    instance: &Instance,
    store: &mut Store<PluginHostState>,
    plugin_name: &str,
) -> Result<Vec<WasmToolDef>, AppError> {
    let list_fn = instance.get_typed_func::<(), i64>(&mut *store, "khadim_list_tools");

    match list_fn {
        Ok(func) => {
            let packed = func.call(&mut *store, ())
                .map_err(|e| AppError::invalid_input(format!("Plugin {plugin_name} list_tools() failed: {e}")))?;
            let (ptr, len) = unpack_i64(packed);

            let memory = instance
                .get_memory(&mut *store, "memory")
                .ok_or_else(|| AppError::invalid_input("Plugin missing memory export"))?;

            let json_str = read_string_from_memory(store, &memory, ptr, len)?;
            serde_json::from_str(&json_str).map_err(|e| {
                AppError::invalid_input(format!("Plugin {plugin_name} returned invalid tools JSON: {e}"))
            })
        }
        Err(_) => Ok(Vec::new()),
    }
}

fn call_execute_tool(
    instance: &Instance,
    store: &mut Store<PluginHostState>,
    tool_name: &str,
    args_json: &str,
) -> Result<WasmToolResult, AppError> {
    let exec_fn = instance.get_typed_func::<(i32, i32, i32, i32), i64>(&mut *store, "khadim_execute_tool");

    match exec_fn {
        Ok(func) => {
            let (name_ptr, name_len) = write_string_to_memory(store, instance, tool_name)?;
            let (args_ptr, args_len) = write_string_to_memory(store, instance, args_json)?;

            let packed = func
                .call(&mut *store, (name_ptr, name_len, args_ptr, args_len))
                .map_err(|e| AppError::invalid_input(format!("Plugin execute_tool({tool_name}) failed: {e}")))?;
            let (result_ptr, result_len) = unpack_i64(packed);

            let memory = instance
                .get_memory(&mut *store, "memory")
                .ok_or_else(|| AppError::invalid_input("Plugin missing memory export"))?;

            let json_str = read_string_from_memory(store, &memory, result_ptr, result_len)?;
            serde_json::from_str(&json_str).map_err(|e| {
                AppError::invalid_input(format!("Plugin returned invalid result JSON for {tool_name}: {e}"))
            })
        }
        Err(_) => Err(AppError::not_found(format!(
            "Plugin does not export khadim_execute_tool"
        ))),
    }
}
