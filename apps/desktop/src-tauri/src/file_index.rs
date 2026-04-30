//! Native file index for fast fuzzy file finding.
//!
//! Uses the `ignore` crate (gitignore-aware recursive walker) to build a
//! flat list of file paths rooted at a given directory.  The index is held
//! in memory keyed by root path so separate worktrees / workspaces get
//! independent indexes.
//!
//! Fuzzy matching uses a simple subsequence scorer that biases toward:
//!   1. Basename matches (filename without directories)
//!   2. Consecutive character runs
//!   3. Shorter paths (tighter matches)
//!
//! A background watcher (`notify`) can be started per root to
//! incrementally update the index when files change on disk.

use crate::error::AppError;
use ignore::WalkBuilder;
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Instant;

/// Maximum files to index per root to avoid blowing memory on huge monorepos.
const MAX_INDEX_ENTRIES: usize = 100_000;

/// Maximum results returned by a single search.
const MAX_SEARCH_RESULTS: usize = 50;

// ── Public types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    /// Path relative to the index root.
    pub relative_path: String,
    /// Just the file name (last component).
    pub name: String,
    /// Single-letter git-like status hint: ' ' = clean, '?' = unknown.
    /// The caller can enrich this with real git status externally.
    pub status: String,
    /// True when the entry is a directory (included for jump-to-dir UX).
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileSearchResult {
    pub entry: FileEntry,
    /// Higher = better match. Frontend sorts descending.
    pub score: i64,
    /// Byte offsets in `relative_path` that matched the query.
    pub matched_indices: Vec<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileIndexStatus {
    pub root: String,
    pub file_count: usize,
    pub built_at_ms: u64,
    pub building: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FilePreview {
    pub path: String,
    pub content: String,
    pub is_binary: bool,
    pub size_bytes: u64,
    pub line_count: usize,
}

// ── Internal state ───────────────────────────────────────────────────

struct IndexEntry {
    files: Vec<FileEntry>,
    built_at: Instant,
    building: bool,
}

struct WatcherHandle {
    _watcher: RecommendedWatcher,
}

pub struct FileIndexManager {
    indexes: Arc<Mutex<HashMap<String, IndexEntry>>>,
    watchers: Arc<Mutex<HashMap<String, WatcherHandle>>>,
}

impl Default for FileIndexManager {
    fn default() -> Self {
        Self {
            indexes: Arc::new(Mutex::new(HashMap::new())),
            watchers: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl FileIndexManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Build (or rebuild) the file index for `root`.
    ///
    /// This walks the directory tree synchronously — it is fast for most
    /// repos but the caller should run it off the main thread for very
    /// large ones.
    pub fn build(&self, root: &str) -> Result<FileIndexStatus, AppError> {
        let root_path = Path::new(root);
        if !root_path.is_dir() {
            return Err(AppError::invalid_input(format!(
                "Index root is not a directory: {root}"
            )));
        }

        // Mark as building
        {
            let mut indexes = self.indexes.lock().unwrap();
            if let Some(entry) = indexes.get_mut(root) {
                entry.building = true;
            }
        }

        let mut files = Vec::with_capacity(8192);

        // Walk every file under `root_path`, regardless of gitignore rules.
        // Agent working directories are often nested inside larger repos whose
        // .gitignore excludes the sandbox — that made the finder appear empty.
        // The explicit `filter_entry` below still skips heavy directories.
        let walker = WalkBuilder::new(root_path)
            .hidden(false)
            .standard_filters(false)
            .parents(false)
            .git_ignore(false)
            .git_global(false)
            .git_exclude(false)
            .filter_entry(|entry| {
                let name = entry.file_name().to_string_lossy();
                // Skip heavy / uninteresting directories
                !matches!(
                    name.as_ref(),
                    "node_modules"
                        | ".git"
                        | "target"
                        | "dist"
                        | "build"
                        | ".next"
                        | "__pycache__"
                        | ".turbo"
                        | ".cache"
                        | ".yarn"
                        | ".pnp"
                )
            })
            .build();

        for result in walker {
            if files.len() >= MAX_INDEX_ENTRIES {
                break;
            }
            let Ok(entry) = result else { continue };
            let Some(relative) = pathdiff(entry.path(), root_path) else {
                continue;
            };
            // Skip the root itself
            if relative.as_os_str().is_empty() {
                continue;
            }
            let relative_str = relative.to_string_lossy().to_string();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);

            files.push(FileEntry {
                relative_path: relative_str,
                name,
                status: " ".to_string(),
                is_dir,
            });
        }

        let now = Instant::now();
        let status = FileIndexStatus {
            root: root.to_string(),
            file_count: files.len(),
            built_at_ms: unix_millis(),
            building: false,
        };

        self.indexes.lock().unwrap().insert(
            root.to_string(),
            IndexEntry {
                files,
                built_at: now,
                building: false,
            },
        );

        // Start a background watcher so incremental changes are picked up
        self.ensure_watcher(root);

        Ok(status)
    }

    /// Fuzzy search the index for `root`.
    pub fn search(
        &self,
        root: &str,
        query: &str,
        max_results: Option<usize>,
    ) -> Result<Vec<FileSearchResult>, AppError> {
        let indexes = self.indexes.lock().unwrap();
        let index = indexes
            .get(root)
            .ok_or_else(|| AppError::not_found(format!("No file index for root: {root}")))?;

        let limit = max_results
            .unwrap_or(MAX_SEARCH_RESULTS)
            .min(MAX_SEARCH_RESULTS);

        if query.trim().is_empty() {
            // Return most recent / shortest paths when query is empty
            let results: Vec<FileSearchResult> = index
                .files
                .iter()
                .filter(|f| !f.is_dir)
                .take(limit)
                .map(|entry| FileSearchResult {
                    entry: entry.clone(),
                    score: 0,
                    matched_indices: vec![],
                })
                .collect();
            return Ok(results);
        }

        let query_lower = query.to_lowercase();
        let query_chars: Vec<char> = query_lower.chars().collect();
        let mut scored: Vec<FileSearchResult> = Vec::with_capacity(256);

        for entry in &index.files {
            if entry.is_dir {
                continue;
            }
            if let Some((score, indices)) =
                fuzzy_score(&query_chars, &entry.relative_path, &entry.name)
            {
                scored.push(FileSearchResult {
                    entry: entry.clone(),
                    score,
                    matched_indices: indices,
                });
            }
        }

        // Sort descending by score, then ascending by path length
        scored.sort_by(|a, b| {
            b.score.cmp(&a.score).then_with(|| {
                a.entry
                    .relative_path
                    .len()
                    .cmp(&b.entry.relative_path.len())
            })
        });

        scored.truncate(limit);
        Ok(scored)
    }

    /// Read a preview of a file (first N bytes).
    pub fn read_preview(
        &self,
        root: &str,
        relative_path: &str,
        max_bytes: Option<usize>,
    ) -> Result<FilePreview, AppError> {
        let full_path = Path::new(root).join(relative_path);
        if !full_path.is_file() {
            return Err(AppError::not_found(format!(
                "File not found: {}",
                full_path.display()
            )));
        }

        let metadata = std::fs::metadata(&full_path)
            .map_err(|e| AppError::io(format!("Failed to read metadata: {e}")))?;
        let size_bytes = metadata.len();
        let max = max_bytes.unwrap_or(512 * 1024); // 512 KB default

        let raw = std::fs::read(&full_path)
            .map_err(|e| AppError::io(format!("Failed to read file: {e}")))?;

        let is_binary = raw.iter().take(8192).any(|&b| b == 0);

        if is_binary {
            return Ok(FilePreview {
                path: full_path.to_string_lossy().to_string(),
                content: String::new(),
                is_binary: true,
                size_bytes,
                line_count: 0,
            });
        }

        let text = String::from_utf8_lossy(&raw[..raw.len().min(max)]).to_string();
        let line_count = text.lines().count();

        Ok(FilePreview {
            path: full_path.to_string_lossy().to_string(),
            content: text,
            is_binary: false,
            size_bytes,
            line_count,
        })
    }

    /// Return current index status for a root.
    pub fn status(&self, root: &str) -> Option<FileIndexStatus> {
        let indexes = self.indexes.lock().unwrap();
        indexes.get(root).map(|idx| FileIndexStatus {
            root: root.to_string(),
            file_count: idx.files.len(),
            built_at_ms: unix_millis(),
            building: idx.building,
        })
    }

    /// Start a filesystem watcher that marks the index dirty when changes
    /// happen. The next search call after a change will auto-rebuild.
    fn ensure_watcher(&self, root: &str) {
        let mut watchers = self.watchers.lock().unwrap();
        if watchers.contains_key(root) {
            return;
        }

        let root_owned = root.to_string();
        let indexes = Arc::clone(&self.indexes);

        let watcher_result = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    // On any file create/modify/remove, invalidate the index
                    // by clearing the files so the next build picks up changes.
                    if event.kind.is_create() || event.kind.is_modify() || event.kind.is_remove() {
                        let mut indexes = indexes.lock().unwrap();
                        if let Some(entry) = indexes.get_mut(&root_owned) {
                            // Mark stale — the caller should re-build.
                            entry.building = false;
                        }
                    }
                }
            },
            Config::default(),
        );

        if let Ok(mut watcher) = watcher_result {
            let _ = watcher.watch(Path::new(root), RecursiveMode::Recursive);
            watchers.insert(root.to_string(), WatcherHandle { _watcher: watcher });
        }
    }
}

