//! LSP client manager for workspace-scoped language intelligence.
//!
//! Manages one language server per (workspace root, language) pair. Servers
//! are spawned on demand when the first LSP-capable request arrives for a
//! given language, then kept alive for the workspace lifetime.
//!
//! The manager communicates with language servers over stdio using the
//! standard LSP JSON-RPC protocol. It exposes a minimal surface to the
//! desktop frontend:
//!
//!   - **Hover** — type info / docs at a position
//!   - **Go-to-definition** — jump to where a symbol is defined
//!   - **Document symbols** — outline / symbol list for a file
//!   - **Workspace symbol search** — fuzzy symbol search across files
//!   - **Diagnostics** — errors/warnings for the open file
//!
//! ## Design decisions
//!
//! - **Stdio transport only.** All supported language servers (rust-analyzer,
//!   typescript-language-server, pyright, gopls, etc.) support stdio. No need
//!   for TCP/pipe complexity.
//!
//! - **One server per language per root.** A workspace that has both TS and
//!   Rust files spawns two servers. Each server is initialized with the
//!   workspace root so it can find project config (tsconfig, Cargo.toml, etc).
//!
//! - **Lazy spawn.** Servers are only started when a frontend request actually
//!   needs them. The manager checks `$PATH` for the binary first and returns a
//!   clean "not available" error when the binary is missing.
//!
//! - **`textDocument/didOpen` on demand.** When the frontend asks for hover or
//!   definition on a file the manager hasn't seen yet, it sends a synthetic
//!   `didOpen` with the file content before the actual request.
//!
//! - **No persistent state.** If the desktop app restarts, servers are gone and
//!   will be lazily re-spawned. This keeps the implementation simple and avoids
//!   stale-server problems.

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

