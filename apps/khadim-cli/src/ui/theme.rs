//! Theme integration for the TUI.
//! Uses the central themes module to provide dynamic theme colors.

use ratatui::style::Color;

use crate::themes::{
    self, get_theme_colors, parse_theme_family, parse_theme_variant, ThemeColors, ThemeFamily,
};

// Lazily initialized theme colors (updated when theme changes)
static mut CURRENT_THEME: Option<ThemeColors> = None;

// ── Get current theme colors ──────────────────────────────────────────────────

pub fn get_current_theme() -> ThemeColors {
    // SAFETY: Single-threaded app, this is called from the main loop
    unsafe { CURRENT_THEME.unwrap_or_default() }
}

pub fn set_current_theme(family: Option<String>, variant: Option<String>) {
    let family = family
        .and_then(|s| parse_theme_family(&s))
        .unwrap_or(ThemeFamily::Default);
    let variant = variant
        .and_then(|s| parse_theme_variant(&s))
        .unwrap_or_else(|| themes::get_default_variant(family));

    let colors = get_theme_colors(family, variant);

    // SAFETY: Single-threaded app
    unsafe {
        CURRENT_THEME = Some(colors);
    }
}

// ── Dynamic color accessor functions ──────────────────────────────────────────

pub fn accent() -> Color {
    get_current_theme().accent
}
pub fn accent_dim() -> Color {
    get_current_theme().accent_dim
}
pub fn text_primary() -> Color {
    get_current_theme().text_primary
}
pub fn text_dim() -> Color {
    get_current_theme().text_dim
}
pub fn text_muted() -> Color {
    get_current_theme().text_muted
}
pub fn user_bg() -> Color {
    get_current_theme().user_bg
}
pub fn tool_label() -> Color {
    get_current_theme().tool_label
}
pub fn tool_text() -> Color {
    get_current_theme().tool_text
}
pub fn error() -> Color {
    get_current_theme().error
}
pub fn thinking() -> Color {
    get_current_theme().thinking
}
pub fn border_idle() -> Color {
    get_current_theme().border_idle
}
#[allow(dead_code)]
pub fn border_active() -> Color {
    get_current_theme().border_active
}
pub fn border_error() -> Color {
    get_current_theme().border_error
}
#[allow(dead_code)]
pub fn footer_bg() -> Color {
    get_current_theme().footer_bg
}
pub fn footer_text() -> Color {
    get_current_theme().footer_text
}
pub fn system_text() -> Color {
    get_current_theme().system_text
}

// Markdown specific colors
pub fn md_heading() -> Color {
    get_current_theme().md_heading
}
pub fn md_code_fg() -> Color {
    get_current_theme().md_code_fg
}
pub fn md_code_bg() -> Color {
    get_current_theme().md_code_bg
}
pub fn md_link() -> Color {
    get_current_theme().md_link
}
pub fn md_list_bullet() -> Color {
    get_current_theme().md_list_bullet
}
pub fn md_blockquote() -> Color {
    get_current_theme().md_blockquote
}
pub fn md_hr() -> Color {
    get_current_theme().md_hr
}
pub fn md_table_border() -> Color {
    get_current_theme().md_table_border
}
pub fn md_table_header() -> Color {
    get_current_theme().md_table_header
}

// ── Derived markdown colors ──────────────────────────────────────────
// Tokens the renderer needs but the per-theme `ThemeColors` struct
// doesn't carry as fields. Each is derived from an existing theme color
// so themes don't have to ship more fields just to enable these markdown
// elements.

pub fn md_strikethrough() -> Color {
    text_dim()
}
pub fn md_image() -> Color {
    Color::Rgb(244, 114, 182) // pink-400
}
pub fn md_task_checked() -> Color {
    tool_label()
}
pub fn md_task_unchecked() -> Color {
    text_muted()
}

// GFM blockquote alert label colors. Each `[!KIND]` alert renders with a
// matching label color so users can tell them apart at a glance.
pub fn md_bq_note() -> Color {
    system_text()
}
pub fn md_bq_tip() -> Color {
    tool_label()
}
pub fn md_bq_important() -> Color {
    accent()
}
pub fn md_bq_warning() -> Color {
    thinking()
}
pub fn md_bq_caution() -> Color {
    error()
}
