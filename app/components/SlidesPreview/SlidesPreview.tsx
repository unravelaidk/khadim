import { useState, useEffect, useMemo, useRef } from 'react';
import { SLIDE_THEMES, slideAnimationStyles } from '../agent-builder/slideTemplates';
import { useSlideExport } from '../agent-builder/hooks/useSlideExport';
import { SlideToolbar } from './SlideToolbar';
import { SlideThumbnail } from './SlideThumbnail';
import { SlideViewer } from './SlideViewer';
import { SlideNavigation } from './SlideNavigation';
import { SlideFullscreen } from './SlideFullscreen';
import { generateHTMLFromSlides, hasRichHtmlStyling } from './utils';
import type { SlideData, SlideTheme } from '../../types/slides';

type PreviewSlide = SlideData & { __building?: boolean };

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
  const previewSlides = useMemo<PreviewSlide[]>(() => {
    if (!isStreaming) return slides;
    return [
      ...slides,
      {
        id: Number.MAX_SAFE_INTEGER,
        type: 'content',
        title: `Slide ${slides.length + 1} in progress`,
        subtitle: 'Khadim is drafting the next section now.',
        bullets: [
          'Generating structure and copy',
          'Updating layout and visuals',
          'Preview will refresh automatically',
        ],
        __building: true,
      },
    ];
  }, [slides, isStreaming]);

  // Export hook
  const { 
    isDownloading,
    downloadAsStyledPptx, 
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
    if (currentSlide >= previewSlides.length) {
      setCurrentSlide(Math.max(0, previewSlides.length - 1));
    }
  }, [currentSlide, previewSlides.length]);

  useEffect(() => {
    if (isStreaming && previewSlides.length > 0) {
      setCurrentSlide(previewSlides.length - 1);
    }
  }, [isStreaming, previewSlides.length]);

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
    if (index >= 0 && index < previewSlides.length) {
      setCurrentSlide(index);
    }
  };

  const slide = previewSlides[Math.min(currentSlide, previewSlides.length - 1)];

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
              onExportPptx={downloadAsStyledPptx}
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
            {previewSlides.map((s, index) => (
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
          <div className="flex-1 flex min-w-0 flex-col bg-[var(--surface-bg-subtle)]">
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
                  currentSlide={Math.min(currentSlide, previewSlides.length - 1)}
                  totalSlides={previewSlides.length}
                  theme={currentTheme}
                  onPrevious={() => goToSlide(Math.min(currentSlide, previewSlides.length - 1) - 1)}
                  onNext={() => goToSlide(Math.min(currentSlide, previewSlides.length - 1) + 1)}
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