// ── Public types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct LspHoverResult {
    pub contents: String,
    pub language: Option<String>,
    pub range: Option<LspRange>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LspLocation {
    pub uri: String,
    pub range: LspRange,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspRange {
    pub start: LspPosition,
    pub end: LspPosition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LspPosition {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct LspSymbol {
    pub name: String,
    pub kind: String,
    pub detail: Option<String>,
    pub range: LspRange,
    pub selection_range: LspRange,
    pub children: Vec<LspSymbol>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LspWorkspaceSymbol {
    pub name: String,
    pub kind: String,
    pub container_name: Option<String>,
    pub location: LspLocation,
}

#[derive(Debug, Clone, Serialize)]
pub struct LspDiagnostic {
    pub message: String,
    pub severity: String,
    pub range: LspRange,
    pub source: Option<String>,
    pub code: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LspServerStatus {
    pub language: String,
    pub root: String,
    pub server_command: String,
    pub running: bool,
}

// ── Language → server binary mapping ─────────────────────────────────

struct ServerSpec {
    language_id: &'static str,
    binary: &'static str,
    args: &'static [&'static str],
}

const KNOWN_SERVERS: &[ServerSpec] = &[
    ServerSpec {
        language_id: "typescript",
        binary: "typescript-language-server",
        args: &["--stdio"],
    },
    ServerSpec {
        language_id: "tsx",
        binary: "typescript-language-server",
        args: &["--stdio"],
    },
    ServerSpec {
        language_id: "javascript",
        binary: "typescript-language-server",
        args: &["--stdio"],
    },
    ServerSpec {
        language_id: "jsx",
        binary: "typescript-language-server",
        args: &["--stdio"],
    },
    ServerSpec {
        language_id: "rust",
        binary: "rust-analyzer",
        args: &[],
    },
    ServerSpec {
        language_id: "python",
        binary: "pyright-langserver",
        args: &["--stdio"],
    },
    ServerSpec {
        language_id: "go",
        binary: "gopls",
        args: &["serve"],
    },
    ServerSpec {
        language_id: "c",
        binary: "clangd",
        args: &[],
    },
    ServerSpec {
        language_id: "cpp",
        binary: "clangd",
        args: &[],
    },
    ServerSpec {
        language_id: "json",
        binary: "vscode-json-language-server",
        args: &["--stdio"],
    },
    ServerSpec {
        language_id: "css",
        binary: "vscode-css-language-server",
        args: &["--stdio"],
    },
    ServerSpec {
        language_id: "html",
        binary: "vscode-html-language-server",
        args: &["--stdio"],
    },
    ServerSpec {
        language_id: "lua",
        binary: "lua-language-server",
        args: &[],
    },
    ServerSpec {
        language_id: "zig",
        binary: "zls",
        args: &[],
    },
    ServerSpec {
        language_id: "dart",
        binary: "dart",
        args: &["language-server", "--protocol=lsp"],
    },
    ServerSpec {
        language_id: "kotlin",
        binary: "kotlin-language-server",
        args: &[],
    },
    ServerSpec {
        language_id: "elixir",
        binary: "elixir-ls",
        args: &[],
    },
    ServerSpec {
        language_id: "ruby",
        binary: "solargraph",
        args: &["stdio"],
    },
    ServerSpec {
        language_id: "swift",
        binary: "sourcekit-lsp",
        args: &[],
    },
];

/// Map file extension to LSP language ID.
fn ext_to_language_id(filename: &str) -> Option<&'static str> {
    let lower = filename.to_lowercase();
    if lower == "dockerfile" {
        return None;
    }

    let ext = filename.rsplit('.').next().map(|s| s.to_lowercase());

    match ext.as_deref() {
        Some("ts") | Some("mts") | Some("cts") => Some("typescript"),
        Some("tsx") => Some("tsx"),
        Some("js") | Some("mjs") | Some("cjs") => Some("javascript"),
        Some("jsx") => Some("jsx"),
        Some("rs") => Some("rust"),
        Some("py") | Some("pyi") => Some("python"),
        Some("go") => Some("go"),
        Some("c") | Some("h") => Some("c"),
        Some("cpp") | Some("cxx") | Some("cc") | Some("hpp") | Some("hxx") => Some("cpp"),
        Some("java") => Some("java"),
        Some("kt") | Some("kts") => Some("kotlin"),
        Some("swift") => Some("swift"),
        Some("rb") => Some("ruby"),
        Some("ex") | Some("exs") => Some("elixir"),
        Some("lua") => Some("lua"),
        Some("zig") => Some("zig"),
        Some("dart") => Some("dart"),
        Some("json") | Some("jsonc") => Some("json"),
        Some("css") | Some("scss") | Some("less") => Some("css"),
        Some("html") | Some("htm") => Some("html"),
        _ => None,
    }
}

fn find_server_spec(language_id: &str) -> Option<&'static ServerSpec> {
    KNOWN_SERVERS.iter().find(|s| s.language_id == language_id)
}

fn find_binary(name: &str) -> Option<PathBuf> {
    which::which(name).ok()
}

// ── Server handle ────────────────────────────────────────────────────

struct LspServerHandle {
    language_id: String,
    root: String,
    server_command: String,
    child: Child,
    next_id: AtomicI64,
    /// Files we've already sent didOpen for (URI set).
    opened_files: Mutex<HashSet<String>>,
}

impl LspServerHandle {
    fn next_request_id(&self) -> i64 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Send a JSON-RPC request and read the response.
    fn request(&mut self, method: &str, params: Value) -> Result<Value, AppError> {
        let id = self.next_request_id();
        let msg = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        self.send_message(&msg)?;
        self.read_response(id)
    }

    /// Send a JSON-RPC notification (no response expected).
    fn notify(&mut self, method: &str, params: Value) -> Result<(), AppError> {
        let msg = json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        });
        self.send_message(&msg)
    }

    fn send_message(&mut self, msg: &Value) -> Result<(), AppError> {
        let body = serde_json::to_string(msg)
            .map_err(|e| AppError::io(format!("LSP serialize failed: {e}")))?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());

        let stdin = self
            .child
            .stdin
            .as_mut()
            .ok_or_else(|| AppError::io("LSP server stdin unavailable"))?;
        stdin
            .write_all(header.as_bytes())
            .and_then(|_| stdin.write_all(body.as_bytes()))
            .and_then(|_| stdin.flush())
            .map_err(|e| AppError::io(format!("LSP write failed: {e}")))
    }

    fn read_response(&mut self, expected_id: i64) -> Result<Value, AppError> {
        let stdout = self
            .child
            .stdout
            .as_mut()
            .ok_or_else(|| AppError::io("LSP server stdout unavailable"))?;
        let mut reader = BufReader::new(stdout);

        // Read messages until we find our response (skip notifications).
        // Safety: limit iterations to avoid infinite loop on broken servers.
        for _ in 0..200 {
            let content_length = read_content_length(&mut reader)?;
            let mut body = vec![0u8; content_length];
            std::io::Read::read_exact(&mut reader, &mut body)
                .map_err(|e| AppError::io(format!("LSP read body failed: {e}")))?;

            let msg: Value = serde_json::from_slice(&body)
                .map_err(|e| AppError::io(format!("LSP parse failed: {e}")))?;

            // Check if this is our response
            if let Some(id) = msg.get("id") {
                if id.as_i64() == Some(expected_id) {
                    if let Some(error) = msg.get("error") {
                        let message = error
                            .get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown LSP error");
                        return Err(AppError::io(format!("LSP error: {message}")));
                    }
                    return Ok(msg.get("result").cloned().unwrap_or(Value::Null));
                }
            }
            // Otherwise it's a notification or a response for a different ID — skip
        }
        Err(AppError::io(
            "LSP response timeout: too many messages without matching ID",
        ))
    }

    /// Ensure the file has been opened in the language server.
    fn ensure_opened(&mut self, file_path: &str) -> Result<(), AppError> {
        let uri = path_to_uri(file_path);
        {
            let opened = self.opened_files.lock().unwrap();
            if opened.contains(&uri) {
                return Ok(());
            }
        }

        let content = std::fs::read_to_string(file_path)
            .map_err(|e| AppError::io(format!("Failed to read {file_path}: {e}")))?;

        let language_id = ext_to_language_id(
            Path::new(file_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(""),
        )
        .unwrap_or(&self.language_id);

        self.notify(
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id,
                    "version": 1,
                    "text": content,
                }
            }),
        )?;

        self.opened_files.lock().unwrap().insert(uri);
        Ok(())
    }

    fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for LspServerHandle {
    fn drop(&mut self) {
        // Try a graceful shutdown
        let _ = self.notify("shutdown", Value::Null);
        let _ = self.notify("exit", Value::Null);
        // Give it a moment, then kill
        std::thread::sleep(std::time::Duration::from_millis(100));
        let _ = self.child.kill();
    }
}

