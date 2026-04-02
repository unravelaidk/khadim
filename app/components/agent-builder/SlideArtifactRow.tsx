import { useMemo, useState } from "react";
import { LuChevronDown, LuChevronUp, LuPresentation } from "react-icons/lu";
import KhadimLogo from "../../assets/Khadim-logo.svg";
import { SlidesPreview } from "../SlidesPreview";
import {
  extractPresentationTheme,
  extractPresentationTitle,
  parseSlidesFromHtml,
} from "../SlidesPreview/utils";
import type { Message } from "../../types/chat";

interface SlideArtifactRowProps {
  message: Message;
  workspaceId?: string | null;
  selected?: boolean;
  onSelect?: () => void;
}

export function SlideArtifactRow({ message, workspaceId, selected = false, onSelect }: SlideArtifactRowProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const htmlContent = message.fileContent || "";
  const slideData = useMemo(() => parseSlidesFromHtml(htmlContent), [htmlContent]);
  const title = useMemo(() => extractPresentationTitle(htmlContent), [htmlContent]);
  const theme = useMemo(() => extractPresentationTheme(htmlContent), [htmlContent]);
  const timestamp = message.timestamp instanceof Date
    ? message.timestamp
    : new Date(message.timestamp);
  const timeLabel = Number.isNaN(timestamp.getTime())
    ? ""
    : timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isStreaming = (message.thinkingSteps || []).some((step) => step.status === "running");

  if (!slideData || slideData.length === 0) {
    return null;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex gap-2.5 duration-300 md:gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg md:h-8 md:w-8 overflow-hidden">
        <div className="h-full w-full [&>svg]:w-full [&>svg]:h-full">
          <KhadimLogo />
        </div>
      </div>

      <div className="flex min-w-0 w-full max-w-[92%] flex-col items-start md:max-w-[88%]">
        <span className="mb-1 flex items-center gap-1 px-1 text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] md:text-[10px]">
          Khadim
          {timeLabel && <span style={{ opacity: 0.7 }}>{timeLabel}</span>}
        </span>

        <div className={`w-full overflow-hidden rounded-2xl border bg-[var(--surface-bg)] shadow-[var(--shadow-glass-sm)] transition-colors ${selected ? "border-[var(--color-accent)]" : "border-[var(--glass-border)]"}`}>
          <button
            onClick={() => {
              onSelect?.();
              setIsExpanded((prev) => !prev);
            }}
            className="flex w-full items-center justify-between gap-3 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]/70 px-4 py-3 text-left transition-colors hover:bg-[var(--glass-bg-strong)]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#10150a] text-[var(--text-inverse)]">
                <LuPresentation className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                  <span>{slideData.length} {slideData.length === 1 ? "slide" : "slides"}</span>
                  {theme && <span className="uppercase tracking-[0.14em]">{theme}</span>}
                  {selected && <span className="uppercase tracking-[0.14em] text-[var(--color-accent)]">Active</span>}
                  {isStreaming && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--color-accent-subtle)] px-2 py-0.5 font-semibold text-[var(--text-primary)]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
                      Updating
                    </span>
                  )}
                </div>
              </div>
            </div>
            {isExpanded ? (
              <LuChevronUp className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            ) : (
              <LuChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
            )}
          </button>

          {isExpanded && (
            <div className="p-2">
              <SlidesPreview
                slides={slideData}
                title={title}
                htmlContent={htmlContent}
                initialTheme={theme}
                isStreaming={isStreaming}
                workspaceId={workspaceId}
                hideHeader={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
