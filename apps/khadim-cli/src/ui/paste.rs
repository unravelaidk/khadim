//! Smart paste handling inspired by Codex CLI.
//!
//! Detects image paths, file paths, and clipboard images in pasted text and
//! converts them into useful input rather than raw text.

use std::path::Path;

/// Image file extensions we can detect from pasted paths.
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"];

/// Check if a string looks like an image file path.
pub fn is_image_path(text: &str) -> bool {
    let path = Path::new(text.trim());
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            let e = e.to_lowercase();
            IMAGE_EXTS.contains(&e.as_str())
        })
        .unwrap_or(false)
}

/// Check if a string looks like a regular file path (has a file extension and
/// exists on disk, or at least looks path-like).
pub fn is_likely_file_path(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.len() < 2 {
        return false;
    }
    // Quick heuristic: contains a slash or backslash and has an extension.
    let has_separator = trimmed.contains('/') || trimmed.contains('\\');
    let has_extension = Path::new(trimmed)
        .extension()
        .and_then(|e| e.to_str())
        .is_some();
    has_separator && has_extension
}

/// If the pasted text is a path to an existing image file, return a markdown
/// image reference so the LLM can see it.
pub fn handle_pasted_image_path(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if !is_image_path(trimmed) {
        return None;
    }
    let path = Path::new(trimmed);
    if !path.exists() {
        return None;
    }
    // Return a placeholder mention the user can reference.
    Some(format!("[Image: {}]", trimmed))
}

/// If the pasted text is a path to an existing regular file, read its content
/// and return it wrapped in a fenced code block.
pub fn handle_pasted_file_path(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if !is_likely_file_path(trimmed) {
        return None;
    }
    let path = Path::new(trimmed);
    if !path.exists() || !path.is_file() {
        return None;
    }
    // Skip images (handled above).
    if is_image_path(trimmed) {
        return None;
    }
    let content = std::fs::read_to_string(path).ok()?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let lang = if ext.is_empty() { "" } else { ext };
    Some(format!(
        "```{}\n{}\n```\n",
        lang,
        content.trim_end()
    ))
}

/// Process pasted text: detect image/file paths and inline them.
///
/// Returns `Some(replacement)` when the paste was handled specially,
/// `None` when the text should be inserted verbatim.
pub fn process_paste(text: &str) -> Option<String> {
    // Single-line paste that looks like a path.
    if text.lines().count() == 1 {
        if let Some(result) = handle_pasted_image_path(text) {
            return Some(result);
        }
        if let Some(result) = handle_pasted_file_path(text) {
            return Some(result);
        }
    }
    None
}

/// Try to read an image from the system clipboard and save it to a temp file.
/// Returns the path to the saved image.
#[cfg(not(target_os = "android"))]
pub fn paste_clipboard_image_to_temp() -> Option<String> {
    use arboard::Clipboard;
    let mut cb = Clipboard::new().ok()?;

    // Try file list first (e.g. copy from Finder / Explorer).
    if let Ok(files) = cb.get().file_list() {
        for f in files {
            let path_str = f.to_string_lossy().to_string();
            if is_image_path(&path_str) {
                return Some(path_str);
            }
        }
    }

    // Try raw image data.
    if let Ok(img) = cb.get_image() {
        let w = img.width as u32;
        let h = img.height as u32;
        let rgba = image::RgbaImage::from_raw(w, h, img.bytes.into_owned())?;
        let dyn_img = image::DynamicImage::ImageRgba8(rgba);
        let mut png: Vec<u8> = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut png);
        dyn_img
            .write_to(&mut cursor, image::ImageFormat::Png)
            .ok()?;
        // Save to a temp file.
        let tmp_path = std::env::temp_dir().join(format!(
            "khadim-clipboard-{}.png",
            std::process::id()
        ));
        std::fs::write(&tmp_path, &png).ok()?;
        return Some(tmp_path.to_string_lossy().to_string());
    }

    None
}

#[cfg(target_os = "android")]
pub fn paste_clipboard_image_to_temp() -> Option<String> {
    None
}
