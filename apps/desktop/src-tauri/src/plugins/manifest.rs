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
