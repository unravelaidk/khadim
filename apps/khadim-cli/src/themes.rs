use ratatui::style::Color;
use serde::{Deserialize, Serialize};

// ── Theme definition ───────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThemeFamily {
    Default,
    Catppuccin,
    Nord,
    TokyoNight,
    Gruvbox,
    OneDark,
    Dracula,
}

impl ThemeFamily {
    pub const fn id(&self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Catppuccin => "catppuccin",
            Self::Nord => "nord",
            Self::TokyoNight => "tokyo-night",
            Self::Gruvbox => "gruvbox",
            Self::OneDark => "one-dark",
            Self::Dracula => "dracula",
        }
    }

    pub const fn label(&self) -> &'static str {
        match self {
            Self::Default => "Default",
            Self::Catppuccin => "Catppuccin",
            Self::Nord => "Nord",
            Self::TokyoNight => "Tokyo Night",
            Self::Gruvbox => "Gruvbox",
            Self::OneDark => "One Dark",
            Self::Dracula => "Dracula",
        }
    }

    #[allow(dead_code)]
    pub const fn description(&self) -> &'static str {
        match self {
            Self::Default => "Neutral ink, monochrome accent",
            Self::Catppuccin => "Soothing pastel theme",
            Self::Nord => "Arctic, north-bluish colors",
            Self::TokyoNight => "Tokyo night darkness",
            Self::Gruvbox => "Retro groove theme",
            Self::OneDark => "Atom's iconic theme",
            Self::Dracula => "Dark purple-tinted theme",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ThemeVariant {
    Dark,
    Light,
    Mocha,
    Macchiato,
    Frappe,
    Latte,
}

impl ThemeVariant {
    pub const fn id(&self) -> &'static str {
        match self {
            Self::Dark => "dark",
            Self::Light => "light",
            Self::Mocha => "mocha",
            Self::Macchiato => "macchiato",
            Self::Frappe => "frappe",
            Self::Latte => "latte",
        }
    }

    #[allow(dead_code)]
    pub const fn is_dark(&self) -> bool {
        !matches!(self, Self::Light | Self::Latte)
    }
}

// ── Theme colors ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy)]
pub struct ThemeColors {
    pub accent: Color,
    pub accent_dim: Color,
    pub text_primary: Color,
    pub text_dim: Color,
    pub text_muted: Color,
    pub user_bg: Color,
    pub tool_label: Color,
    pub tool_text: Color,
    pub error: Color,
    pub thinking: Color,
    pub border_idle: Color,
    #[allow(dead_code)]
    pub border_active: Color,
    pub border_error: Color,
    #[allow(dead_code)]
    pub footer_bg: Color,
    pub footer_text: Color,
    pub system_text: Color,
    // Markdown specific
    pub md_heading: Color,
    pub md_code_fg: Color,
    pub md_code_bg: Color,
    pub md_link: Color,
    pub md_list_bullet: Color,
    pub md_blockquote: Color,
    pub md_hr: Color,
    pub md_table_border: Color,
    pub md_table_header: Color,
}

impl Default for ThemeColors {
    fn default() -> Self {
        // Default dark theme colors
        Self {
            accent: Color::Rgb(139, 92, 246),          // violet-500
            accent_dim: Color::Rgb(109, 70, 196),      // violet-600
            text_primary: Color::Rgb(229, 231, 235),   // gray-200
            text_dim: Color::Rgb(156, 163, 175),       // gray-400
            text_muted: Color::Rgb(107, 114, 128),     // gray-500
            user_bg: Color::Rgb(30, 30, 46),           // dark surface
            tool_label: Color::Rgb(34, 197, 94),       // green-500
            tool_text: Color::Rgb(156, 163, 175),      // gray-400
            error: Color::Rgb(239, 68, 68),            // red-500
            thinking: Color::Rgb(250, 204, 21),        // yellow-400
            border_idle: Color::Rgb(55, 65, 81),       // gray-700
            border_active: Color::Rgb(139, 92, 246),   // violet-500
            border_error: Color::Rgb(239, 68, 68),     // red-500
            footer_bg: Color::Rgb(17, 17, 27),         // deep dark
            footer_text: Color::Rgb(107, 114, 128),    // gray-500
            system_text: Color::Rgb(96, 165, 250),     // blue-400
            md_heading: Color::Rgb(139, 92, 246),      // violet-500
            md_code_fg: Color::Rgb(250, 204, 21),      // yellow-400
            md_code_bg: Color::Rgb(30, 30, 46),        // dark surface
            md_link: Color::Rgb(96, 165, 250),         // blue-400
            md_list_bullet: Color::Rgb(139, 92, 246),  // violet-500
            md_blockquote: Color::Rgb(107, 114, 128),  // gray-500
            md_hr: Color::Rgb(55, 65, 81),             // gray-700
            md_table_border: Color::Rgb(75, 85, 99),   // gray-600
            md_table_header: Color::Rgb(139, 92, 246), // violet-500
        }
    }
}

