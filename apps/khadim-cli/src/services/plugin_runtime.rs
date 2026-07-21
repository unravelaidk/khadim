use crate::services::plugin_service::{
    configured_values, enabled_plugins, PluginPermissions, ResolvedPlugin,
};
use async_trait::async_trait;
use khadim_ai_core::error::AppError;
use khadim_ai_core::tools::{Tool, ToolDefinition, ToolResult};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use wasmtime::{
    Caller, Engine, Extern, Instance, Linker, Module, Store, StoreLimits, StoreLimitsBuilder,
};

const MAX_PLUGIN_MEMORY: usize = 64 * 1024 * 1024;
const MAX_HOST_BUFFER: u64 = 8 * 1024 * 1024;
const MAX_HTTP_BODY: u64 = 8 * 1024 * 1024;
const FUEL_PER_CALL: u64 = 25_000_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WasmToolDefinition {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub params: Vec<WasmToolParameter>,
    pub prompt_snippet: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WasmToolParameter {
    pub name: String,
    pub description: String,
    pub param_type: String,
    pub required: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WasmToolResult {
    content: String,
    is_error: bool,
    #[serde(default)]
    metadata: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HttpRequest {
    url: String,
    #[serde(default = "default_http_method")]
    method: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
}

fn default_http_method() -> String {
    "GET".to_string()
}

struct HostState {
    plugin_id: String,
    workspace_root: PathBuf,
    permissions: PluginPermissions,
    fs_buffer: Vec<u8>,
    http_buffer: Vec<u8>,
    http_status: u16,
    store_buffer: Vec<u8>,
    store: HashMap<String, String>,
    store_path: PathBuf,
    limits: StoreLimits,
}

struct LoadedPlugin {
    id: String,
    tools: Vec<WasmToolDefinition>,
    store: Mutex<Store<HostState>>,
    instance: Instance,
}

pub struct PluginTool {
    plugin: Arc<LoadedPlugin>,
    definition: WasmToolDefinition,
}

#[async_trait]
impl Tool for PluginTool {
    fn definition(&self) -> ToolDefinition {
        let mut properties = serde_json::Map::new();
        let mut required = Vec::new();
        for parameter in &self.definition.params {
            let mut schema = json!({
                "type": parameter.param_type,
                "description": parameter.description,
            });
            if let Some(default) = &parameter.default_value {
                schema["default"] = serde_json::from_str(default)
                    .unwrap_or_else(|_| Value::String(default.clone()));
            }
            properties.insert(parameter.name.clone(), schema);
            if parameter.required {
                required.push(parameter.name.clone());
            }
        }
        ToolDefinition {
            name: format!(
                "plugin_{}_{}",
                safe_tool_segment(&self.plugin.id),
                safe_tool_segment(&self.definition.name)
            ),
            description: format!(
                "[Plugin: {}] {}",
                self.plugin.id, self.definition.description
            ),
            parameters: json!({
                "type": "object",
                "properties": properties,
                "required": required,
            }),
            prompt_snippet: self.definition.prompt_snippet.clone(),
        }
    }

    async fn execute(&self, input: Value) -> Result<ToolResult, AppError> {
        let plugin = self.plugin.clone();
        let tool_name = self.definition.name.clone();
        tokio::task::spawn_blocking(move || plugin.execute(&tool_name, &input))
            .await
            .map_err(|error| AppError::io(format!("Plugin worker failed: {error}")))?
    }
}

impl LoadedPlugin {
    fn load(plugin: &ResolvedPlugin, workspace_root: &Path) -> Result<Arc<Self>, AppError> {
        let mut config = wasmtime::Config::new();
        config.consume_fuel(true);
        let engine = Engine::new(&config)
            .map_err(|error| AppError::invalid_input(format!("Plugin engine failed: {error}")))?;
        let module = Module::from_file(&engine, &plugin.wasm_path).map_err(|error| {
            AppError::invalid_input(format!("Failed to compile plugin '{}': {error}", plugin.id))
        })?;
        let store_path = plugin.dir.join("store.json");
        let persisted_store = std::fs::read_to_string(&store_path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default();
        let state = HostState {
            plugin_id: plugin.id.clone(),
            workspace_root: std::fs::canonicalize(workspace_root).map_err(|error| {
                AppError::invalid_input(format!("Cannot open project root: {error}"))
            })?,
            permissions: plugin.manifest.permissions.clone(),
            fs_buffer: Vec::new(),
            http_buffer: Vec::new(),
            http_status: 0,
            store_buffer: Vec::new(),
            store: persisted_store,
            store_path,
            limits: StoreLimitsBuilder::new()
                .memory_size(MAX_PLUGIN_MEMORY)
                .instances(1)
                .memories(1)
                .build(),
        };
        let mut store = Store::new(&engine, state);
        store.limiter(|state| &mut state.limits);
        store.set_fuel(FUEL_PER_CALL).map_err(|error| {
            AppError::invalid_input(format!("Plugin fuel setup failed: {error}"))
        })?;
        let mut linker = Linker::new(&engine);
        register_host_functions(&mut linker)?;
        let instance = linker.instantiate(&mut store, &module).map_err(|error| {
            AppError::invalid_input(format!(
                "Failed to initialize plugin '{}': {error}",
                plugin.id
            ))
        })?;
        let values = configured_values(plugin)?;
        call_initialize(
            &instance,
            &mut store,
            &Value::Object(
                values
                    .into_iter()
                    .map(|(key, value)| (key, parse_config_value(value)))
                    .collect(),
            ),
        )?;
        let tools: Vec<WasmToolDefinition> =
            call_json_export(&instance, &mut store, "khadim_list_tools")?;
        validate_tool_definitions(&plugin.id, &tools)?;
        Ok(Arc::new(Self {
            id: plugin.id.clone(),
            tools,
            store: Mutex::new(store),
            instance,
        }))
    }

    fn execute(&self, tool_name: &str, input: &Value) -> Result<ToolResult, AppError> {
        let mut store = self.store.lock().map_err(|_| {
            AppError::backend_busy(format!("Plugin '{}' is already executing", self.id))
        })?;
        store.set_fuel(FUEL_PER_CALL).map_err(|error| {
            AppError::invalid_input(format!("Plugin fuel reset failed: {error}"))
        })?;
        let function = self
            .instance
            .get_typed_func::<(i32, i32, i32, i32), i64>(&mut *store, "khadim_execute_tool")
            .map_err(|error| {
                AppError::invalid_input(format!(
                    "Plugin '{}' has an invalid tool export: {error}",
                    self.id
                ))
            })?;
        let name = write_guest_string(&self.instance, &mut store, tool_name)?;
        let input = serde_json::to_string(input)
            .map_err(|error| AppError::invalid_input(format!("Invalid plugin input: {error}")))?;
        let payload = write_guest_string(&self.instance, &mut store, &input)?;
        let packed = function
            .call(&mut *store, (name.0, name.1, payload.0, payload.1))
            .map_err(|error| {
                AppError::invalid_input(format!("Plugin '{}' tool failed: {error}", self.id))
            })?;
        let result: WasmToolResult = read_packed_json(&self.instance, &mut store, packed)?;
        if result.is_error {
            return Err(AppError::invalid_input(result.content));
        }
        Ok(ToolResult {
            content: result.content,
            metadata: result
                .metadata
                .and_then(|value| serde_json::from_str(&value).ok()),
        })
    }
}

fn parse_config_value(value: String) -> Value {
    serde_json::from_str(&value).unwrap_or(Value::String(value))
}

fn safe_tool_segment(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn validate_tool_definitions(
    plugin_id: &str,
    tools: &[WasmToolDefinition],
) -> Result<(), AppError> {
    let mut names = std::collections::HashSet::new();
    for tool in tools {
        if tool.name.is_empty()
            || !tool.name.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.')
            })
            || !names.insert(tool.name.as_str())
        {
            return Err(AppError::invalid_input(format!(
                "Plugin '{plugin_id}' returned an invalid or duplicate tool name '{}'.",
                tool.name
            )));
        }
    }
    Ok(())
}

pub fn collect_plugin_tools(workspace_root: &Path) -> Result<Vec<Arc<dyn Tool>>, AppError> {
    let mut result = Vec::new();
    for plugin in enabled_plugins()? {
        let loaded = LoadedPlugin::load(&plugin, workspace_root)?;
        for definition in loaded.tools.clone() {
            result.push(Arc::new(PluginTool {
                plugin: loaded.clone(),
                definition,
            }) as Arc<dyn Tool>);
        }
    }
    Ok(result)
}

pub fn run_plugin_tool(
    workspace_root: &Path,
    requested_name: &str,
    input: &Value,
) -> Result<ToolResult, AppError> {
    for plugin in enabled_plugins()? {
        let loaded = LoadedPlugin::load(&plugin, workspace_root)?;
        for definition in &loaded.tools {
            let exposed_name = format!(
                "plugin_{}_{}",
                safe_tool_segment(&loaded.id),
                safe_tool_segment(&definition.name)
            );
            if exposed_name == requested_name {
                return loaded.execute(&definition.name, input);
            }
        }
    }
    Err(AppError::not_found(format!(
        "Enabled plugin tool '{requested_name}' was not found. Run `khadim plugin tools` to list tool names."
    )))
}

fn register_host_functions(linker: &mut Linker<HostState>) -> Result<(), AppError> {
    register_logs(linker)?;
    register_filesystem(linker)?;
    register_http(linker)?;
    register_store(linker)?;
    Ok(())
}

fn register_logs(linker: &mut Linker<HostState>) -> Result<(), AppError> {
    for level in ["info", "debug", "warn", "error"] {
        linker
            .func_wrap(
                "host-log",
                level,
                move |mut caller: Caller<'_, HostState>, pointer: i32, length: i32| {
                    let message =
                        read_caller_string(&mut caller, pointer, length).unwrap_or_default();
                    match level {
                        "error" => log::error!("[plugin:{}] {message}", caller.data().plugin_id),
                        "warn" => log::warn!("[plugin:{}] {message}", caller.data().plugin_id),
                        "debug" => log::debug!("[plugin:{}] {message}", caller.data().plugin_id),
                        _ => log::info!("[plugin:{}] {message}", caller.data().plugin_id),
                    }
                },
            )
            .map_err(host_registration_error)?;
    }
    Ok(())
}

fn register_filesystem(linker: &mut Linker<HostState>) -> Result<(), AppError> {
    linker
        .func_wrap(
            "host-fs",
            "read-file",
            |mut caller: Caller<'_, HostState>, pointer: i32, length: i32| -> i32 {
                let result = (|| {
                    ensure_permission(caller.data().permissions.fs, "Filesystem")?;
                    let path =
                        read_caller_string(&mut caller, pointer, length).ok_or("Invalid path")?;
                    let path = resolve_workspace_path(&caller.data().workspace_root, &path)?;
                    let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
                    let mut bytes = Vec::new();
                    file.take(MAX_HOST_BUFFER + 1)
                        .read_to_end(&mut bytes)
                        .map_err(|error| error.to_string())?;
                    if bytes.len() as u64 > MAX_HOST_BUFFER {
                        return Err("Plugin file read exceeded 8 MB".to_string());
                    }
                    Ok(bytes)
                })();
                store_buffer_result(&mut caller, result)
            },
        )
        .map_err(host_registration_error)?;
    linker
        .func_wrap(
            "host-fs",
            "read-result",
            |mut caller: Caller<'_, HostState>, pointer: i32, capacity: i32| -> i32 {
                let bytes = caller.data().fs_buffer.clone();
                copy_to_guest(&mut caller, pointer, capacity, &bytes)
            },
        )
        .map_err(host_registration_error)?;
    for (name, append) in [("write-file", false), ("append-file", true)] {
        linker
            .func_wrap(
                "host-fs",
                name,
                move |mut caller: Caller<'_, HostState>,
                      path_pointer: i32,
                      path_length: i32,
                      content_pointer: i32,
                      content_length: i32|
                      -> i32 {
                    let result = (|| {
                        ensure_permission(caller.data().permissions.fs, "Filesystem")?;
                        let path = read_caller_string(&mut caller, path_pointer, path_length)
                            .ok_or("Invalid path")?;
                        let content =
                            read_caller_bytes(&mut caller, content_pointer, content_length)
                                .ok_or("Invalid content")?;
                        let path = resolve_workspace_path(&caller.data().workspace_root, &path)?;
                        if let Some(parent) = path.parent() {
                            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                        }
                        if append {
                            use std::io::Write;
                            std::fs::OpenOptions::new()
                                .create(true)
                                .append(true)
                                .open(path)
                                .and_then(|mut file| file.write_all(&content))
                                .map_err(|error| error.to_string())?;
                        } else {
                            std::fs::write(path, content).map_err(|error| error.to_string())?;
                        }
                        Ok(Vec::new())
                    })();
                    store_status_result(&mut caller, result)
                },
            )
            .map_err(host_registration_error)?;
    }
    linker
        .func_wrap(
            "host-fs",
            "list-dir",
            |mut caller: Caller<'_, HostState>, pointer: i32, length: i32| -> i32 {
                let result = (|| {
                    ensure_permission(caller.data().permissions.fs, "Filesystem")?;
                    let path =
                        read_caller_string(&mut caller, pointer, length).ok_or("Invalid path")?;
                    let path = resolve_workspace_path(&caller.data().workspace_root, &path)?;
                    let mut entries = std::fs::read_dir(path)
                        .map_err(|error| error.to_string())?
                        .filter_map(Result::ok)
                        .filter_map(|entry| {
                            Some((
                                entry.file_type().ok()?.is_dir(),
                                entry.file_name().to_string_lossy().to_string(),
                            ))
                        })
                        .collect::<Vec<_>>();
                    entries.sort_by(|left, right| left.1.cmp(&right.1));
                    let payload = entries
                        .into_iter()
                        .map(|(directory, name)| {
                            format!("{}\t{name}", if directory { "D" } else { "F" })
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                        .into_bytes();
                    if payload.len() as u64 > MAX_HOST_BUFFER {
                        return Err("Plugin directory listing exceeded 8 MB".to_string());
                    }
                    Ok(payload)
                })();
                store_buffer_result(&mut caller, result)
            },
        )
        .map_err(host_registration_error)?;
    linker
        .func_wrap(
            "host-fs",
            "path-exists",
            |mut caller: Caller<'_, HostState>, pointer: i32, length: i32| -> i32 {
                if !caller.data().permissions.fs {
                    return -1;
                }
                let Some(path) = read_caller_string(&mut caller, pointer, length) else {
                    return -1;
                };
                resolve_workspace_path(&caller.data().workspace_root, &path)
                    .map(|path| i32::from(path.exists()))
                    .unwrap_or(-1)
            },
        )
        .map_err(host_registration_error)?;
    Ok(())
}

