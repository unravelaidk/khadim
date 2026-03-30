import { useState } from 'react';
import { 
  LuPresentation, 
  LuEye, 
  LuCode, 
  LuDownload, 
  LuMaximize2,
  LuChevronDown
} from 'react-icons/lu';
import type { SlideTheme } from '../../types/slides';

interface SlideToolbarProps {
  title: string;
  slideCount: number;
  theme: SlideTheme;
  viewMode: 'preview' | 'code';
  isDownloading: boolean;
  isStreaming?: boolean;
  recentUpdate?: string;
  statusLabel?: string;
  hasRichHtml: boolean;
  onViewModeChange: (mode: 'preview' | 'code') => void;
  onFullscreen: () => void;
  onExportPdf: () => void;
  onExportPptx: () => void;
  onSavePdfToWorkspace?: () => void;
}

export function SlideToolbar({
  title,
  slideCount,
  theme,
  viewMode,
  isDownloading,
  isStreaming = false,
  recentUpdate,
  statusLabel,
  hasRichHtml,
  onViewModeChange,
  onFullscreen,
  onExportPdf,
  onExportPptx,
  onSavePdfToWorkspace,
}: SlideToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-4 py-3">
      {/* Title Section */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#10150a] shadow-[var(--shadow-glass-sm)]">
          <LuPresentation className="h-4 w-4 text-[var(--text-inverse)]" />
        </div>
        <div>
          <h3 className="leading-tight text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>{slideCount} {slideCount === 1 ? 'slide' : 'slides'}</span>
            {isStreaming && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#10150a] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-inverse)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-inverse)]" />
                {statusLabel || 'Updating'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {/* View Toggle */}
        <div className="flex rounded-xl glass-panel p-0.5">
          <button
            onClick={() => onViewModeChange('preview')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
              viewMode === 'preview' 
                ? 'bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)]' 
                : 'text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]'
            }`}
          >
            <LuEye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <button
            onClick={() => onViewModeChange('code')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
              viewMode === 'code' 
                ? 'bg-[#10150a] text-[var(--text-inverse)] shadow-[var(--shadow-glass-sm)]' 
                : 'text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]'
            }`}
          >
            <LuCode className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Code</span>
          </button>
        </div>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={isDownloading}
            className="flex items-center gap-1.5 rounded-xl btn-glass px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-all duration-150"
          >
            <LuDownload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isDownloading ? 'Exporting...' : 'Export'}
            </span>
            <LuChevronDown className="w-3 h-3 opacity-60" />
          </button>
          
          {showExportMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl glass-panel-strong shadow-[var(--shadow-glass-lg)] animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-1.5">
                  <button
                    onClick={() => { setShowExportMenu(false); onExportPdf(); }}
                    disabled={isDownloading || !hasRichHtml}
                    className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
                  >
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">PDF Export</div>
                      <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">Preserves all CSS styling</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowExportMenu(false); onExportPptx(); }}
                    disabled={isDownloading || !hasRichHtml}
                    className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                        PPTX Export
                        <span className="rounded-full bg-[#10150a] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-[var(--text-inverse)]">BETA</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">Native editable PowerPoint</div>
                    </div>
                  </button>
                  {onSavePdfToWorkspace && (
                    <button
                      onClick={() => { setShowExportMenu(false); onSavePdfToWorkspace(); }}
                      disabled={isDownloading || !hasRichHtml}
                      className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
                    >
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-[var(--text-primary)]">Save PDF to workspace</div>
                        <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">Stores the exported PDF with workspace files</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Fullscreen Button */}
        <button
          onClick={onFullscreen}
          className="flex h-8 w-8 items-center justify-center rounded-xl btn-glass transition-all duration-150"
          title="Present fullscreen (ESC to exit)"
        >
          <LuMaximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