// ── Theme definitions ────────────────────────────────────────────────

pub fn get_theme_colors(family: ThemeFamily, variant: ThemeVariant) -> ThemeColors {
    match (family, variant) {
        // Default Dark
        (ThemeFamily::Default, ThemeVariant::Dark) => ThemeColors {
            accent: Color::Rgb(224, 224, 236), // near-white
            accent_dim: Color::Rgb(180, 180, 200),
            text_primary: Color::Rgb(229, 231, 235),
            text_dim: Color::Rgb(156, 163, 175),
            text_muted: Color::Rgb(107, 114, 128),
            user_bg: Color::Rgb(30, 30, 46),
            tool_label: Color::Rgb(34, 197, 94),
            tool_text: Color::Rgb(156, 163, 175),
            error: Color::Rgb(239, 68, 68),
            thinking: Color::Rgb(250, 204, 21),
            border_idle: Color::Rgb(55, 65, 81),
            border_active: Color::Rgb(224, 224, 236),
            border_error: Color::Rgb(239, 68, 68),
            footer_bg: Color::Rgb(17, 17, 27),
            footer_text: Color::Rgb(107, 114, 128),
            system_text: Color::Rgb(96, 165, 250),
            md_heading: Color::Rgb(224, 224, 236),
            md_code_fg: Color::Rgb(250, 204, 21),
            md_code_bg: Color::Rgb(30, 30, 46),
            md_link: Color::Rgb(96, 165, 250),
            md_list_bullet: Color::Rgb(224, 224, 236),
            md_blockquote: Color::Rgb(107, 114, 128),
            md_hr: Color::Rgb(55, 65, 81),
            md_table_border: Color::Rgb(75, 85, 99),
            md_table_header: Color::Rgb(224, 224, 236),
        },
        // Catppuccin Mocha
        (ThemeFamily::Catppuccin, ThemeVariant::Mocha) => ThemeColors {
            accent: Color::Rgb(137, 180, 250), // blue
            accent_dim: Color::Rgb(116, 166, 236),
            text_primary: Color::Rgb(205, 214, 244),
            text_dim: Color::Rgb(186, 194, 222),
            text_muted: Color::Rgb(127, 132, 156),
            user_bg: Color::Rgb(30, 30, 46),
            tool_label: Color::Rgb(166, 227, 161), // green
            tool_text: Color::Rgb(186, 194, 222),
            error: Color::Rgb(243, 139, 168),    // red
            thinking: Color::Rgb(249, 226, 175), // yellow
            border_idle: Color::Rgb(82, 85, 118),
            border_active: Color::Rgb(137, 180, 250),
            border_error: Color::Rgb(243, 139, 168),
            footer_bg: Color::Rgb(24, 24, 37),
            footer_text: Color::Rgb(127, 132, 156),
            system_text: Color::Rgb(137, 180, 250),
            md_heading: Color::Rgb(205, 214, 244),
            md_code_fg: Color::Rgb(249, 226, 175),
            md_code_bg: Color::Rgb(30, 30, 46),
            md_link: Color::Rgb(137, 180, 250),
            md_list_bullet: Color::Rgb(137, 180, 250),
            md_blockquote: Color::Rgb(127, 132, 156),
            md_hr: Color::Rgb(82, 85, 118),
            md_table_border: Color::Rgb(92, 95, 128),
            md_table_header: Color::Rgb(137, 180, 250),
        },
        // Catppuccin Latte
        (ThemeFamily::Catppuccin, ThemeVariant::Latte) => ThemeColors {
            accent: Color::Rgb(30, 102, 175), // blue
            accent_dim: Color::Rgb(56, 123, 178),
            text_primary: Color::Rgb(76, 79, 89),
            text_dim: Color::Rgb(102, 106, 117),
            text_muted: Color::Rgb(125, 130, 144),
            user_bg: Color::Rgb(239, 239, 245),
            tool_label: Color::Rgb(63, 149, 68),
            tool_text: Color::Rgb(102, 106, 117),
            error: Color::Rgb(210, 46, 91),
            thinking: Color::Rgb(191, 143, 0),
            border_idle: Color::Rgb(175, 178, 189),
            border_active: Color::Rgb(30, 102, 175),
            border_error: Color::Rgb(210, 46, 91),
            footer_bg: Color::Rgb(231, 231, 238),
            footer_text: Color::Rgb(125, 130, 144),
            system_text: Color::Rgb(30, 102, 175),
            md_heading: Color::Rgb(30, 102, 175),
            md_code_fg: Color::Rgb(191, 143, 0),
            md_code_bg: Color::Rgb(232, 232, 239),
            md_link: Color::Rgb(30, 102, 175),
            md_list_bullet: Color::Rgb(30, 102, 175),
            md_blockquote: Color::Rgb(125, 130, 144),
            md_hr: Color::Rgb(175, 178, 189),
            md_table_border: Color::Rgb(185, 188, 199),
            md_table_header: Color::Rgb(30, 102, 175),
        },
        // Nord
        (ThemeFamily::Nord, ThemeVariant::Dark) => ThemeColors {
            accent: Color::Rgb(136, 192, 208), // nord4
            accent_dim: Color::Rgb(129, 161, 176),
            text_primary: Color::Rgb(216, 222, 233),
            text_dim: Color::Rgb(169, 177, 191),
            text_muted: Color::Rgb(143, 151, 166),
            user_bg: Color::Rgb(46, 52, 64),
            tool_label: Color::Rgb(163, 190, 140), // nord7
            tool_text: Color::Rgb(169, 177, 191),
            error: Color::Rgb(191, 97, 106),     // nord11
            thinking: Color::Rgb(235, 203, 115), // nord13
            border_idle: Color::Rgb(94, 104, 118),
            border_active: Color::Rgb(136, 192, 208),
            border_error: Color::Rgb(191, 97, 106),
            footer_bg: Color::Rgb(36, 42, 54),
            footer_text: Color::Rgb(143, 151, 166),
            system_text: Color::Rgb(136, 192, 208),
            md_heading: Color::Rgb(136, 192, 208),
            md_code_fg: Color::Rgb(235, 203, 115),
            md_code_bg: Color::Rgb(46, 52, 64),
            md_link: Color::Rgb(136, 192, 208),
            md_list_bullet: Color::Rgb(136, 192, 208),
            md_blockquote: Color::Rgb(143, 151, 166),
            md_hr: Color::Rgb(94, 104, 118),
            md_table_border: Color::Rgb(104, 114, 128),
            md_table_header: Color::Rgb(136, 192, 208),
        },
        // Tokyo Night
        (ThemeFamily::TokyoNight, ThemeVariant::Dark) => ThemeColors {
            accent: Color::Rgb(138, 173, 244), // blue
            accent_dim: Color::Rgb(118, 153, 218),
            text_primary: Color::Rgb(192, 202, 237),
            text_dim: Color::Rgb(165, 175, 210),
            text_muted: Color::Rgb(138, 149, 182),
            user_bg: Color::Rgb(26, 27, 38),
            tool_label: Color::Rgb(121, 192, 129), // green
            tool_text: Color::Rgb(165, 175, 210),
            error: Color::Rgb(242, 92, 119),     // red
            thinking: Color::Rgb(255, 208, 115), // yellow
            border_idle: Color::Rgb(68, 76, 97),
            border_active: Color::Rgb(138, 173, 244),
            border_error: Color::Rgb(242, 92, 119),
            footer_bg: Color::Rgb(22, 23, 34),
            footer_text: Color::Rgb(138, 149, 182),
            system_text: Color::Rgb(138, 173, 244),
            md_heading: Color::Rgb(138, 173, 244),
            md_code_fg: Color::Rgb(255, 208, 115),
            md_code_bg: Color::Rgb(26, 27, 38),
            md_link: Color::Rgb(138, 173, 244),
            md_list_bullet: Color::Rgb(138, 173, 244),
            md_blockquote: Color::Rgb(138, 149, 182),
            md_hr: Color::Rgb(68, 76, 97),
            md_table_border: Color::Rgb(78, 86, 107),
            md_table_header: Color::Rgb(138, 173, 244),
        },
        // Gruvbox Dark
        (ThemeFamily::Gruvbox, ThemeVariant::Dark) => ThemeColors {
            accent: Color::Rgb(184, 187, 38), // green
            accent_dim: Color::Rgb(156, 160, 32),
            text_primary: Color::Rgb(235, 219, 178),
            text_dim: Color::Rgb(189, 174, 147),
            text_muted: Color::Rgb(146, 131, 116),
            user_bg: Color::Rgb(40, 40, 40),
            tool_label: Color::Rgb(104, 157, 100), // green
            tool_text: Color::Rgb(189, 174, 147),
            error: Color::Rgb(204, 102, 102),   // red
            thinking: Color::Rgb(214, 158, 46), // yellow
            border_idle: Color::Rgb(90, 80, 70),
            border_active: Color::Rgb(184, 187, 38),
            border_error: Color::Rgb(204, 102, 102),
            footer_bg: Color::Rgb(35, 35, 35),
            footer_text: Color::Rgb(146, 131, 116),
            system_text: Color::Rgb(104, 157, 100),
            md_heading: Color::Rgb(184, 187, 38),
            md_code_fg: Color::Rgb(214, 158, 46),
            md_code_bg: Color::Rgb(40, 40, 40),
            md_link: Color::Rgb(104, 157, 100),
            md_list_bullet: Color::Rgb(184, 187, 38),
            md_blockquote: Color::Rgb(146, 131, 116),
            md_hr: Color::Rgb(90, 80, 70),
            md_table_border: Color::Rgb(100, 90, 80),
            md_table_header: Color::Rgb(184, 187, 38),
        },
        // One Dark
        (ThemeFamily::OneDark, ThemeVariant::Dark) => ThemeColors {
            accent: Color::Rgb(97, 175, 239), // blue
            accent_dim: Color::Rgb(86, 156, 214),
            text_primary: Color::Rgb(171, 178, 191),
            text_dim: Color::Rgb(152, 159, 174),
            text_muted: Color::Rgb(139, 146, 161),
            user_bg: Color::Rgb(40, 44, 52),
            tool_label: Color::Rgb(152, 195, 121), // green
            tool_text: Color::Rgb(152, 159, 174),
            error: Color::Rgb(224, 108, 117),    // red
            thinking: Color::Rgb(229, 192, 123), // yellow
            border_idle: Color::Rgb(86, 89, 101),
            border_active: Color::Rgb(97, 175, 239),
            border_error: Color::Rgb(224, 108, 117),
            footer_bg: Color::Rgb(35, 38, 46),
            footer_text: Color::Rgb(139, 146, 161),
            system_text: Color::Rgb(97, 175, 239),
            md_heading: Color::Rgb(97, 175, 239),
            md_code_fg: Color::Rgb(229, 192, 123),
            md_code_bg: Color::Rgb(40, 44, 52),
            md_link: Color::Rgb(97, 175, 239),
            md_list_bullet: Color::Rgb(97, 175, 239),
            md_blockquote: Color::Rgb(139, 146, 161),
            md_hr: Color::Rgb(86, 89, 101),
            md_table_border: Color::Rgb(96, 99, 111),
            md_table_header: Color::Rgb(97, 175, 239),
        },
        // Dracula
        (ThemeFamily::Dracula, ThemeVariant::Dark) => ThemeColors {
            accent: Color::Rgb(139, 233, 253), // cyan
            accent_dim: Color::Rgb(119, 207, 227),
            text_primary: Color::Rgb(248, 248, 242),
            text_dim: Color::Rgb(210, 210, 200),
            text_muted: Color::Rgb(175, 175, 170),
            user_bg: Color::Rgb(40, 42, 54),
            tool_label: Color::Rgb(80, 250, 123), // green
            tool_text: Color::Rgb(210, 210, 200),
            error: Color::Rgb(255, 85, 85),      // red
            thinking: Color::Rgb(255, 241, 118), // yellow
            border_idle: Color::Rgb(85, 85, 102),
            border_active: Color::Rgb(139, 233, 253),
            border_error: Color::Rgb(255, 85, 85),
            footer_bg: Color::Rgb(34, 36, 48),
            footer_text: Color::Rgb(175, 175, 170),
            system_text: Color::Rgb(139, 233, 253),
            md_heading: Color::Rgb(139, 233, 253),
            md_code_fg: Color::Rgb(255, 241, 118),
            md_code_bg: Color::Rgb(40, 42, 54),
            md_link: Color::Rgb(139, 233, 253),
            md_list_bullet: Color::Rgb(139, 233, 253),
            md_blockquote: Color::Rgb(175, 175, 170),
            md_hr: Color::Rgb(85, 85, 102),
            md_table_border: Color::Rgb(95, 95, 112),
            md_table_header: Color::Rgb(139, 233, 253),
        },
        // Default fallback (same as default dark)
        _ => ThemeColors::default(),
    }
}

