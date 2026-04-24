import React, { useEffect, useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight, oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { commands, type FilePreview } from "../../lib/bindings";

/* ═══════════════════════════════════════════════════════════════════════
   FilePreviewCard — expandable, syntax-highlighted file preview.
   Used inside the Log view to inline files referenced by an event.
   Lazy: content loads on first expand. Binary files short-circuit.
   ═══════════════════════════════════════════════════════════════════════ */

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/* ── Language map — keyed by file extension (lowercase, no dot) ─────── */
const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript", tsx: "tsx", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  py: "python", pyi: "python",
  rs: "rust",
  go: "go",
  rb: "ruby",
  java: "java", kt: "kotlin", kts: "kotlin", scala: "scala",
  c: "c", h: "c",
  cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hxx: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  html: "markup", htm: "markup", xml: "markup", svg: "markup",
  css: "css", scss: "scss", sass: "sass", less: "less",
  json: "json", jsonc: "json",
  yaml: "yaml", yml: "yaml",
  toml: "toml", ini: "ini", conf: "ini",
  md: "markdown", mdx: "markdown",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash", ksh: "bash",
  sql: "sql",
  graphql: "graphql", gql: "graphql",
  lua: "lua",
  hs: "haskell",
  ex: "elixir", exs: "elixir",
  erl: "erlang",
  elm: "elm",
  vue: "markup",
  svelte: "markup",
  dockerfile: "docker",
  makefile: "makefile",
  nix: "nix",
  tf: "hcl", hcl: "hcl",
  proto: "protobuf",
};

function languageFor(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === "dockerfile" || lower.endsWith(".dockerfile")) return "docker";
  if (lower === "makefile") return "makefile";
  const ext = lower.split(".").pop() ?? "";
  return LANGUAGE_BY_EXT[ext] ?? "text";
}

/* ── Theme watcher ─ lightweight, no context required ────────────── */
function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(() => readIsDark());
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(readIsDark()));
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme-variant"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function readIsDark(): boolean {
  if (typeof document === "undefined") return false;
  const v = document.documentElement.getAttribute("data-theme-variant");
  return v === "dark" || v === "mocha" || v === "macchiato" || v === "frappe";
}

/* ── Load state ──────────────────────────────────────────────────── */
type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; preview: FilePreview };

interface FilePreviewCardProps {
  path: string;
  /** Optional label shown in the header. Defaults to the basename. */
  label?: string;
  /** Start expanded. Default false so log rows stay dense. */
  initiallyExpanded?: boolean;
  /** Max bytes to read. Default 200KB. */
  maxBytes?: number;
  /** Absolute root directory used to resolve `path` when it is relative. */
  root?: string | null;
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p);
}

export function FilePreviewCard({
  path,
  label,
  initiallyExpanded = false,
  maxBytes = 200_000,
  root,
}: FilePreviewCardProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const isDark = useIsDarkTheme();

  const displayName = label ?? basename(path);
  const language = useMemo(() => languageFor(basename(path)), [path]);

  useEffect(() => {
    if (!expanded || state.kind !== "idle") return;
    setState({ kind: "loading" });
    let alive = true;

    let resolvedRoot: string;
    let resolvedRelative: string;
    if (root && !isAbsolutePath(path)) {
      resolvedRoot = root;
      resolvedRelative = path.replace(/^[/\\]+/, "");
    } else {
      const parts = path.split(/[/\\]/);
      const name = parts.pop() ?? "file";
      resolvedRoot = parts.join("/") || "/";
      resolvedRelative = name;
    }

    commands
      .fileReadPreview(resolvedRoot, resolvedRelative, maxBytes)
      .then((preview) => {
        if (alive) setState({ kind: "ready", preview });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      alive = false;
    };
  }, [expanded, state.kind, path, maxBytes, root]);

  const isTruncated =
    state.kind === "ready" &&
    !state.preview.is_binary &&
    state.preview.size_bytes > maxBytes;

  return (
    <div className="depth-inset mt-2 overflow-hidden rounded-[var(--radius-sm)]">
      {/* ── Header ─ filename · language · size · lines · chevron ──── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--glass-bg)]/50"
      >
        <i className="ri-file-text-line text-[13px] leading-none text-[var(--text-muted)]" />
        <span className="truncate font-mono text-[11px] font-medium text-[var(--text-primary)]">
          {displayName}
        </span>
        {language !== "text" && (
          <span
            className="shrink-0 rounded-full px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-primary)]"
            style={{ background: "var(--tint-sky)" }}
          >
            {language}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
          {state.kind === "ready" && !state.preview.is_binary && (
            <>
              <span>{state.preview.line_count} lines</span>
              <span className="opacity-40">·</span>
              <span>{fmtBytes(state.preview.size_bytes)}</span>
            </>
          )}
          {state.kind === "ready" && state.preview.is_binary && (
            <span>{fmtBytes(state.preview.size_bytes)}</span>
          )}
        </span>
        <i
          className={`ri-arrow-down-s-line text-base leading-none text-[var(--text-muted)] transition-transform ${
            expanded ? "" : "-rotate-90"
          }`}
        />
      </button>

      {/* ── Body ─ lazy, syntax-highlighted ──────────────────────── */}
      {expanded && (
        <div className="border-t border-[var(--glass-border)]">
          {state.kind === "loading" && (
            <div className="flex items-center gap-2 px-3 py-3">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] status-pulse" />
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                loading…
              </span>
            </div>
          )}

          {state.kind === "error" && (
            <div className="px-3 py-3">
              <p className="text-[11px] font-medium text-[var(--color-danger-text)]">
                Could not read file
              </p>
              <p
                className="mt-0.5 break-words font-mono text-[10px] text-[var(--text-muted)]"
                title={state.message}
              >
                {state.message}
              </p>
            </div>
          )}

          {state.kind === "ready" && state.preview.is_binary && (
            <p className="px-3 py-3 font-mono text-[11px] text-[var(--text-muted)]">
              Binary file — no preview available.
            </p>
          )}

          {state.kind === "ready" && !state.preview.is_binary && (
            <>
              <SyntaxHighlighter
                style={(isDark ? oneDark : oneLight) as { [key: string]: React.CSSProperties }}
                language={language}
                customStyle={{
                  margin: 0,
                  padding: "10px 14px",
                  fontSize: "11px",
                  lineHeight: "1.55",
                  background: "transparent",
                  maxHeight: "360px",
                  overflow: "auto",
                }}
                codeTagProps={{
                  style: {
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  },
                }}
                PreTag="div"
                showLineNumbers
                lineNumberStyle={{
                  minWidth: "2em",
                  paddingRight: "12px",
                  opacity: 0.35,
                  userSelect: "none",
                }}
                wrapLongLines={false}
              >
                {state.preview.content}
              </SyntaxHighlighter>
              {isTruncated && (
                <p className="border-t border-[var(--glass-border)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  truncated · showing {fmtBytes(maxBytes)} of {fmtBytes(state.preview.size_bytes)}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