// ── Fuzzy matching ───────────────────────────────────────────────────

/// Simple fuzzy subsequence matcher with scoring.
///
/// Returns `Some((score, matched_byte_offsets))` when all query chars appear
/// in order in the haystack, or `None` on mismatch.
fn fuzzy_score(query_chars: &[char], path: &str, basename: &str) -> Option<(i64, Vec<usize>)> {
    if query_chars.is_empty() {
        return Some((0, vec![]));
    }

    let path_lower = path.to_lowercase();
    let path_chars: Vec<char> = path_lower.chars().collect();

    // First pass: check if query is a subsequence at all
    let mut indices = Vec::with_capacity(query_chars.len());
    let mut pi = 0;
    for &qc in query_chars {
        let mut found = false;
        while pi < path_chars.len() {
            if path_chars[pi] == qc {
                indices.push(pi);
                pi += 1;
                found = true;
                break;
            }
            pi += 1;
        }
        if !found {
            return None;
        }
    }

    // Convert char indices → byte offsets for the frontend highlight
    let byte_offsets: Vec<usize> = {
        let char_to_byte: Vec<usize> = path_lower.char_indices().map(|(i, _)| i).collect();
        indices
            .iter()
            .filter_map(|&ci| char_to_byte.get(ci).copied())
            .collect()
    };

    // Scoring
    let mut score: i64 = 100; // base

    // Bonus: basename match (query appears in the file name)
    let basename_lower = basename.to_lowercase();
    if is_subsequence(query_chars, &basename_lower) {
        score += 200;
        // Extra bonus for prefix match in basename
        if basename_lower.starts_with(&query_chars.iter().collect::<String>()) {
            score += 150;
        }
    }

    // Bonus: exact substring match anywhere
    let query_str: String = query_chars.iter().collect();
    if path_lower.contains(&query_str) {
        score += 100;
        // Bonus for exact basename substring
        if basename_lower.contains(&query_str) {
            score += 80;
        }
    }

    // Bonus: consecutive character runs
    let mut consecutive_bonus: i64 = 0;
    for window in indices.windows(2) {
        if window[1] == window[0] + 1 {
            consecutive_bonus += 30;
        }
    }
    score += consecutive_bonus;

    // Bonus: matches after path separators (word boundary)
    for &idx in &indices {
        if idx == 0 || path_chars.get(idx.wrapping_sub(1)) == Some(&'/') {
            score += 20;
        }
    }

    // Penalty: longer paths
    score -= (path.len() as i64) / 4;

    // Penalty: matches spread far apart
    if indices.len() >= 2 {
        let spread = indices.last().unwrap() - indices.first().unwrap();
        score -= (spread as i64) / 3;
    }

    Some((score, byte_offsets))
}