fn read_content_length(reader: &mut impl BufRead) -> Result<usize, AppError> {
    let mut content_length: Option<usize> = None;
    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .map_err(|e| AppError::io(format!("LSP header read failed: {e}")))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            break; // end of headers
        }
        if let Some(value) = trimmed.strip_prefix("Content-Length: ") {
            content_length = value.parse().ok();
        }
    }
    content_length.ok_or_else(|| AppError::io("LSP: missing Content-Length header"))
}

fn path_to_uri(path: &str) -> String {
    let p = Path::new(path);
    let abs = if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(p)
    };
    format!("file://{}", abs.display())
}

fn uri_to_path(uri: &str) -> String {
    uri.strip_prefix("file://").unwrap_or(uri).to_string()
}

// ── Server key ───────────────────────────────────────────────────────

/// Unique key for a language server instance: (root, canonical server binary).
#[derive(Hash, Eq, PartialEq, Clone, Debug)]
struct ServerKey {
    root: String,
    binary: String,
}

// ── Manager ──────────────────────────────────────────────────────────

pub struct LspManager {
    servers: Mutex<HashMap<ServerKey, LspServerHandle>>,
}

impl Default for LspManager {
    fn default() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
        }
    }
}

impl LspManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Get hover information at a position.
    pub fn hover(
        &self,
        root: &str,
        file_path: &str,
        line: u32,
        character: u32,
    ) -> Result<Option<LspHoverResult>, AppError> {
        let filename = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let lang = ext_to_language_id(filename)
            .ok_or_else(|| AppError::invalid_input(format!("No LSP for file: {filename}")))?;

        let mut servers = self.servers.lock().unwrap();
        let server = self.ensure_server(&mut servers, root, lang)?;
        server.ensure_opened(file_path)?;

        let result = server.request(
            "textDocument/hover",
            json!({
                "textDocument": { "uri": path_to_uri(file_path) },
                "position": { "line": line, "character": character },
            }),
        )?;

        if result.is_null() {
            return Ok(None);
        }

        Ok(Some(parse_hover_result(&result)))
    }

    /// Get go-to-definition locations.
    pub fn definition(
        &self,
        root: &str,
        file_path: &str,
        line: u32,
        character: u32,
    ) -> Result<Vec<LspLocation>, AppError> {
        let filename = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let lang = ext_to_language_id(filename)
            .ok_or_else(|| AppError::invalid_input(format!("No LSP for file: {filename}")))?;

        let mut servers = self.servers.lock().unwrap();
        let server = self.ensure_server(&mut servers, root, lang)?;
        server.ensure_opened(file_path)?;

        let result = server.request(
            "textDocument/definition",
            json!({
                "textDocument": { "uri": path_to_uri(file_path) },
                "position": { "line": line, "character": character },
            }),
        )?;

        Ok(parse_locations(&result))
    }

    /// Get document symbols (outline) for a file.
    pub fn document_symbols(
        &self,
        root: &str,
        file_path: &str,
    ) -> Result<Vec<LspSymbol>, AppError> {
        let filename = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let lang = ext_to_language_id(filename)
            .ok_or_else(|| AppError::invalid_input(format!("No LSP for file: {filename}")))?;

        let mut servers = self.servers.lock().unwrap();
        let server = self.ensure_server(&mut servers, root, lang)?;
        server.ensure_opened(file_path)?;

        let result = server.request(
            "textDocument/documentSymbol",
            json!({
                "textDocument": { "uri": path_to_uri(file_path) },
            }),
        )?;

        Ok(parse_document_symbols(&result))
    }

    /// Search for symbols across the workspace.
    pub fn workspace_symbols(
        &self,
        root: &str,
        query: &str,
        language_hint: Option<&str>,
    ) -> Result<Vec<LspWorkspaceSymbol>, AppError> {
        let lang = language_hint.unwrap_or("typescript"); // default to TS

        let mut servers = self.servers.lock().unwrap();
        let server = self.ensure_server(&mut servers, root, lang)?;

        let result = server.request("workspace/symbol", json!({ "query": query }))?;

        Ok(parse_workspace_symbols(&result))
    }

    /// List currently running language servers.
    pub fn list_servers(&self) -> Vec<LspServerStatus> {
        let mut servers = self.servers.lock().unwrap();
        servers
            .iter_mut()
            .map(|(key, handle)| LspServerStatus {
                language: handle.language_id.clone(),
                root: key.root.clone(),
                server_command: handle.server_command.clone(),
                running: handle.is_alive(),
            })
            .collect()
    }

    /// Shut down all servers for a given root (e.g. when closing a workspace).
    pub fn stop_for_root(&self, root: &str) {
        let mut servers = self.servers.lock().unwrap();
        servers.retain(|key, _| key.root != root);
    }

    /// Shut down all servers.
    pub fn stop_all(&self) {
        let mut servers = self.servers.lock().unwrap();
        servers.clear();
    }

    fn ensure_server<'a>(
        &self,
        servers: &'a mut HashMap<ServerKey, LspServerHandle>,
        root: &str,
        language_id: &str,
    ) -> Result<&'a mut LspServerHandle, AppError> {
        let spec = find_server_spec(language_id).ok_or_else(|| {
            AppError::not_found(format!("No known LSP server for language: {language_id}"))
        })?;

        let key = ServerKey {
            root: root.to_string(),
            binary: spec.binary.to_string(),
        };

        // Check if we already have a live server
        if let Some(handle) = servers.get_mut(&key) {
            if handle.is_alive() {
                return Ok(servers.get_mut(&key).unwrap());
            }
            // Dead server — remove and re-spawn
            servers.remove(&key);
        }

        // Spawn a new server
        let binary_path = find_binary(spec.binary).ok_or_else(|| {
            AppError::not_found(format!(
                "LSP server binary not found: {}. Install it and ensure it's on $PATH.",
                spec.binary
            ))
        })?;

        let mut cmd = Command::new(&binary_path);
        cmd.args(spec.args)
            .current_dir(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        // Inherit PATH so the server can find project tools
        if let Ok(path) = std::env::var("PATH") {
            cmd.env("PATH", path);
        }
        if let Ok(home) = std::env::var("HOME") {
            cmd.env("HOME", home);
        }

        let child = cmd.spawn().map_err(|e| {
            AppError::process_spawn(format!("Failed to spawn {}: {e}", spec.binary))
        })?;

        let mut handle = LspServerHandle {
            language_id: language_id.to_string(),
            root: root.to_string(),
            server_command: spec.binary.to_string(),
            child,
            next_id: AtomicI64::new(1),
            opened_files: Mutex::new(HashSet::new()),
        };

        // Initialize the server
        let init_result = handle.request(
            "initialize",
            json!({
                "processId": std::process::id(),
                "rootUri": path_to_uri(root),
                "rootPath": root,
                "capabilities": {
                    "textDocument": {
                        "hover": { "contentFormat": ["markdown", "plaintext"] },
                        "definition": { "linkSupport": true },
                        "documentSymbol": {
                            "hierarchicalDocumentSymbolSupport": true,
                            "symbolKind": {
                                "valueSet": (1..=26).collect::<Vec<i32>>()
                            }
                        },
                        "synchronization": {
                            "didOpen": true,
                            "didChange": true,
                        },
                    },
                    "workspace": {
                        "symbol": {
                            "symbolKind": {
                                "valueSet": (1..=26).collect::<Vec<i32>>()
                            }
                        },
                    },
                },
            }),
        );

        if let Err(e) = init_result {
            log::warn!(
                "LSP initialize failed for {} in {root}: {}",
                spec.binary,
                e.message
            );
            return Err(e);
        }

        // Send initialized notification
        let _ = handle.notify("initialized", json!({}));

        servers.insert(key.clone(), handle);
        Ok(servers.get_mut(&key).unwrap())
    }
}

