use crate::db::Database;
use crate::error::AppError;
use crate::plugins::manifest::PluginManifest;
use crate::plugins::wasm_host::{WasmPlugin, WasmToolDef, WasmToolResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

// ── Plugin state ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub license: Option<String>,
    pub homepage: Option<String>,
    pub dir: PathBuf,
    pub enabled: bool,
    pub tool_count: usize,
    pub permissions: PluginPermissionsSummary,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginPermissionsSummary {
    pub fs: bool,
    pub http: bool,
    pub store: bool,
    pub allowed_hosts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginToolInfo {
    pub plugin_id: String,
    pub plugin_name: String,
    pub tool: WasmToolDef,
}

// ── Plugin Manager ───────────────────────────────────────────────────

struct LoadedPlugin {
    entry: PluginEntry,
    instance: Option<Arc<WasmPlugin>>,
}

pub struct PluginManager {
    /// Base directory for plugins (e.g., ~/.khadim/plugins/).
    plugins_dir: PathBuf,
    /// All known plugins (loaded or failed).
    plugins: RwLock<HashMap<String, LoadedPlugin>>,
    /// Enabled plugin settings persisted in DB.
    /// Key: "plugin:enabled:{plugin_id}", Value: "true"/"false"
    db: Arc<Database>,
}

impl PluginManager {
    pub fn new(db: Arc<Database>) -> Self {
        let plugins_dir = default_plugins_dir();
        std::fs::create_dir_all(&plugins_dir).ok();

        Self {
            plugins_dir,
            plugins: RwLock::new(HashMap::new()),
            db,
        }
    }

    pub fn plugins_dir(&self) -> &Path {
        &self.plugins_dir
    }

    /// Scan the plugins directory and load all valid plugins.
    pub fn discover_and_load(&self, workspace_root: &Path) -> Vec<PluginEntry> {
        let mut entries = Vec::new();

        let dirs = match std::fs::read_dir(&self.plugins_dir) {
            Ok(dirs) => dirs,
            Err(e) => {
                log::warn!("Failed to read plugins directory: {e}");
                return entries;
            }
        };

        for entry in dirs.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let plugin_id = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            match self.load_plugin(&plugin_id, &path, workspace_root) {
                Ok(entry) => entries.push(entry),
                Err(e) => {
                    log::warn!("Failed to load plugin {plugin_id}: {e}");
                    entries.push(PluginEntry {
                        id: plugin_id.clone(),
                        name: plugin_id,
                        version: "0.0.0".to_string(),
                        description: String::new(),
                        author: String::new(),
                        license: None,
                        homepage: None,
                        dir: path,
                        enabled: false,
                        tool_count: 0,
                        permissions: PluginPermissionsSummary {
                            fs: false,
                            http: false,
                            store: false,
                            allowed_hosts: Vec::new(),
                        },
                        error: Some(e.to_string()),
                    });
                }
            }
        }

        entries
    }

    /// Load a single plugin from a directory.
    fn load_plugin(
        &self,
        plugin_id: &str,
        dir: &Path,
        workspace_root: &Path,
    ) -> Result<PluginEntry, AppError> {
        let resolved = PluginManifest::load(dir).map_err(|e| AppError::invalid_input(e))?;

        let enabled = self.is_enabled(plugin_id);

        let permissions_summary = PluginPermissionsSummary {
            fs: resolved.manifest.permissions.fs,
            http: resolved.manifest.permissions.http,
            store: resolved.manifest.permissions.store,
            allowed_hosts: resolved.manifest.permissions.allowed_hosts.clone(),
        };

        let (instance, tool_count, error) = if enabled {
            let config = self.load_plugin_config(plugin_id);
            log::info!(
                "Loading WASM plugin '{plugin_id}' from {}",
                resolved.wasm_path.display()
            );
            match WasmPlugin::load(&resolved, workspace_root, config) {
                Ok(plugin) => {
                    log::info!("Plugin '{plugin_id}' loaded: {} tools", plugin.tools.len());
                    for t in &plugin.tools {
                        log::info!("  tool: {}", t.name);
                    }
                    let count = plugin.tools.len();
                    (Some(Arc::new(plugin)), count, None)
                }
                Err(e) => {
                    log::error!("Plugin '{plugin_id}' failed to load: {}", e.message);
                    (None, 0, Some(e.message.clone()))
                }
            }
        } else {
            log::info!("Plugin '{plugin_id}' is disabled, skipping WASM load");
            (None, 0, None)
        };

        let entry = PluginEntry {
            id: plugin_id.to_string(),
            name: resolved.manifest.plugin.name.clone(),
            version: resolved.manifest.plugin.version.clone(),
            description: resolved.manifest.plugin.description.clone(),
            author: resolved.manifest.plugin.author.clone(),
            license: resolved.manifest.plugin.license.clone(),
            homepage: resolved.manifest.plugin.homepage.clone(),
            dir: dir.to_path_buf(),
            enabled,
            tool_count,
            permissions: permissions_summary,
            error,
        };

        let mut plugins = self.plugins.write().unwrap();
        plugins.insert(
            plugin_id.to_string(),
            LoadedPlugin {
                entry: entry.clone(),
                instance,
            },
        );

        Ok(entry)
    }

    /// List all known plugins.
    pub fn list_plugins(&self) -> Vec<PluginEntry> {
        self.plugins
            .read()
            .unwrap()
            .values()
            .map(|p| p.entry.clone())
            .collect()
    }

    /// Get a single plugin's info.
    pub fn get_plugin(&self, plugin_id: &str) -> Option<PluginEntry> {
        self.plugins
            .read()
            .unwrap()
            .get(plugin_id)
            .map(|p| p.entry.clone())
    }

    /// Enable a plugin and reload it.
    pub fn enable_plugin(
        &self,
        plugin_id: &str,
        workspace_root: &Path,
    ) -> Result<PluginEntry, AppError> {
        self.db
            .set_setting(&format!("plugin:enabled:{plugin_id}"), "true")?;

        let dir = self.plugins_dir.join(plugin_id);
        if !dir.exists() {
            return Err(AppError::not_found(format!(
                "Plugin directory not found: {plugin_id}"
            )));
        }

        self.load_plugin(plugin_id, &dir, workspace_root)
    }

    /// Disable a plugin and unload it.
    pub fn disable_plugin(&self, plugin_id: &str) -> Result<PluginEntry, AppError> {
        self.db
            .set_setting(&format!("plugin:enabled:{plugin_id}"), "false")?;

        let mut plugins = self.plugins.write().unwrap();
        if let Some(loaded) = plugins.get_mut(plugin_id) {
            loaded.entry.enabled = false;
            loaded.instance = None;
            loaded.entry.tool_count = 0;
            loaded.entry.error = None;
            Ok(loaded.entry.clone())
        } else {
            Err(AppError::not_found(format!(
                "Plugin not found: {plugin_id}"
            )))
        }
    }

    /// Get all tools from all enabled plugins.
    pub fn all_plugin_tools(&self) -> Vec<PluginToolInfo> {
        let plugins = self.plugins.read().unwrap();
        let mut tools = Vec::new();

        for (id, loaded) in plugins.iter() {
            if !loaded.entry.enabled {
                continue;
            }
            if let Some(ref instance) = loaded.instance {
                for tool in &instance.tools {
                    tools.push(PluginToolInfo {
                        plugin_id: id.clone(),
                        plugin_name: loaded.entry.name.clone(),
                        tool: tool.clone(),
                    });
                }
            }
        }

        tools
    }

    /// Execute a tool from a specific plugin.
    pub fn execute_tool(
        &self,
        plugin_id: &str,
        tool_name: &str,
        args: &Value,
    ) -> Result<WasmToolResult, AppError> {
        let plugins = self.plugins.read().unwrap();
        let loaded = plugins
            .get(plugin_id)
            .ok_or_else(|| AppError::not_found(format!("Plugin not found: {plugin_id}")))?;

        if !loaded.entry.enabled {
            return Err(AppError::invalid_input(format!(
                "Plugin {plugin_id} is disabled"
            )));
        }

        let instance = loaded
            .instance
            .as_ref()
            .ok_or_else(|| AppError::invalid_input(format!("Plugin {plugin_id} is not loaded")))?;

        instance.execute_tool(tool_name, args)
    }

    /// Find which plugin owns a tool name. Returns (plugin_id, tool_def).
    pub fn find_tool(&self, tool_name: &str) -> Option<(String, WasmToolDef)> {
        let plugins = self.plugins.read().unwrap();
        for (id, loaded) in plugins.iter() {
            if !loaded.entry.enabled {
                continue;
            }
            if let Some(ref instance) = loaded.instance {
                for tool in &instance.tools {
                    if tool.name == tool_name {
                        return Some((id.clone(), tool.clone()));
                    }
                }
            }
        }
        None
    }

    /// Install a plugin from a directory (copies only manifest + wasm).
    pub fn install_from_dir(
        &self,
        source: &Path,
        workspace_root: &Path,
    ) -> Result<PluginEntry, AppError> {
        // Validate the source has a manifest and a reachable wasm file
        let resolved = PluginManifest::load(source).map_err(|e| AppError::invalid_input(e))?;

        let plugin_id = slug(&resolved.manifest.plugin.name);
        let target = self.plugins_dir.join(&plugin_id);

        if target.exists() {
            return Err(AppError::invalid_input(format!(
                "Plugin {plugin_id} already installed at {}. Uninstall it first.",
                target.display()
            )));
        }

        std::fs::create_dir_all(&target)?;

        // Copy only the wasm binary, normalised to plugin.wasm
        let dest_wasm = target.join("plugin.wasm");
        std::fs::copy(&resolved.wasm_path, &dest_wasm).map_err(|e| {
            AppError::io(format!(
                "Failed to copy {} -> {}: {e}",
                resolved.wasm_path.display(),
                dest_wasm.display()
            ))
        })?;

        // Write a clean plugin.toml that points to plugin.wasm
        let mut manifest = resolved.manifest.clone();
        manifest.plugin.wasm = "plugin.wasm".to_string();
        let toml_str = toml::to_string_pretty(&manifest)
            .map_err(|e| AppError::io(format!("Failed to serialise manifest: {e}")))?;
        std::fs::write(target.join("plugin.toml"), toml_str)?;

        log::info!("Installed plugin '{plugin_id}' to {}", target.display());

        // Enable by default on install
        self.db
            .set_setting(&format!("plugin:enabled:{plugin_id}"), "true")?;

        self.load_plugin(&plugin_id, &target, workspace_root)
    }

    /// Uninstall a plugin (remove from disk).
    pub fn uninstall(&self, plugin_id: &str) -> Result<(), AppError> {
        // Remove from loaded plugins
        {
            let mut plugins = self.plugins.write().unwrap();
            plugins.remove(plugin_id);
        }

        // Remove settings
        self.db
            .set_setting(&format!("plugin:enabled:{plugin_id}"), "")
            .ok();

        // Remove directory
        let dir = self.plugins_dir.join(plugin_id);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)
                .map_err(|e| AppError::io(format!("Failed to remove plugin: {e}")))?;
        }

        Ok(())
    }

    /// Set a plugin config value.
    pub fn set_plugin_config(
        &self,
        plugin_id: &str,
        key: &str,
        value: &str,
    ) -> Result<(), AppError> {
        self.db
            .set_setting(&format!("plugin:config:{plugin_id}:{key}"), value)
    }

    /// Get a plugin config value.
    pub fn get_plugin_config(
        &self,
        plugin_id: &str,
        key: &str,
    ) -> Result<Option<String>, AppError> {
        self.db
            .get_setting(&format!("plugin:config:{plugin_id}:{key}"))
    }

    // ── Helpers ──────────────────────────────────────────────────────

    fn is_enabled(&self, plugin_id: &str) -> bool {
        self.db
            .get_setting(&format!("plugin:enabled:{plugin_id}"))
            .ok()
            .flatten()
            .map(|v| v == "true")
            .unwrap_or(false)
    }

    fn load_plugin_config(&self, plugin_id: &str) -> HashMap<String, String> {
        let config = HashMap::new();

        // Load all settings with this prefix
        // For now, we'll load known config fields from the manifest
        if let Some(loaded) = self.plugins.read().unwrap().get(plugin_id) {
            // If we already have the resolved plugin, use its config fields
            // Otherwise, try to read manifest from disk
            let _ = loaded; // We might not have config fields yet
        }

        config
    }
}

// ── Utilities ────────────────────────────────────────────────────────

fn default_plugins_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("khadim")
        .join("plugins")
}

fn slug(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), AppError> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