// ── Theme catalog ───────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ThemeCatalog {
    pub family: ThemeFamily,
    pub variants: Vec<ThemeVariant>,
}

pub fn all_themes() -> Vec<ThemeCatalog> {
    vec![
        ThemeCatalog {
            family: ThemeFamily::Default,
            variants: vec![ThemeVariant::Dark, ThemeVariant::Light],
        },
        ThemeCatalog {
            family: ThemeFamily::Catppuccin,
            variants: vec![
                ThemeVariant::Mocha,
                ThemeVariant::Macchiato,
                ThemeVariant::Frappe,
                ThemeVariant::Latte,
            ],
        },
        ThemeCatalog {
            family: ThemeFamily::Nord,
            variants: vec![ThemeVariant::Dark, ThemeVariant::Light],
        },
        ThemeCatalog {
            family: ThemeFamily::TokyoNight,
            variants: vec![ThemeVariant::Dark, ThemeVariant::Light],
        },
        ThemeCatalog {
            family: ThemeFamily::Gruvbox,
            variants: vec![ThemeVariant::Dark, ThemeVariant::Light],
        },
        ThemeCatalog {
            family: ThemeFamily::OneDark,
            variants: vec![ThemeVariant::Dark, ThemeVariant::Light],
        },
        ThemeCatalog {
            family: ThemeFamily::Dracula,
            variants: vec![ThemeVariant::Dark],
        },
    ]
}

