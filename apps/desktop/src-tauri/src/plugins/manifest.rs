use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// On-disk plugin manifest (`plugin.toml`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub plugin: PluginMeta,
    #[serde(default)]
    pub config: Vec<ConfigField>,
    #[serde(default)]
    pub permissions: PluginPermissions,
    /// Optional UI declaration. Present only when the plugin ships a UI.
    #[serde(default)]
    pub ui: Option<PluginUiManifest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMeta {
    pub name: String,
    pub version: String,
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    /// The `.wasm` file relative to the manifest directory.
    #[serde(default = "default_wasm_file")]
    pub wasm: String,
    #[serde(default)]
    pub min_host_version: Option<String>,
}

fn default_wasm_file() -> String {
    "plugin.wasm".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigField {
    pub key: String,
    pub description: String,
    #[serde(default = "default_field_type")]
    pub field_type: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default_value: Option<String>,
}

fn default_field_type() -> String {
    "string".to_string()
}

/// Permissions the plugin requests. Host enforces these.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginPermissions {
    /// Allow filesystem access (scoped to workspace).
    #[serde(default)]
    pub fs: bool,
    /// Allow outbound HTTP requests.
    #[serde(default)]
    pub http: bool,
    /// Allowed HTTP host patterns (e.g., "api.github.com", "*.openai.com").
    #[serde(default)]
    pub allowed_hosts: Vec<String>,
    /// Allow persistent key-value storage.
    #[serde(default)]
    pub store: bool,
}

// ── UI extension declarations ─────────────────────────────────────────

/// Top-level `[ui]` table in `plugin.toml`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginUiManifest {
    /// Path to the JS file (relative to plugin dir) that registers the
    /// plugin's custom elements.  Required when `tabs` is non-empty.
    pub js: Option<String>,

    /// Each entry adds one tab to the chat sidebar tab strip.
    #[serde(default)]
    pub tabs: Vec<PluginUiTab>,
}

/// A single `[[ui.tabs]]` entry.
///
/// When the user selects this tab:
///   - `sidebar_element` (if set) owns the full sidebar content div.
///   - `content_element` (if set) owns the full main content div.
///
/// Either or both may be omitted:
///   - No `sidebar_element` → sidebar shows nothing extra (just the tab icon).
///   - No `content_element` → the default ChatView keeps showing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginUiTab {
    /// Display label shown under / next to the tab icon.
    pub label: String,
    /// Icon name (maps to SVG in the host icon set, e.g. "calendar", "notes").
    #[serde(default)]
    pub icon: Option<String>,
    /// Custom-element tag that owns the full sidebar div.
    #[serde(default)]
    pub sidebar_element: Option<String>,
    /// Custom-element tag that owns the full content div.
    #[serde(default)]
    pub content_element: Option<String>,
    /// Ordering hint — lower numbers appear first. Default 100.
    #[serde(default = "default_priority")]
    pub priority: u32,
}

fn default_priority() -> u32 {
    100
}

// ── Resolved plugin on disk ───────────────────────────────────────────

/// A fully resolved plugin on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedPlugin {
    pub manifest: PluginManifest,
    pub dir: PathBuf,
    pub wasm_path: PathBuf,
}

impl PluginManifest {
    /// Load a plugin manifest from a directory.
    pub fn load(dir: &Path) -> Result<ResolvedPlugin, String> {
        let manifest_path = dir.join("plugin.toml");
        if !manifest_path.exists() {
            return Err(format!(
                "No plugin.toml found in {}",
                dir.display()
            ));
        }

        let content = std::fs::read_to_string(&manifest_path)
            .map_err(|e| format!("Failed to read {}: {e}", manifest_path.display()))?;

        let manifest: PluginManifest = toml::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {e}", manifest_path.display()))?;

        let wasm_path = dir.join(&manifest.plugin.wasm);
        if !wasm_path.exists() {
            return Err(format!(
                "WASM file not found: {}",
                wasm_path.display()
            ));
        }

        Ok(ResolvedPlugin {
            manifest,
            dir: dir.to_path_buf(),
            wasm_path,
        })
    }
}