fn register_http(linker: &mut Linker<HostState>) -> Result<(), AppError> {
    linker
        .func_wrap(
            "host-http",
            "fetch",
            |mut caller: Caller<'_, HostState>, pointer: i32, length: i32| -> i32 {
                let result = (|| {
                    ensure_permission(caller.data().permissions.http, "HTTP")?;
                    let raw = read_caller_string(&mut caller, pointer, length)
                        .ok_or("Invalid HTTP request")?;
                    let request: HttpRequest =
                        serde_json::from_str(&raw).map_err(|error| error.to_string())?;
                    let url = allowed_url(&request.url, &caller.data().permissions.allowed_hosts)?;
                    let method = reqwest::Method::from_bytes(request.method.as_bytes())
                        .map_err(|error| error.to_string())?;
                    if !matches!(
                        method,
                        reqwest::Method::GET
                            | reqwest::Method::POST
                            | reqwest::Method::PUT
                            | reqwest::Method::PATCH
                            | reqwest::Method::DELETE
                            | reqwest::Method::HEAD
                    ) {
                        return Err("Unsupported HTTP method".to_string());
                    }
                    let client = reqwest::blocking::Client::builder()
                        .timeout(Duration::from_secs(25))
                        .redirect(reqwest::redirect::Policy::none())
                        .build()
                        .map_err(|error| error.to_string())?;
                    let mut builder = client.request(method, url);
                    for (key, value) in request.headers {
                        builder = builder.header(key, value);
                    }
                    if let Some(body) = request.body {
                        builder = builder.body(body);
                    }
                    let response = builder.send().map_err(|error| error.to_string())?;
                    if response.status().is_redirection() {
                        return Err("Plugin HTTP redirects are not allowed".to_string());
                    }
                    let status = response.status().as_u16();
                    let mut bytes = Vec::new();
                    response
                        .take(MAX_HTTP_BODY + 1)
                        .read_to_end(&mut bytes)
                        .map_err(|error| error.to_string())?;
                    if bytes.len() as u64 > MAX_HTTP_BODY {
                        return Err("Plugin HTTP response exceeded 8 MB".to_string());
                    }
                    Ok((status, bytes))
                })();
                match result {
                    Ok((status, bytes)) => {
                        caller.data_mut().http_status = status;
                        let length = bytes.len() as i32;
                        caller.data_mut().http_buffer = bytes;
                        length
                    }
                    Err(error) => {
                        caller.data_mut().http_status = 0;
                        caller.data_mut().http_buffer = error.into_bytes();
                        -1
                    }
                }
            },
        )
        .map_err(host_registration_error)?;
    linker
        .func_wrap(
            "host-http",
            "read_body",
            |mut caller: Caller<'_, HostState>, pointer: i32, capacity: i32| -> i32 {
                let bytes = caller.data().http_buffer.clone();
                copy_to_guest(&mut caller, pointer, capacity, &bytes)
            },
        )
        .map_err(host_registration_error)?;
    linker
        .func_wrap(
            "host-http",
            "status",
            |caller: Caller<'_, HostState>| -> i32 { caller.data().http_status.into() },
        )
        .map_err(host_registration_error)?;
    Ok(())
}