// ── Theme parsing ────────────────────────────────────────────────────

pub fn parse_theme_family(s: &str) -> Option<ThemeFamily> {
    match s.to_lowercase().as_str() {
        "default" => Some(ThemeFamily::Default),
        "catppuccin" => Some(ThemeFamily::Catppuccin),
        "nord" => Some(ThemeFamily::Nord),
        "tokyo-night" | "tokyo_night" | "tokyo" => Some(ThemeFamily::TokyoNight),
        "gruvbox" => Some(ThemeFamily::Gruvbox),
        "one-dark" | "one_dark" | "onedark" => Some(ThemeFamily::OneDark),
        "dracula" => Some(ThemeFamily::Dracula),
        _ => None,
    }
}

pub fn parse_theme_variant(s: &str) -> Option<ThemeVariant> {
    match s.to_lowercase().as_str() {
        "dark" => Some(ThemeVariant::Dark),
        "light" => Some(ThemeVariant::Light),
        "mocha" => Some(ThemeVariant::Mocha),
        "macchiato" => Some(ThemeVariant::Macchiato),
        "frappe" => Some(ThemeVariant::Frappe),
        "latte" => Some(ThemeVariant::Latte),
        _ => None,
    }
}

pub const fn get_default_variant(family: ThemeFamily) -> ThemeVariant {
    match family {
        ThemeFamily::Catppuccin => ThemeVariant::Mocha,
        _ => ThemeVariant::Dark,
    }
}
