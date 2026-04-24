/// Calculate how many visual lines a string takes when wrapped at `width` columns.
pub fn count_wrapped_lines(text: &str, width: usize) -> u16 {
    if width == 0 || text.is_empty() {
        return 1;
    }
    let mut lines: u16 = 0;
    for line in text.split('\n') {
        if line.is_empty() {
            lines += 1;
        } else {
            let line_len = line.chars().count();
            lines += (line_len / width) as u16;
            if line_len % width != 0 || line_len == 0 {
                lines += 1;
            }
        }
    }
    lines.max(1)
}

/// Calculate the (row, col) position of a character index within wrapped text.
pub fn cursor_to_row_col(text: &str, cursor: usize, width: usize) -> (u16, u16) {
    if width == 0 {
        return (0, 0);
    }
    let mut row: u16 = 0;
    let mut col: u16 = 0;
    let mut char_idx: usize = 0;

    for ch in text.chars() {
        if char_idx == cursor {
            return (row, col);
        }
        if ch == '\n' {
            row += 1;
            col = 0;
        } else {
            // Wrap BEFORE placing a character that would overflow, so a line
            // that is exactly `width` characters wide stays on one row.
            if col + 1 > width as u16 {
                row += 1;
                col = 0;
            }
            col += 1;
        }
        char_idx += 1;
    }

    // Cursor at end
    (row, col)
}

