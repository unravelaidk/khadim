use khadim_ai_core::error::AppError;
use std::env;
use std::io::{self, IsTerminal, Read};
use std::path::PathBuf;

// ── CLI Config ────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct CliConfig {
    pub cwd: PathBuf,
    pub prompt: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub session: Option<String>,
    #[allow(dead_code)]
    pub verbose: bool,
    pub json: bool,
}

// ── Arg parsing ──────────────────────────────────────────────────────

pub fn parse_args() -> Result<CliConfig, AppError> {
    let mut cwd = env::current_dir().map_err(AppError::from)?;
    let mut prompt = None;
    let mut provider = None;
    let mut model = None;
    let mut session = None;
    let mut verbose = false;
    let mut json = false;
    let mut exec_mode = false;
    let mut positional_prompt = Vec::new();
    let mut args = env::args().skip(1).peekable();
    if matches!(args.peek().map(String::as_str), Some("exec")) {
        exec_mode = true;
        args.next();
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
            "--session" => {
                let value = args
                    .next()
                    .ok_or_else(|| AppError::invalid_input("--session requires a value"))?;
                session = Some(value);
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

    if prompt.as_deref() == Some("-") {
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
        session,
        verbose,
        json,
    })
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
        "khadim — Autonomous Coding Agent\n\n\
         USAGE:\n\
         \x20 khadim [OPTIONS]\n\
         \x20 khadim exec [OPTIONS] [PROMPT]\n\n\
         OPTIONS:\n\
         \x20 --cwd PATH       Set working directory\n\
         \x20 --prompt TEXT    Run in batch mode with prompt (`-` reads stdin)\n\
         \x20 --provider NAME  Set AI provider\n\
         \x20 --model ID       Set AI model\n\
         \x20 --session NAME   Load saved session\n\
         \x20 --verbose        Enable verbose logging\n\
         \x20 -h, --help       Show this help\n\
         \x20 -v, --version    Show version\n\n\
         Without --prompt or exec, Khadim launches an interactive TUI.\n\
         In exec mode, piped stdin is appended as a <stdin> block.\n\
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
