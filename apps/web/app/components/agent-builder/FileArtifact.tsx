import { useState, useEffect, useMemo } from "react";
import { LuDownload, LuExternalLink, LuCode, LuChevronDown, LuChevronRight, LuMaximize2, LuMinimize2, LuLoader } from "react-icons/lu";
import { SlidesPreview } from "../SlidesPreview";
import { extractPresentationTheme, extractPresentationTitle, parseSlidesFromHtml } from "../SlidesPreview/utils";

interface FileArtifactProps {
  filename?: string;
  content: string;
  previewUrl?: string;
  isStreaming?: boolean;
  workspaceId?: string | null;
}

export function FileArtifact({ filename = "index.html", content, previewUrl, isStreaming = false, workspaceId }: FileArtifactProps) {
  const [showCode, setShowCode] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const slideData = useMemo(() => parseSlidesFromHtml(content), [content]);
  const isSlidePresentation = slideData !== null;
  const presentationTitle = useMemo(() => extractPresentationTitle(content), [content]);
  const presentationTheme = useMemo(() => extractPresentationTheme(content), [content]);

  useEffect(() => {
    if (previewUrl) setIsLoading(true);
  }, [previewUrl]);

  const handleDownload = () => {
    const ext = filename.split('.').pop()?.toLowerCase() || 'txt';
    const mimeTypes: Record<string, string> = {
      html: 'text/html',
      css: 'text/css',
      js: 'application/javascript',
      json: 'application/json',
      txt: 'text/plain',
    };
    const mimeType = mimeTypes[ext] || 'text/plain';
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isSlidePresentation && slideData) {
    return (
      <div className="my-3">
        <SlidesPreview
          slides={slideData}
          title={presentationTitle}
          htmlContent={content}
          initialTheme={presentationTheme}
          isStreaming={isStreaming}
          workspaceId={workspaceId}
        />
      </div>
    );
  }

  return (
    <div className="my-3 rounded-2xl glass-card-static overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-[#10150a]">
            <LuCode className="w-3 h-3 text-[var(--text-inverse)]" />
          </div>
          <span className="text-sm font-medium text-[var(--text-primary)]">{filename}</span>
        </div>
        <div className="flex items-center gap-2">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)] transition-all hover:bg-[#1c2214]"
            >
              <LuExternalLink className="w-3.5 h-3.5" />
              Open
            </a>
          )}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full btn-glass transition-colors"
          >
            <LuDownload className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Iframe Preview */}
      {previewUrl && (
        <div className="border-b border-[var(--glass-border)]">
          <div className="flex items-center justify-between px-4 py-1.5 bg-[var(--glass-bg)]">
            <span className="text-xs text-[var(--text-muted)] truncate flex-1">
              {previewUrl === "loading" ? "Restoring preview..." : previewUrl}
            </span>
            {previewUrl !== "loading" && (
              <button 
                onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                className="p-1 hover:bg-[var(--glass-bg-strong)] rounded-lg transition-colors"
              >
                {isPreviewExpanded ? (
                  <LuMinimize2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                ) : (
                  <LuMaximize2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                )}
              </button>
            )}
          </div>
          {isPreviewExpanded && (
            <div className="relative bg-white" style={{ height: '300px' }}>
              {(isLoading || previewUrl === "loading") && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-elevated)] text-[var(--text-muted)] z-10">
                  <div className="flex flex-col items-center gap-2">
                    <LuLoader className="w-6 h-6 animate-spin text-[#10150a]" />
                    <span className="text-xs font-medium">
                      {previewUrl === "loading" ? "Restoring sandbox environment..." : "Loading preview..."}
                    </span>
                  </div>
                </div>
              )}
              {previewUrl !== "loading" && (
                <iframe
                  src={previewUrl}
                  title={`Preview of ${filename}`}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  onLoad={() => setIsLoading(false)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Code Toggle */}
      <button
        onClick={() => setShowCode(!showCode)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--glass-bg)] transition-colors"
      >
        {showCode ? <LuChevronDown className="w-3.5 h-3.5" /> : <LuChevronRight className="w-3.5 h-3.5" />}
        {showCode ? "Hide code" : "Show code"}
      </button>

      {/* Code Preview */}
      {showCode && (
        <div className="px-4 py-3 max-h-64 overflow-auto bg-[#0f1409]">
          <pre className="text-xs text-[#e4ebd6] font-mono whitespace-pre-wrap break-all">
            {content.slice(0, 5000)}{content.length > 5000 ? "\n\n... (truncated)" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}
