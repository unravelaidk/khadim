use crate::domain::harness::Harness;
use crate::services::session_service::validate_session_key;
use khadim_ai_core::error::AppError;
use std::env;
use std::io::{self, IsTerminal, Read};
use std::path::PathBuf;

// ── CLI Config ────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ToolGroup {
    Web,
    Files,
    Apps,
    Rpa,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CodexAuthCommand {
    Login { open_browser: bool },
    Status,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SecretInput {
    Value(String),
    Stdin,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConfigCommand {
    Show,
    Path,
    SetProvider(String),
    SetModel(String),
    SetSystemPrompt(String),
    ClearProvider,
    ClearModel,
    ClearSystemPrompt,
    SetApiKey {
        provider: String,
        input: SecretInput,
    },
    ClearApiKey(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SearchCommand {
    Providers,
    Status,
    Use(String),
    SetApiKey {
        provider: String,
        input: SecretInput,
    },
    ClearApiKey(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PluginCommand {
    List,
    Tools,
    Run {
        tool: String,
        input: String,
    },
    Dir,
    Inspect(String),
    Install(PathBuf),
    Uninstall(String),
    Enable(String),
    Disable(String),
    SetConfig {
        plugin: String,
        key: String,
        input: SecretInput,
    },
    ClearConfig {
        plugin: String,
        key: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AdminCommand {
    Config(ConfigCommand),
    Search(SearchCommand),
    Plugin(PluginCommand),
}

#[derive(Clone)]
pub struct CliConfig {
    pub cwd: PathBuf,
    pub prompt: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub base_url: Option<String>,
    pub search_provider: Option<String>,
    pub ignore_saved_api_key: bool,
    /// Inherited pipe descriptor used by managed launchers to signal their
    /// lifetime. EOF terminates this CLI and its child process tree.
    pub parent_watch_fd: Option<i32>,
    pub session: Option<String>,
    pub delete_session: Option<String>,
    pub system_prompt: Option<String>,
    pub harness: Harness,
    #[allow(dead_code)]
    pub verbose: bool,
    pub json: bool,
    pub list_providers: Option<String>,
    pub list_models: Option<String>,
    pub codex_auth: Option<CodexAuthCommand>,
    /// One-shot, non-interactive configuration or plugin administration.
    pub admin_command: Option<AdminCommand>,
    /// Run via the multi-agent coordinator (decompose → assign → spawn →
    /// aggregate) instead of the single-agent loop. Default: off.
    pub multi_agent: bool,
    /// Explicit tool-group allowlist. `None` preserves the legacy full tool
    /// set, while `Some([])` intentionally disables every optional tool.
    pub tool_groups: Option<Vec<ToolGroup>>,
    /// Canonical directories that the explicit `read` tool may access in
    /// addition to the project root.
    pub skill_dirs: Vec<PathBuf>,
}

// ── Arg parsing ──────────────────────────────────────────────────────

pub fn parse_args() -> Result<CliConfig, AppError> {
    parse_args_from(env::args().skip(1))
}

fn parse_args_from(args: impl IntoIterator<Item = String>) -> Result<CliConfig, AppError> {
    let mut cwd = env::current_dir().map_err(AppError::from)?;
    let mut prompt = None;
    let mut provider = None;
    let mut model = None;
    let mut temperature = None;
    let mut base_url = None;
    let mut search_provider = None;
    let mut ignore_saved_api_key = false;
    let mut parent_watch_fd = None;
    let mut session = None;
    let mut delete_session = None;
    let mut system_prompt = None;
    let mut harness = Harness::default();
    let mut verbose = false;
    let mut json = false;
    let mut list_providers = None;
    let mut list_models = None;
    let mut codex_auth = None;
    let mut admin_command = None;
    let mut multi_agent = false;
    let mut tool_groups = None;
    let mut skill_dirs = Vec::new();
    let mut request_stdin = false;
    let mut exec_mode = false;
    let mut positional_prompt = Vec::new();
    let mut args = args.into_iter().peekable();
    if matches!(
        args.peek().map(String::as_str),
        Some("config" | "search" | "plugin" | "plugins")
    ) {
        let family = args.next().expect("peeked command family");
        let (command, command_json) = parse_admin_command(&family, args.by_ref().collect())?;
        admin_command = Some(command);
        json = command_json;
    } else if matches!(args.peek().map(String::as_str), Some("login")) {
        args.next();
        let provider = args.next().ok_or_else(|| {
            AppError::invalid_input("login requires a provider; expected 'codex'")
        })?;
        if provider != "codex" && provider != "openai-codex" {
            return Err(AppError::invalid_input(
                "Only 'login codex' is supported as a direct login command",
            ));
        }
        codex_auth = Some(CodexAuthCommand::Login { open_browser: true });
    } else if matches!(args.peek().map(String::as_str), Some("exec")) {
        exec_mode = true;
        args.next();
    } else if let Some(first) = args.peek().cloned() {
        if is_harness_subcommand(&first) {
            harness = Harness::parse(&first)?;
            args.next();
            if matches!(args.peek().map(String::as_str), Some("exec")) {
                exec_mode = true;
                args.next();
            }
        }
    }

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--cwd" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--cwd requires a value"))?;
                cwd = PathBuf::from(&value)
                    .canonicalize()
                    .unwrap_or_else(|_| PathBuf::from(value));
            }
            "--prompt" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--prompt requires a value"))?;
                prompt = Some(value);
            }
            "--request-stdin" => {
                request_stdin = true;
            }
            "--provider" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--provider requires a value"))?;
                provider = Some(value);
            }
            "--model" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--model requires a value"))?;
                model = Some(value);
            }
            "--temperature" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--temperature requires a value"))?;
                temperature = Some(parse_temperature(&value)?);
            }
            "--base-url" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--base-url requires a value"))?;
                base_url = Some(parse_base_url(&value)?);
            }
            "--search-provider" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--search-provider requires a value"))?;
                search_provider = Some(parse_search_provider(&value)?);
            }
            "--ignore-saved-api-key" => {
                ignore_saved_api_key = true;
            }
            "--parent-watch-fd" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--parent-watch-fd requires a value"))?;
                parent_watch_fd = Some(parse_parent_watch_fd(&value)?);
            }
            "--session" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--session requires a value"))?;
                session = Some(value);
            }
            "--delete-session" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--delete-session requires a value"))?;
                validate_session_key(&value)?;
                delete_session = Some(value);
            }
            "--system-prompt" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--system-prompt requires a value"))?;
                system_prompt = Some(value);
            }
            "--harness" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--harness requires a value"))?;
                harness = Harness::parse(&value)?;
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            "--version" | "-v" => {
                print_version();
                std::process::exit(0);
            }
            "--json" => {
                json = true;
            }
            "--multi-agent" => {
                multi_agent = true;
            }
            "--tool-groups" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--tool-groups requires a value"))?;
                tool_groups = Some(parse_tool_groups(&value)?);
            }
            "--skill-dir" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--skill-dir requires a value"))?;
                let skill_dir = canonical_skill_dir(&value)?;
                if !skill_dirs.contains(&skill_dir) {
                    skill_dirs.push(skill_dir);
                }
            }
            "--providers" => {
                let value = args.next().unwrap_or_else(|| "json".to_string());
                list_providers = Some(value);
            }
            "--models" => {
                let value = args.next().ok_or_else(|| {
                    AppError::invalid_input("--models requires a provider argument")
                })?;
                list_models = Some(value);
            }
            "--status" if codex_auth.is_some() => {
                codex_auth = Some(CodexAuthCommand::Status);
            }
            "--no-open-browser" if matches!(codex_auth, Some(CodexAuthCommand::Login { .. })) => {
                codex_auth = Some(CodexAuthCommand::Login {
                    open_browser: false,
                });
            }
            "--verbose" => {
                verbose = true;
            }
            other if exec_mode => {
                positional_prompt.push(other.to_string());
            }
            other => {
                return Err(AppError::invalid_input(format!(
                    "Unknown argument: {other}"
                )));
            }
        }
    }

    if prompt.is_none() && exec_mode && !positional_prompt.is_empty() {
        prompt = Some(positional_prompt.join(" "));
    }

    if request_stdin {
        if prompt.is_some() || system_prompt.is_some() {
            return Err(AppError::invalid_input(
                "--request-stdin cannot be combined with --prompt, a positional exec prompt, or --system-prompt",
            ));
        }
        let request = parse_stdin_request(&read_stdin()?)?;
        prompt = Some(request.prompt);
        system_prompt = request.system_prompt;
    } else if prompt.as_deref() == Some("-") {
        prompt = Some(read_stdin()?);
    } else if exec_mode && !io::stdin().is_terminal() {
        let stdin = read_stdin()?;
        if !stdin.trim().is_empty() {
            prompt = Some(match prompt {
                Some(existing) if !existing.trim().is_empty() => {
                    format!("{existing}\n\n<stdin>\n{stdin}\n</stdin>")
                }
                _ => stdin,
            });
        }
    }

    if exec_mode && prompt.is_none() {
        return Err(AppError::invalid_input(
            "exec requires a prompt argument or piped stdin",
        ));
    }

    Ok(CliConfig {
        cwd,
        prompt,
        provider,
        model,
        temperature,
        base_url,
        search_provider,
        ignore_saved_api_key,
        parent_watch_fd,
        session,
        delete_session,
        system_prompt,
        harness,
        verbose,
        json,
        list_providers,
        list_models,
        codex_auth,
        admin_command,
        multi_agent,
        tool_groups,
        skill_dirs,
    })
}