fn register_store(linker: &mut Linker<HostState>) -> Result<(), AppError> {
    linker
        .func_wrap(
            "host-store",
            "store_set",
            |mut caller: Caller<'_, HostState>,
             key_pointer: i32,
             key_length: i32,
             value_pointer: i32,
             value_length: i32|
             -> i32 {
                if !caller.data().permissions.store {
                    return -1;
                }
                let Some(key) = read_caller_string(&mut caller, key_pointer, key_length) else {
                    return -1;
                };
                let Some(value) = read_caller_string(&mut caller, value_pointer, value_length)
                else {
                    return -1;
                };
                caller.data_mut().store.insert(key, value);
                persist_store(caller.data()).map(|_| 0).unwrap_or(-1)
            },
        )
        .map_err(host_registration_error)?;
    linker
        .func_wrap(
            "host-store",
            "store_get",
            |mut caller: Caller<'_, HostState>, pointer: i32, length: i32| -> i32 {
                if !caller.data().permissions.store {
                    return -1;
                }
                let Some(key) = read_caller_string(&mut caller, pointer, length) else {
                    return -1;
                };
                match caller.data().store.get(&key).cloned() {
                    Some(value) => {
                        let bytes = value.into_bytes();
                        let length = bytes.len() as i32;
                        caller.data_mut().store_buffer = bytes;
                        length
                    }
                    None => -1,
                }
            },
        )
        .map_err(host_registration_error)?;
    linker
        .func_wrap(
            "host-store",
            "store_read",
            |mut caller: Caller<'_, HostState>, pointer: i32, capacity: i32| -> i32 {
                let bytes = caller.data().store_buffer.clone();
                copy_to_guest(&mut caller, pointer, capacity, &bytes)
            },
        )
        .map_err(host_registration_error)?;
    Ok(())
}

