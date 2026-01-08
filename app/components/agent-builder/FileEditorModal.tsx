import { useState } from "react";
import { LuX, LuDownload, LuCopy, LuCheck, LuFile } from "react-icons/lu";

interface FileEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  filename: string;
  content: string;
}

// Simple language detection for syntax highlighting classes
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

export function FileEditorModal({ isOpen, onClose, filename, content }: FileEditorModalProps) {
  const [copied, setCopied] = useState(false);
  const language = getLanguageFromFilename(filename);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lines = content.split('\n');

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
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
            >
              <LuX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="overflow-auto max-h-[calc(80vh-60px)]">
          <div className="flex min-w-full">
            {/* Line Numbers */}
            <div className="flex-shrink-0 py-4 px-3 text-right bg-[#1e1e1e] border-r border-gray-800 select-none">
              {lines.map((_, i) => (
                <div key={i} className="text-xs leading-6 text-gray-600 font-mono">
                  {i + 1}
                </div>
              ))}
            </div>
            
            {/* Code */}
            <div className="flex-1 py-4 px-4 overflow-x-auto">
              <pre className="text-sm leading-6 font-mono text-gray-300">
                {lines.map((line, i) => (
                  <div key={i} className="hover:bg-gray-800/50">
                    {line || ' '}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FileEditorModal;