// ── Response parsers ─────────────────────────────────────────────────

fn parse_hover_result(result: &Value) -> LspHoverResult {
    let contents = result.get("contents");
    let (text, language) = match contents {
        Some(Value::String(s)) => (s.clone(), None),
        Some(Value::Object(obj)) => {
            let value = obj
                .get("value")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let kind = obj.get("kind").and_then(|v| v.as_str()).map(String::from);
            let lang = obj
                .get("language")
                .and_then(|v| v.as_str())
                .map(String::from);
            (value, lang.or(kind))
        }
        Some(Value::Array(arr)) => {
            let parts: Vec<String> = arr
                .iter()
                .map(|item| match item {
                    Value::String(s) => s.clone(),
                    Value::Object(obj) => obj
                        .get("value")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    _ => String::new(),
                })
                .filter(|s| !s.is_empty())
                .collect();
            (parts.join("\n\n"), None)
        }
        _ => (String::new(), None),
    };

    let range = result.get("range").and_then(parse_range);

    LspHoverResult {
        contents: text,
        language,
        range,
    }
}

fn parse_locations(result: &Value) -> Vec<LspLocation> {
    match result {
        Value::Object(_) => {
            if let Some(loc) = parse_single_location(result) {
                vec![loc]
            } else {
                vec![]
            }
        }
        Value::Array(arr) => arr.iter().filter_map(parse_single_location).collect(),
        _ => vec![],
    }
}