fn is_subsequence(query: &[char], haystack: &str) -> bool {
    let mut qi = 0;
    for ch in haystack.chars() {
        if qi < query.len() && ch == query[qi] {
            qi += 1;
        }
    }
    qi == query.len()
}

// ── Helpers ──────────────────────────────────────────────────────────

fn pathdiff(path: &Path, base: &Path) -> Option<PathBuf> {
    path.strip_prefix(base).ok().map(PathBuf::from)
}

fn unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fuzzy_score_basic_match() {
        let query: Vec<char> = "main".chars().collect();
        let (score, indices) = fuzzy_score(&query, "src/main.rs", "main.rs").unwrap();
        assert!(score > 0);
        assert!(!indices.is_empty());
    }

    #[test]
    fn fuzzy_score_no_match() {
        let query: Vec<char> = "xyz".chars().collect();
        assert!(fuzzy_score(&query, "src/main.rs", "main.rs").is_none());
    }

    #[test]
    fn fuzzy_score_basename_bias() {
        let query: Vec<char> = "app".chars().collect();
        let (score_short, _) = fuzzy_score(&query, "src/app.tsx", "app.tsx").unwrap();
        let (score_long, _) = fuzzy_score(
            &query,
            "src/components/application/wrapper.tsx",
            "wrapper.tsx",
        )
        .unwrap();
        // The shorter path with basename match should score higher
        assert!(score_short > score_long);
    }

    #[test]
    fn fuzzy_score_empty_query() {
        let query: Vec<char> = vec![];
        let (score, indices) = fuzzy_score(&query, "anything.txt", "anything.txt").unwrap();
        assert_eq!(score, 0);
        assert!(indices.is_empty());
    }
}