fn parse_admin_command(
    family: &str,
    raw_args: Vec<String>,
) -> Result<(AdminCommand, bool), AppError> {
    let mut json = false;
    let mut args = Vec::new();
    for arg in raw_args {
        if arg == "--json" {
            json = true;
        } else {
            args.push(arg);
        }
    }
    let command = match family {
        "config" => AdminCommand::Config(parse_config_command(&args)?),
        "search" => AdminCommand::Search(parse_search_command(&args)?),
        "plugin" | "plugins" => AdminCommand::Plugin(parse_plugin_command(&args)?),
        _ => unreachable!("validated admin command family"),
    };
    Ok((command, json))
}

fn parse_config_command(args: &[String]) -> Result<ConfigCommand, AppError> {
    match strings(args).as_slice() {
        [] | ["show"] => Ok(ConfigCommand::Show),
        ["path"] => Ok(ConfigCommand::Path),
        ["set", "provider", provider] => Ok(ConfigCommand::SetProvider(non_blank(
            "provider",
            provider,
        )?)),
        ["set", "model", model] => Ok(ConfigCommand::SetModel(non_blank("model", model)?)),
        ["set", "system-prompt", prompt] => Ok(ConfigCommand::SetSystemPrompt(non_blank(
            "system prompt",
            prompt,
        )?)),
        ["set", "api-key", provider, "--stdin"] => Ok(ConfigCommand::SetApiKey {
            provider: non_blank("provider", provider)?,
            input: SecretInput::Stdin,
        }),
        ["set", "api-key", provider, value] => Ok(ConfigCommand::SetApiKey {
            provider: non_blank("provider", provider)?,
            input: SecretInput::Value(non_blank("API key", value)?),
        }),
        ["clear", "api-key", provider] => {
            Ok(ConfigCommand::ClearApiKey(non_blank("provider", provider)?))
        }
        ["clear", "provider"] => Ok(ConfigCommand::ClearProvider),
        ["clear", "model"] => Ok(ConfigCommand::ClearModel),
        ["clear", "system-prompt"] => Ok(ConfigCommand::ClearSystemPrompt),
        _ => Err(AppError::invalid_input(
            "Usage: khadim config [show|path|set provider NAME|set model ID|set system-prompt TEXT|set api-key PROVIDER VALUE|--stdin|clear provider|model|system-prompt|api-key PROVIDER]",
        )),
    }
}

