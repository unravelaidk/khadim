import {
  forwardRef,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import type {
  FileSearchResult,
  FilePreview,
  DesktopWorkspaceContext,
  LspSymbol,
  SyntaxHighlightResult,
} from "../lib/bindings";
import { commands } from "../lib/bindings";

// ── Language mapping (module-level constant, never re-allocated) ─────

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  mjs: "javascript", cjs: "javascript", rs: "rust", py: "python",
  rb: "ruby", go: "go", java: "java", kt: "kotlin", kts: "kotlin",
  scala: "scala", swift: "swift", c: "c", h: "c", cpp: "cpp",
  cxx: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", css: "css",
  scss: "scss", sass: "sass", less: "less", html: "html", htm: "html",
  xml: "xml", svg: "svg", json: "json", jsonc: "json", yaml: "yaml",
  yml: "yaml", toml: "toml", md: "markdown", mdx: "mdx", sh: "bash",
  bash: "bash", zsh: "bash", fish: "bash", ps1: "powershell",
  sql: "sql", graphql: "graphql", gql: "graphql", dockerfile: "docker",
  lua: "lua", zig: "zig", nim: "nim", dart: "dart", r: "r", R: "r",
  ex: "elixir", exs: "elixir", erl: "erlang", hrl: "erlang",
  clj: "clojure", cljs: "clojure", hs: "haskell", ml: "ocaml",
  mli: "ocaml", vue: "markup", svelte: "markup", astro: "markup",
  php: "php", pl: "perl", makefile: "makefile", cmake: "cmake",
  tf: "hcl", hcl: "hcl", nix: "nix", proto: "protobuf", ini: "ini",
  env: "bash", lock: "json",
};

function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) return "docker";
  if (lower === "makefile" || lower === "gnumakefile") return "makefile";
  if (lower === "cmakelists.txt") return "cmake";
  if (lower.endsWith(".d.ts")) return "typescript";
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return "text";
  return EXT_TO_LANGUAGE[filename.slice(dot + 1).toLowerCase()] ?? "text";
}

// No Prism style constants — tree-sitter does all highlighting in Rust.

// ── Props ────────────────────────────────────────────────────────────

interface Props {
  context: DesktopWorkspaceContext | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFile?: (absolutePath: string) => void;
}

// ── Main component ───────────────────────────────────────────────────

