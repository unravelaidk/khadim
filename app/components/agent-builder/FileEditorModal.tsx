import { useState } from "react";
import { LuX, LuDownload, LuCopy, LuCheck, LuFile, LuSave } from "react-icons/lu";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

interface FileEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  content: string;
  editable?: boolean;
  onSave?: (content: string) => Promise<void>;
}

function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    py: 'python',
  };
  return langMap[ext] || 'text';
}

export function FileEditorModal({ isOpen, onClose, filename, content, editable = false, onSave }: FileEditorModalProps) {
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const language = getLanguageFromFilename(filename);

  if (!isOpen) return null;

  const currentContent = editable ? draft : content;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([currentContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
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

  const lines = currentContent.split('\n');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[80vh] bg-[#1e1e1e] rounded-xl shadow-2xl border border-gray-700 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-gray-700">
          <div className="flex items-center gap-3">
            <LuFile className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-gray-200">{filename}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400 font-mono">
              {language}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
            >
              {copied ? <LuCheck className="w-3.5 h-3.5 text-green-400" /> : <LuCopy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
            >
              <LuDownload className="w-3.5 h-3.5" />
              Download
            </button>
            {editable && onSave && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
              >
                <LuSave className="w-3.5 h-3.5" />
                {saving ? "Saving..." : "Save"}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
            >
              <LuX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="scrollbar-hide overflow-auto max-h-[calc(80vh-60px)]">
          <div className="grid min-w-full grid-cols-1">
            <div className="flex min-w-0">
              <div className="flex-shrink-0 py-4 px-3 text-right bg-[#1e1e1e] border-r border-gray-800 select-none">
                {lines.map((_, i) => (
                  <div key={i} className="text-xs leading-6 text-gray-600 font-mono">
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
      </div>
    </div>
  );
}

export default FileEditorModal;
