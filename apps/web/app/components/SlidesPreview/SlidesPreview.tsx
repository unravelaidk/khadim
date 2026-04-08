import { useState, useEffect, useMemo, useRef } from 'react';
import { SLIDE_THEMES, slideAnimationStyles } from '../agent-builder/slideTemplates';
import { useSlideExport } from '../agent-builder/hooks/useSlideExport';
import { SlideToolbar } from './SlideToolbar';
import { SlideThumbnail } from './SlideThumbnail';
import { SlideViewer } from './SlideViewer';
import { SlideNavigation } from './SlideNavigation';
import { SlideFullscreen } from './SlideFullscreen';
import { generateHTMLFromSlides, hasRichHtmlStyling } from './utils';
import { LuDownload, LuChevronDown, LuMaximize2 } from 'react-icons/lu';
import type { SlideData, SlideTheme } from '../../types/slides';

interface SlidesPreviewProps {
  slides: SlideData[];
  htmlContent?: string;
  onDownloadPptx?: () => void;
  title?: string;
  initialTheme?: string;
  isStreaming?: boolean;
  workspaceId?: string | null;
  hideHeader?: boolean;
}

export function SlidesPreview({
  slides,
  htmlContent,
  onDownloadPptx,
  title = 'Presentation',
  initialTheme = 'brass',
  isStreaming = false,
  workspaceId,
  hideHeader = false,
}: SlidesPreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [currentTheme, setCurrentTheme] = useState<SlideTheme>(
    SLIDE_THEMES.get(initialTheme) || SLIDE_THEMES.get('brass')!
  );
  const [slideKey, setSlideKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [recentUpdate, setRecentUpdate] = useState<string>('Ready');
  const hasRichHtml = hasRichHtmlStyling(htmlContent);
  const previousSlideCountRef = useRef(slides.length);
  const previousHtmlRef = useRef(htmlContent);
  const [showFloatingExport, setShowFloatingExport] = useState(false);

  // Export hook
  const { 
    isDownloading,
    downloadAsStyledPptx,
    downloadAsImagePptx,
    downloadAsPdf,
    savePdfToWorkspace,
  } = useSlideExport({
    slides,
    htmlContent,
    title,
    currentTheme,
    onDownloadPptx,
    workspaceId,
  });

  // Inject animation styles
  useEffect(() => {
    const styleId = 'slide-animations';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = slideAnimationStyles;
      document.head.appendChild(style);
    }
  }, []);

  // Keep currentSlide in bounds when slides array changes during streaming
  useEffect(() => {
    if (currentSlide >= slides.length) {
      setCurrentSlide(Math.max(0, slides.length - 1));
    }
  }, [currentSlide, slides.length]);

  useEffect(() => {
    if (isStreaming && slides.length > 0) {
      setCurrentSlide(slides.length - 1);
    }
  }, [isStreaming, slides.length]);

  useEffect(() => {
    setSlideKey(prev => prev + 1);
  }, [currentSlide]);

  useEffect(() => {
    const previousCount = previousSlideCountRef.current;
    const previousHtml = previousHtmlRef.current;
    const latestSlide = slides[slides.length - 1];
    const latestTitle = latestSlide?.title || `Slide ${slides.length}`;

    if (slides.length > previousCount && latestSlide) {
      setRecentUpdate(`Added slide ${slides.length}: ${latestTitle}`);
    } else if (slides.length > 0 && htmlContent && previousHtml && htmlContent !== previousHtml) {
      const currentTitle = slides[Math.min(currentSlide, slides.length - 1)]?.title || `Slide ${currentSlide + 1}`;
      setRecentUpdate(`Updated ${currentTitle}`);
    } else if (!isStreaming && slides.length > 0) {
      setRecentUpdate(`Showing slide ${currentSlide + 1} of ${slides.length}`);
    }

    previousSlideCountRef.current = slides.length;
    previousHtmlRef.current = htmlContent;
  }, [slides, htmlContent, currentSlide, isStreaming]);

  const statusLabel = useMemo(() => {
    if (isStreaming) return 'Updating';
    return 'Ready';
  }, [isStreaming]);

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
    }
  };

  const slide = slides[Math.min(currentSlide, slides.length - 1)];

  return (
    <>
      {/* Fullscreen Mode */}
      <SlideFullscreen
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        slides={slides}
        currentSlide={currentSlide}
        theme={currentTheme}
        htmlContent={htmlContent}
        slideKey={slideKey}
        onGoToSlide={goToSlide}
      />

      {/* Main Preview Card */}
      <div className="overflow-hidden rounded-2xl glass-panel-strong">
        {!hideHeader && (
          <>
            {/* Toolbar */}
            <SlideToolbar
              title={title}
              slideCount={slides.length}
              theme={currentTheme}
              viewMode={viewMode}
              isDownloading={isDownloading}
              isStreaming={isStreaming}
              recentUpdate={recentUpdate}
              statusLabel={statusLabel}
              hasRichHtml={hasRichHtml}
              onViewModeChange={setViewMode}
              onFullscreen={() => setIsFullscreen(true)}
              onExportPdf={downloadAsPdf}
              onExportPptx={downloadAsImagePptx}
              onExportEditablePptx={downloadAsStyledPptx}
              onSavePdfToWorkspace={workspaceId ? savePdfToWorkspace : undefined}
            />

            {/* Main Content */}
            <div className="border-b border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2 text-xs text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">{statusLabel}:</span>{' '}
                  <span>{recentUpdate}</span>
            </div>
          </>
        )}

        <div className="flex h-[360px] md:h-[460px] lg:h-[520px] flex-col md:flex-row">
          {/* Sidebar with Thumbnails */}
          <div className="w-full border-b border-[var(--glass-border)] bg-[var(--glass-bg)] md:w-48 md:border-b-0 md:border-r-[var(--glass-border)] lg:w-52 overflow-x-auto md:overflow-y-auto p-2.5 md:space-y-2.5 flex md:block gap-2.5 scrollbar-hide">
            {slides.map((s, index) => (
              <SlideThumbnail
                key={s.id}
                slide={s}
                index={index}
                isActive={index === currentSlide}
                theme={currentTheme}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>

          {/* Slide Viewer / Code View */}
          <div className="relative flex-1 flex min-w-0 flex-col bg-[var(--surface-bg-subtle)]">
            {/* Floating export controls when header is hidden */}
            {hideHeader && (
              <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
                <div className="relative">
                  <button
                    onClick={() => setShowFloatingExport(!showFloatingExport)}
                    disabled={isDownloading}
                    className="flex items-center gap-1.5 rounded-xl bg-[var(--glass-bg-strong)] backdrop-blur-md border border-[var(--glass-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)] transition-all hover:bg-[var(--glass-bg)] disabled:opacity-50"
                  >
                    <LuDownload className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{isDownloading ? 'Exporting…' : 'Export'}</span>
                    <LuChevronDown className="w-3 h-3 opacity-60" />
                  </button>

                  {showFloatingExport && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowFloatingExport(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-2xl glass-panel-strong shadow-[var(--shadow-glass-lg)] animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="p-1.5">
                          <button
                            onClick={() => { setShowFloatingExport(false); downloadAsPdf(); }}
                            disabled={isDownloading || !hasRichHtml}
                            className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
                          >
                            <div className="flex-1">
                              <div className="text-xs font-semibold text-[var(--text-primary)]">PDF Export</div>
                              <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">Preserves all CSS styling</div>
                            </div>
                          </button>
                          <button
                            onClick={() => { setShowFloatingExport(false); downloadAsImagePptx(); }}
                            disabled={isDownloading || !hasRichHtml}
                            className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
                          >
                            <div className="flex-1">
                              <div className="text-xs font-semibold text-[var(--text-primary)]">PPTX Export</div>
                              <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">Pixel-perfect with editable text</div>
                            </div>
                          </button>
                          <button
                            onClick={() => { setShowFloatingExport(false); downloadAsStyledPptx(); }}
                            disabled={isDownloading || !hasRichHtml}
                            className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--glass-bg-strong)] disabled:opacity-50"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                                PPTX Export (Native)
                                <span className="rounded-full bg-[#10150a] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-[var(--text-inverse)]">BETA</span>
                              </div>
                              <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">Fully editable shapes &amp; text</div>
                            </div>
                          </button>
                          {workspaceId && (
                            <button
                              onClick={() => { setShowFloatingExport(false); savePdfToWorkspace(); }}
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

                <button
                  onClick={() => setIsFullscreen(true)}
                  className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--glass-bg-strong)] backdrop-blur-md border border-[var(--glass-border)] shadow-[var(--shadow-glass-sm)] transition-all hover:bg-[var(--glass-bg)]"
                  title="Present fullscreen"
                >
                  <LuMaximize2 className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                </button>
              </div>
            )}

            {viewMode === 'preview' ? (
              <>
                {/* Slide Preview */}
                <div className="flex-1 flex items-center justify-center overflow-hidden p-3 md:p-5 lg:p-6">
                  <SlideViewer
                    slide={slide}
                    slideIndex={currentSlide}
                    theme={currentTheme}
                    htmlContent={htmlContent}
                    slideKey={slideKey}
                  />
                </div>

                {/* Navigation */}
                <SlideNavigation
                  currentSlide={Math.min(currentSlide, slides.length - 1)}
                  totalSlides={slides.length}
                  theme={currentTheme}
                  isStreaming={isStreaming}
                  onPrevious={() => goToSlide(Math.min(currentSlide, slides.length - 1) - 1)}
                  onNext={() => goToSlide(Math.min(currentSlide, slides.length - 1) + 1)}
                  onGoTo={goToSlide}
                  variant="compact"
                />
              </>
            ) : (
              /* Code View */
              <div className="relative flex-1 overflow-auto bg-[#0d1117]">
                <div className="flex text-[11px] leading-5 font-mono">
                  <div className="sticky left-0 select-none border-r border-white/5 bg-[#0d1117] px-3 py-3 text-right text-white/20" aria-hidden>
                    {(htmlContent || generateHTMLFromSlides(slides, title, currentTheme)).split('\n').map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <pre className="flex-1 overflow-x-auto px-4 py-3 text-gray-300 whitespace-pre">
                    {htmlContent || generateHTMLFromSlides(slides, title, currentTheme)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Default export for compatibility
export default SlidesPreview;