fn parse_search_command(args: &[String]) -> Result<SearchCommand, AppError> {
    match strings(args).as_slice() {
        [] | ["status"] => Ok(SearchCommand::Status),
        ["providers"] | ["list"] => Ok(SearchCommand::Providers),
        ["use", provider] => Ok(SearchCommand::Use(parse_search_provider(provider)?)),
        ["set-key", provider, "--stdin"] => Ok(SearchCommand::SetApiKey {
            provider: parse_search_provider(provider)?,
            input: SecretInput::Stdin,
        }),
        ["set-key", provider, value] => Ok(SearchCommand::SetApiKey {
            provider: parse_search_provider(provider)?,
            input: SecretInput::Value(non_blank("search API key", value)?),
        }),
        ["clear-key", provider] => Ok(SearchCommand::ClearApiKey(parse_search_provider(provider)?)),
        _ => Err(AppError::invalid_input(
            "Usage: khadim search [status|providers|use PROVIDER|set-key PROVIDER VALUE|--stdin|clear-key PROVIDER]",
        )),
    }
}

fn parse_plugin_command(args: &[String]) -> Result<PluginCommand, AppError> {
    match strings(args).as_slice() {
        [] | ["list"] => Ok(PluginCommand::List),
        ["tools"] => Ok(PluginCommand::Tools),
        ["run", tool, input] => Ok(PluginCommand::Run {
            tool: non_blank("plugin tool", tool)?,
            input: non_blank("plugin tool JSON input", input)?,
        }),
        ["dir"] => Ok(PluginCommand::Dir),
        ["inspect", plugin] => Ok(PluginCommand::Inspect(plugin_id(plugin)?)),
        ["install", path] => Ok(PluginCommand::Install(PathBuf::from(path))),
        ["uninstall", plugin] => Ok(PluginCommand::Uninstall(plugin_id(plugin)?)),
        ["enable", plugin] => Ok(PluginCommand::Enable(plugin_id(plugin)?)),
        ["disable", plugin] => Ok(PluginCommand::Disable(plugin_id(plugin)?)),
        ["config", "set", plugin, key, "--stdin"] => Ok(PluginCommand::SetConfig {
            plugin: plugin_id(plugin)?,
            key: config_key(key)?,
            input: SecretInput::Stdin,
        }),
        ["config", "set", plugin, key, value] => Ok(PluginCommand::SetConfig {
            plugin: plugin_id(plugin)?,
            key: config_key(key)?,
            input: SecretInput::Value(non_blank("plugin config value", value)?),
        }),
        ["config", "clear", plugin, key] => Ok(PluginCommand::ClearConfig {
            plugin: plugin_id(plugin)?,
            key: config_key(key)?,
        }),
        _ => Err(AppError::invalid_input(
            "Usage: khadim plugin [list|tools|run TOOL JSON|dir|inspect ID|install PATH|uninstall ID|enable ID|disable ID|config set ID KEY VALUE|--stdin|config clear ID KEY]",
        )),
    }
}