fn persist_store(state: &HostState) -> Result<(), String> {
    let encoded = serde_json::to_vec(&state.store).map_err(|error| error.to_string())?;
    std::fs::write(&state.store_path, encoded).map_err(|error| error.to_string())
}

fn allowed_url(value: &str, allowed_hosts: &[String]) -> Result<url::Url, String> {
    let url = url::Url::parse(value).map_err(|error| error.to_string())?;
    let host = url
        .host_str()
        .ok_or("HTTP URL has no host")?
        .to_ascii_lowercase();
    let loopback = host == "localhost"
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|address| address.is_loopback());
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
        return Err("Plugin HTTP requires HTTPS except for loopback hosts".to_string());
    }
    let allowed = allowed_hosts.iter().any(|pattern| {
        let pattern = pattern.to_ascii_lowercase();
        pattern == "*"
            || pattern == host
            || pattern
                .strip_prefix("*.")
                .is_some_and(|suffix| host.ends_with(&format!(".{suffix}")))
    });
    if !allowed {
        return Err(format!("Plugin is not allowed to connect to {host}"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Plugin URLs cannot contain credentials".to_string());
    }
    Ok(url)
}

fn ensure_permission(enabled: bool, name: &str) -> Result<(), String> {
    if enabled {
        Ok(())
    } else {
        Err(format!("{name} permission denied"))
    }
}

fn resolve_workspace_path(root: &Path, requested: &str) -> Result<PathBuf, String> {
    let mut relative = PathBuf::new();
    for component in Path::new(requested).components() {
        match component {
            Component::Normal(value) => relative.push(value),
            Component::CurDir => {}
            _ => return Err("Plugin path must be relative and cannot contain '..'".to_string()),
        }
    }
    let candidate = root.join(relative);
    let mut existing = candidate.as_path();
    while !existing.exists() {
        existing = existing
            .parent()
            .ok_or("Plugin path has no existing ancestor")?;
    }
    let canonical = std::fs::canonicalize(existing).map_err(|error| error.to_string())?;
    if !canonical.starts_with(root) {
        return Err("Plugin path escaped the project root".to_string());
    }
    Ok(candidate)
}

fn store_buffer_result(caller: &mut Caller<'_, HostState>, result: Result<Vec<u8>, String>) -> i32 {
    match result {
        Ok(bytes) => {
            let length = bytes.len() as i32;
            caller.data_mut().fs_buffer = bytes;
            length
        }
        Err(error) => {
            caller.data_mut().fs_buffer = error.into_bytes();
            -1
        }
    }
}

fn store_status_result(caller: &mut Caller<'_, HostState>, result: Result<Vec<u8>, String>) -> i32 {
    match result {
        Ok(_) => 0,
        Err(error) => {
            caller.data_mut().fs_buffer = error.into_bytes();
            -1
        }
    }
}

fn read_caller_bytes(
    caller: &mut Caller<'_, HostState>,
    pointer: i32,
    length: i32,
) -> Option<Vec<u8>> {
    if pointer < 0 || length < 0 {
        return None;
    }
    let memory = caller.get_export("memory").and_then(Extern::into_memory)?;
    let start = pointer as usize;
    let end = start.checked_add(length as usize)?;
    memory.data(&*caller).get(start..end).map(<[u8]>::to_vec)
}

fn read_caller_string(
    caller: &mut Caller<'_, HostState>,
    pointer: i32,
    length: i32,
) -> Option<String> {
    String::from_utf8(read_caller_bytes(caller, pointer, length)?).ok()
}

fn copy_to_guest(
    caller: &mut Caller<'_, HostState>,
    pointer: i32,
    capacity: i32,
    bytes: &[u8],
) -> i32 {
    if pointer < 0 || capacity < 0 {
        return -1;
    }
    let Some(memory) = caller.get_export("memory").and_then(Extern::into_memory) else {
        return -1;
    };
    let count = bytes.len().min(capacity as usize);
    let start = pointer as usize;
    let Some(end) = start.checked_add(count) else {
        return -1;
    };
    let Some(destination) = memory.data_mut(caller).get_mut(start..end) else {
        return -1;
    };
    destination.copy_from_slice(&bytes[..count]);
    count as i32
}

fn call_initialize(
    instance: &Instance,
    store: &mut Store<HostState>,
    config: &Value,
) -> Result<(), AppError> {
    let encoded = serde_json::to_string(config)
        .map_err(|error| AppError::invalid_input(error.to_string()))?;
    let input = write_guest_string(instance, store, &encoded)?;
    let function = instance
        .get_typed_func::<(i32, i32), i32>(&mut *store, "khadim_initialize")
        .map_err(|error| {
            AppError::invalid_input(format!("Plugin is missing khadim_initialize: {error}"))
        })?;
    let result = function.call(&mut *store, input).map_err(|error| {
        AppError::invalid_input(format!("Plugin initialization failed: {error}"))
    })?;
    if result == 0 {
        Ok(())
    } else {
        Err(AppError::invalid_input("Plugin rejected its configuration"))
    }
}

fn call_json_export<T: serde::de::DeserializeOwned>(
    instance: &Instance,
    store: &mut Store<HostState>,
    name: &str,
) -> Result<T, AppError> {
    let function = instance
        .get_typed_func::<(), i64>(&mut *store, name)
        .map_err(|error| AppError::invalid_input(format!("Plugin is missing {name}: {error}")))?;
    let packed = function
        .call(&mut *store, ())
        .map_err(|error| AppError::invalid_input(format!("Plugin {name} failed: {error}")))?;
    read_packed_json(instance, store, packed)
}

fn write_guest_string(
    instance: &Instance,
    store: &mut Store<HostState>,
    value: &str,
) -> Result<(i32, i32), AppError> {
    let bytes = value.as_bytes();
    let length = i32::try_from(bytes.len())
        .map_err(|_| AppError::invalid_input("Plugin input is too large"))?;
    let allocate = instance
        .get_typed_func::<i32, i32>(&mut *store, "__alloc")
        .map_err(|error| AppError::invalid_input(format!("Plugin is missing __alloc: {error}")))?;
    let pointer = allocate
        .call(&mut *store, length)
        .map_err(|error| AppError::invalid_input(format!("Plugin allocation failed: {error}")))?;
    if pointer < 0 {
        return Err(AppError::invalid_input(
            "Plugin returned an invalid allocation",
        ));
    }
    let memory = instance
        .get_memory(&mut *store, "memory")
        .ok_or_else(|| AppError::invalid_input("Plugin is missing memory"))?;
    memory
        .write(&mut *store, pointer as usize, bytes)
        .map_err(|error| AppError::invalid_input(format!("Plugin input write failed: {error}")))?;
    Ok((pointer, length))
}

fn read_packed_json<T: serde::de::DeserializeOwned>(
    instance: &Instance,
    store: &mut Store<HostState>,
    packed: i64,
) -> Result<T, AppError> {
    let pointer = ((packed as u64) >> 32) as usize;
    let length = (packed as u64 & 0xffff_ffff) as usize;
    if length > MAX_PLUGIN_MEMORY {
        return Err(AppError::invalid_input("Plugin output is too large"));
    }
    let memory = instance
        .get_memory(&mut *store, "memory")
        .ok_or_else(|| AppError::invalid_input("Plugin is missing memory"))?;
    let data = memory.data(&*store);
    let end = pointer
        .checked_add(length)
        .ok_or_else(|| AppError::invalid_input("Plugin returned an invalid output buffer"))?;
    let bytes = data
        .get(pointer..end)
        .ok_or_else(|| AppError::invalid_input("Plugin returned an invalid output buffer"))?;
    serde_json::from_slice(bytes)
        .map_err(|error| AppError::invalid_input(format!("Plugin returned invalid JSON: {error}")))
}

fn host_registration_error(error: wasmtime::Error) -> AppError {
    AppError::invalid_input(format!(
        "Failed to register plugin host capability: {error}"
    ))
}
