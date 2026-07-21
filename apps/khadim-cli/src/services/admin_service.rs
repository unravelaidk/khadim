use crate::args::{AdminCommand, ConfigCommand, PluginCommand, SearchCommand, SecretInput};
use crate::domain::settings::StoredSettings;
use crate::services::{plugin_service, search_service, settings_service};
use khadim_ai_core::error::AppError;
use khadim_ai_core::tools::ToolDefinition;
use serde_json::{json, Value};
use std::io::Read;

pub fn run(
    command: AdminCommand,
    json_output: bool,
    settings: &mut StoredSettings,
) -> Result<(), AppError> {
    match command {
        AdminCommand::Config(command) => run_config(command, json_output, settings),
        AdminCommand::Search(command) => run_search(command, json_output, settings),
        AdminCommand::Plugin(command) => run_plugin(command, json_output),
    }
}

fn run_config(
    command: ConfigCommand,
    json_output: bool,
    settings: &mut StoredSettings,
) -> Result<(), AppError> {
    match command {
        ConfigCommand::Show => {
            let value = json!({
                "path": settings_service::settings_path()?,
                "provider": settings.provider,
                "model": settings.model_id,
                "systemPromptConfigured": settings.system_prompt.is_some(),
                "apiKeyProviders": sorted_keys(&settings.api_keys),
                "searchProvider": search_service::active_provider(settings).id,
                "searchApiKeyProviders": sorted_keys(&settings.search_api_keys),
            });
            emit(json_output, value, || {
                format!(
                    "Config: {}\nProvider: {}\nModel: {}\nSystem prompt: {}\nProvider credentials: {}\nSearch provider: {}\nSearch credentials: {}",
                    settings_service::settings_path().map(|path| path.display().to_string()).unwrap_or_else(|_| "unknown".into()),
                    settings.provider.as_deref().unwrap_or("not set"),
                    settings.model_id.as_deref().unwrap_or("not set"),
                    if settings.system_prompt.is_some() { "configured" } else { "not set" },
                    display_keys(&settings.api_keys),
                    search_service::active_provider(settings).id,
                    display_keys(&settings.search_api_keys),
                )
            });
        }
        ConfigCommand::Path => emit(
            json_output,
            json!({ "path": settings_service::settings_path()? }),
            || {
                settings_service::settings_path()
                    .map(|path| path.display().to_string())
                    .unwrap_or_default()
            },
        ),
        ConfigCommand::SetProvider(provider) => {
            ensure_ai_provider(&provider)?;
            settings.provider = Some(provider.clone());
            persist(settings)?;
            changed(json_output, "provider", &provider);
        }
        ConfigCommand::SetModel(model) => {
            settings.model_id = Some(model.clone());
            persist(settings)?;
            changed(json_output, "model", &model);
        }
        ConfigCommand::SetSystemPrompt(prompt) => {
            settings.system_prompt = Some(prompt);
            persist(settings)?;
            changed(json_output, "systemPrompt", "configured");
        }
        ConfigCommand::SetApiKey { provider, input } => {
            ensure_ai_provider(&provider)?;
            settings
                .api_keys
                .insert(provider.clone(), read_secret(input)?);
            persist(settings)?;
            changed(json_output, "apiKey", &format!("configured for {provider}"));
        }
        ConfigCommand::ClearApiKey(provider) => {
            ensure_ai_provider(&provider)?;
            settings.api_keys.remove(&provider);
            persist(settings)?;
            changed(json_output, "apiKey", &format!("cleared for {provider}"));
        }
        ConfigCommand::ClearProvider => {
            settings.provider = None;
            persist(settings)?;
            changed(json_output, "provider", "cleared");
        }
        ConfigCommand::ClearModel => {
            settings.model_id = None;
            persist(settings)?;
            changed(json_output, "model", "cleared");
        }
        ConfigCommand::ClearSystemPrompt => {
            settings.system_prompt = None;
            persist(settings)?;
            changed(json_output, "systemPrompt", "cleared");
        }
    }
    Ok(())
}