fn strings(values: &[String]) -> Vec<&str> {
    values.iter().map(String::as_str).collect()
}

fn non_blank(label: &str, value: &str) -> Result<String, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::invalid_input(format!("{label} cannot be blank")));
    }
    Ok(value.to_string())
}

fn plugin_id(value: &str) -> Result<String, AppError> {
    let value = non_blank("plugin id", value)?.to_ascii_lowercase();
    if value.len() > 128
        || !value.chars().all(|ch| {
            ch.is_ascii_lowercase() || ch.is_ascii_digit() || matches!(ch, '.' | '_' | '-')
        })
        || !value
            .chars()
            .next()
            .is_some_and(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit())
    {
        return Err(AppError::invalid_input(
            "plugin id must start with a letter or number and contain only letters, numbers, '.', '_' or '-'",
        ));
    }
    Ok(value)
}

fn config_key(value: &str) -> Result<String, AppError> {
    let value = non_blank("plugin config key", value)?;
    if value.len() > 80
        || !value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
    {
        return Err(AppError::invalid_input(
            "plugin config key may contain only letters, numbers, '.', '_' or '-'",
        ));
    }
    Ok(value)
}

fn canonical_skill_dir(value: &str) -> Result<PathBuf, AppError> {
    let path = PathBuf::from(value);
    let canonical = std::fs::canonicalize(&path).map_err(|_| {
        AppError::invalid_input(format!(
            "--skill-dir must name an existing directory: {}",
            path.display()
        ))
    })?;
    if !canonical.is_dir() {
        return Err(AppError::invalid_input(format!(
            "--skill-dir must name an existing directory: {}",
            path.display()
        )));
    }
    Ok(canonical)
}

fn parse_temperature(value: &str) -> Result<f32, AppError> {
    let temperature = value.parse::<f32>().map_err(|_| {
        AppError::invalid_input("--temperature must be a finite number from 0 to 2")
    })?;
    if !temperature.is_finite() || !(0.0..=2.0).contains(&temperature) {
        return Err(AppError::invalid_input(
            "--temperature must be a finite number from 0 to 2",
        ));
    }
    Ok(temperature)
}

fn parse_parent_watch_fd(value: &str) -> Result<i32, AppError> {
    let fd = value.parse::<i32>().map_err(|_| {
        AppError::invalid_input("--parent-watch-fd must be an inherited descriptor of 3 or higher")
    })?;
    if fd < 3 {
        return Err(AppError::invalid_input(
            "--parent-watch-fd must be an inherited descriptor of 3 or higher",
        ));
    }
    Ok(fd)
}

fn parse_base_url(value: &str) -> Result<String, AppError> {
    let value = value.trim();
    let invalid = || {
        AppError::invalid_input(
            "--base-url must use HTTPS unless its host is loopback; userinfo, query, and fragment are not allowed",
        )
    };
    let parsed = url::Url::parse(value).map_err(|_| invalid())?;
    let is_loopback = match parsed.host() {
        Some(url::Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(address)) => address.is_loopback(),
        Some(url::Host::Ipv6(address)) => address.is_loopback(),
        None => false,
    };
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || (parsed.scheme() == "http" && !is_loopback)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(invalid());
    }
    Ok(value.to_string())
}