export const FileFinder = memo(function FileFinder({
  context,
  isOpen,
  onClose,
  onOpenFile,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [indexReady, setIndexReady] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [highlightHtml, setHighlightHtml] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<LspSymbol[]>([]);
  const [showSymbols, setShowSymbols] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Track the path we last fetched so we can skip redundant loads. */
  const lastPreviewPath = useRef<string | null>(null);
  const root = context?.cwd ?? null;

  // ── Index lifecycle ────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !root) return;
    let cancelled = false;
    setIndexReady(false);
    setIndexing(true);

    commands
      .fileIndexStatus(root)
      .then((status) => {
        if (cancelled) return;
        if (status && status.file_count > 0) {
          setIndexReady(true);
          setIndexing(false);
        } else {
          return commands.fileIndexBuild(root).then(() => {
            if (cancelled) return;
            setIndexReady(true);
            setIndexing(false);
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        commands.fileIndexBuild(root).then(() => {
          if (cancelled) return;
          setIndexReady(true);
          setIndexing(false);
        }).catch(() => { if (!cancelled) setIndexing(false); });
      });

    return () => { cancelled = true; };
  }, [isOpen, root]);

  // ── Reset on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    setPreview(null);
    setHighlightHtml(null);
    setSymbols([]);
    setShowSymbols(false);
    lastPreviewPath.current = null;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  // ── Debounced search ───────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !root || !indexReady) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      commands
        .fileSearch(root, query, 50)
        .then((res) => {
          setResults(res);
          setSelectedIndex(0);
        })
        .catch(() => setResults([]));
    }, query ? 50 : 0);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, isOpen, root, indexReady]);

  // ── Preview: only load when the *path* actually changes ────────
  const selectedPath = results[selectedIndex]?.entry.relative_path ?? null;

  useEffect(() => {
    if (!root || !selectedPath) {
      setPreview(null);
      setHighlightHtml(null);
      lastPreviewPath.current = null;
      return;
    }
    // Skip if we already have this file loaded
    if (lastPreviewPath.current === selectedPath) return;

    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      lastPreviewPath.current = selectedPath;
      const filename = selectedPath.split("/").pop() ?? selectedPath;
      commands
        .fileReadPreview(root, selectedPath)
        .then((p) => {
          startTransition(() => setPreview(p));
          // Fire tree-sitter highlight in Rust — non-blocking
          if (p && !p.is_binary && p.content) {
            commands
              .syntaxHighlight(p.content, filename)
              .then((result) => startTransition(() => setHighlightHtml(result.html)))
              .catch(() => setHighlightHtml(null));
          } else {
            setHighlightHtml(null);
          }
        })
        .catch(() => {
          setPreview(null);
          setHighlightHtml(null);
        });
    }, 120);

    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [selectedPath, root]);

  // ── LSP symbols: fire-and-forget, deferred ─────────────────────
  useEffect(() => {
    if (!root || !preview || preview.is_binary || !selectedPath) {
      setSymbols([]);
      return;
    }
    if (symbolTimer.current) clearTimeout(symbolTimer.current);
    symbolTimer.current = setTimeout(() => {
      const filePath = `${root}/${selectedPath}`;
      commands
        .lspDocumentSymbols(root, filePath)
        .then((s) => startTransition(() => setSymbols(s)))
        .catch(() => setSymbols([]));
    }, 500);
    return () => { if (symbolTimer.current) clearTimeout(symbolTimer.current); };
  }, [preview, selectedPath, root]);

  // ── Scroll selected item into view ─────────────────────────────
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // ── Stable callbacks (no inline closures in JSX) ───────────────

  const handleSelect = useCallback(
    (index: number) => {
      const entry = results[index]?.entry;
      if (!entry || !root) return;
      onOpenFile?.(`${root}/${entry.relative_path}`);
      onClose();
    },
    [results, root, onOpenFile, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const len = results.length;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((p) => Math.min(p + 1, len - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((p) => Math.max(p - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          handleSelect(selectedIndex);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "Tab":
          e.preventDefault();
          setSelectedIndex((p) =>
            e.shiftKey ? Math.max(p - 1, 0) : Math.min(p + 1, len - 1),
          );
          break;
      }
    },
    [results.length, selectedIndex, handleSelect, onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); },
    [onClose],
  );

  const handleClearQuery = useCallback(() => setQuery(""), []);
  const handleToggleSymbols = useCallback(() => setShowSymbols((s) => !s), []);

  if (!isOpen) return null;

  const selectedEntry = results[selectedIndex]?.entry ?? null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[5vh]"
      onClick={handleBackdropClick}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="finder-panel relative z-10 flex flex-col w-[95vw] max-w-[1200px] rounded-2xl overflow-hidden border border-[var(--glass-border)]"
        style={{
          background: "var(--glass-bg-strong)",
          backdropFilter: "blur(40px) saturate(1.6)",
          WebkitBackdropFilter: "blur(40px) saturate(1.6)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05)",
          maxHeight: "85vh",
        }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--glass-border)] shrink-0">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={indexing ? "Indexing files…" : "Search files by name…"}
            disabled={indexing}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button onClick={handleClearQuery} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <CloseIcon />
            </button>
          )}
          <kbd className="hidden sm:inline-flex h-5 items-center rounded px-1.5 text-[9px] font-mono font-medium text-[var(--text-muted)] bg-[var(--surface-ink-5)] border border-[var(--glass-border)]">
            ESC
          </kbd>
        </div>

        {/* Results + Preview split */}
        <div className="flex flex-1 min-h-0">
          {/* Results list */}
          <ResultsList
            ref={listRef}
            results={results}
            selectedIndex={selectedIndex}
            indexing={indexing}
            indexReady={indexReady}
            query={query}
            onSelect={handleSelect}
            onHover={setSelectedIndex}
          />

          {/* Code preview */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {selectedEntry && (
              <PreviewHeader
                entry={selectedEntry}
                preview={preview}
                symbolCount={symbols.length}
                showSymbols={showSymbols}
                onToggleSymbols={handleToggleSymbols}
              />
            )}

            <div className="flex-1 flex min-h-0">
              {showSymbols && symbols.length > 0 && (
                <SymbolOutline symbols={symbols} />
              )}

              <PreviewContent
                preview={preview}
                highlightHtml={highlightHtml}
                selectedEntry={selectedEntry}
                results={results}
                indexing={indexing}
                indexReady={indexReady}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-[var(--glass-border)] flex items-center justify-between text-[9px] text-[var(--text-muted)] shrink-0">
          <span>
            {results.length > 0
              ? `${results.length} result${results.length !== 1 ? "s" : ""}`
              : indexReady ? "Ready" : ""}
          </span>
          <div className="flex items-center gap-4">
            <span><kbd className="font-mono bg-[var(--surface-ink-5)] px-1 py-0.5 rounded">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono bg-[var(--surface-ink-5)] px-1 py-0.5 rounded">↵</kbd> open in editor</span>
            <span><kbd className="font-mono bg-[var(--surface-ink-5)] px-1 py-0.5 rounded">esc</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Results list (extracted to isolate re-renders) ───────────────────

interface ResultsListProps {
  results: FileSearchResult[];
  selectedIndex: number;
  indexing: boolean;
  indexReady: boolean;
  query: string;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}

const ResultsList = memo(forwardRef<HTMLDivElement, ResultsListProps>(
  function ResultsList({ results, selectedIndex, indexing, indexReady, query, onSelect, onHover }, ref) {
    return (
      <div
        ref={ref}
        className="w-[320px] shrink-0 overflow-y-auto scrollbar-thin border-r border-[var(--glass-border)]"
      >
        {indexing && (
          <div className="px-4 py-12 text-center">
            <div className="inline-flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
              <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[var(--color-accent)] border-t-transparent dot-spinner" />
              Building file index…
            </div>
          </div>
        )}
        {!indexing && results.length === 0 && query && (
          <div className="px-4 py-12 text-center text-[12px] text-[var(--text-muted)]">
            No files matching "<span className="font-medium text-[var(--text-secondary)]">{query}</span>"
          </div>
        )}
        {!indexing && results.length === 0 && !query && indexReady && (
          <div className="px-4 py-12 text-center text-[12px] text-[var(--text-muted)]">
            Type to search files
          </div>
        )}
        {results.map((result, i) => (
          <FileResultRow
            key={result.entry.relative_path}
            result={result}
            index={i}
            isSelected={i === selectedIndex}
            onSelect={onSelect}
            onHover={onHover}
          />
        ))}
      </div>
    );
  },
));

// ── Result row (stable props, no inline closures) ────────────────────

const FileResultRow = memo(function FileResultRow({
  result,
  index,
  isSelected,
  onSelect,
  onHover,
}: {
  result: FileSearchResult;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}) {
  const { entry, matched_indices } = result;
  const dir = useMemo(() => directoryPart(entry.relative_path), [entry.relative_path]);
  const nameIndices = useMemo(
    () => basenameIndices(entry.relative_path, entry.name, matched_indices),
    [entry.relative_path, entry.name, matched_indices],
  );
  const dirMatchIndices = useMemo(
    () => (dir ? dirIndices(entry.relative_path, dir, matched_indices) : EMPTY_SET),
    [entry.relative_path, dir, matched_indices],
  );

  const handleClick = useCallback(() => onSelect(index), [onSelect, index]);
  const handleMouseEnter = useCallback(() => onHover(index), [onHover, index]);

  return (
    <div
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
        isSelected
          ? "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]"
          : "hover:bg-[var(--surface-ink-3)]"
      }`}
    >
      <FileIcon ext={extension(entry.name)} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">
          <HighlightedText text={entry.name} indices={nameIndices} />
        </p>
        {dir && (
          <p className="text-[10px] text-[var(--text-muted)] truncate font-mono mt-0.5">
            <HighlightedText text={dir} indices={dirMatchIndices} />
          </p>
        )}
      </div>
      {entry.status !== " " && entry.status !== "" && (
        <span className={`text-[9px] font-bold shrink-0 ${statusColor(entry.status)}`}>
          {entry.status}
        </span>
      )}
      {isSelected && <ChevronIcon />}
    </div>
  );
});

// ── Preview content (deferred highlight) ─────────────────────────────

const PreviewContent = memo(function PreviewContent({
  preview,
  highlightHtml,
  selectedEntry,
  results,
  indexing,
  indexReady,
}: {
  preview: FilePreview | null;
  highlightHtml: string | null;
  selectedEntry: FileSearchResult["entry"] | null;
  results: FileSearchResult[];
  indexing: boolean;
  indexReady: boolean;
}) {
  const deferredHtml = useDeferredValue(highlightHtml);
  const isPending = preview !== null && deferredHtml === null && highlightHtml === null;

  return (
    <div className="flex-1 overflow-auto scrollbar-thin relative">
      {isPending && (
        <div className="absolute top-2 right-3 z-10">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-[var(--color-accent)] border-t-transparent dot-spinner" />
        </div>
      )}

      {!preview && results.length > 0 && !indexing && (
        <div className="flex items-center justify-center h-full text-[12px] text-[var(--text-muted)]">
          Select a file to preview
        </div>
      )}

      {preview && !preview.is_binary && preview.content && selectedEntry && (
        <TreeSitterPreview
          html={deferredHtml}
          content={preview.content}
          lineCount={preview.line_count}
        />
      )}

      {preview && preview.is_binary && (
        <div className="flex items-center justify-center h-full text-[12px] text-[var(--text-muted)]">
          <div className="text-center">
            <BinaryIcon />
            <p className="mt-2">Binary file</p>
            {preview.size_bytes > 0 && (
              <p className="text-[10px] mt-1">{formatSize(preview.size_bytes)}</p>
            )}
          </div>
        </div>
      )}

      {results.length === 0 && !indexing && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-xs mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-[var(--surface-ink-5)] flex items-center justify-center mx-auto mb-3">
              <SearchIcon />
            </div>
            <p className="text-[12px] text-[var(--text-muted)]">
              {indexReady ? "Search for files in your workspace" : "Preparing file index…"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Preview header ───────────────────────────────────────────────────

const PreviewHeader = memo(function PreviewHeader({
  entry,
  preview,
  symbolCount,
  showSymbols,
  onToggleSymbols,
}: {
  entry: FileSearchResult["entry"];
  preview: FilePreview | null;
  symbolCount: number;
  showSymbols: boolean;
  onToggleSymbols: () => void;
}) {
  const dir = useMemo(() => directoryPart(entry.relative_path), [entry.relative_path]);
  const lang = useMemo(() => detectLanguage(entry.name), [entry.name]);

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-[var(--glass-border)] bg-[var(--surface-ink-3)]">
      <FileIcon ext={extension(entry.name)} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-[var(--text-primary)] truncate">{entry.name}</p>
        {dir && <p className="text-[9px] text-[var(--text-muted)] font-mono truncate">{dir}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0 text-[9px] text-[var(--text-muted)]">
        {symbolCount > 0 && (
          <button
            onClick={onToggleSymbols}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium transition-colors ${
              showSymbols
                ? "bg-[color-mix(in_srgb,var(--color-accent)_20%,transparent)] text-[var(--color-accent)]"
                : "bg-[var(--surface-ink-5)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
            title="Toggle symbol outline"
          >
            <SymbolIcon />
            {symbolCount}
          </button>
        )}
        {lang !== "text" && (
          <span className="uppercase tracking-wide font-medium text-[var(--text-secondary)] bg-[var(--surface-ink-5)] px-1.5 py-0.5 rounded">
            {lang}
          </span>
        )}
        {preview && (
          <>
            <span>{preview.line_count} lines</span>
            <span>·</span>
            <span>{formatSize(preview.size_bytes)}</span>
          </>
        )}
      </div>
    </div>
  );
});

// ── Tree-sitter preview (native speed) ─────────────────────────────
//
// Rust does all tokenization via tree-sitter. The frontend just injects
// the pre-built HTML with line numbers. Zero JS parsing overhead.

const TreeSitterPreview = memo(
  function TreeSitterPreview({
    html,
    content,
    lineCount,
  }: {
    /** Pre-tokenized HTML from Rust, or null while loading. */
    html: string | null;
    /** Raw source content (fallback when html is null). */
    content: string;
    lineCount: number;
  }) {
    // Build line-numbered HTML
    const numberedHtml = useMemo(() => {
      const source = html ?? escapeHtml(content);
      const lines = source.split("\n");
      const digits = String(lines.length).length;
      const pad = Math.max(digits, 3);

      const parts: string[] = [];
      parts.push('<div class="ts-code">');
      for (let i = 0; i < lines.length; i++) {
        const num = String(i + 1).padStart(pad, " ");
        parts.push(
          `<div class="ts-line"><span class="ts-ln">${num}</span><span class="ts-lc">${lines[i] || " "}</span></div>`,
        );
      }
      parts.push("</div>");
      return parts.join("");
    }, [html, content]);

    return (
      <div
        className="ts-preview"
        dangerouslySetInnerHTML={{ __html: numberedHtml }}
      />
    );
  },
  (prev, next) => prev.html === next.html && prev.content === next.content,
);

// ── Symbol outline ───────────────────────────────────────────────────

const SymbolOutline = memo(function SymbolOutline({ symbols }: { symbols: LspSymbol[] }) {
  return (
    <div className="w-[200px] shrink-0 border-r border-[var(--glass-border)] overflow-y-auto scrollbar-thin bg-[var(--surface-ink-3)]">
      <div className="px-3 py-2 border-b border-[var(--glass-border)]">
        <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Symbols</p>
      </div>
      <div className="py-1">
        {symbols.map((sym, i) => (
          <SymbolRow key={`${sym.name}-${sym.kind}-${i}`} symbol={sym} depth={0} />
        ))}
      </div>
    </div>
  );
});

const SymbolRow = memo(function SymbolRow({ symbol, depth }: { symbol: LspSymbol; depth: number }) {
  return (
    <>
      <div
        className="flex items-center gap-1.5 px-3 py-1 hover:bg-[var(--glass-bg)] cursor-default text-[10px]"
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        title={`${symbol.kind}: ${symbol.name}${symbol.detail ? ` — ${symbol.detail}` : ""}`}
      >
        <span className={`shrink-0 w-3 text-center font-bold text-[8px] ${symbolKindColor(symbol.kind)}`}>
          {symbolKindIcon(symbol.kind)}
        </span>
        <span className="text-[var(--text-primary)] truncate">{symbol.name}</span>
        {symbol.detail && (
          <span className="text-[var(--text-muted)] truncate ml-auto text-[9px]">{symbol.detail}</span>
        )}
      </div>
      {symbol.children.map((child, i) => (
        <SymbolRow key={`${child.name}-${child.kind}-${i}`} symbol={child} depth={depth + 1} />
      ))}
    </>
  );
});

function symbolKindIcon(kind: string): string {
  switch (kind) {
    case "Function": case "Method": case "Constructor": return "ƒ";
    case "Class": case "Struct": return "C";
    case "Interface": return "I";
    case "Enum": case "EnumMember": return "E";
    case "Variable": case "Constant": return "v";
    case "Property": case "Field": return "p";
    case "Module": case "Namespace": case "Package": return "M";
    case "TypeParameter": return "T";
    default: return "·";
  }
}

function symbolKindColor(kind: string): string {
  switch (kind) {
    case "Function": case "Method": case "Constructor": return "text-purple-400";
    case "Class": case "Struct": return "text-yellow-400";
    case "Interface": return "text-cyan-400";
    case "Enum": case "EnumMember": return "text-green-400";
    case "Variable": case "Constant": return "text-blue-400";
    case "Property": case "Field": return "text-orange-400";
    case "Module": case "Namespace": return "text-pink-400";
    case "TypeParameter": return "text-teal-400";
    default: return "text-[var(--text-muted)]";
  }
}

// ── Highlighted text ─────────────────────────────────────────────────

const HighlightedText = memo(function HighlightedText({
  text,
  indices,
}: {
  text: string;
  indices: Set<number>;
}) {
  if (indices.size === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    if (indices.has(i)) {
      const start = i;
      while (i < text.length && indices.has(i)) i++;
      parts.push(<span key={start} className="text-[var(--color-accent)] font-bold">{text.slice(start, i)}</span>);
    } else {
      const start = i;
      while (i < text.length && !indices.has(i)) i++;
      parts.push(<span key={start}>{text.slice(start, i)}</span>);
    }
  }
  return <>{parts}</>;
});

// ── Icons (pure, never re-render) ────────────────────────────────────

function SearchIcon() {
  return (
    <i className="ri-search-line text-base leading-none text-[var(--text-muted)]" />
  );
}

function CloseIcon() {
  return (
    <i className="ri-close-line text-base leading-none" />
  );
}

function ChevronIcon() {
  return (
    <i className="ri-arrow-right-s-line text-[12px] leading-none text-[var(--text-muted)]" />
  );
}

function FileIcon({ ext }: { ext: string }) {
  const color = extColor(ext);
  return (
    <i className="ri-file-line text-base leading-none" />
  );
}

function BinaryIcon() {
  return (
    <i className="ri-file-text-line text-[20px] leading-none text-[var(--text-muted)] mx-auto" />
  );
}

function SymbolIcon() {
  return (
    <i className="ri-menu-line text-[12px] leading-none" />
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

const EMPTY_SET = new Set<number>();

function directoryPart(path: string): string {
  const last = path.lastIndexOf("/");
  return last > 0 ? path.slice(0, last) : "";
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function extColor(ext: string): string {
  switch (ext) {
    case "ts": case "tsx": return "text-blue-400";
    case "js": case "jsx": return "text-yellow-400";
    case "rs": return "text-orange-400";
    case "css": case "scss": return "text-pink-400";
    case "html": return "text-red-400";
    case "json": case "toml": case "yaml": case "yml": return "text-green-400";
    case "md": case "mdx": return "text-cyan-400";
    case "py": return "text-emerald-400";
    case "go": return "text-sky-400";
    case "java": case "kt": return "text-amber-400";
    case "c": case "cpp": case "h": case "hpp": return "text-violet-400";
    case "swift": return "text-orange-300";
    case "rb": return "text-red-300";
    default: return "text-[var(--text-muted)]";
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "M": return "text-yellow-400";
    case "A": case "?": return "text-green-400";
    case "D": return "text-red-400";
    default: return "text-[var(--text-muted)]";
  }
}

function basenameIndices(fullPath: string, basename: string, pathIndices: number[]): Set<number> {
  if (pathIndices.length === 0) return EMPTY_SET;
  const offset = fullPath.length - basename.length;
  const set = new Set<number>();
  for (const idx of pathIndices) {
    if (idx >= offset) set.add(idx - offset);
  }
  return set.size > 0 ? set : EMPTY_SET;
}

function dirIndices(fullPath: string, dir: string, pathIndices: number[]): Set<number> {
  if (pathIndices.length === 0) return EMPTY_SET;
  const set = new Set<number>();
  for (const idx of pathIndices) {
    if (idx < dir.length) set.add(idx);
  }
  return set.size > 0 ? set : EMPTY_SET;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
