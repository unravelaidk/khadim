import { useMemo, useState } from "react";
import { LuChevronDown, LuChevronUp, LuCode, LuEye, LuPresentation } from "react-icons/lu";
import { SlidesPreview } from "../SlidesPreview";
import {
  extractPresentationTheme,
  extractPresentationTitle,
  parseSlidesFromHtml,
} from "../SlidesPreview/utils";

interface StickySlidePreviewProps {
  content: string | null;
  isStreaming: boolean;
  isBuilding: boolean;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  workspaceId?: string | null;
}

export function StickySlidePreview({
  content,
  isStreaming,
  isBuilding,
  isMinimized,
  onToggleMinimize,
  workspaceId,
}: StickySlidePreviewProps) {
  const slideData = useMemo(() => (content ? parseSlidesFromHtml(content) : null), [content]);
  const title = useMemo(() => (content ? extractPresentationTitle(content) : "Presentation"), [content]);
  const theme = useMemo(() => (content ? extractPresentationTheme(content) : undefined), [content]);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");

  const hasSlides = slideData && slideData.length > 0;
  const showBuildingSkeleton = isBuilding && !hasSlides;

  // Nothing to show
  if (!hasSlides && !showBuildingSkeleton) return null;

  return (
    <div className="sticky top-0 z-30 border-b-2 border-black bg-white shadow-gb-sm">
      {/* Header bar */}
      <button
        onClick={onToggleMinimize}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-[#f5f5f5]"
      >
        <div className="flex items-center gap-2">
          <LuPresentation className="w-3.5 h-3.5 text-black" />
            <span className="font-display text-xs font-semibold text-black">{title}</span>
          {hasSlides && (
            <span className="text-[10px] text-black/50">
              {slideData.length} {slideData.length === 1 ? "slide" : "slides"}
            </span>
          )}
          {(isStreaming || isBuilding) && (
            <span className="inline-flex items-center gap-1 border border-black bg-[#e5ff00] px-2 py-0.5 text-[10px] font-semibold text-black">
              <span className="h-1.5 w-1.5 animate-pulse bg-black" />
              {showBuildingSkeleton ? "Building" : isBuilding ? "Adding slides" : "Live"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isMinimized && hasSlides && (
            <div
              className="flex border-2 border-black bg-white p-0.5 shadow-gb-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setViewMode("preview")}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-all ${
                  viewMode === "preview"
                    ? "bg-black text-white"
                    : "text-black/50 hover:bg-[#f5f5f5] hover:text-black"
                }`}
              >
                <LuEye className="w-3 h-3" />
                Preview
              </button>
              <button
                onClick={() => setViewMode("code")}
                className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-all ${
                  viewMode === "code"
                    ? "bg-black text-white"
                    : "text-black/50 hover:bg-[#f5f5f5] hover:text-black"
                }`}
              >
                <LuCode className="w-3 h-3" />
                Code
              </button>
            </div>
          )}
          {isMinimized ? (
            <LuChevronDown className="w-4 h-4 text-black/50" />
          ) : (
            <LuChevronUp className="w-4 h-4 text-black/50" />
          )}
        </div>
      </button>

      {/* Expandable content */}
      {!isMinimized && (
        <div className="px-2 pb-2">
          {showBuildingSkeleton ? (
            <BuildingSkeleton />
          ) : hasSlides && viewMode === "preview" ? (
            <SlidesPreview
              slides={slideData}
              title={title}
              htmlContent={content!}
              initialTheme={theme}
              isStreaming={isStreaming || isBuilding}
              workspaceId={workspaceId}
            />
          ) : content ? (
            <SlideCodeView content={content} isStreaming={isStreaming || isBuilding} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function BuildingSkeleton() {
  return (
    <div className="flex h-[320px] gap-2 overflow-hidden border-2 border-black bg-white animate-in fade-in duration-300 md:h-[420px] lg:h-[480px]">
      {/* Fake thumbnail sidebar */}
      <div className="hidden w-44 flex-col gap-2.5 border-r-2 border-black bg-[#fafafa] p-2.5 md:flex">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-[16/9] w-full animate-pulse border-2 border-black bg-black/10"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      {/* Fake slide area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        <div className="relative">
          <LuPresentation className="w-10 h-10 text-black/30" />
          <span className="absolute -bottom-1 -right-1 h-3 w-3 animate-pulse bg-[#e5ff00]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-black">Building your presentation</p>
          <p className="mt-1 text-xs text-black/50">Slides will appear here as the agent writes them</p>
        </div>
        {/* Shimmer bars */}
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          <div className="mx-auto h-2 w-3/4 animate-pulse bg-black/15" />
          <div className="mx-auto h-2 w-1/2 animate-pulse bg-black/10" style={{ animationDelay: "200ms" }} />
          <div className="mx-auto h-2 w-2/3 animate-pulse bg-black/10" style={{ animationDelay: "400ms" }} />
        </div>
      </div>
    </div>
  );
}

function SlideCodeView({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  const lines = content.split("\n");

  return (
    <div className="relative max-h-80 overflow-auto border-2 border-black bg-[#0d1117]">
      {isStreaming && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/5 bg-[#0d1117]/95 px-4 py-2">
          <span className="h-2 w-2 animate-pulse bg-[#e5ff00]" />
          <span className="text-[11px] font-medium text-white/70">
            Writing slides...
          </span>
        </div>
      )}
      <div className="flex text-[11px] leading-5 font-mono">
        {/* Line numbers */}
        <div
          className="sticky left-0 select-none border-r border-white/5 bg-[#0d1117] px-3 py-3 text-right text-white/20"
          aria-hidden
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        {/* Code */}
        <pre className="flex-1 overflow-x-auto px-4 py-3 text-gray-300 whitespace-pre">
          {content}
        </pre>
      </div>
    </div>
  );
}
