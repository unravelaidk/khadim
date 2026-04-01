import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { LuX, LuDownload, LuCopy, LuCheck, LuFile, LuSave, LuFileText } from "react-icons/lu";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

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
                        style={vscDarkPlus}
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
