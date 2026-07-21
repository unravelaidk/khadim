//! Line-number gutter sizing inspired by Zed's editor gutter.
//!
//! Zed (`editor::GutterDimensions`) sizes the number column as:
//!   max(widest_line_number_digits, min_line_number_digits) × char_width
//! with only ~1 character of right padding when only line numbers are shown.
//!
//! We mirror that for terminal code blocks: tight digit column, single space
//! after the number, no fixed 4–5 col fat gutters that push code off-screen.

/// Zed-like gutter metrics for a code block of `line_count` lines in a pane
/// of `available_width` columns (after outer chrome indent).
#[derive(Debug, Clone, Copy)]
pub struct GutterMetrics {
    /// Width of the digit column only (no trailing space). 0 = hidden.
    pub digit_cols: usize,
    /// Trailing padding after the number (Zed: ~1 ch). 0 when hidden.
    pub right_pad: usize,
}

impl GutterMetrics {
    /// Total columns taken by the gutter including right pad.
    pub fn total(self) -> usize {
        if self.digit_cols == 0 {
            0
        } else {
            self.digit_cols + self.right_pad
        }
    }

    /// Format a 1-based line number into the gutter (right-aligned + pad).
    pub fn format(self, line_no: usize) -> String {
        if self.digit_cols == 0 {
            return String::new();
        }
        let n = line_no.to_string();
        let digits = if n.len() > self.digit_cols {
            // Overflow: show last digits (rare; min floor usually prevents this)
            n[n.len() - self.digit_cols..].to_string()
        } else {
            format!("{n:>w$}", w = self.digit_cols)
        };
        if self.right_pad > 0 {
            format!("{digits}{}", " ".repeat(self.right_pad))
        } else {
            digits
        }
    }

    /// Blank pad of the same total width (for wrapped continuation lines).
    pub fn blank(self) -> String {
        " ".repeat(self.total())
    }
}

/// Compute gutter metrics the way Zed does, adapted to terminal columns.
///
/// - `line_count`: number of lines in the block (for digit width)
/// - `available_width`: columns available for code+gutter after outer indent
/// - `min_digits`: floor (Zed's `min_line_number_digits`, default 2)
///
/// Hides the gutter when the pane is too narrow to show useful code.
pub fn gutter_metrics(
    line_count: usize,
    available_width: usize,
    min_digits: usize,
) -> GutterMetrics {
    // Need room for at least ~20 cols of code after gutter.
    const MIN_CODE_COLS: usize = 20;
    // Hide entirely under this total available width.
    const HIDE_BELOW: usize = 28;

    if available_width < HIDE_BELOW || line_count == 0 {
        return GutterMetrics {
            digit_cols: 0,
            right_pad: 0,
        };
    }

    // digit_count = floor(log10(n)) + 1  (Zed: widest_line_number().ilog10() + 1)
    let needed = if line_count < 10 {
        1
    } else {
        (line_count as f64).log10().floor() as usize + 1
    };
    let digit_cols = needed.max(min_digits).min(4); // cap at 4 (up to 9999)
    let right_pad = 1; // Zed: ~1× ch_width when only line numbers

    let total = digit_cols + right_pad;
    if available_width.saturating_sub(total) < MIN_CODE_COLS {
        // Prefer code over numbers on tiny panes.
        return GutterMetrics {
            digit_cols: 0,
            right_pad: 0,
        };
    }

    GutterMetrics {
        digit_cols,
        right_pad,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digit_width_matches_line_count() {
        assert_eq!(gutter_metrics(9, 80, 1).digit_cols, 1);
        assert_eq!(gutter_metrics(10, 80, 1).digit_cols, 2);
        assert_eq!(gutter_metrics(99, 80, 1).digit_cols, 2);
        assert_eq!(gutter_metrics(100, 80, 1).digit_cols, 3);
    }

    #[test]
    fn min_digits_floor() {
        // Zed min_line_number_digits avoids flicker — small files still get 2 cols.
        assert_eq!(gutter_metrics(5, 80, 2).digit_cols, 2);
    }

    #[test]
    fn hides_when_narrow() {
        let g = gutter_metrics(100, 24, 2);
        assert_eq!(g.digit_cols, 0);
        assert_eq!(g.total(), 0);
    }

    #[test]
    fn format_is_tight() {
        let g = gutter_metrics(50, 80, 2);
        // " 1 " style — 2 digits + 1 pad
        assert_eq!(g.format(1), " 1 ");
        assert_eq!(g.format(50), "50 ");
        assert_eq!(g.blank().len(), g.total());
    }
}
