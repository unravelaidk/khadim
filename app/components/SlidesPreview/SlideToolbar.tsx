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
  hasRichHtml: boolean;
  onViewModeChange: (mode: 'preview' | 'code') => void;
  onFullscreen: () => void;
  onExportPdf: () => void;
  onExportPptx: () => void;
}

export function SlideToolbar({
  title,
  slideCount,
  theme,
  viewMode,
  isDownloading,
  hasRichHtml,
  onViewModeChange,
  onFullscreen,
  onExportPdf,
  onExportPptx,
}: SlideToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gb-bg-subtle to-gb-bg border-b border-gb-border">
      {/* Title Section */}
      <div className="flex items-center gap-3">
        <div 
          className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm transition-transform hover:scale-105"
          style={{ 
            background: `linear-gradient(135deg, ${theme.accentColor}20 0%, ${theme.accentColor}10 100%)`,
            border: `1px solid ${theme.accentColor}30`
          }}
        >
          <LuPresentation 
            className="w-4.5 h-4.5" 
            style={{ color: theme.accentColor }}
          />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gb-text leading-tight">{title}</h3>
          <span className="text-xs text-gb-text-muted">
            {slideCount} {slideCount === 1 ? 'slide' : 'slides'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {/* View Toggle */}
        <div className="flex bg-gb-bg rounded-lg border border-gb-border p-0.5 shadow-sm">
          <button
            onClick={() => onViewModeChange('preview')}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium 
              transition-all duration-150
              ${viewMode === 'preview' 
                ? 'bg-gb-bg-card text-gb-text shadow-sm' 
                : 'text-gb-text-muted hover:text-gb-text hover:bg-gb-bg-card/50'
              }
            `}
          >
            <LuEye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </button>
          <button
            onClick={() => onViewModeChange('code')}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium 
              transition-all duration-150
              ${viewMode === 'code' 
                ? 'bg-gb-bg-card text-gb-text shadow-sm' 
                : 'text-gb-text-muted hover:text-gb-text hover:bg-gb-bg-card/50'
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
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium 
              bg-gb-bg border border-gb-border text-gb-text-secondary
              hover:text-gb-text hover:bg-gb-bg-card hover:border-gb-border-medium
              disabled:opacity-50 transition-all duration-150 shadow-sm
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
              <div className="absolute right-0 top-full mt-2 w-52 bg-gb-bg-card border border-gb-border rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-1">
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      onExportPdf();
                    }}
                    disabled={isDownloading || !hasRichHtml}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left rounded-lg hover:bg-gb-bg-subtle transition-colors disabled:opacity-50"
                  >
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-gb-text">PDF Export</div>
                      <div className="text-[10px] text-gb-text-muted mt-0.5">
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
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left rounded-lg hover:bg-gb-bg-subtle transition-colors disabled:opacity-50"
                  >
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-gb-text flex items-center gap-2">
                        PPTX Export
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-bold tracking-wide border border-amber-500/20">
                          BETA
                        </span>
                      </div>
                      <div className="text-[10px] text-gb-text-muted mt-0.5">
                        Native editable PowerPoint
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Fullscreen Button */}
        <button
          onClick={onFullscreen}
          className="
            flex items-center justify-center w-8 h-8 rounded-lg text-xs 
            bg-gb-bg border border-gb-border text-gb-text-secondary
            hover:text-gb-text hover:bg-gb-bg-card hover:border-gb-border-medium
            transition-all duration-150 shadow-sm hover:scale-105
          "
          title="Present fullscreen (ESC to exit)"
        >
          <LuMaximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
