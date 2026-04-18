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
            col += 1;
            if col >= width as u16 {
                row += 1;
                col = 0;
            }
        }
        char_idx += 1;
    }

    // Cursor at end
    (row, col)
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
    let ch_len = s[byte_idx..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
    s.drain(byte_idx..byte_idx + ch_len);
    char_idx - 1
}

/// Remove the character at the given character index.
pub fn remove_char_at(s: &mut String, char_idx: usize) {
    if char_idx >= s.chars().count() {
        return;
    }
    let byte_idx = char_idx_to_byte_idx(s, char_idx);
    let ch_len = s[byte_idx..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
    s.drain(byte_idx..byte_idx + ch_len);
}

/// Truncate a string to at most `max` characters, adding "…" if truncated.
pub fn truncate_str(s: &str, max: usize) -> &str {
    if s.chars().count() <= max {
        s
    } else {
        let end = s.char_indices()
            .take_while(|(i, _)| *i < max.saturating_sub(1))
            .last()
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(0);
        &s[..end]
    }
}

/// Word-wrap text to a maximum width (character-aware).
pub fn wrap_text(text: &str, max_width: usize) -> Vec<String> {
    if max_width == 0 || text.is_empty() { return vec![text.to_string()]; }
    let mut lines = Vec::new();
    let mut current = String::new();
    let mut col = 0;
    for word in text.split_whitespace() {
        let wlen = word.chars().count();
        if col > 0 && col + 1 + wlen > max_width {
            lines.push(current);
            current = String::new();
            col = 0;
        }
        if col > 0 { current.push(' '); col += 1; }
        current.push_str(word);
        col += wlen;
    }
    if !current.is_empty() || lines.is_empty() { lines.push(current); }
    lines
}