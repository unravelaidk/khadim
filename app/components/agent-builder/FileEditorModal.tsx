import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { LuX, LuDownload, LuCopy, LuCheck, LuFile, LuSave, LuFileText } from "react-icons/lu";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";

const vscDarkPlus = {
  "pre[class*=\"language-\"]": {
    color: "#d4d4d4",
    fontSize: "13px",
    textShadow: "none",
    fontFamily: "Menlo, Monaco, Consolas, \"Andale Mono\", \"Ubuntu Mono\", \"Courier New\", monospace",
    direction: "ltr",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    lineHeight: "1.5",
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
    background: "#1e1e1e",
  },
  "code[class*=\"language-\"]": {
    color: "#d4d4d4",
    fontSize: "13px",
    textShadow: "none",
    fontFamily: "Menlo, Monaco, Consolas, \"Andale Mono\", \"Ubuntu Mono\", \"Courier New\", monospace",
    direction: "ltr",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    lineHeight: "1.5",
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
  const language = getLanguageFromFilename(filename);
  const isMd = isMarkdownFile(filename);

  useEffect(() => {
    setDraft(content);
  }, [content, filename, isOpen]);

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
    []
  );

  const lines = currentContent.split("\n");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-h-[90vh] overflow-hidden animate-in zoom-in duration-200 flex flex-col ${
          isMd
            ? "max-w-5xl rounded-2xl glass-panel-strong border border-[var(--glass-border-strong)] shadow-[var(--shadow-glass-lg)]"
            : "max-w-4xl bg-[#1e1e1e] rounded-xl shadow-2xl border border-gray-700"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 shrink-0 ${
            isMd
              ? "border-b border-[var(--glass-border)] bg-[var(--surface-secondary)]"
              : "bg-[#252526] border-b border-gray-700"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {isMd ? (
              <LuFileText className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
            ) : (
              <LuFile className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span
              className={`text-sm font-medium truncate ${
                isMd ? "text-[var(--text-primary)]" : "text-gray-200"
              }`}
            >
              {filename}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded font-mono shrink-0 ${
                isMd
                  ? "bg-[var(--surface-secondary)] text-[var(--text-muted)] border border-[var(--glass-border)]"
                  : "bg-gray-700 text-gray-400"
              }`}
            >
              {language}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <HeaderButton isMd={isMd} onClick={handleCopy}>
              {copied ? (
                <LuCheck className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <LuCopy className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {copied ? "Copied" : "Copy"}
              </span>
            </HeaderButton>

            <HeaderButton isMd={isMd} onClick={handleDownload}>
              <LuDownload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </HeaderButton>

            {editable && onSave && (
              <HeaderButton isMd={isMd} onClick={handleSave} disabled={saving}>
                <LuSave className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {saving ? "Saving…" : "Save"}
                </span>
              </HeaderButton>
            )}

            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                isMd
                  ? "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)]"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
              }`}
            >
              <LuX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isMd ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64">
                  <div className="w-5 h-5 rounded-full border-2 border-[var(--text-primary)] border-t-transparent animate-spin" />
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
            /* Code editor — unchanged */
            <div className="scrollbar-hide overflow-auto max-h-[calc(90vh-56px)]">
              <div className="grid min-w-full grid-cols-1">
                <div className="flex min-w-0">
                  <div className="flex-shrink-0 py-4 px-3 text-right bg-[#1e1e1e] border-r border-gray-800 select-none">
                    {lines.map((_, i) => (
                      <div
                        key={i}
                        className="text-xs leading-6 text-gray-600 font-mono"
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  <div className="scrollbar-hide flex-1 overflow-x-hidden px-4 py-4">
                    <div className="relative min-h-[60vh]">
                      <SyntaxHighlighter
                        language={language}
                        style={vscDarkPlus as Record<string, React.CSSProperties>}
                        customStyle={{
                          margin: 0,
                          padding: 0,
                          background: "transparent",
                          fontSize: "0.875rem",
                          lineHeight: "1.5rem",
                          minHeight: "60vh",
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
                          className="scrollbar-hide absolute inset-0 min-h-[60vh] w-full resize-none overflow-x-hidden bg-transparent text-sm leading-6 font-mono text-transparent caret-white outline-none"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Header button helper ──────────────────────────────────────────── */

function HeaderButton({
  isMd,
  onClick,
  disabled,
  children,
}: {
  isMd: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
        isMd
          ? "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)]"
          : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

export default FileEditorModal;
