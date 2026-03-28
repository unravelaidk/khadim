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
    <div className="flex items-center justify-between border-b-2 border-black bg-white px-4 py-3">
      {/* Title Section */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center border-2 border-black bg-white shadow-gb-sm">
          <LuPresentation className="h-4.5 w-4.5 text-black" />
        </div>
        <div>
          <h3 className="leading-tight text-sm font-semibold text-black">{title}</h3>
          <div className="flex items-center gap-2 text-xs text-black/50">
            <span>{slideCount} {slideCount === 1 ? 'slide' : 'slides'}</span>
            {isStreaming && (
              <span className="inline-flex items-center gap-1 border border-black bg-[#e5ff00] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black">
                <span className="h-1.5 w-1.5 animate-pulse bg-black" />
                {statusLabel || 'Updating'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {/* View Toggle */}
        <div className="flex border-2 border-black bg-white p-0.5 shadow-gb-sm">
          <button
            onClick={() => onViewModeChange('preview')}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium 
              transition-all duration-150
              ${viewMode === 'preview' 
                ? 'bg-black text-white' 
                : 'text-black/50 hover:bg-[#f5f5f5] hover:text-black'
              }
            `}
          >
            <LuEye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <button
            onClick={() => onViewModeChange('code')}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium 
              transition-all duration-150
              ${viewMode === 'code' 
                ? 'bg-black text-white' 
                : 'text-black/50 hover:bg-[#f5f5f5] hover:text-black'
              }
            `}
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
            className="
              flex items-center gap-1.5 border-2 border-black bg-white px-3 py-1.5 text-xs font-medium 
              text-black/70 hover:bg-[#f5f5f5] hover:text-black
              disabled:opacity-50 transition-all duration-150 shadow-gb-sm
            "
          >
            <LuDownload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isDownloading ? 'Exporting...' : 'Export'}
            </span>
            <LuChevronDown className="w-3 h-3 opacity-60" />
          </button>
          
          {showExportMenu && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowExportMenu(false)} 
              />
              
              {/* Menu */}
              <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden border-2 border-black bg-white shadow-gb-md animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-1">
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      onExportPdf();
                    }}
                    disabled={isDownloading || !hasRichHtml}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#f5f5f5] disabled:opacity-50"
                  >
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-black">PDF Export</div>
                      <div className="mt-0.5 text-[10px] text-black/50">
                        Preserves all CSS styling
                      </div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      onExportPptx();
                    }}
                    disabled={isDownloading || !hasRichHtml}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#f5f5f5] disabled:opacity-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-black">
                        PPTX Export
                        <span className="border border-black bg-[#e5ff00] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-black">
                          BETA
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-black/50">
                        Native editable PowerPoint
                      </div>
                    </div>
                  </button>

                  {onSavePdfToWorkspace && (
                    <button
                      onClick={() => {
                        setShowExportMenu(false);
                        onSavePdfToWorkspace();
                      }}
                      disabled={isDownloading || !hasRichHtml}
                      className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#f5f5f5] disabled:opacity-50"
                    >
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-black">Save PDF to workspace</div>
                        <div className="mt-0.5 text-[10px] text-black/50">
                          Stores the exported PDF with workspace files
                        </div>
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
          className="
            flex h-8 w-8 items-center justify-center border-2 border-black bg-white text-xs 
            text-black/70 hover:bg-[#f5f5f5] hover:text-black
            transition-all duration-150 shadow-gb-sm
          "
          title="Present fullscreen (ESC to exit)"
        >
          <LuMaximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
