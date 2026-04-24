// ═══════════════════════════════════════════════════════════════════════════════
// KHADIM - ASCII Animation Splash Screen
// ═══════════════════════════════════════════════════════════════════════════════

use std::io::{self, Write};
use std::thread;
use std::time::Duration;

/// ASCII art frames for the splash animation — progressive reveal
const FRAMES: &[&str] = &[
    // Frame 0: Just the K
    r#"
 ██╗  ██╗
 ██║ ██╔╝
 █████╔╝
 ██╔═██╗
 ██║  ██╗
 ╚═╝  ╚═╝
"#,
    // Frame 1: K H
    r#"
 ██╗  ██╗██╗  ██╗
 ██║ ██╔╝██║  ██║
 █████╔╝ ███████║
 ██╔═██╗ ██╔══██║
 ██║  ██╗██║  ██║
 ╚═╝  ╚═╝╚═╝  ╚═╝
"#,
    // Frame 2: K H A
    r#"
 ██╗  ██╗██╗  ██╗ █████╗
 ██║ ██╔╝██║  ██║██╔══██╗
 █████╔╝ ███████║███████║
 ██╔═██╗ ██╔══██║██╔══██║
 ██║  ██╗██║  ██║██║  ██║
 ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
"#,
    // Frame 3: K H A D
    r#"
 ██╗  ██╗██╗  ██╗ █████╗ ██████╗
 ██║ ██╔╝██║  ██║██╔══██╗██╔══██╗
 █████╔╝ ███████║███████║██║  ██║
 ██╔═██╗ ██╔══██║██╔══██║██║  ██║
 ██║  ██╗██║  ██║██║  ██║██████╔╝
 ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝
"#,
    // Frame 4: K H A D I
    r#"
 ██╗  ██╗██╗  ██╗ █████╗ ██████╗ ██╗
 ██║ ██╔╝██║  ██║██╔══██╗██╔══██╗██║
 █████╔╝ ███████║███████║██║  ██║██║
 ██╔═██╗ ██╔══██║██╔══██║██║  ██║██║
 ██║  ██╗██║  ██║██║  ██║██████╔╝██║
 ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝
"#,
    // Frame 5: K H A D I M (full)
    r#"
 ██╗  ██╗██╗  ██╗ █████╗ ██████╗ ██╗███╗   ███╗
 ██║ ██╔╝██║  ██║██╔══██╗██╔══██╗██║████╗ ████║
 █████╔╝ ███████║███████║██║  ██║██║██╔████╔██║
 ██╔═██╗ ██╔══██║██╔══██║██║  ██║██║██║╚██╔╝██║
 ██║  ██╗██║  ██║██║  ██║██████╔╝██║██║ ╚═╝ ██║
 ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝     ╚═╝
"#,
    // Frame 6: Full logo + info box
    r#"
 ██╗  ██╗██╗  ██╗ █████╗ ██████╗ ██╗███╗   ███╗
 ██║ ██╔╝██║  ██║██╔══██╗██╔══██╗██║████╗ ████║
 █████╔╝ ███████║███████║██║  ██║██║██╔████╔██║
 ██╔═██╗ ██╔══██║██╔══██║██║  ██║██║██║╚██╔╝██║
 ██║  ██╗██║  ██║██║  ██║██████╔╝██║██║ ╚═╝ ██║
 ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝╚═╝     ╚═╝

 ╔══════════════════════════════════════════════════╗
 ║              KHADIM v0.1.0 Alpha                 ║
 ║             Autonomous Coding Agent              ║
 ║                  by Unravel AI                   ║
 ║         Type / to see all available commands     ║
 ╚══════════════════════════════════════════════════╝
"#,
];

/// Display the animated splash screen
pub fn show_splash() {
    // Get terminal size (default to 80x24 if unable to determine)
    let (_width, _height) = crossterm::terminal::size().unwrap_or((80, 24));

    for (i, frame) in FRAMES.iter().enumerate() {
        // Clear screen and move cursor to top-left
        print!(
            "{}{}",
            crossterm::cursor::MoveTo(0, 0),
            crossterm::terminal::Clear(crossterm::terminal::ClearType::All)
        );

        // Print the frame
        print!("{}", frame);

        // Print loading text that changes with each frame
        let loading = match i {
            0..=2 => "Loading...",
            3..=4 => "Initializing...",
            5 => "Ready!",
            6 => "",
            _ => "",
        };

        if !loading.is_empty() {
            println!("\n{:^52}", loading);
        }

        io::stdout().flush().unwrap();

        // Variable timing for effect
        let delay = match i {
            0..=4 => 120,
            5 => 250,
            6 => 300,
            _ => 100,
        };

        thread::sleep(Duration::from_millis(delay));
    }

    // Brief pause on final frame
    thread::sleep(Duration::from_millis(500));
}
