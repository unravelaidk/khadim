import { useMemo } from "react";
import { LuChevronDown, LuChevronUp, LuPresentation } from "react-icons/lu";
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

  const hasSlides = slideData && slideData.length > 0;
  const hasHtmlContent = Boolean(content?.trim());
  const showBuildingSkeleton = isBuilding && !hasSlides;

  // Nothing to show
  if (!hasSlides && !showBuildingSkeleton && !hasHtmlContent) return null;

  return (
    <div className="sticky top-0 z-30 border-b border-[var(--glass-border)] glass-panel-strong">
      {/* Header bar */}
      <button
        onClick={onToggleMinimize}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg-strong)]"
      >
        <div className="flex items-center gap-2">
          <LuPresentation className="w-3.5 h-3.5 text-[var(--text-primary)]" />
            <span className="font-display text-xs font-semibold text-[var(--text-primary)]">{title}</span>
          {hasSlides && (
            <span className="text-[10px] text-[var(--text-muted)]">
              {slideData.length} {slideData.length === 1 ? "slide" : "slides"}
            </span>
          )}
          {!hasSlides && hasHtmlContent && (
            <span className="text-[10px] text-[var(--text-muted)]">HTML preview</span>
          )}
          {(isStreaming || isBuilding) && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--color-accent-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-primary)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
              {showBuildingSkeleton ? "Building" : isBuilding ? "Adding slides" : "Live"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isMinimized ? (
            <LuChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <LuChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </div>
      </button>

      {/* Expandable content */}
      {!isMinimized && (
        <div className="px-2 pb-2">
          {showBuildingSkeleton ? (
            <BuildingSkeleton />
          ) : hasSlides ? (
            <SlidesPreview
              slides={slideData}
              title={title}
              htmlContent={content!}
              initialTheme={theme}
              isStreaming={isStreaming || isBuilding}
              workspaceId={workspaceId}
              hideHeader={true}
            />
          ) : hasHtmlContent ? (
            <HtmlSlideFallback content={content!} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function HtmlSlideFallback({ content }: { content: string }) {
  return (
    <div className="overflow-hidden rounded-2xl glass-panel-strong">
      <div className="h-[360px] bg-black md:h-[460px] lg:h-[520px]">
        <iframe
          srcDoc={content}
          title="Slide HTML Preview"
          sandbox="allow-scripts allow-same-origin"
          className="h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}

function BuildingSkeleton() {
  return (
    <div className="flex h-[320px] gap-2 overflow-hidden rounded-2xl glass-panel-strong animate-in fade-in duration-300 md:h-[420px] lg:h-[480px]">
      {/* Fake thumbnail sidebar */}
      <div className="hidden w-44 flex-col gap-2.5 border-r border-[var(--glass-border)] bg-[var(--glass-bg)] p-2.5 md:flex">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="aspect-[16/9] w-full animate-pulse rounded-xl border border-[var(--glass-border)] bg-[var(--surface-bg-subtle)]"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
      {/* Fake slide area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
        <div className="relative">
          <LuPresentation className="w-10 h-10 text-[var(--text-muted)]" />
          <span className="absolute -bottom-1 -right-1 h-3 w-3 animate-pulse rounded-full bg-[var(--color-accent)]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Building your presentation</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Slides will appear here as the agent writes them</p>
        </div>
        {/* Shimmer bars */}
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          <div className="mx-auto h-2 w-3/4 animate-pulse rounded-full bg-[var(--surface-bg-subtle)]" />
          <div className="mx-auto h-2 w-1/2 animate-pulse rounded-full bg-[var(--glass-border)]" style={{ animationDelay: "200ms" }} />
          <div className="mx-auto h-2 w-2/3 animate-pulse rounded-full bg-[var(--glass-border)]" style={{ animationDelay: "400ms" }} />
        </div>
      </div>
    </div>
  );
}