fn parse_search_provider(value: &str) -> Result<String, AppError> {
    match value.trim().to_ascii_lowercase().as_str() {
        provider @ ("duckduckgo" | "parallel" | "exa" | "tavily" | "perplexity" | "brave") => {
            Ok(provider.to_string())
        }
        _ => Err(AppError::invalid_input(
            "--search-provider must be one of: duckduckgo, parallel, exa, tavily, perplexity, brave",
        )),
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StdinRequest {
    prompt: String,
    system_prompt: Option<String>,
}

fn parse_stdin_request(input: &str) -> Result<StdinRequest, AppError> {
    let request = serde_json::from_str::<StdinRequest>(input).map_err(|error| {
        AppError::invalid_input(format!(
            "--request-stdin requires one JSON object {{\"prompt\": string, \"systemPrompt\"?: string}}: {error}"
        ))
    })?;
    if request.prompt.trim().is_empty() {
        return Err(AppError::invalid_input(
            "--request-stdin requires a non-blank prompt",
        ));
    }
    Ok(request)
}

fn parse_tool_groups(value: &str) -> Result<Vec<ToolGroup>, AppError> {
    if value.trim().is_empty() {
        return Ok(Vec::new());
    }

    let names = value.split(',').map(str::trim).collect::<Vec<_>>();
    if names.contains(&"none") {
        if names.len() == 1 {
            return Ok(Vec::new());
        }
        return Err(AppError::invalid_input(
            "Tool group 'none' cannot be combined with other groups",
        ));
    }

    let mut groups = Vec::new();
    for name in names {
        let group = match name {
            "web" => ToolGroup::Web,
            "files" => ToolGroup::Files,
            "apps" => ToolGroup::Apps,
            "rpa" => ToolGroup::Rpa,
            "" => {
                return Err(AppError::invalid_input(
                    "--tool-groups contains an empty group",
                ))
            }
            _ => {
                return Err(AppError::invalid_input(format!(
                    "Unknown tool group '{name}'. Expected one of: web, files, apps, rpa, none"
                )))
            }
        };
        if !groups.contains(&group) {
            groups.push(group);
        }
    }
    Ok(groups)
}

fn is_harness_subcommand(value: &str) -> bool {
    matches!(value, "coding" | "rpa" | "assistant")
}

fn read_stdin() -> Result<String, AppError> {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|err| AppError::io(format!("Failed to read stdin: {err}")))?;
    Ok(input)
}

fn print_version() {
    println!("khadim-cli {}", env!("CARGO_PKG_VERSION"));
}

fn print_help() {
    println!(
        "khadim — Local-first Agentic Automation\n\n\
         USAGE:\n\
         \x20 khadim [OPTIONS]\n\
         \x20 khadim exec [OPTIONS] [PROMPT]\n\n\
         \x20 khadim login codex [--json] [--no-open-browser]\n\
         \x20 khadim login codex --status [--json]\n\n\
         \x20 khadim config [show|path|set|clear] [--json]\n\
         \x20 khadim search [status|providers|use|set-key|clear-key] [--json]\n\
         \x20 khadim plugin [list|tools|run|dir|inspect|install|uninstall|enable|disable|config] [--json]\n\n\
         \x20 khadim rpa [OPTIONS]\n\
         \x20 khadim rpa exec [OPTIONS] [PROMPT]\n\
         \x20 khadim assistant [OPTIONS]\n\n\
         OPTIONS:\n\
         \x20 --cwd PATH       Set working directory\n\
         \x20 --prompt TEXT    Run in batch mode with prompt (`-` reads stdin)\n\
         \x20 --request-stdin  Read one JSON request {{prompt, systemPrompt?}} from stdin\n\
         \x20 --provider NAME  Set AI provider\n\
         \x20 --model ID       Set AI model\n\
         \x20 --temperature N  Override sampling temperature (0 to 2)\n\
         \x20 --base-url URL   Override the selected provider endpoint\n\
         \x20 --search-provider NAME  Select web search: duckduckgo, parallel, exa, tavily, perplexity, or brave\n\
         \x20 --ignore-saved-api-key  Do not use API keys from CLI settings\n\
         \x20 --parent-watch-fd FD  Exit with the child process tree when this inherited pipe closes\n\
         \x20 --session NAME   Load saved session\n\
         \x20 --delete-session KEY  Delete a saved engine session and exit\n\
         \x20 --system-prompt TEXT  Override the system prompt for this run\n\
         \x20 --harness NAME   Select harness: coding, rpa, assistant, or custom\n\
         \x20 --tool-groups LIST  Restrict tools to web,files,apps,rpa; none disables all\n\
         \x20 --skill-dir PATH  Allow explicit read access to an enabled skill dir (repeatable)\n\
         \x20 --multi-agent   Use multi-agent mode (no --tool-groups/--temperature)\n\
         \x20 --verbose       Enable verbose logging\n\
         \x20 -h, --help       Show this help\n\
         \x20 -v, --version    Show version\n\n\
         Without --prompt or exec, Khadim launches an interactive TUI.\n\
         In exec mode, piped stdin is appended as a <stdin> block.\n\
         Use `--stdin` with API-key and plugin-config commands to keep secrets out of shell history.\n\
         Type / to see all available commands with live preview.\n\n\
         COMMANDS (type / to see preview):\n\
         \x20 /help            Show all commands & shortcuts\n\
         \x20 /sessions        List saved sessions\n\
         \x20 /session NAME    Switch to a session\n\
         \x20 /new             Start a new session\n\
         \x20 /save NAME       Save current session\n\
         \x20 /delete NAME     Delete a saved session\n\
         \x20 /rename OLD NEW  Rename a saved session\n\
         \x20 /theme           Switch theme\n\
         \x20 /provider        Switch AI provider\n\
         \x20 /model           Switch model\n\
         \x20 /harness         Switch harness\n\
         \x20 /login           OAuth login (Copilot, Codex)\n\
         \x20 /settings        Open settings panel (F2)\n\
         \x20 /providers       List providers & auth status\n\
         \x20 /reset           Reset session\n\
         \x20 /copy            Copy last response to clipboard\n\
         \x20 /export [PATH]   Export conversation to markdown\n\
         \x20 /system PROMPT   Set custom system prompt\n\
         \x20 /tokens          Show token usage breakdown\n\
         \x20 /history         Show input history\n\
         \x20 /clear-history   Clear input history\n\
         \x20 /config          Show config directory path\n\
         \x20 /version         Show version info\n\
         \x20 /refresh-models  Refresh dynamic model lists\n\n\
         SHORTCUTS:\n\
         \x20 Enter           Send message\n\
         \x20 Shift+Enter     Insert newline\n\
         \x20 Tab             Accept command suggestion\n\
         \x20 Escape          Abort / close overlay\n\
         \x20 Ctrl-C          Quit\n\
         \x20 Ctrl-L          Clear session\n\
         \x20 Ctrl-K          Clear input\n\
         \x20 Ctrl-O          Toggle tool output\n\
         \x20 Ctrl-Left/Right Word navigation\n\
         \x20 Ctrl-W          Delete word before cursor\n\
         \x20 Ctrl-A/E        Jump to start/end of line\n\
         \x20 Up/Down         History navigation (when input focused)\n\
         \x20 F2              Settings panel\n\
         \x20 PageUp/Down     Scroll by page\n\
         \x20 Mouse wheel     Scroll transcript"
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn omitted_tool_flags_preserve_legacy_mode_without_external_read_roots() {
        let config = parse_args_from(Vec::<String>::new()).expect("parse defaults");

        assert_eq!(config.tool_groups, None);
        assert!(config.skill_dirs.is_empty());
        assert_eq!(config.temperature, None);
        assert_eq!(config.base_url, None);
        assert_eq!(config.search_provider, None);
        assert!(!config.ignore_saved_api_key);
        assert_eq!(config.parent_watch_fd, None);
        assert_eq!(config.delete_session, None);
        assert_eq!(config.codex_auth, None);
        assert_eq!(config.admin_command, None);
    }

    #[test]
    fn parses_non_interactive_search_and_plugin_commands() {
        let search = parse_args_from([
            "search".to_string(),
            "set-key".to_string(),
            "exa".to_string(),
            "--stdin".to_string(),
            "--json".to_string(),
        ])
        .expect("parse search command");
        assert_eq!(
            search.admin_command,
            Some(AdminCommand::Search(SearchCommand::SetApiKey {
                provider: "exa".to_string(),
                input: SecretInput::Stdin,
            }))
        );
        assert!(search.json);

        let plugin = parse_args_from([
            "plugins".to_string(),
            "config".to_string(),
            "clear".to_string(),
            "example.plugin".to_string(),
            "token".to_string(),
        ])
        .expect("parse plugin command");
        assert_eq!(
            plugin.admin_command,
            Some(AdminCommand::Plugin(PluginCommand::ClearConfig {
                plugin: "example.plugin".to_string(),
                key: "token".to_string(),
            }))
        );
    }

    #[test]
    fn parses_direct_codex_login_commands() {
        let login = parse_args_from([
            "login".to_string(),
            "codex".to_string(),
            "--json".to_string(),
            "--no-open-browser".to_string(),
        ])
        .expect("parse codex login");
        assert_eq!(
            login.codex_auth,
            Some(CodexAuthCommand::Login {
                open_browser: false
            })
        );
        assert!(login.json);

        let status = parse_args_from([
            "login".to_string(),
            "openai-codex".to_string(),
            "--status".to_string(),
        ])
        .expect("parse codex status");
        assert_eq!(status.codex_auth, Some(CodexAuthCommand::Status));
    }

    #[test]
    fn parses_and_validates_search_provider() {
        let config = parse_args_from(["--search-provider".to_string(), "Exa".to_string()])
            .expect("parse search provider");
        assert_eq!(config.search_provider.as_deref(), Some("exa"));

        let result = parse_args_from(["--search-provider".to_string(), "google".to_string()]);
        let error = match result {
            Err(error) => error,
            Ok(_) => panic!("unsupported search provider was accepted"),
        };
        assert!(error
            .to_string()
            .contains("--search-provider must be one of"));
    }

    #[test]
    fn parses_explicit_tool_groups_as_a_typed_allowlist() {
        let config = parse_args_from(["--tool-groups".to_string(), "web, files,rpa".to_string()])
            .expect("parse tool groups");

        assert_eq!(
            config.tool_groups,
            Some(vec![ToolGroup::Web, ToolGroup::Files, ToolGroup::Rpa])
        );
    }

    #[test]
    fn parses_per_run_model_overrides() {
        let config = parse_args_from([
            "--temperature".to_string(),
            "0.75".to_string(),
            "--base-url".to_string(),
            "https://gateway.example/v1".to_string(),
        ])
        .expect("parse model overrides");

        assert_eq!(config.temperature, Some(0.75));
        assert_eq!(
            config.base_url.as_deref(),
            Some("https://gateway.example/v1")
        );
    }

    #[test]
    fn parses_json_delete_session_as_a_one_shot_command() {
        let config = parse_args_from([
            "--delete-session".to_string(),
            "chat-123.v2".to_string(),
            "--json".to_string(),
        ])
        .expect("parse delete-session command");

        assert_eq!(config.delete_session.as_deref(), Some("chat-123.v2"));
        assert!(config.json);
    }

    #[test]
    fn parses_ignore_saved_api_key_as_an_explicit_credential_boundary() {
        let config = parse_args_from(["--ignore-saved-api-key".to_string()])
            .expect("parse credential boundary flag");

        assert!(config.ignore_saved_api_key);
    }

    #[test]
    fn parses_parent_watch_fd_for_managed_process_lifecycle() {
        let config = parse_args_from(["--parent-watch-fd".to_string(), "3".to_string()])
            .expect("parse parent watch fd");

        assert_eq!(config.parent_watch_fd, Some(3));
    }

    #[test]
    fn rejects_parent_watch_fds_reserved_for_standard_streams() {
        for value in ["-1", "0", "1", "2", "not-a-fd"] {
            let error = parse_args_from(["--parent-watch-fd".to_string(), value.to_string()])
                .err()
                .expect("reserved or invalid fd must be rejected");

            assert!(error.message.contains("--parent-watch-fd"));
        }
    }

    #[test]
    fn parses_the_strict_stdin_request_envelope() {
        let request = parse_stdin_request(
            r#"{"prompt":"private prompt","systemPrompt":"private capability context"}"#,
        )
        .expect("parse stdin request");

        assert_eq!(request.prompt, "private prompt");
        assert_eq!(
            request.system_prompt.as_deref(),
            Some("private capability context")
        );

        for invalid in [
            r#"{"prompt":"   "}"#,
            r#"{"prompt":"valid","extra":true}"#,
            r#"["not", "an", "object"]"#,
            r#"{"systemPrompt":"missing prompt"}"#,
        ] {
            let error = parse_stdin_request(invalid).expect_err("invalid stdin request");
            assert!(error.message.contains("--request-stdin"));
        }
    }

    #[test]
    fn request_stdin_rejects_prompt_and_system_prompt_flags() {
        for conflicting in ["--prompt", "--system-prompt"] {
            let error = parse_args_from([
                "--request-stdin".to_string(),
                conflicting.to_string(),
                "argv secret".to_string(),
            ])
            .err()
            .expect("stdin request conflict");
            assert!(error.message.contains("cannot be combined"));
        }
    }

    #[test]
    fn delete_session_requires_an_exact_safe_engine_key() {
        let too_long = "x".repeat(181);
        for key in [
            "",
            "../outside",
            "contains space",
            "chat/name",
            too_long.as_str(),
        ] {
            let error = parse_args_from(["--delete-session".to_string(), key.to_string()])
                .err()
                .expect("unsafe session key must be rejected");
            assert!(error.message.contains("session key"));
        }

        let missing = parse_args_from(["--delete-session".to_string()])
            .err()
            .expect("missing session key must be rejected");
        assert!(missing.message.contains("requires a value"));
    }

    #[test]
    fn rejects_non_finite_or_out_of_range_temperatures() {
        for value in ["NaN", "inf", "-0.01", "2.01", "not-a-number"] {
            let error = parse_args_from(["--temperature".to_string(), value.to_string()])
                .err()
                .unwrap_or_else(|| panic!("temperature {value} must be rejected"));

            assert!(error.to_string().contains("number from 0 to 2"));
        }
    }

    #[test]
    fn accepts_inclusive_temperature_boundaries() {
        for value in ["0", "2"] {
            let config = parse_args_from(["--temperature".to_string(), value.to_string()])
                .expect("temperature boundary");
            assert_eq!(config.temperature, value.parse::<f32>().ok());
        }
    }

    #[test]
    fn rejects_invalid_or_non_http_base_urls() {
        for value in [
            "",
            "not-a-url",
            "ftp://gateway.example",
            "https://",
            "https://gateway.example/v1?tenant=acme",
            "https://gateway.example/v1#responses",
            "https://user@gateway.example/v1",
            "https://user:secret@gateway.example/v1",
        ] {
            let error = parse_args_from(["--base-url".to_string(), value.to_string()])
                .err()
                .unwrap_or_else(|| panic!("base URL {value:?} must be rejected"));

            assert!(error.to_string().contains("--base-url"));
        }
    }

    #[test]
    fn plain_http_base_urls_are_limited_to_loopback_hosts() {
        for value in [
            "http://localhost:11434/v1",
            "http://127.0.0.1:8080/v1",
            "http://127.42.1.2/v1",
            "http://[::1]:8080/v1",
            "https://models.example/v1",
        ] {
            assert_eq!(parse_base_url(value).expect("loopback/HTTPS URL"), value);
        }

        for value in [
            "http://models.example/v1",
            "http://10.0.0.5/v1",
            "http://0.0.0.0:11434/v1",
            "http://localhost.example/v1",
        ] {
            let error = parse_base_url(value).expect_err("remote HTTP must be rejected");
            assert!(error.message.contains("HTTPS"));
        }
    }

    #[test]
    fn parses_none_as_an_explicit_empty_tool_allowlist() {
        let config = parse_args_from(["--tool-groups".to_string(), "none".to_string()])
            .expect("parse empty tool allowlist");

        assert_eq!(config.tool_groups, Some(Vec::new()));
    }

    #[test]
    fn rejects_none_combined_with_a_tool_group() {
        let error = parse_args_from(["--tool-groups".to_string(), "none,web".to_string()])
            .err()
            .expect("none must be exclusive");

        assert!(error.to_string().contains("cannot be combined"));
    }

    #[test]
    fn rejects_an_unknown_tool_group() {
        let error = parse_args_from(["--tool-groups".to_string(), "web,telepathy".to_string()])
            .err()
            .expect("unknown groups must fail closed");

        assert!(error.to_string().contains("Unknown tool group 'telepathy'"));
    }

    #[test]
    fn parses_repeated_skill_dirs_as_canonical_existing_directories() {
        let temp = tempfile::tempdir().expect("temp dir");
        let first = temp.path().join("first");
        let second = temp.path().join("second");
        std::fs::create_dir(&first).expect("first skill dir");
        std::fs::create_dir(&second).expect("second skill dir");

        let config = parse_args_from([
            "--skill-dir".to_string(),
            first.to_string_lossy().into_owned(),
            "--skill-dir".to_string(),
            second.to_string_lossy().into_owned(),
        ])
        .expect("parse skill dirs");

        assert_eq!(
            config.skill_dirs,
            vec![
                std::fs::canonicalize(first).expect("canonical first"),
                std::fs::canonicalize(second).expect("canonical second"),
            ]
        );
    }

    #[test]
    fn rejects_a_skill_dir_that_is_not_an_existing_directory() {
        let temp = tempfile::tempdir().expect("temp dir");
        let file = temp.path().join("SKILL.md");
        std::fs::write(&file, "skill").expect("skill file");

        let file_error = parse_args_from([
            "--skill-dir".to_string(),
            file.to_string_lossy().into_owned(),
        ])
        .err()
        .expect("file must not be accepted as a skill directory");
        let missing_error = parse_args_from([
            "--skill-dir".to_string(),
            temp.path().join("missing").to_string_lossy().into_owned(),
        ])
        .err()
        .expect("missing skill directory must be rejected");

        assert!(file_error.to_string().contains("existing directory"));
        assert!(missing_error.to_string().contains("existing directory"));
    }
}
