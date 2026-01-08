import { useState, useEffect, useMemo } from "react";
import { LuChevronLeft, LuChevronRight, LuCode, LuEye, LuDownload, LuPresentation, LuMaximize2, LuMinimize2, LuX, LuMonitor } from "react-icons/lu";
import { 
  SLIDE_THEMES, 
  getSlideBackground,
  getSlidePptxColor,
  slideAnimationStyles,
  isLightTheme
} from "./slideTemplates";
import type { 
  SlideTheme, 
  SlideData, 
  SlideType 
} from "../../../types/slides";
import { useSlideExport } from "./hooks/useSlideExport";
 
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
  title = "Presentation",
  initialTheme = "brass"
}: SlidesPreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  // isDownloading state moved to hook
  const [currentTheme, setCurrentTheme] = useState<SlideTheme>(
    SLIDE_THEMES.get(initialTheme) || SLIDE_THEMES.get('brass')!
  );
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [slideKey, setSlideKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [useIframePreview, setUseIframePreview] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Detect if HTML has rich styling (Tailwind, custom CSS) that needs iframe rendering
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

  // Use the new export hook
  const { 
    isDownloading,
    downloadAsPptx, 
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
    const styleId = "slide-animations";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = slideAnimationStyles;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    setSlideKey(prev => prev + 1);
  }, [currentSlide]);

  // Keyboard navigation for fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
      if (e.key === "ArrowRight") goToSlide(currentSlide + 1);
      if (e.key === "ArrowLeft") goToSlide(currentSlide - 1);
    };
    
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen, currentSlide]);

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
    }
  };


  const slide = slides[currentSlide];
  const themeIsLight = isLightTheme(currentTheme);
  const isLightSlide = themeIsLight && 
    (slide?.type === "content" || slide?.type === "quote" || slide?.type === "twoColumn" || slide?.type === "comparison");

  const renderSlideContent = () => {
    if (!slide) return null;

    // Use theme colors directly for proper light/dark handling
    const textPrimary = currentTheme.textColors.primary;
    const textSecondary = currentTheme.textColors.secondary;
    const textMuted = currentTheme.textColors.muted;

    switch (slide.type) {
      case "title":
      case "section":
        return (
          <div className="text-center max-w-3xl">
            {/* Decorative accent line above title */}
            <div 
              className="w-16 h-1 mx-auto mb-8 rounded-full"
              style={{ background: currentTheme.accentColor }}
            />
            {slide.title && (
              <h1 
                className="text-4xl md:text-5xl font-bold mb-6 leading-tight tracking-tight"
                style={{ 
                  color: textPrimary,
                  fontFamily: currentTheme.fontFamily,
                  textShadow: themeIsLight ? 'none' : '0 2px 20px rgba(0,0,0,0.3)'
                }}
              >
                {slide.title}
              </h1>
            )}
            {slide.subtitle && (
              <p 
                className="text-xl md:text-2xl font-light tracking-wide"
                style={{ 
                  color: textSecondary,
                  fontFamily: currentTheme.fontFamily
                }}
              >
                {slide.subtitle}
              </p>
            )}
            {/* Decorative accent line below */}
            <div 
              className="w-24 h-0.5 mx-auto mt-10 rounded-full opacity-40"
              style={{ background: currentTheme.accentColor }}
            />
          </div>
        );

      case "quote":
        if ("quote" in slide) {
          return (
            <div className="text-center max-w-2xl px-8">
              <div 
                className="text-5xl mb-6"
                style={{ color: currentTheme.accentColor }}
              >
                "
              </div>
              <p 
                className="text-xl italic mb-6 leading-relaxed"
                style={{ color: textPrimary }}
              >
                {slide.quote}
              </p>
              {slide.attribution && (
                <p 
                  className="text-base"
                  style={{ color: textMuted }}
                >
                  — {slide.attribution}
                </p>
              )}
            </div>
          );
        }
        break;

      case "twoColumn":
        if ("leftBullets" in slide) {
          return (
            <div className="w-full px-6">
              {slide.title && (
                <h1 
                  className="text-2xl font-bold mb-6 text-center"
                  style={{ color: textPrimary }}
                >
                  {slide.title}
                </h1>
              )}
              <div className="grid grid-cols-2 gap-8">
                <div 
                  className="p-4 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  {slide.leftTitle && (
                    <h2 
                      className="text-lg font-semibold mb-3"
                      style={{ color: currentTheme.accentColor }}
                    >
                      {slide.leftTitle}
                    </h2>
                  )}
                  <ul className="space-y-2 text-sm">
                    {slide.leftBullets?.map((b: string, i: number) => (
                      <li 
                        key={i} 
                        className="flex items-start gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span style={{ color: currentTheme.accentColor }}>→</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div 
                  className="p-4 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  {slide.rightTitle && (
                    <h2 
                      className="text-lg font-semibold mb-3"
                      style={{ color: currentTheme.accentColor }}
                    >
                      {slide.rightTitle}
                    </h2>
                  )}
                  <ul className="space-y-2 text-sm">
                    {slide.rightBullets?.map((b: string, i: number) => (
                      <li 
                        key={i} 
                        className="flex items-start gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span style={{ color: currentTheme.accentColor }}>→</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        }
        break;

      case "comparison":
        if ("leftItems" in slide) {
          return (
            <div className="w-full px-6">
              {slide.title && (
                <h1 
                  className="text-2xl font-bold mb-6 text-center"
                  style={{ color: textPrimary }}
                >
                  {slide.title}
                </h1>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div 
                  className="p-4 rounded-xl border-2"
                  style={{ 
                    background: "rgba(255,255,255,0.03)",
                    borderColor: `${currentTheme.accentColor}40`
                  }}
                >
                  {slide.leftLabel && (
                    <h2 
                      className="text-base font-bold mb-4 text-center pb-2 border-b"
                      style={{ 
                        color: currentTheme.accentColor,
                        borderColor: `${currentTheme.accentColor}30`
                      }}
                    >
                      {slide.leftLabel}
                    </h2>
                  )}
                  <ul className="space-y-2 text-sm">
                    {slide.leftItems?.map((item: string, i: number) => (
                      <li 
                        key={i}
                        className="flex items-center gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span 
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: currentTheme.accentColor }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div 
                  className="p-4 rounded-xl border-2"
                  style={{ 
                    background: "rgba(255,255,255,0.03)",
                    borderColor: `${currentTheme.accentColor}40`
                  }}
                >
                  {slide.rightLabel && (
                    <h2 
                      className="text-base font-bold mb-4 text-center pb-2 border-b"
                      style={{ 
                        color: currentTheme.accentColor,
                        borderColor: `${currentTheme.accentColor}30`
                      }}
                    >
                      {slide.rightLabel}
                    </h2>
                  )}
                  <ul className="space-y-2 text-sm">
                    {slide.rightItems?.map((item: string, i: number) => (
                      <li 
                        key={i}
                        className="flex items-center gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span 
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: currentTheme.accentColor }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        }
        break;

      case "image":
        if ("imageUrl" in slide) {
          return (
            <div className="text-center">
              {slide.title && (
                <h1 
                  className="text-2xl font-bold mb-4"
                  style={{ color: textPrimary }}
                >
                  {slide.title}
                </h1>
              )}
              <div 
                className="w-full h-40 rounded-xl mb-4 flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.1)" }}
              >
                {slide.imageUrl ? (
                  <img 
                    src={slide.imageUrl} 
                    alt={slide.caption || ""} 
                    className="max-h-full max-w-full object-contain rounded-lg"
                  />
                ) : (
                  <span style={{ color: textMuted }}>Image Placeholder</span>
                )}
              </div>
              {slide.caption && (
                <p 
                  className="text-sm"
                  style={{ color: textMuted }}
                >
                  {slide.caption}
                </p>
              )}
            </div>
          );
        }
        break;

      case "content":
      case "accent":
      default:
        return (
          <>
            {slide.title && (
              <h1 
                className="text-2xl font-bold text-center mb-4"
                style={{ color: textPrimary }}
              >
                {slide.title}
              </h1>
            )}
            {slide.subtitle && (
              <p 
                className="text-base text-center mb-4"
                style={{ color: textSecondary }}
              >
                {slide.subtitle}
              </p>
            )}
            {"bullets" in slide && slide.bullets && slide.bullets.length > 0 && (
              <ul className="text-sm space-y-2 mt-4 w-full max-w-md">
                {slide.bullets.map((bullet: string, i: number) => (
                  <li 
                    key={i} 
                    className="flex items-start gap-3"
                    style={{ color: textSecondary }}
                  >
                    <span 
                      className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: currentTheme.accentColor }}
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        );
    }
    return null;
  };

  return (
    <>
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: getSlideBackground(slide?.type || "content", currentTheme) }}
        >
          <div 
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-6 right-6 z-10 p-3 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-all"
            title="Exit fullscreen (ESC)"
          >
            <LuX className="w-6 h-6" />
          </button>
          
          <div className="absolute top-6 left-6 px-4 py-2 rounded-full bg-black/30 text-white/80 text-sm font-medium">
            {currentSlide + 1} / {slides.length}
          </div>
          
          {/* Navigation arrows */}
          <button
            onClick={() => goToSlide(currentSlide - 1)}
            disabled={currentSlide === 0}
            className="absolute left-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <LuChevronLeft className="w-8 h-8" />
          </button>
          
          <button
            onClick={() => goToSlide(currentSlide + 1)}
            disabled={currentSlide === slides.length - 1}
            className="absolute right-6 top-1/2 -translate-y-1/2 p-4 rounded-full bg-black/30 hover:bg-black/50 text-white/80 hover:text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <LuChevronRight className="w-8 h-8" />
          </button>
          
          {/* Slide Content - Use iframe for rich HTML, native for simple */}
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
                    }
                    .scroll-container, .slides, [class*="scroll"] {
                      overflow: hidden !important;
                      scroll-snap-type: none !important;
                      height: 100vh !important;
                      max-height: 100vh !important;
                    }
                    /* Prevent canvas resize loops */
                    canvas {
                      max-height: 400px !important;
                      width: auto !important;
                    }
                    .slide, section {
                      max-height: 100vh !important;
                      overflow: hidden !important;
                    }
                  </style>
                  <script>
                    window.addEventListener('load', function() {
                      // Find all slide elements
                      const slides = document.querySelectorAll('section.slide, .slide, section');
                      const targetIndex = ${currentSlide};
                      
                      if (slides.length > 0) {
                        // Hide all slides except the target
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
                      
                      // Fix canvas elements
                      document.querySelectorAll('canvas').forEach(c => {
                        c.style.maxHeight = '400px';
                      });
                    });
                  </script>
                `;
                return htmlContent.replace('</head>', `${slideControlScript}</head>`);
              })()}
              className="absolute inset-0 w-full h-full border-0 z-0"
              title="Fullscreen Slide Preview"
              sandbox="allow-scripts allow-same-origin"
              style={{ height: '100vh', maxHeight: '100vh' }}
            />
          ) : (
            <div 
              key={`fullscreen-${slideKey}`}
              className="relative z-0 w-full max-w-5xl mx-auto px-24 slide-animate"
            >
              <div className="flex flex-col items-center justify-center min-h-[60vh]">
                {renderSlideContent()}
              </div>
            </div>
          )}
          
          {/* Slide indicators */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className="transition-all rounded-full"
                style={{
                  width: index === currentSlide ? "24px" : "8px",
                  height: "8px",
                  background: index === currentSlide 
                    ? currentTheme.accentColor 
                    : "rgba(255, 255, 255, 0.3)",
                }}
              />
            ))}
          </div>
          
          {/* Keyboard hint */}
          <div className="absolute bottom-8 right-6 text-white/40 text-xs">
            ← → to navigate • ESC to exit
          </div>
        </div>
      )}
    
    <div className="border border-gb-border rounded-lg overflow-hidden bg-gb-bg-card shadow-[var(--shadow-gb-md)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gb-bg-subtle border-b border-gb-border">
        <div className="flex items-center gap-2">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: `${currentTheme.accentColor}20` }}
          >
            <LuPresentation 
              className="w-4 h-4" 
              style={{ color: currentTheme.accentColor }}
            />
          </div>
          <div>
            <span className="text-sm font-medium text-gb-text">{title}</span>
            <span className="ml-2 text-xs text-gb-text-muted">
              {slides.length} slides
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">

          {/* View Toggle */}
          <div className="flex bg-gb-bg rounded-lg border border-gb-border p-0.5">
            <button
              onClick={() => setViewMode("preview")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "preview" 
                  ? "bg-gb-bg-card text-gb-text shadow-sm" 
                  : "text-gb-text-muted hover:text-gb-text"
              }`}
            >
              <LuEye className="w-3.5 h-3.5" />
              Preview
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "code" 
                  ? "bg-gb-bg-card text-gb-text shadow-sm" 
                  : "text-gb-text-muted hover:text-gb-text"
              }`}
            >
              <LuCode className="w-3.5 h-3.5" />
              Code
            </button>
            
            {/* Export Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                disabled={isDownloading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-gb-text-muted hover:text-gb-text hover:bg-gb-bg-card disabled:opacity-50"
              >
                <LuDownload className="w-3.5 h-3.5" />
                {isDownloading ? "Exporting..." : "Export"}
              </button>
              
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-gb-bg-card border border-gb-border rounded-lg shadow-lg z-50 overflow-hidden">
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      downloadAsPdf();
                    }}
                    disabled={isDownloading || !hasRichHtml}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-gb-bg-subtle transition-colors disabled:opacity-50"
                  >
                    <div>
                      <div className="text-xs font-medium text-gb-text">PDF (Styled)</div>
                      <div className="text-[10px] text-gb-text-muted">Preserves all CSS styling</div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      setShowExportMenu(false);
                      downloadAsStyledPptx();
                    }}
                    disabled={isDownloading || !hasRichHtml}
                    className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-gb-bg-subtle transition-colors border-t border-gb-border disabled:opacity-50"
                  >
                    <div>
                      <div className="text-xs font-medium text-gb-text flex items-center gap-2">
                        PPTX (Styled)
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold tracking-wider border border-amber-500/20">
                          BETA
                        </span>
                      </div>
                      <div className="text-[10px] text-gb-text-muted">Native editable with styling</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
            
            <button
              onClick={() => setIsFullscreen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-gb-text-muted hover:text-gb-text hover:bg-gb-bg-card"
              title="Present fullscreen (ESC to exit)"
            >
              <LuMaximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[520px]">
        {/* Slide Thumbnails Sidebar */}
        <div className="w-40 bg-gb-bg-subtle border-r border-gb-border overflow-y-auto p-2 space-y-2">
          {slides.map((s, index) => (
            <button
              key={s.id}
              onClick={() => goToSlide(index)}
              className={`w-full relative rounded-lg overflow-hidden aspect-[16/9] border-2 transition-all ${
                index === currentSlide 
                  ? "ring-2" 
                  : "border-gb-border hover:border-gb-border-medium"
              }`}
              style={{
                borderColor: index === currentSlide ? currentTheme.accentColor : undefined,
                boxShadow: index === currentSlide ? `0 0 0 2px ${currentTheme.accentColor}30` : undefined,
              }}
            >
              <div 
                className="absolute inset-0 flex flex-col items-center justify-center p-1.5"
                style={{ background: getSlideBackground(s.type, currentTheme) }}
              >
                <span className="text-white text-[7px] font-medium text-center line-clamp-2 px-1">
                  {s.title || `Slide ${index + 1}`}
                </span>
              </div>
              <div 
                className="absolute bottom-0.5 left-0.5 text-[9px] text-white/80 px-1 rounded-sm font-medium"
                style={{ background: "rgba(0,0,0,0.4)" }}
              >
                {index + 1}
              </div>
            </button>
          ))}
        </div>

        {/* Main Slide View / Code View */}
        <div className="flex-1 flex flex-col bg-gb-bg">
          {viewMode === "preview" ? (
            <>
              {/* Slide Preview - Use iframe for rich HTML, native for simple */}
              <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                {hasRichHtml && htmlContent && useIframePreview ? (
                  // Iframe preview for Tailwind/styled HTML - shows one slide at a time
                  <div className="w-full h-full relative rounded-xl overflow-hidden shadow-[var(--shadow-gb-lg)] bg-black">
                    <iframe
                      key={`iframe-${currentSlide}`}
                      srcDoc={(() => {
                        // Inject JavaScript to scroll to the correct slide and hide scrollbars
                        const slideControlScript = `
                          <style id="slide-controller">
                            html, body {
                              overflow: hidden !important;
                              scroll-behavior: auto !important;
                              height: 100% !important;
                              max-height: 100% !important;
                            }
                            .scroll-container, .slides, [class*="scroll"] {
                              overflow: hidden !important;
                              scroll-snap-type: none !important;
                              height: 100% !important;
                            }
                            canvas {
                              max-height: 300px !important;
                            }
                            .slide, section {
                              max-height: 100% !important;
                              overflow: hidden !important;
                            }
                          </style>
                          <script>
                            window.addEventListener('load', function() {
                              // Find all slide elements
                              const slides = document.querySelectorAll('section.slide, .slide, section');
                              const targetIndex = ${currentSlide};
                              
                              if (slides.length > 0) {
                                // Hide all slides except the target
                                slides.forEach((slide, index) => {
                                  if (index !== targetIndex) {
                                    slide.style.display = 'none';
                                  } else {
                                    slide.style.display = 'flex';
                                    slide.style.height = '100%';
                                    slide.style.overflow = 'hidden';
                                  }
                                });
                              }
                              
                              // Fix canvas elements
                              document.querySelectorAll('canvas').forEach(c => {
                                c.style.maxHeight = '300px';
                              });
                            });
                          </script>
                        `;
                        // Insert after <head>
                        return htmlContent.replace('</head>', `${slideControlScript}</head>`);
                      })()}
                      className="w-full h-full border-0"
                      title="Slide Preview"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                ) : (
                  // Native React preview for simple JSON slides
                  <div 
                    key={slideKey}
                    className="w-full max-w-4xl aspect-[16/9] rounded-xl shadow-[var(--shadow-gb-lg)] flex flex-col items-center justify-center p-10 slide-animate overflow-hidden relative"
                    style={{ background: getSlideBackground(slide?.type || "content", currentTheme) }}
                  >
                    {/* Subtle pattern overlay */}
                    <div 
                      className="absolute inset-0 opacity-30 pointer-events-none"
                      style={{
                        backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px)",
                        backgroundSize: "20px 20px",
                      }}
                    />
                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                      {renderSlideContent()}
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation - show for both iframe and native preview */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-gb-bg-subtle border-t border-gb-border">
                <button
                  onClick={() => goToSlide(currentSlide - 1)}
                  disabled={currentSlide === 0}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gb-text-secondary hover:text-gb-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <LuChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gb-text-muted mr-2">
                    {currentSlide + 1} / {slides.length}
                  </span>
                  {slides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => goToSlide(index)}
                      className="transition-all rounded-full"
                      style={{
                        width: index === currentSlide ? "12px" : "6px",
                        height: "6px",
                        background: index === currentSlide 
                          ? currentTheme.accentColor 
                          : "var(--color-gb-border-dark)",
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => goToSlide(currentSlide + 1)}
                  disabled={currentSlide === slides.length - 1}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gb-text-secondary hover:text-gb-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <LuChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            /* Code View */
            <div className="flex-1 overflow-auto bg-gb-bg-dark p-4">
              <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">
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

// Helper to generate HTML from slide data with theme
function generateHTMLFromSlides(slides: SlideData[], title: string, theme: SlideTheme): string {
  const slidesHTML = slides.map((slide, i) => {
    let content = "";
    if (slide.title) content += `      <h1>${slide.title}</h1>\n`;
    if (slide.subtitle) content += `      <p>${slide.subtitle}</p>\n`;
    
    if (slide.type === "quote" && "quote" in slide) {
      content += `      <blockquote>"${slide.quote}"</blockquote>\n`;
      if (slide.attribution) {
        content += `      <cite>— ${slide.attribution}</cite>\n`;
      }
    }
    
    if ("bullets" in slide && slide.bullets?.length) {
      content += "      <ul>\n";
      slide.bullets.forEach(b => content += `        <li>${b}</li>\n`);
      content += "      </ul>\n";
    }
    
    return `    <section class="slide ${slide.type}" data-slide="${i + 1}">\n${content}    </section>`;
  }).join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${theme.fontFamily}; }
    .slides { height: 100vh; overflow-y: scroll; scroll-snap-type: y mandatory; }
    .slide { 
      min-height: 100vh; 
      scroll-snap-align: start; 
      display: flex; 
      flex-direction: column; 
      justify-content: center; 
      align-items: center; 
      padding: 60px; 
      color: ${theme.textColors.primary}; 
    }
    .slide.title { background: ${theme.backgrounds.title}; }
    .slide.content { background: ${theme.backgrounds.content}; }
    .slide.accent { background: ${theme.backgrounds.accent}; }
    .slide.section { background: ${theme.backgrounds.section}; }
    .slide.quote { background: ${theme.backgrounds.quote}; }
    .slide h1 { font-size: 3.5rem; margin-bottom: 1rem; text-align: center; }
    .slide p { font-size: 1.5rem; opacity: 0.85; }
    .slide ul { font-size: 1.5rem; line-height: 2.2; list-style: none; }
    .slide li::before { content: "→ "; color: ${theme.accentColor}; }
    .slide blockquote { font-size: 2rem; font-style: italic; text-align: center; max-width: 80%; }
    .slide cite { font-size: 1.2rem; opacity: 0.7; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="slides">
${slidesHTML}
  </div>
</body>
</html>`;
}

// Re-export types for convenience
export type { SlideData } from "./slideTemplates";
export { SLIDE_THEMES, SLIDE_TEMPLATES } from "./slideTemplates";

export default SlidesPreview;
