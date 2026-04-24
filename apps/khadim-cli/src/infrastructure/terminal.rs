use crossterm::event::{DisableMouseCapture, EnableMouseCapture};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use khadim_ai_core::error::AppError;

pub struct TerminalGuard {
    terminal: ratatui::DefaultTerminal,
}

impl TerminalGuard {
    pub fn new() -> Result<Self, AppError> {
        enable_raw_mode()
            .map_err(|err| AppError::io(format!("Failed to enable raw mode: {err}")))?;
        let mut stdout = std::io::stdout();
        execute!(stdout, EnterAlternateScreen, EnableMouseCapture)
            .map_err(|err| AppError::io(format!("Failed to enter alternate screen: {err}")))?;
        let terminal = ratatui::init();
        Ok(Self { terminal })
    }

    pub fn terminal(&mut self) -> &mut ratatui::DefaultTerminal {
        &mut self.terminal
    }
}

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let _ = disable_raw_mode();
        let _ = execute!(
            self.terminal.backend_mut(),
            DisableMouseCapture,
            LeaveAlternateScreen
        );
        ratatui::restore();
    }
}