/// Hard-wrap `text` into visual lines of at most `width` characters,
/// splitting at newlines and then at the width boundary.
/// This must stay in sync with [`count_wrapped_lines`] and [`cursor_to_row_col`].
pub fn hard_wrap_lines(text: &str, width: usize) -> Vec<String> {
    if width == 0 {
        return vec![text.to_string()];
    }
    let mut lines: Vec<String> = Vec::new();
    for line in text.split('\n') {
        if line.is_empty() {
            lines.push(String::new());
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        for chunk in chars.chunks(width) {
            lines.push(chunk.iter().collect());
        }
    }
    // str::split('\n') on a trailing-\n string already yields a trailing empty
    // slice, but if the input is completely empty we need one empty line.
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

/// Convert a character index to a byte index in a string.
pub fn char_idx_to_byte_idx(s: &str, char_idx: usize) -> usize {
    s.char_indices()
        .nth(char_idx)
        .map(|(i, _)| i)
        .unwrap_or(s.len())
}

/// Insert a character at a character index in a string.
pub fn insert_char(s: &mut String, char_idx: usize, ch: char) {
    let byte_idx = char_idx_to_byte_idx(s, char_idx);
    s.insert(byte_idx, ch);
}

/// Remove the character before the given character index, returning the new cursor position.
pub fn remove_char_before(s: &mut String, char_idx: usize) -> usize {
    if char_idx == 0 {
        return 0;
    }
    let byte_idx = char_idx_to_byte_idx(s, char_idx - 1);
    let ch_len = s[byte_idx..]
        .chars()
        .next()
        .map(|c| c.len_utf8())
        .unwrap_or(1);
    s.drain(byte_idx..byte_idx + ch_len);
    char_idx - 1
}

/// Remove the character at the given character index.
pub fn remove_char_at(s: &mut String, char_idx: usize) {
    if char_idx >= s.chars().count() {
        return;
    }
    let byte_idx = char_idx_to_byte_idx(s, char_idx);
    let ch_len = s[byte_idx..]
        .chars()
        .next()
        .map(|c| c.len_utf8())
        .unwrap_or(1);
    s.drain(byte_idx..byte_idx + ch_len);
}

/// Render `text` as a sequence of per-character spans with a brightness band
/// that moves across it on each tick — a cheap shimmer for "thinking" states.
///
/// Uses `tick` as the time source so callers don't need an extra timer.
pub fn shimmer_spans(
    text: &str,
    tick: u64,
    base: ratatui::style::Color,
) -> Vec<ratatui::text::Span<'static>> {
    use ratatui::style::{Modifier, Style};
    use ratatui::text::Span;

    let chars: Vec<char> = text.chars().collect();
    if chars.is_empty() {
        return Vec::new();
    }
    // Period covers the text plus leading/trailing padding so the band drifts
    // in and out rather than popping at the edges.
    let padding = 6usize;
    let period = chars.len() + padding * 2;
    // Advance ~4 columns per tick; tick granularity is fine enough that this
    // reads as smooth motion at the usual 8fps UI redraw rate.
    let head = (tick as usize / 1).wrapping_mul(1) % period;
    let band_half: isize = 3;

    let mut spans = Vec::with_capacity(chars.len());
    for (i, ch) in chars.iter().enumerate() {
        let pos = i as isize + padding as isize;
        let dist = (pos - head as isize).abs();
        let style = if dist == 0 {
            Style::default().fg(base).add_modifier(Modifier::BOLD)
        } else if dist <= band_half {
            Style::default().fg(base)
        } else {
            Style::default().fg(base).add_modifier(Modifier::DIM)
        };
        spans.push(Span::styled(ch.to_string(), style));
    }
    spans
}

/// Truncate a string to at most `max` characters, adding "…" if truncated.
pub fn truncate_str(s: &str, max: usize) -> &str {
    if s.chars().count() <= max {
        s
    } else {
        let end = s
            .char_indices()
            .take_while(|(i, _)| *i < max.saturating_sub(1))
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(0);
        &s[..end]
    }
}

/// Wrap text to an exact character width, breaking at word boundaries when possible.
/// Long words are hard-broken at the width limit.
pub fn wrap_text_to_width(text: &str, max_width: usize) -> Vec<String> {
    if max_width == 0 {
        return vec![text.to_string()];
    }
    if text.is_empty() {
        return vec![String::new()];
    }
    let mut lines = Vec::new();
    for raw_line in text.lines() {
        if raw_line.is_empty() {
            lines.push(String::new());
            continue;
        }
        let mut current = String::new();
        let mut col = 0;
        for word in raw_line.split_whitespace() {
            let wlen = word.chars().count();
            // If a single word is longer than max_width, hard-break it
            if wlen > max_width {
                if !current.is_empty() {
                    lines.push(current);
                    current = String::new();
                    col = 0;
                }
                let chars: Vec<char> = word.chars().collect();
                for chunk in chars.chunks(max_width) {
                    lines.push(chunk.iter().collect());
                }
                continue;
            }
            if col > 0 && col + 1 + wlen > max_width {
                lines.push(current);
                current = String::new();
                col = 0;
            }
            if col > 0 {
                current.push(' ');
                col += 1;
            }
            current.push_str(word);
            col += wlen;
        }
        if !current.is_empty() {
            lines.push(current);
        }
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wrap_text_to_width_basic() {
        let text = "hello world foo bar";
        let result = wrap_text_to_width(text, 10);
        assert_eq!(result, vec!["hello", "world foo", "bar"]);
    }

    #[test]
    fn test_wrap_text_to_width_long_word() {
        let text = "supercalifragilistic";
        let result = wrap_text_to_width(text, 8);
        assert_eq!(result, vec!["supercal", "ifragili", "stic"]);
    }

    #[test]
    fn test_wrap_text_to_width_empty() {
        let result = wrap_text_to_width("", 10);
        assert_eq!(result, vec![""]);
    }

    #[test]
    fn test_wrap_text_to_width_multiline() {
        let text = "line one\nline two";
        let result = wrap_text_to_width(text, 20);
        assert_eq!(result, vec!["line one", "line two"]);
    }

    #[test]
    fn test_hard_wrap_lines_basic() {
        assert_eq!(hard_wrap_lines("hello", 10), vec!["hello"]);
        assert_eq!(
            hard_wrap_lines("supercalifragilistic", 10),
            vec!["supercalif", "ragilistic"]
        );
    }

    #[test]
    fn test_hard_wrap_lines_with_newlines() {
        assert_eq!(
            hard_wrap_lines("hello\nworld", 10),
            vec!["hello", "world"]
        );
        assert_eq!(
            hard_wrap_lines("hello\n", 10),
            vec!["hello", ""]
        );
        assert_eq!(
            hard_wrap_lines("hello\n\nworld", 10),
            vec!["hello", "", "world"]
        );
    }

    #[test]
    fn test_hard_wrap_lines_exact_width() {
        // A line of exactly `width` chars should stay on one row.
        assert_eq!(hard_wrap_lines("abcde", 5), vec!["abcde"]);
        assert_eq!(hard_wrap_lines("abcdef", 5), vec!["abcde", "f"]);
    }

    #[test]
    fn test_cursor_to_row_col_basic() {
        assert_eq!(cursor_to_row_col("hello", 5, 10), (0, 5));
    }

    #[test]
    fn test_cursor_to_row_col_exact_width() {
        // Cursor at end of exactly-width text should stay on the same line.
        assert_eq!(cursor_to_row_col("abcde", 5, 5), (0, 5));
        // Cursor after the first char of the next chunk.
        assert_eq!(cursor_to_row_col("abcdef", 6, 5), (1, 1));
    }

    #[test]
    fn test_cursor_to_row_col_with_newlines() {
        assert_eq!(cursor_to_row_col("hello\nworld", 5, 10), (0, 5));
        assert_eq!(cursor_to_row_col("hello\nworld", 6, 10), (1, 0));
        assert_eq!(cursor_to_row_col("hello\nworld", 11, 10), (1, 5));
    }

    #[test]
    fn test_hard_wrap_and_cursor_agree() {
        // For any text, the number of lines produced by hard_wrap_lines must
        // match count_wrapped_lines, and cursor_to_row_col must stay within bounds.
        let text = "hello\nworld! this is a test\nfoo";
        let width = 8;
        let lines = hard_wrap_lines(text, width);
        assert_eq!(lines.len() as u16, count_wrapped_lines(text, width));
        for (cursor, _) in text.chars().enumerate().chain(std::iter::once((text.chars().count(), ' '))) {
            let (row, col) = cursor_to_row_col(text, cursor, width);
            assert!(
                row < lines.len() as u16 || (row == lines.len() as u16 && col == 0),
                "cursor {} out of bounds: row={}, col={}, lines={}",
                cursor,
                row,
                col,
                lines.len()
            );
        }
    }
}
