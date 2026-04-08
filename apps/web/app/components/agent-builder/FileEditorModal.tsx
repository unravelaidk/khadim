import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { LuX, LuDownload, LuCopy, LuCheck, LuFile, LuSave, LuFileText, LuMaximize2, LuMinimize2 } from "react-icons/lu";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";

/* ── VS Code–style theme (code files only) ─────────────────────────── */
const vscDarkPlus = {
  "pre[class*=\"language-\"]": {
    color: "#d4d4d4",
    fontSize: "13px",
    textShadow: "none",
    fontFamily: "var(--font-mono)",
    direction: "ltr",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    lineHeight: "1.6",
    MozTabSize: "4",
    OTabSize: "4",
    tabSize: "4",
    WebkitHyphens: "none",
    MozHyphens: "none",
    msHyphens: "none",
    hyphens: "none",
    padding: "1em",
    margin: ".5em 0",
    overflow: "auto",
    background: "transparent",
  },
  "code[class*=\"language-\"]": {
    color: "#d4d4d4",
    fontSize: "13px",
    textShadow: "none",
    fontFamily: "var(--font-mono)",
    direction: "ltr",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    lineHeight: "1.6",
    MozTabSize: "4",
    OTabSize: "4",
    tabSize: "4",
    WebkitHyphens: "none",
    MozHyphens: "none",
    msHyphens: "none",
    hyphens: "none",
  },
  "pre[class*=\"language-\"]::selection": { textShadow: "none", background: "#264F78" },
  "code[class*=\"language-\"]::selection": { textShadow: "none", background: "#264F78" },
  "pre[class*=\"language-\"] *::selection": { textShadow: "none", background: "#264F78" },
  "code[class*=\"language-\"] *::selection": { textShadow: "none", background: "#264F78" },
  ":not(pre) > code[class*=\"language-\"]": { padding: ".1em .3em", borderRadius: ".3em", color: "#db4c69", background: "#1e1e1e" },
  ".namespace": { Opacity: ".7" },
  "doctype.doctype-tag": { color: "#569CD6" },
  "doctype.name": { color: "#9cdcfe" },
  comment: { color: "#6a9955" },
  prolog: { color: "#6a9955" },
  punctuation: { color: "#d4d4d4" },
  ".language-html .language-css .token.punctuation": { color: "#d4d4d4" },
  ".language-html .language-javascript .token.punctuation": { color: "#d4d4d4" },
  property: { color: "#9cdcfe" },
  tag: { color: "#569cd6" },
  boolean: { color: "#569cd6" },
  number: { color: "#b5cea8" },
  constant: { color: "#9cdcfe" },
  symbol: { color: "#b5cea8" },
  inserted: { color: "#b5cea8" },
  unit: { color: "#b5cea8" },
  selector: { color: "#d7ba7d" },
  "attr-name": { color: "#9cdcfe" },
  string: { color: "#ce9178" },
  char: { color: "#ce9178" },
  builtin: { color: "#ce9178" },
  deleted: { color: "#ce9178" },
  ".language-css .token.string.url": { textDecoration: "underline" },
  operator: { color: "#d4d4d4" },
  entity: { color: "#569cd6" },
  "operator.arrow": { color: "#569CD6" },
  atrule: { color: "#ce9178" },
  "atrule.rule": { color: "#c586c0" },
  "atrule.url": { color: "#9cdcfe" },
  "atrule.url.function": { color: "#dcdcaa" },
  "atrule.url.punctuation": { color: "#d4d4d4" },
  keyword: { color: "#569CD6" },
  "keyword.module": { color: "#c586c0" },
  "keyword.control-flow": { color: "#c586c0" },
  function: { color: "#dcdcaa" },
  "function.maybe-class-name": { color: "#dcdcaa" },
  regex: { color: "#d16969" },
  important: { color: "#569cd6" },
  italic: { fontStyle: "italic" },
  "class-name": { color: "#4ec9b0" },
  "maybe-class-name": { color: "#4ec9b0" },
  console: { color: "#9cdcfe" },
  parameter: { color: "#9cdcfe" },
  interpolation: { color: "#9cdcfe" },
  "punctuation.interpolation-punctuation": { color: "#569cd6" },
  variable: { color: "#9cdcfe" },
  "imports.maybe-class-name": { color: "#9cdcfe" },
  "exports.maybe-class-name": { color: "#9cdcfe" },
  escape: { color: "#d7ba7d" },
  "tag.punctuation": { color: "#808080" },
  cdata: { color: "#808080" },
  "attr-value": { color: "#ce9178" },
  "attr-value.punctuation": { color: "#ce9178" },
  "attr-value.punctuation.attr-equals": { color: "#d4d4d4" },
  namespace: { color: "#4ec9b0" },
  "pre[class*=\"language-javascript\"]": { color: "#9cdcfe" },
  "code[class*=\"language-javascript\"]": { color: "#9cdcfe" },
  "pre[class*=\"language-jsx\"]": { color: "#9cdcfe" },
  "code[class*=\"language-jsx\"]": { color: "#9cdcfe" },
  "pre[class*=\"language-typescript\"]": { color: "#9cdcfe" },
  "code[class*=\"language-typescript\"]": { color: "#9cdcfe" },
  "pre[class*=\"language-tsx\"]": { color: "#9cdcfe" },
  "code[class*=\"language-tsx\"]": { color: "#9cdcfe" },
  "pre[class*=\"language-css\"]": { color: "#ce9178" },
  "code[class*=\"language-css\"]": { color: "#ce9178" },
  "pre[class*=\"language-html\"]": { color: "#d4d4d4" },
  "code[class*=\"language-html\"]": { color: "#d4d4d4" },
  ".language-regex .token.anchor": { color: "#dcdcaa" },
  ".language-html .token.punctuation": { color: "#808080" },
  "pre[class*=\"language-\"] > code[class*=\"language-\"]": { position: "relative", zIndex: "1" },
  ".line-highlight.line-highlight": { background: "#f7ebc6", boxShadow: "inset 5px 0 0 #f7d87c", zIndex: "0" },
};