fn run_search(
    command: SearchCommand,
    json_output: bool,
    settings: &mut StoredSettings,
) -> Result<(), AppError> {
    match command {
        SearchCommand::Providers => {
            let providers = search_service::SEARCH_PROVIDERS
                .iter()
                .map(|provider| {
                    json!({
                        "id": provider.id,
                        "name": provider.name,
                        "description": provider.description,
                        "requiresApiKey": provider.requires_api_key,
                        "configured": search_service::has_credential(settings, provider),
                        "active": provider.id == search_service::active_provider(settings).id,
                    })
                })
                .collect::<Vec<_>>();
            emit(json_output, Value::Array(providers), || {
                search_service::SEARCH_PROVIDERS
                    .iter()
                    .map(|provider| {
                        format!(
                            "{} {:<12} {}",
                            if provider.id == search_service::active_provider(settings).id {
                                "*"
                            } else {
                                " "
                            },
                            provider.id,
                            if search_service::has_credential(settings, provider) {
                                "ready"
                            } else {
                                "API key required"
                            },
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            });
        }
        SearchCommand::Status => {
            let provider = search_service::active_provider(settings);
            let ready = search_service::has_credential(settings, provider);
            emit(
                json_output,
                json!({ "provider": provider.id, "name": provider.name, "ready": ready }),
                || {
                    format!(
                        "Search provider: {} ({})\nStatus: {}",
                        provider.name,
                        provider.id,
                        if ready { "ready" } else { "API key required" }
                    )
                },
            );
        }
        SearchCommand::Use(id) => {
            let provider = search_service::provider(&id)?;
            if !search_service::has_credential(settings, provider) {
                return Err(AppError::invalid_input(format!(
                    "{} requires an API key. Run `khadim search set-key {} --stdin` first.",
                    provider.name, provider.id
                )));
            }
            settings.search_provider = Some(id.clone());
            persist(settings)?;
            changed(json_output, "searchProvider", &id);
        }
        SearchCommand::SetApiKey { provider, input } => {
            let definition = search_service::provider(&provider)?;
            if !definition.requires_api_key {
                return Err(AppError::invalid_input(format!(
                    "{} does not use an API key",
                    definition.name
                )));
            }
            settings
                .search_api_keys
                .insert(provider.clone(), read_secret(input)?);
            persist(settings)?;
            changed(
                json_output,
                "searchApiKey",
                &format!("configured for {provider}"),
            );
        }
        SearchCommand::ClearApiKey(provider) => {
            settings.search_api_keys.remove(&provider);
            if settings.search_provider.as_deref() == Some(provider.as_str()) {
                settings.search_provider = Some("duckduckgo".to_string());
            }
            persist(settings)?;
            changed(
                json_output,
                "searchApiKey",
                &format!("cleared for {provider}"),
            );
        }
    }
    Ok(())
}

fn run_plugin(command: PluginCommand, json_output: bool) -> Result<(), AppError> {
    match command {
        PluginCommand::List => {
            let plugins = plugin_service::discover()?;
            emit(
                json_output,
                serde_json::to_value(&plugins).unwrap_or(Value::Null),
                || {
                    if plugins.is_empty() {
                        return "No plugins installed.".to_string();
                    }
                    plugins
                        .iter()
                        .map(|plugin| {
                            let status = if plugin.error.is_some() {
                                "invalid"
                            } else if plugin.enabled && !plugin.configured {
                                "needs config"
                            } else if plugin.enabled {
                                "enabled"
                            } else {
                                "disabled"
                            };
                            format!("{:<24} {:<12} {}", plugin.id, plugin.version, status)
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                },
            );
        }
        PluginCommand::Tools => {
            let cwd = std::env::current_dir().map_err(AppError::from)?;
            let tools = crate::services::plugin_runtime::collect_plugin_tools(&cwd)?;
            let definitions = tools
                .iter()
                .map(|tool| {
                    let definition = tool.definition();
                    json!({
                        "name": definition.name,
                        "description": definition.description,
                        "parameters": definition.parameters,
                    })
                })
                .collect::<Vec<_>>();
            emit(json_output, Value::Array(definitions), || {
                if tools.is_empty() {
                    "No tools from enabled plugins.".to_string()
                } else {
                    tools
                        .iter()
                        .map(|tool| {
                            let ToolDefinition {
                                name, description, ..
                            } = tool.definition();
                            format!("{name:<36} {description}")
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                }
            });
        }
        PluginCommand::Run { tool, input } => {
            let input: Value = serde_json::from_str(&input).map_err(|error| {
                AppError::invalid_input(format!("Plugin tool input must be a JSON value: {error}"))
            })?;
            let cwd = std::env::current_dir().map_err(AppError::from)?;
            let result = crate::services::plugin_runtime::run_plugin_tool(&cwd, &tool, &input)?;
            let value = json!({
                "ok": true,
                "tool": tool,
                "content": result.content,
                "metadata": result.metadata,
            });
            emit(json_output, value, || result.content);
        }
        PluginCommand::Dir => {
            let path = plugin_service::plugins_dir()?;
            emit(json_output, json!({ "path": path }), || {
                path.display().to_string()
            });
        }
        PluginCommand::Inspect(id) => {
            let plugin = plugin_service::inspect(&id)?;
            emit(
                json_output,
                serde_json::to_value(&plugin).unwrap_or(Value::Null),
                || {
                    format!(
                    "{} ({})\n{}\nStatus: {}\nFilesystem: {}  HTTP: {}  Store: {}\nConfig fields: {}",
                    plugin.name,
                    plugin.id,
                    plugin.description,
                    if plugin.enabled { "enabled" } else { "disabled" },
                    plugin.permissions.fs,
                    plugin.permissions.http,
                    plugin.permissions.store,
                    plugin.config.iter().map(|field| format!("{} ({})", field.key, if field.configured { "configured" } else { "missing" })).collect::<Vec<_>>().join(", "),
                )
                },
            );
        }
        PluginCommand::Install(path) => {
            let plugin = plugin_service::install(&path)?;
            emit(
                json_output,
                serde_json::to_value(&plugin).unwrap_or(Value::Null),
                || format!("Installed and enabled plugin '{}'.", plugin.id),
            );
        }
        PluginCommand::Uninstall(id) => {
            plugin_service::uninstall(&id)?;
            changed(json_output, "plugin", &format!("uninstalled {id}"));
        }
        PluginCommand::Enable(id) => {
            let plugin = plugin_service::set_enabled(&id, true)?;
            emit(
                json_output,
                serde_json::to_value(&plugin).unwrap_or(Value::Null),
                || format!("Enabled plugin '{}'.", plugin.id),
            );
        }
        PluginCommand::Disable(id) => {
            let plugin = plugin_service::set_enabled(&id, false)?;
            emit(
                json_output,
                serde_json::to_value(&plugin).unwrap_or(Value::Null),
                || format!("Disabled plugin '{}'.", plugin.id),
            );
        }
        PluginCommand::SetConfig { plugin, key, input } => {
            let entry = plugin_service::set_config(&plugin, &key, &read_secret(input)?)?;
            emit(
                json_output,
                serde_json::to_value(&entry).unwrap_or(Value::Null),
                || format!("Configured '{}.{}'.", plugin, key),
            );
        }
        PluginCommand::ClearConfig { plugin, key } => {
            let entry = plugin_service::clear_config(&plugin, &key)?;
            emit(
                json_output,
                serde_json::to_value(&entry).unwrap_or(Value::Null),
                || format!("Cleared '{}.{}'.", plugin, key),
            );
        }
    }
    Ok(())
}

fn persist(settings: &StoredSettings) -> Result<(), AppError> {
    settings_service::save_settings(settings)
}

fn ensure_ai_provider(provider: &str) -> Result<(), AppError> {
    if crate::services::catalog_service::provider_catalog()
        .iter()
        .any(|candidate| candidate.id == provider)
    {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!(
            "Unknown AI provider '{provider}'. Run `khadim --providers` to list provider ids."
        )))
    }
}

fn read_secret(input: SecretInput) -> Result<String, AppError> {
    let value = match input {
        SecretInput::Value(value) => value,
        SecretInput::Stdin => {
            let mut value = String::new();
            std::io::stdin()
                .read_to_string(&mut value)
                .map_err(|error| {
                    AppError::io(format!("Failed to read secret from stdin: {error}"))
                })?;
            value.trim_end_matches(['\r', '\n']).to_string()
        }
    };
    if value.trim().is_empty() {
        return Err(AppError::invalid_input("Secret value cannot be blank"));
    }
    if value.len() > 16 * 1024 {
        return Err(AppError::invalid_input("Secret value is too large"));
    }
    Ok(value)
}

fn emit(message_as_json: bool, value: Value, text: impl FnOnce() -> String) {
    if message_as_json {
        println!(
            "{}",
            serde_json::to_string(&value).unwrap_or_else(|_| "null".into())
        );
    } else {
        println!("{}", text());
    }
}

fn changed(json_output: bool, setting: &str, value: &str) {
    emit(
        json_output,
        json!({ "ok": true, "setting": setting, "value": value }),
        || format!("Updated {setting}: {value}"),
    );
}

fn sorted_keys(map: &std::collections::HashMap<String, String>) -> Vec<&str> {
    let mut keys = map.keys().map(String::as_str).collect::<Vec<_>>();
    keys.sort_unstable();
    keys
}

fn display_keys(map: &std::collections::HashMap<String, String>) -> String {
    let keys = sorted_keys(map);
    if keys.is_empty() {
        "none".to_string()
    } else {
        keys.join(", ")
    }
}
