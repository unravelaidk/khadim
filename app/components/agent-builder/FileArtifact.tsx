import { useState, useEffect, useMemo } from "react";
import { LuDownload, LuExternalLink, LuCode, LuChevronDown, LuChevronRight, LuMaximize2, LuMinimize2, LuLoader, LuPresentation } from "react-icons/lu";
import { SlidesPreview } from "../SlidesPreview";
import type { SlideData } from "../../types/slides";

interface FileArtifactProps {
  filename?: string;
  content: string;
  previewUrl?: string;
}

// Parse slide data from HTML content
function parseSlideData(htmlContent: string): SlideData[] | null {
  try {
    // Look for the slide-data script tag
    const match = htmlContent.match(/<script id="slide-data"[^>]*>([\s\S]*?)<\/script>/);
    if (match && match[1]) {
      const jsonStr = match[1].trim();
      const slides = JSON.parse(jsonStr);
      if (Array.isArray(slides) && slides.length > 0 && slides[0].type) {
        return slides;
      }
    }
  } catch {
    // Not valid slide data
  }
  return null;
}

// Extract presentation title from HTML
function extractPresentationTitle(htmlContent: string): string {
  const match = htmlContent.match(/<title>([^<]*)<\/title>/);
  return match?.[1] || "Presentation";
}

export function FileArtifact({ filename = "index.html", content, previewUrl }: FileArtifactProps) {
  const [showCode, setShowCode] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Detect if content contains slide data
  const slideData = useMemo(() => parseSlideData(content), [content]);
  const isSlidePresentation = slideData !== null;
  const presentationTitle = useMemo(() => extractPresentationTitle(content), [content]);

  // Reset loading when URL changes
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

  // Render native SlidesPreview for slide presentations
  if (isSlidePresentation && slideData) {
    return (
      <div className="my-3">
        <SlidesPreview
          slides={slideData}
          title={presentationTitle}
          htmlContent={content}
        />
      </div>
    );
  }

  return (
    <div className="my-3 border border-gb-border rounded-lg overflow-hidden bg-gb-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gb-bg-subtle border-b border-gb-border">
        <div className="flex items-center gap-2">
          <LuCode className="w-4 h-4 text-gb-accent" />
          <span className="text-sm font-medium text-gb-text">{filename}</span>
        </div>
        <div className="flex items-center gap-2">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gb-accent hover:bg-gb-accent/10 rounded transition-colors"
            >
              <LuExternalLink className="w-3.5 h-3.5" />
              Open
            </a>
          )}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gb-text-secondary hover:bg-gb-border/50 rounded transition-colors"
          >
            <LuDownload className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Iframe Preview */}
      {previewUrl && (
        <div className="border-b border-gb-border">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800">
            <span className="text-xs text-gb-text-muted truncate flex-1">
              {previewUrl === "loading" ? "Restoring preview..." : previewUrl}
            </span>
            {previewUrl !== "loading" && (
              <button 
                onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                className="p-1 hover:bg-gb-border/50 rounded"
              >
                {isPreviewExpanded ? (
                  <LuMinimize2 className="w-3.5 h-3.5 text-gb-text-muted" />
                ) : (
                  <LuMaximize2 className="w-3.5 h-3.5 text-gb-text-muted" />
                )}
              </button>
            )}
          </div>
          {isPreviewExpanded && (
            <div className="relative bg-white" style={{ height: '300px' }}>
              {(isLoading || previewUrl === "loading") && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gb-text-muted z-10">
                  <div className="flex flex-col items-center gap-2">
                    <LuLoader className="w-6 h-6 animate-spin text-gb-accent" />
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
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gb-text-muted hover:bg-gb-bg-subtle transition-colors"
      >
        {showCode ? <LuChevronDown className="w-3.5 h-3.5" /> : <LuChevronRight className="w-3.5 h-3.5" />}
        {showCode ? "Hide code" : "Show code"}
      </button>

      {/* Code Preview */}
      {showCode && (
        <div className="px-3 py-2 max-h-64 overflow-auto bg-gray-900">
          <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
            {content.slice(0, 5000)}{content.length > 5000 ? "\n\n... (truncated)" : ""}
          </pre>
        </div>
      )}
    </div>
  );
}