const MarkdownEditor = lazy(() => import("../editor/MarkdownEditor"));

interface FileEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  content: string;
  editable?: boolean;
  onSave?: (content: string) => Promise<void>;
}

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    sh: "bash",
    yml: "yaml",
    yaml: "yaml",
  };
  return langMap[ext] || "text";
}

function isMarkdownFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "md" || ext === "mdx" || ext === "markdown";
}

export function FileEditorModal({
  isOpen,
  onClose,
  filename,
  content,
  editable = false,
  onSave,
}: FileEditorModalProps) {
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const language = getLanguageFromFilename(filename);
  const isMd = isMarkdownFile(filename);

  useEffect(() => {
    setDraft(content);
  }, [content, filename, isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const currentContent = editable ? draft : content;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!editable || !onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkdownChange = useCallback(
    (markdown: string) => {
      setDraft(markdown);
    },
    [],
  );

  const lines = currentContent.split("\n");

  if (!isOpen) return null;

  const sizeClasses = isFullscreen
    ? "w-full h-full max-w-none max-h-none rounded-none"
    : isMd
      ? "w-full max-w-5xl max-h-[88dvh] rounded-2xl"
      : "w-full max-w-4xl max-h-[88dvh] rounded-2xl";

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 md:p-6 animate-in fade-in duration-200">
      {/* Backdrop — darker, less transparent */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`
          relative overflow-hidden animate-in zoom-in duration-200 flex flex-col
          ${sizeClasses}
          ${isMd
            ? "bg-[var(--surface-bg)] border border-[var(--glass-border-strong)] shadow-[var(--shadow-glass-lg)]"
            : "bg-[#0f1409] border border-[var(--glass-border-strong)] shadow-[var(--shadow-glass-lg)]"
          }
        `}
      >
        {/* Top shine line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--glass-shine)] to-transparent" />

        {/* ── Header ──────────────────────────────────────────────── */}
        <div
          className={`flex items-center justify-between px-4 py-3 shrink-0 border-b ${
            isMd
              ? "border-[var(--glass-border)] bg-[var(--surface-elevated)]"
              : "border-[#1e2518] bg-[#0d1208]"
          }`}
        >
          {/* Left: file info */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                isMd
                  ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-ink)]"
                  : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {isMd ? (
                <LuFileText className="w-3.5 h-3.5" />
              ) : (
                <LuFile className="w-3.5 h-3.5" />
              )}
            </div>
            <div className="min-w-0">
              <span
                className={`block text-sm font-semibold truncate ${
                  isMd ? "text-[var(--text-primary)]" : "text-gray-100"
                }`}
              >
                {filename}
              </span>
              <span
                className={`block text-[10px] uppercase tracking-[0.14em] font-medium mt-0.5 ${
                  isMd ? "text-[var(--text-muted)]" : "text-gray-500"
                }`}
              >
                {language} · {lines.length} lines
              </span>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1">
            <HeaderButton isMd={isMd} onClick={handleCopy} title={copied ? "Copied!" : "Copy to clipboard"}>
              {copied ? (
                <LuCheck className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <LuCopy className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {copied ? "Copied" : "Copy"}
              </span>
            </HeaderButton>

            <HeaderButton isMd={isMd} onClick={handleDownload} title="Download file">
              <LuDownload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </HeaderButton>

            {editable && onSave && (
              <HeaderButton isMd={isMd} onClick={handleSave} disabled={saving} title="Save changes">
                <LuSave className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {saving ? "Saving…" : "Save"}
                </span>
              </HeaderButton>
            )}

            <div className={`mx-1 h-4 w-px ${isMd ? "bg-[var(--glass-border)]" : "bg-gray-700"}`} />

            <HeaderButton isMd={isMd} onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? (
                <LuMinimize2 className="w-3.5 h-3.5" />
              ) : (
                <LuMaximize2 className="w-3.5 h-3.5" />
              )}
            </HeaderButton>

            <button
              onClick={onClose}
              title="Close (Esc)"
              className={`p-1.5 rounded-lg transition-colors ${
                isMd
                  ? "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)]"
                  : "text-gray-500 hover:text-gray-200 hover:bg-gray-700/60"
              }`}
            >
              <LuX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {isMd ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
                    <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Loading editor…</span>
                  </div>
                </div>
              }
            >
              <MarkdownEditor
                initialContent={content}
                onChange={editable ? handleMarkdownChange : undefined}
                readOnly={!editable}
                placeholder="Start writing markdown…"
              />
            </Suspense>
          ) : (
            /* ── Code viewer ──────────────────────────────────────── */
            <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
              <div className="flex min-w-0">
                {/* Line numbers gutter */}
                <div className="flex-shrink-0 py-4 px-3 text-right bg-[#0a0e07] border-r border-[#1a2012] select-none sticky left-0 z-10">
                  {lines.map((_, i) => (
                    <div
                      key={i}
                      className="text-[11px] leading-[1.6rem] text-gray-600 font-mono tabular-nums"
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
                {/* Code content */}
                <div className="flex-1 min-w-0 px-4 py-4">
                  <div className="relative">
                    <SyntaxHighlighter
                      language={language}
                      style={vscDarkPlus as Record<string, React.CSSProperties>}
                      customStyle={{
                        margin: 0,
                        padding: 0,
                        background: "transparent",
                        fontSize: "0.8125rem",
                        lineHeight: "1.6rem",
                      }}
                      wrapLongLines
                      showLineNumbers={false}
                    >
                      {currentContent}
                    </SyntaxHighlighter>
                    {editable && (
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        spellCheck={false}
                        className="absolute inset-0 w-full h-full resize-none bg-transparent text-[0.8125rem] leading-[1.6rem] font-mono text-transparent caret-[var(--color-accent)] outline-none"
                        style={{
                          WebkitTextFillColor: "transparent",
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Header button helper ──────────────────────────────────────────── */

function HeaderButton({
  isMd,
  onClick,
  disabled,
  title,
  children,
}: {
  isMd: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold tracking-wide rounded-lg transition-all duration-150 disabled:opacity-40 ${
        isMd
          ? "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)]"
          : "text-gray-500 hover:text-gray-200 hover:bg-gray-700/60"
      }`}
    >
      {children}
    </button>
  );
}

export default FileEditorModal;
