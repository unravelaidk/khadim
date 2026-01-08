import { useEffect, useCallback, useMemo } from 'react';
import { LuX, LuChevronLeft, LuChevronRight } from 'react-icons/lu';
import { getSlideBackground, isLightTheme } from '../agent-builder/slideTemplates';
import type { SlideData, SlideTheme } from '../../types/slides';

interface SlideFullscreenProps {
  isOpen: boolean;
  onClose: () => void;
  slides: SlideData[];
  currentSlide: number;
  theme: SlideTheme;
  htmlContent?: string;
  slideKey: number;
  onGoToSlide: (index: number) => void;
}

export function SlideFullscreen({
  isOpen,
  onClose,
  slides,
  currentSlide,
  theme,
  htmlContent,
  slideKey,
  onGoToSlide,
}: SlideFullscreenProps) {
  const slide = slides[currentSlide];
  const themeIsLight = isLightTheme(theme);
  const textPrimary = theme.textColors.primary;
  const textSecondary = theme.textColors.secondary;

  // Check if HTML has rich styling
  const hasRichHtml = useMemo(() => {
    if (!htmlContent) return false;
    return (
      htmlContent.includes('tailwindcss') ||
      htmlContent.includes('cdn.tailwindcss.com') ||
      htmlContent.includes('class="slide') ||
      htmlContent.includes('font-display') ||
      htmlContent.includes('bg-gradient') ||
      htmlContent.includes('grid-cols')
    );
  }, [htmlContent]);

  const goNext = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      onGoToSlide(currentSlide + 1);
    }
  }, [currentSlide, slides.length, onGoToSlide]);

  const goPrev = useCallback(() => {
    if (currentSlide > 0) {
      onGoToSlide(currentSlide - 1);
    }
  }, [currentSlide, onGoToSlide]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, goNext, goPrev, onClose]);

  if (!isOpen) return null;

  // Render native slide content
  const renderNativeSlide = () => {
    if (!slide) return null;

    switch (slide.type) {
      case 'title':
      case 'section':
        return (
          <div className="text-center max-w-4xl">
            <div 
              className="w-20 h-1.5 mx-auto mb-10 rounded-full"
              style={{ background: theme.accentColor }}
            />
            {slide.title && (
              <h1 
                className="text-5xl md:text-6xl lg:text-7xl font-bold mb-8 leading-tight tracking-tight"
                style={{ 
                  color: textPrimary,
                  fontFamily: theme.fontFamily,
                  textShadow: themeIsLight ? 'none' : '0 4px 30px rgba(0,0,0,0.4)'
                }}
              >
                {slide.title}
              </h1>
            )}
            {slide.subtitle && (
              <p 
                className="text-2xl md:text-3xl font-light tracking-wide"
                style={{ 
                  color: textSecondary,
                  fontFamily: theme.fontFamily
                }}
              >
                {slide.subtitle}
              </p>
            )}
          </div>
        );

      case 'content':
      case 'accent':
      default:
        return (
          <div className="text-center max-w-4xl">
            {slide.title && (
              <h1 
                className="text-4xl md:text-5xl font-bold mb-6"
                style={{ color: textPrimary }}
              >
                {slide.title}
              </h1>
            )}
            {slide.subtitle && (
              <p 
                className="text-xl md:text-2xl mb-8"
                style={{ color: textSecondary }}
              >
                {slide.subtitle}
              </p>
            )}
            {'bullets' in slide && slide.bullets && slide.bullets.length > 0 && (
              <ul className="text-xl space-y-4 text-left max-w-2xl mx-auto">
                {slide.bullets.map((bullet: string, i: number) => (
                  <li 
                    key={i} 
                    className="flex items-start gap-4"
                    style={{ color: textSecondary }}
                  >
                    <span 
                      className="mt-2 w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: theme.accentColor }}
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50"
      style={{ background: getSlideBackground(slide?.type || 'content', theme) }}
    >
      {/* Full-screen iframe for rich HTML content */}
      {hasRichHtml && htmlContent ? (
        <iframe
          key={`fullscreen-iframe-${currentSlide}`}
          srcDoc={(() => {
            const slideControlScript = `
              <style id="slide-controller">
                html, body {
                  overflow: hidden !important;
                  scroll-behavior: auto !important;
                  height: 100vh !important;
                  max-height: 100vh !important;
                  margin: 0 !important;
                  padding: 0 !important;
                }
                .scroll-container, .slides, [class*="scroll"] {
                  overflow: hidden !important;
                  scroll-snap-type: none !important;
                  height: 100vh !important;
                  max-height: 100vh !important;
                }
                canvas {
                  max-height: 50vh !important;
                  width: auto !important;
                }
                .slide, section {
                  max-height: 100vh !important;
                  overflow: hidden !important;
                }
              </style>
              <script>
                window.addEventListener('load', function() {
                  const slides = document.querySelectorAll('section.slide, .slide, section');
                  const targetIndex = ${currentSlide};
                  
                  if (slides.length > 0) {
                    slides.forEach((slide, index) => {
                      if (index !== targetIndex) {
                        slide.style.display = 'none';
                      } else {
                        slide.style.display = 'flex';
                        slide.style.height = '100vh';
                        slide.style.maxHeight = '100vh';
                        slide.style.overflow = 'hidden';
                      }
                    });
                  }
                  
                  document.querySelectorAll('canvas').forEach(c => {
                    c.style.maxHeight = '50vh';
                  });
                });
              </script>
            `;
            return htmlContent.replace('</head>', `${slideControlScript}</head>`);
          })()}
          className="absolute inset-0 w-full h-full border-0"
          title="Fullscreen Slide Preview"
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        /* Native rendering for simple slides */
        <>
          <div 
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          <div 
            key={`fullscreen-native-${slideKey}`}
            className="absolute inset-0 flex items-center justify-center p-16"
          >
            {renderNativeSlide()}
          </div>
        </>
      )}
      
      {/* Close Button */}
      <button
        onClick={onClose}
        className="
          absolute top-6 right-6 z-30 p-3 rounded-full 
          bg-black/40 backdrop-blur-sm hover:bg-black/60 
          text-white/90 hover:text-white 
          transition-all duration-200 hover:scale-110
        "
        title="Exit fullscreen (ESC)"
      >
        <LuX className="w-6 h-6" />
      </button>
      
      {/* Slide Counter */}
      <div className="
        absolute top-6 left-6 z-30 px-4 py-2 rounded-full 
        bg-black/40 backdrop-blur-sm text-white/90 
        text-sm font-medium
      ">
        {currentSlide + 1} / {slides.length}
      </div>
      
      {/* Navigation Arrows */}
      <button
        onClick={goPrev}
        disabled={currentSlide === 0}
        className="
          absolute left-6 top-1/2 -translate-y-1/2 z-30 p-4 rounded-full 
          bg-black/40 backdrop-blur-sm hover:bg-black/60 
          text-white/90 hover:text-white 
          transition-all duration-200 hover:scale-110
          disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:scale-100
        "
      >
        <LuChevronLeft className="w-8 h-8" />
      </button>
      
      <button
        onClick={goNext}
        disabled={currentSlide === slides.length - 1}
        className="
          absolute right-6 top-1/2 -translate-y-1/2 z-30 p-4 rounded-full 
          bg-black/40 backdrop-blur-sm hover:bg-black/60 
          text-white/90 hover:text-white 
          transition-all duration-200 hover:scale-110
          disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:scale-100
        "
      >
        <LuChevronRight className="w-8 h-8" />
      </button>
      
      {/* Slide Indicators */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => onGoToSlide(index)}
            className="transition-all duration-200 rounded-full hover:scale-125"
            style={{
              width: index === currentSlide ? '24px' : '8px',
              height: '8px',
              background: index === currentSlide 
                ? theme.accentColor 
                : 'rgba(255, 255, 255, 0.4)',
              boxShadow: index === currentSlide 
                ? `0 0 12px ${theme.accentColor}80` 
                : 'none',
            }}
          />
        ))}
      </div>
      
      {/* Keyboard Hints */}
      <div className="absolute bottom-8 right-6 z-30 text-white/50 text-xs flex items-center gap-4">
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70">←</kbd>
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70">→</kbd>
          navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/70">ESC</kbd>
          exit
        </span>
      </div>
    </div>
  );
}