fn parse_single_location(value: &Value) -> Option<LspLocation> {
    // LocationLink has targetUri + targetRange; Location has uri + range
    let uri = value
        .get("targetUri")
        .or_else(|| value.get("uri"))
        .and_then(|v| v.as_str())?
        .to_string();
    let range_val = value.get("targetRange").or_else(|| value.get("range"))?;
    let range = parse_range(range_val)?;
    Some(LspLocation {
        uri: uri_to_path(&uri),
        range,
    })
}

fn parse_range(value: &Value) -> Option<LspRange> {
    let start = value.get("start")?;
    let end = value.get("end")?;
    Some(LspRange {
        start: LspPosition {
            line: start.get("line")?.as_u64()? as u32,
            character: start.get("character")?.as_u64()? as u32,
        },
        end: LspPosition {
            line: end.get("line")?.as_u64()? as u32,
            character: end.get("character")?.as_u64()? as u32,
        },
    })
}

fn parse_document_symbols(result: &Value) -> Vec<LspSymbol> {
    match result {
        Value::Array(arr) => arr.iter().filter_map(parse_single_symbol).collect(),
        _ => vec![],
    }
}

fn parse_single_symbol(value: &Value) -> Option<LspSymbol> {
    let name = value.get("name")?.as_str()?.to_string();
    let kind = symbol_kind_name(value.get("kind")?.as_u64()? as u32);
    let detail = value
        .get("detail")
        .and_then(|v| v.as_str())
        .map(String::from);

    // DocumentSymbol has `range` + `selectionRange`; SymbolInformation has `location`
    let (range, selection_range) = if let Some(r) = value.get("range").and_then(parse_range) {
        let sr = value
            .get("selectionRange")
            .and_then(parse_range)
            .unwrap_or_else(|| r.clone());
        (r, sr)
    } else if let Some(loc) = value.get("location") {
        let r = loc.get("range").and_then(parse_range)?;
        (r.clone(), r)
    } else {
        return None;
    };

    let children = value
        .get("children")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(parse_single_symbol).collect())
        .unwrap_or_default();

    Some(LspSymbol {
        name,
        kind,
        detail,
        range,
        selection_range,
        children,
    })
}

