import { useState, useEffect } from 'react';
import { SLIDE_THEMES, slideAnimationStyles } from '../agent-builder/slideTemplates';
import { useSlideExport } from '../agent-builder/hooks/useSlideExport';
import { SlideToolbar } from './SlideToolbar';
import { SlideThumbnail } from './SlideThumbnail';
import { SlideViewer } from './SlideViewer';
import { SlideNavigation } from './SlideNavigation';
import { SlideFullscreen } from './SlideFullscreen';
import { generateHTMLFromSlides, hasRichHtmlStyling } from './utils';
import type { SlideData, SlideTheme } from '../../types/slides';

interface SlidesPreviewProps {
  slides: SlideData[];
  htmlContent?: string;
  onDownloadPptx?: () => void;
  title?: string;
  initialTheme?: string;
}

export function SlidesPreview({ 
  slides, 
  htmlContent, 
  onDownloadPptx, 
  title = 'Presentation',
  initialTheme = 'brass'
}: SlidesPreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [currentTheme, setCurrentTheme] = useState<SlideTheme>(
    SLIDE_THEMES.get(initialTheme) || SLIDE_THEMES.get('brass')!
  );
  const [slideKey, setSlideKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hasRichHtml = hasRichHtmlStyling(htmlContent);

  // Export hook
  const { 
    isDownloading,
    downloadAsStyledPptx, 
    downloadAsPdf 
  } = useSlideExport({
    slides,
    htmlContent,
    title,
    currentTheme,
    onDownloadPptx
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

  useEffect(() => {
    setSlideKey(prev => prev + 1);
  }, [currentSlide]);

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
    }
  };

  const slide = slides[currentSlide];

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
      <div className="border border-gb-border rounded-xl overflow-hidden bg-gb-bg-card shadow-[var(--shadow-gb-md)]">
        {/* Toolbar */}
        <SlideToolbar
          title={title}
          slideCount={slides.length}
          theme={currentTheme}
          viewMode={viewMode}
          isDownloading={isDownloading}
          hasRichHtml={hasRichHtml}
          onViewModeChange={setViewMode}
          onFullscreen={() => setIsFullscreen(true)}
          onExportPdf={downloadAsPdf}
          onExportPptx={downloadAsStyledPptx}
        />

        {/* Main Content */}
        <div className="flex h-[300px]">
          {/* Sidebar with Thumbnails */}
          <div className="w-44 bg-gb-bg-subtle border-r border-gb-border overflow-y-auto p-2.5 space-y-2.5 scrollbar-hide">
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
          <div className="flex-1 flex flex-col bg-gb-bg">
            {viewMode === 'preview' ? (
              <>
                {/* Slide Preview */}
                <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
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
                  currentSlide={currentSlide}
                  totalSlides={slides.length}
                  theme={currentTheme}
                  onPrevious={() => goToSlide(currentSlide - 1)}
                  onNext={() => goToSlide(currentSlide + 1)}
                  onGoTo={goToSlide}
                  variant="compact"
                />
              </>
            ) : (
              /* Code View */
              <div className="flex-1 overflow-auto bg-gb-bg-dark p-4 rounded-br-xl">
                <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {htmlContent || generateHTMLFromSlides(slides, title, currentTheme)}
                </pre>
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
