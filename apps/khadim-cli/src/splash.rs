//! Startup splash. Single static render, short hold.

use std::io::{self, Write};
use std::thread;
use std::time::Duration;

const LOGO: &str = r#"
 ██╗  ██╗██╗  ██╗ █████╗ ██████╗ ██╗███╗   ███╗
 ██║ ██╔╝██║  ██║██╔══██╗██╔══██╗██║████╗ ████║
 █████╔╝ ███████║███████║██║  ██║██║██╔████╔██║
 ██╔═██╗ ██╔══██║██╔══██║██║  ██║██║██║╚██╔╝██║
 ██║  ██╗██║  ██║██║  ██║██████╔╝██║██║ ╚═╝ ██║
 ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝     ╚═╝
"#;

pub fn show_splash() {
    print!(
        "{}{}",
        crossterm::cursor::MoveTo(0, 0),
        crossterm::terminal::Clear(crossterm::terminal::ClearType::All)
    );
    print!("{}", LOGO);
    // Use dim SGR so the tagline feels secondary without relying on theme colors.
    println!("\x1b[2m autonomous coding agent · by unravel ai\x1b[0m");
    println!("\x1b[2m type / for commands\x1b[0m");
    io::stdout().flush().ok();
    thread::sleep(Duration::from_millis(350));
}