fn parse_workspace_symbols(result: &Value) -> Vec<LspWorkspaceSymbol> {
    match result {
        Value::Array(arr) => arr.iter().filter_map(parse_single_ws_symbol).collect(),
        _ => vec![],
    }
}

fn parse_single_ws_symbol(value: &Value) -> Option<LspWorkspaceSymbol> {
    let name = value.get("name")?.as_str()?.to_string();
    let kind = symbol_kind_name(value.get("kind")?.as_u64()? as u32);
    let container_name = value
        .get("containerName")
        .and_then(|v| v.as_str())
        .map(String::from);

    let location = value.get("location").and_then(parse_single_location)?;
    Some(LspWorkspaceSymbol {
        name,
        kind,
        container_name,
        location,
    })
}

fn symbol_kind_name(kind: u32) -> String {
    match kind {
        1 => "File",
        2 => "Module",
        3 => "Namespace",
        4 => "Package",
        5 => "Class",
        6 => "Method",
        7 => "Property",
        8 => "Field",
        9 => "Constructor",
        10 => "Enum",
        11 => "Interface",
        12 => "Function",
        13 => "Variable",
        14 => "Constant",
        15 => "String",
        16 => "Number",
        17 => "Boolean",
        18 => "Array",
        19 => "Object",
        20 => "Key",
        21 => "Null",
        22 => "EnumMember",
        23 => "Struct",
        24 => "Event",
        25 => "Operator",
        26 => "TypeParameter",
        _ => "Unknown",
    }
    .to_string()
}
