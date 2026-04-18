use khadim_ai_core::error::AppError;
use std::env;
use std::path::PathBuf;

// ── CLI Config ────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct CliConfig {
    pub cwd: PathBuf,
    pub prompt: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
}

// ── Arg parsing ──────────────────────────────────────────────────────

pub fn parse_args() -> Result<CliConfig, AppError> {
    let mut cwd = env::current_dir().map_err(AppError::from)?;
    let mut prompt = None;
    let mut provider = None;
    let mut model = None;
    let mut args = env::args().skip(1);
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
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            other => {
                return Err(AppError::invalid_input(format!("Unknown argument: {other}")));
            }
        }
    }

    Ok(CliConfig {
        cwd,
        prompt,
        provider,
        model,
    })
}

fn print_help() {
    println!(
        "khadim-cli\n\n\
         USAGE:\n\
         \x20 khadim-cli [--cwd PATH] [--prompt TEXT] [--provider NAME] [--model ID]\n\n\
         Without --prompt, Khadim launches an interactive TUI.\n\
         Type / to see all available commands with live preview.\n\n\
         COMMANDS (type / to see preview):\n\
         \x20 /help            Show all commands & shortcuts\n\
         \x20 /provider        Switch AI provider\n\
         \x20 /model           Switch model\n\
         \x20 /login           OAuth login (Copilot, Codex)\n\
         \x20 /settings        Open settings panel (same as F2)\n\
         \x20 /providers       List all providers and auth status\n\
         \x20 /reset           Reset session\n\
         \x20 /clear           Clear screen\n\
         \x20 /exit            Quit\n\n\
         SHORTCUTS:\n\
         \x20 Enter        Send message\n\
         \x20 Shift+Enter  Insert newline\n\
         \x20 Tab          Accept command suggestion\n\
         \x20 Escape       Abort / close overlay\n\
         \x20 Ctrl-C       Quit\n\
         \x20 Ctrl-L       Clear session\n\
         \x20 Ctrl-K       Clear input\n\
         \x20 Ctrl-O       Toggle tool output\n\
         \x20 F2           Settings panel\n\
         \x20 Up/Down      Navigate suggestions or scroll\n\
         \x20 PageUp/Down  Scroll by page\n\
         \x20 Mouse wheel  Scroll transcript"
    );
}