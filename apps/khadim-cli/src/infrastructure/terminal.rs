use crossterm::event::{DisableMouseCapture, EnableMouseCapture};
use crossterm::execute;
use khadim_ai_core::error::AppError;

pub struct TerminalGuard {
    terminal: ratatui::DefaultTerminal,
}

impl TerminalGuard {
    pub fn new() -> Result<Self, AppError> {
        let terminal = ratatui::try_init()
            .map_err(|err| AppError::io(format!("Failed to initialize terminal: {err}")))?;
        let mut stdout = std::io::stdout();
        execute!(stdout, EnableMouseCapture)
            .map_err(|err| AppError::io(format!("Failed to enable mouse capture: {err}")))?;
        Ok(Self { terminal })
    }

    pub const fn terminal(&mut self) -> &mut ratatui::DefaultTerminal {
        &mut self.terminal
    }
}

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = execute!(
            self.terminal.backend_mut(),
            DisableMouseCapture,
            crossterm::cursor::Show,
        );
        ratatui::restore();
    }
}
