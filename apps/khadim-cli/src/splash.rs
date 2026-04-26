//! Startup splash. Compact wordmark + accent rule + tagline. Renders
//! before the TUI takes over the screen, so it speaks raw ANSI rather
//! than going through the theme system.
//!
//! Visual language matches the in-TUI welcome:
//!   • lowercase wordmark, gradient-tinted
//!   • thin accent rule with a center-bright fade
//!   • dim tagline + dim hint
//!   • gentle per-row stagger so the paint feels alive, not stamped

use std::io::{self, Write};
use std::thread;
use std::time::Duration;

// Compact lowercase wordmark in the figlet "pagga" style. 3 rows of
// crisp half-block geometry, hand-tuned so the strokes sit on a unified
// baseline and the letters share the same x-height. Reads as "khadim"
// at a glance without dominating the launch screen.
//
// Each glyph is laid out as a self-contained 3-cell-wide cluster
// separated by `░` shades, which read as a soft drop-shadow rather
// than gaps — the wordmark feels like a single object, not a row of
// disconnected letters.
const LOGO: &[&str] = &[
    "░█░█░█░█░█▀█░█▀▄░▀█▀░█▄█",
    "░█▀▄░█▀█░█▀█░█░█░░█░░█░█",
    "░▀░▀░▀░▀░▀░▀░▀▀░░▀▀▀░▀░▀",
];

// ANSI helpers. Kept inline so this stays a leaf module.
const RESET: &str = "\x1b[0m";
const DIM: &str = "\x1b[2m";
const BOLD: &str = "\x1b[1m";

// Cyan-family accent codes (256-color). Picked to read on both dark
// and light terminals without a theme.
const C_BRIGHT: &str = "\x1b[38;5;87m";
const C_ACCENT: &str = "\x1b[38;5;81m";
const C_MID: &str = "\x1b[38;5;75m";
const C_DEEP: &str = "\x1b[38;5;67m";
const C_MUTED: &str = "\x1b[38;5;244m";

pub fn show_splash() {
    print!(
        "{}{}",
        crossterm::cursor::MoveTo(0, 0),
        crossterm::terminal::Clear(crossterm::terminal::ClearType::All)
    );

    let cols = term_cols();

    // ── Logo block ──────────────────────────────────────────────────
    // Paint each row with a top→bottom gradient. Cheap effect, no deps.
    let shades = [C_BRIGHT, C_ACCENT, C_MID];
    println!();
    for (i, line) in LOGO.iter().enumerate() {
        let shade = shades.get(i).copied().unwrap_or(C_ACCENT);
        println!("{}{}{}{}", pad_center(line, cols), shade, line, RESET);
        // 8ms per row is below the perceptual threshold for "loading"
        // but enough that the eye registers a paint rather than a stamp.
        let _ = io::stdout().flush();
        thread::sleep(Duration::from_millis(8));
    }

    println!();

    // ── Accent rule ─────────────────────────────────────────────────
    let rule_w = 32usize.min(cols.saturating_sub(4));
    let rule = build_gradient_rule(rule_w);
    println!("{}{}", pad_center_chars(rule_w, cols), rule);
    thread::sleep(Duration::from_millis(20));

    // ── Tagline (bold accent) · (dim attribution) ───────────────────
    let tagline = "autonomous coding agent";
    let by = "by unravel ai";
    let tag_line_text = format!("{tagline}  ·  {by}");
    let tag_line_w = tag_line_text.chars().count();
    println!(
        "{}{}{}{}{}  {}·{}  {}{}{}",
        pad_center_chars(tag_line_w, cols),
        BOLD,
        C_ACCENT,
        tagline,
        RESET,
        DIM,
        RESET,
        C_MUTED,
        by,
        RESET,
    );
    thread::sleep(Duration::from_millis(20));

    // ── Hint line ───────────────────────────────────────────────────
    let hint = "type / for commands  ·  F2 for settings";
    println!("{}{}{}{}", pad_center(hint, cols), DIM, hint, RESET);
    let _ = io::stdout().flush();

    // Hold long enough for the eye to register without being annoying.
    thread::sleep(Duration::from_millis(280));
}

// ── Layout helpers ─────────────────────────────────────────────────

fn term_cols() -> usize {
    crossterm::terminal::size()
        .map(|(c, _)| c as usize)
        .unwrap_or(80)
}

/// Left-pad so `text` lands roughly centered in `cols`. Uses char count
/// (not byte len) so multi-byte glyphs center correctly.
fn pad_center(text: &str, cols: usize) -> String {
    pad_center_chars(text.chars().count(), cols)
}

fn pad_center_chars(width: usize, cols: usize) -> String {
    if width >= cols {
        return String::new();
    }
    " ".repeat((cols - width) / 2)
}

/// Builds a colored horizontal rule that fades from bright at the
/// center to deep at the edges. Adds visual interest without weight.
fn build_gradient_rule(w: usize) -> String {
    if w == 0 {
        return String::new();
    }
    let mut out = String::new();
    let mid = w / 2;
    for i in 0..w {
        let d = (i as i32 - mid as i32).unsigned_abs() as f32 / (mid.max(1) as f32);
        let code = if d < 0.25 {
            C_BRIGHT
        } else if d < 0.55 {
            C_ACCENT
        } else if d < 0.8 {
            C_MID
        } else {
            C_DEEP
        };
        out.push_str(code);
        out.push('─');
    }
    out.push_str(RESET);
    out
}
