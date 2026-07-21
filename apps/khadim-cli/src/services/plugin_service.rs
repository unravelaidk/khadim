use crate::services::settings_service::{
    atomic_write_private, create_private_dir_all, khadim_config_dir, secure_existing_private_file,
};
use khadim_ai_core::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};

const MANIFEST_FILE: &str = "plugin.toml";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginManifest {
    pub plugin: PluginMetadata,
    #[serde(default)]
    pub config: Vec<PluginConfigField>,
    #[serde(default)]
    pub permissions: PluginPermissions,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginMetadata {
    pub name: String,
    pub version: String,
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(default = "default_wasm")]
    pub wasm: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PluginConfigField {
    pub key: String,
    pub description: String,
    #[serde(default = "default_field_type")]
    pub field_type: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default_value: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct PluginPermissions {
    #[serde(default)]
    pub fs: bool,
    #[serde(default)]
    pub http: bool,
    #[serde(default)]
    pub store: bool,
    #[serde(default)]
    pub allowed_hosts: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub enabled: bool,
    pub configured: bool,
    pub permissions: PluginPermissions,
    pub config: Vec<PluginConfigStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginConfigStatus {
    pub key: String,
    pub description: String,
    pub field_type: String,
    pub required: bool,
    pub configured: bool,
}

#[derive(Clone, Debug)]
pub struct ResolvedPlugin {
    pub id: String,
    pub dir: PathBuf,
    pub wasm_path: PathBuf,
    pub manifest: PluginManifest,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
struct PluginState {
    #[serde(default)]
    enabled: HashMap<String, bool>,
    #[serde(default)]
    config: HashMap<String, HashMap<String, String>>,
}

fn default_wasm() -> String {
    "plugin.wasm".to_string()
}

fn default_field_type() -> String {
    "string".to_string()
}

fn data_base_dir(explicit: Option<OsString>, system: Option<PathBuf>) -> Option<PathBuf> {
    explicit
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or(system)
}

pub fn plugins_dir() -> Result<PathBuf, AppError> {
    let base = data_base_dir(std::env::var_os("KHADIM_DATA_HOME"), dirs::data_dir())
        .ok_or_else(|| AppError::io("Cannot determine data directory"))?;
    let path = base.join("khadim").join("plugins");
    create_private_dir_all(&path)
        .map_err(|error| AppError::io(format!("Failed to create plugins directory: {error}")))?;
    Ok(path)
}

fn state_path() -> Result<PathBuf, AppError> {
    Ok(khadim_config_dir()?.join("cli-plugins.json"))
}

fn load_state() -> Result<PluginState, AppError> {
    let path = state_path()?;
    if !secure_existing_private_file(&path)
        .map_err(|error| AppError::io(format!("Failed to secure plugin settings: {error}")))?
    {
        return Ok(PluginState::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| AppError::io(format!("Failed to read plugin settings: {error}")))?;
    serde_json::from_str(&content)
        .map_err(|error| AppError::io(format!("Failed to parse plugin settings: {error}")))
}

fn save_state(state: &PluginState) -> Result<(), AppError> {
    let content = serde_json::to_vec_pretty(state)
        .map_err(|error| AppError::io(format!("Failed to encode plugin settings: {error}")))?;
    atomic_write_private(&state_path()?, &[content.as_slice(), b"\n"].concat())
        .map_err(|error| AppError::io(format!("Failed to write plugin settings: {error}")))
}

pub fn resolve_plugin_dir(id: &str, dir: &Path) -> Result<ResolvedPlugin, AppError> {
    let canonical_dir = fs::canonicalize(dir).map_err(|error| {
        AppError::invalid_input(format!(
            "Cannot open plugin directory {}: {error}",
            dir.display()
        ))
    })?;
    if !canonical_dir.is_dir() {
        return Err(AppError::invalid_input(
            "Plugin package must be a directory",
        ));
    }
    let manifest_path = canonical_dir.join(MANIFEST_FILE);
    let content = fs::read_to_string(&manifest_path).map_err(|error| {
        AppError::invalid_input(format!(
            "Failed to read {}: {error}",
            manifest_path.display()
        ))
    })?;
    let manifest: PluginManifest = toml::from_str(&content).map_err(|error| {
        AppError::invalid_input(format!(
            "Failed to parse {}: {error}",
            manifest_path.display()
        ))
    })?;
    validate_manifest(&manifest)?;
    let wasm_path = canonical_dir.join(&manifest.plugin.wasm);
    let canonical_wasm = fs::canonicalize(&wasm_path).map_err(|error| {
        AppError::invalid_input(format!(
            "Cannot open plugin WASM {}: {error}",
            wasm_path.display()
        ))
    })?;
    if !canonical_wasm.is_file() || !canonical_wasm.starts_with(&canonical_dir) {
        return Err(AppError::invalid_input(
            "Plugin WASM must be a file inside the plugin package",
        ));
    }
    Ok(ResolvedPlugin {
        id: id.to_string(),
        dir: canonical_dir,
        wasm_path: canonical_wasm,
        manifest,
    })
}

fn validate_manifest(manifest: &PluginManifest) -> Result<(), AppError> {
    for (label, value) in [
        ("name", manifest.plugin.name.as_str()),
        ("version", manifest.plugin.version.as_str()),
        ("description", manifest.plugin.description.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(AppError::invalid_input(format!(
                "Plugin {label} cannot be blank"
            )));
        }
    }
    let wasm = Path::new(&manifest.plugin.wasm);
    if wasm.is_absolute()
        || wasm
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
        || wasm.extension().and_then(|value| value.to_str()) != Some("wasm")
    {
        return Err(AppError::invalid_input(
            "Plugin wasm must be a relative .wasm path inside the package",
        ));
    }
    let mut keys = std::collections::HashSet::new();
    for field in &manifest.config {
        if field.key.is_empty()
            || !field
                .key
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
            || !keys.insert(field.key.as_str())
        {
            return Err(AppError::invalid_input(format!(
                "Invalid or duplicate plugin config key '{}'",
                field.key
            )));
        }
        if !matches!(
            field.field_type.as_str(),
            "string" | "secret" | "boolean" | "number"
        ) {
            return Err(AppError::invalid_input(format!(
                "Unsupported config type '{}' for '{}'",
                field.field_type, field.key
            )));
        }
    }
    Ok(())
}

fn slug(name: &str) -> String {
    name.to_ascii_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

pub fn discover() -> Result<Vec<PluginEntry>, AppError> {
    let root = plugins_dir()?;
    let state = load_state()?;
    let mut entries = Vec::new();
    for child in fs::read_dir(&root)
        .map_err(|error| AppError::io(format!("Failed to scan plugins: {error}")))?
    {
        let child = child.map_err(AppError::from)?;
        if !child.file_type().map_err(AppError::from)?.is_dir() {
            continue;
        }
        let id = child.file_name().to_string_lossy().to_string();
        match resolve_plugin_dir(&id, &child.path()) {
            Ok(plugin) => entries.push(entry_for(&plugin, &state)),
            Err(error) => entries.push(PluginEntry {
                id: id.clone(),
                name: id,
                version: "0.0.0".to_string(),
                description: "Plugin package could not be loaded".to_string(),
                enabled: false,
                configured: false,
                permissions: PluginPermissions::default(),
                config: Vec::new(),
                error: Some(error.message),
            }),
        }
    }
    entries.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(entries)
}

fn entry_for(plugin: &ResolvedPlugin, state: &PluginState) -> PluginEntry {
    let saved = state.config.get(&plugin.id);
    let config = plugin
        .manifest
        .config
        .iter()
        .map(|field| PluginConfigStatus {
            key: field.key.clone(),
            description: field.description.clone(),
            field_type: field.field_type.clone(),
            required: field.required,
            configured: saved.and_then(|values| values.get(&field.key)).is_some()
                || field.default_value.is_some(),
        })
        .collect::<Vec<_>>();
    let configured = config
        .iter()
        .all(|field| !field.required || field.configured);
    PluginEntry {
        id: plugin.id.clone(),
        name: plugin.manifest.plugin.name.clone(),
        version: plugin.manifest.plugin.version.clone(),
        description: plugin.manifest.plugin.description.clone(),
        enabled: state.enabled.get(&plugin.id).copied().unwrap_or(false),
        configured,
        permissions: plugin.manifest.permissions.clone(),
        config,
        error: None,
    }
}

pub fn inspect(id: &str) -> Result<PluginEntry, AppError> {
    discover()?
        .into_iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| AppError::not_found(format!("Plugin '{id}' is not installed")))
}

pub fn install(source: &Path) -> Result<PluginEntry, AppError> {
    let provisional = resolve_plugin_dir("source", source)?;
    let id = slug(&provisional.manifest.plugin.name);
    if id.is_empty() {
        return Err(AppError::invalid_input(
            "Plugin name does not produce a valid id",
        ));
    }
    let target = plugins_dir()?.join(&id);
    if target.exists() {
        return Err(AppError::invalid_input(format!(
            "Plugin '{id}' is already installed"
        )));
    }
    fs::create_dir(&target)
        .map_err(|error| AppError::io(format!("Failed to create plugin directory: {error}")))?;
    let result = (|| {
        fs::copy(&provisional.wasm_path, target.join("plugin.wasm"))
            .map_err(|error| AppError::io(format!("Failed to copy plugin WASM: {error}")))?;
        let mut manifest = provisional.manifest.clone();
        manifest.plugin.wasm = "plugin.wasm".to_string();
        let encoded = toml::to_string_pretty(&manifest)
            .map_err(|error| AppError::io(format!("Failed to encode plugin manifest: {error}")))?;
        fs::write(target.join(MANIFEST_FILE), encoded)
            .map_err(|error| AppError::io(format!("Failed to write plugin manifest: {error}")))?;
        let mut state = load_state()?;
        state.enabled.insert(id.clone(), true);
        save_state(&state)
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(&target);
        return Err(error);
    }
    inspect(&id)
}

pub fn uninstall(id: &str) -> Result<(), AppError> {
    inspect(id)?;
    let target = plugins_dir()?.join(id);
    fs::remove_dir_all(&target)
        .map_err(|error| AppError::io(format!("Failed to uninstall plugin '{id}': {error}")))?;
    let mut state = load_state()?;
    state.enabled.remove(id);
    state.config.remove(id);
    save_state(&state)
}

pub fn set_enabled(id: &str, enabled: bool) -> Result<PluginEntry, AppError> {
    let existing = inspect(id)?;
    if enabled && existing.error.is_some() {
        return Err(AppError::invalid_input(format!("Plugin '{id}' is invalid")));
    }
    let mut state = load_state()?;
    state.enabled.insert(id.to_string(), enabled);
    save_state(&state)?;
    inspect(id)
}

pub fn set_config(id: &str, key: &str, value: &str) -> Result<PluginEntry, AppError> {
    let plugin = resolve_plugin_dir(id, &plugins_dir()?.join(id))?;
    let field = plugin
        .manifest
        .config
        .iter()
        .find(|field| field.key == key)
        .ok_or_else(|| {
            AppError::invalid_input(format!("Plugin '{id}' has no config field '{key}'"))
        })?;
    validate_config_value(field, value)?;
    let mut state = load_state()?;
    state
        .config
        .entry(id.to_string())
        .or_default()
        .insert(key.to_string(), value.to_string());
    save_state(&state)?;
    inspect(id)
}

pub fn clear_config(id: &str, key: &str) -> Result<PluginEntry, AppError> {
    let plugin = resolve_plugin_dir(id, &plugins_dir()?.join(id))?;
    if !plugin.manifest.config.iter().any(|field| field.key == key) {
        return Err(AppError::invalid_input(format!(
            "Plugin '{id}' has no config field '{key}'"
        )));
    }
    let mut state = load_state()?;
    if let Some(values) = state.config.get_mut(id) {
        values.remove(key);
    }
    save_state(&state)?;
    inspect(id)
}

fn validate_config_value(field: &PluginConfigField, value: &str) -> Result<(), AppError> {
    if value.is_empty() {
        return Err(AppError::invalid_input(
            "Plugin config value cannot be empty",
        ));
    }
    match field.field_type.as_str() {
        "boolean" if value.parse::<bool>().is_err() => Err(AppError::invalid_input(format!(
            "Plugin config '{}' must be true or false",
            field.key
        ))),
        "number" if value.parse::<f64>().is_err() => Err(AppError::invalid_input(format!(
            "Plugin config '{}' must be a number",
            field.key
        ))),
        _ => Ok(()),
    }
}

pub fn configured_values(plugin: &ResolvedPlugin) -> Result<HashMap<String, String>, AppError> {
    let state = load_state()?;
    let saved = state.config.get(&plugin.id);
    let mut values = HashMap::new();
    for field in &plugin.manifest.config {
        if let Some(value) = saved.and_then(|config| config.get(&field.key)) {
            values.insert(field.key.clone(), value.clone());
        } else if let Some(value) = &field.default_value {
            values.insert(field.key.clone(), value.clone());
        } else if field.required {
            return Err(AppError::invalid_input(format!(
                "Plugin '{}' requires config '{}'. Run `khadim plugin config set {} {} --stdin`.",
                plugin.id, field.key, plugin.id, field.key
            )));
        }
    }
    Ok(values)
}

pub fn enabled_plugins() -> Result<Vec<ResolvedPlugin>, AppError> {
    let root = plugins_dir()?;
    let state = load_state()?;
    let mut plugins = Vec::new();
    for (id, enabled) in state.enabled {
        if enabled {
            plugins.push(resolve_plugin_dir(&id, &root.join(&id))?);
        }
    }
    plugins.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(plugins)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_rejects_parent_traversal() {
        let manifest = PluginManifest {
            plugin: PluginMetadata {
                name: "example".into(),
                version: "1.0.0".into(),
                description: "example".into(),
                author: String::new(),
                wasm: "../plugin.wasm".into(),
            },
            config: Vec::new(),
            permissions: PluginPermissions::default(),
        };
        assert!(validate_manifest(&manifest).is_err());
    }

    #[test]
    fn validates_typed_config_values() {
        let mut field = PluginConfigField {
            key: "enabled".into(),
            description: "enabled".into(),
            field_type: "boolean".into(),
            required: true,
            default_value: None,
        };
        assert!(validate_config_value(&field, "true").is_ok());
        assert!(validate_config_value(&field, "yes").is_err());
        field.field_type = "number".into();
        assert!(validate_config_value(&field, "2.5").is_ok());
        assert!(validate_config_value(&field, "many").is_err());
    }
}
