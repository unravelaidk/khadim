#[tauri::command]
pub(crate) fn syntax_highlight(source: String, filename: String) -> crate::syntax::HighlightResult {
    crate::syntax::highlight(&source, &filename)
}
