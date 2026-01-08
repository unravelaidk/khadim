import { useMemo } from 'react';
import { getSlideBackground, isLightTheme } from '../agent-builder/slideTemplates';
import type { SlideData, SlideTheme } from '../../types/slides';

interface SlideViewerProps {
  slide: SlideData;
  slideIndex: number;
  theme: SlideTheme;
  htmlContent?: string;
  useIframe?: boolean;
  slideKey: number;
}

export function SlideViewer({
  slide,
  slideIndex,
  theme,
  htmlContent,
  useIframe = true,
  slideKey,
}: SlideViewerProps) {
  const themeIsLight = isLightTheme(theme);
  const textPrimary = theme.textColors.primary;
  const textSecondary = theme.textColors.secondary;
  const textMuted = theme.textColors.muted;

  // Check if HTML has rich styling that needs iframe
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

  const renderSlideContent = () => {
    if (!slide) return null;

    switch (slide.type) {
      case 'title':
      case 'section':
        return (
          <div className="text-center max-w-3xl">
            <div 
              className="w-16 h-1 mx-auto mb-8 rounded-full"
              style={{ background: theme.accentColor }}
            />
            {slide.title && (
              <h1 
                className="text-3xl md:text-4xl font-bold mb-6 leading-tight tracking-tight"
                style={{ 
                  color: textPrimary,
                  fontFamily: theme.fontFamily,
                  textShadow: themeIsLight ? 'none' : '0 2px 20px rgba(0,0,0,0.3)'
                }}
              >
                {slide.title}
              </h1>
            )}
            {slide.subtitle && (
              <p 
                className="text-lg md:text-xl font-light tracking-wide"
                style={{ 
                  color: textSecondary,
                  fontFamily: theme.fontFamily
                }}
              >
                {slide.subtitle}
              </p>
            )}
            <div 
              className="w-24 h-0.5 mx-auto mt-10 rounded-full opacity-40"
              style={{ background: theme.accentColor }}
            />
          </div>
        );

      case 'quote':
        if ('quote' in slide) {
          return (
            <div className="text-center max-w-2xl px-8">
              <div 
                className="text-5xl mb-6"
                style={{ color: theme.accentColor }}
              >
                "
              </div>
              <p 
                className="text-lg italic mb-6 leading-relaxed"
                style={{ color: textPrimary }}
              >
                {slide.quote}
              </p>
              {slide.attribution && (
                <p 
                  className="text-sm"
                  style={{ color: textMuted }}
                >
                  — {slide.attribution}
                </p>
              )}
            </div>
          );
        }
        break;

      case 'twoColumn':
        if ('leftBullets' in slide) {
          return (
            <div className="w-full px-6">
              {slide.title && (
                <h1 
                  className="text-xl font-bold mb-6 text-center"
                  style={{ color: textPrimary }}
                >
                  {slide.title}
                </h1>
              )}
              <div className="grid grid-cols-2 gap-6">
                <div 
                  className="p-4 rounded-xl backdrop-blur-sm"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
                  {slide.leftTitle && (
                    <h2 
                      className="text-base font-semibold mb-3"
                      style={{ color: theme.accentColor }}
                    >
                      {slide.leftTitle}
                    </h2>
                  )}
                  <ul className="space-y-2 text-xs">
                    {slide.leftBullets?.map((b: string, i: number) => (
                      <li 
                        key={i} 
                        className="flex items-start gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span style={{ color: theme.accentColor }}>→</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div 
                  className="p-4 rounded-xl backdrop-blur-sm"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
                  {slide.rightTitle && (
                    <h2 
                      className="text-base font-semibold mb-3"
                      style={{ color: theme.accentColor }}
                    >
                      {slide.rightTitle}
                    </h2>
                  )}
                  <ul className="space-y-2 text-xs">
                    {slide.rightBullets?.map((b: string, i: number) => (
                      <li 
                        key={i} 
                        className="flex items-start gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span style={{ color: theme.accentColor }}>→</span>
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

      case 'comparison':
        if ('leftItems' in slide) {
          return (
            <div className="w-full px-6">
              {slide.title && (
                <h1 
                  className="text-xl font-bold mb-6 text-center"
                  style={{ color: textPrimary }}
                >
                  {slide.title}
                </h1>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div 
                  className="p-4 rounded-xl border-2"
                  style={{ 
                    background: 'rgba(255,255,255,0.05)',
                    borderColor: `${theme.accentColor}40`
                  }}
                >
                  {slide.leftLabel && (
                    <h2 
                      className="text-sm font-bold mb-4 text-center pb-2 border-b"
                      style={{ 
                        color: theme.accentColor,
                        borderColor: `${theme.accentColor}30`
                      }}
                    >
                      {slide.leftLabel}
                    </h2>
                  )}
                  <ul className="space-y-2 text-xs">
                    {slide.leftItems?.map((item: string, i: number) => (
                      <li 
                        key={i}
                        className="flex items-center gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span 
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: theme.accentColor }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div 
                  className="p-4 rounded-xl border-2"
                  style={{ 
                    background: 'rgba(255,255,255,0.05)',
                    borderColor: `${theme.accentColor}40`
                  }}
                >
                  {slide.rightLabel && (
                    <h2 
                      className="text-sm font-bold mb-4 text-center pb-2 border-b"
                      style={{ 
                        color: theme.accentColor,
                        borderColor: `${theme.accentColor}30`
                      }}
                    >
                      {slide.rightLabel}
                    </h2>
                  )}
                  <ul className="space-y-2 text-xs">
                    {slide.rightItems?.map((item: string, i: number) => (
                      <li 
                        key={i}
                        className="flex items-center gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span 
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: theme.accentColor }}
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

      case 'image':
        if ('imageUrl' in slide) {
          return (
            <div className="text-center">
              {slide.title && (
                <h1 
                  className="text-xl font-bold mb-4"
                  style={{ color: textPrimary }}
                >
                  {slide.title}
                </h1>
              )}
              <div 
                className="w-full h-36 rounded-xl mb-4 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              >
                {slide.imageUrl ? (
                  <img 
                    src={slide.imageUrl} 
                    alt={slide.caption || ''} 
                    className="max-h-full max-w-full object-contain rounded-lg"
                  />
                ) : (
                  <span style={{ color: textMuted }}>Image Placeholder</span>
                )}
              </div>
              {slide.caption && (
                <p 
                  className="text-xs"
                  style={{ color: textMuted }}
                >
                  {slide.caption}
                </p>
              )}
            </div>
          );
        }
        break;

      case 'content':
      case 'accent':
      default:
        return (
          <>
            {slide.title && (
              <h1 
                className="text-xl font-bold text-center mb-4"
                style={{ color: textPrimary }}
              >
                {slide.title}
              </h1>
            )}
            {slide.subtitle && (
              <p 
                className="text-sm text-center mb-4"
                style={{ color: textSecondary }}
              >
                {slide.subtitle}
              </p>
            )}
            {'bullets' in slide && slide.bullets && slide.bullets.length > 0 && (
              <ul className="text-xs space-y-2 mt-4 w-full max-w-md">
                {slide.bullets.map((bullet: string, i: number) => (
                  <li 
                    key={i} 
                    className="flex items-start gap-3"
                    style={{ color: textSecondary }}
                  >
                    <span 
                      className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: theme.accentColor }}
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

  // Iframe mode for rich HTML content
  if (hasRichHtml && htmlContent && useIframe) {
    const slideControlScript = `
      <style id="slide-controller">
        html, body {
          overflow: hidden !important;
          scroll-behavior: auto !important;
          height: 100% !important;
          max-height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        /* Hide all scrollbars */
        *::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        * {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
        }
        .scroll-container, .slides, [class*="scroll"] {
          overflow: hidden !important;
          scroll-snap-type: none !important;
          height: 100% !important;
        }
        canvas {
          max-height: 200px !important;
        }
        .slide, section {
          max-height: 100% !important;
          overflow: hidden !important;
        }
      </style>
      <script>
        window.addEventListener('load', function() {
          const slides = document.querySelectorAll('section.slide, .slide, section');
          const targetIndex = ${slideIndex};
          
          if (slides.length > 0) {
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
          
          document.querySelectorAll('canvas').forEach(c => {
            c.style.maxHeight = '200px';
          });
        });
      </script>
    `;

    return (
      <div 
        className="w-full h-full relative rounded-xl overflow-hidden shadow-lg bg-black"
        style={{ 
          // Container maintains aspect ratio
          aspectRatio: '16/9',
          maxHeight: '100%'
        }}
      >
        <div 
          style={{
            width: '400%',
            height: '380%',
            transform: 'scale(0.25)',
            transformOrigin: 'top left',
            position: 'absolute',
            top: 4,
            left: 0
          }}
        >
          <iframe
            key={`iframe-${slideIndex}`}
            srcDoc={htmlContent.replace('</head>', `${slideControlScript}</head>`)}
            className="w-full h-full border-0"
            title="Slide Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    );
  }

  // Native React preview
  return (
    <div 
      key={slideKey}
      className="w-full max-w-4xl aspect-[16/9] rounded-xl shadow-lg flex flex-col items-center justify-center p-8 slide-animate overflow-hidden relative"
      style={{ background: getSlideBackground(slide?.type || 'content', theme) }}
    >
      {/* Pattern overlay */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
        {renderSlideContent()}
      </div>
    </div>
  );
}
