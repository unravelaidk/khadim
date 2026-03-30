import { getSlideBackground, isLightTheme } from '../agent-builder/slideTemplates';
import { hasRichHtmlStyling } from './utils';
import type { SlideData, SlideTheme } from '../../types/slides';

// CSS for iframe slide control - hides scrollbars and constrains content
const SLIDE_IFRAME_STYLES = `
  html, body {
    overflow: hidden !important;
    scroll-behavior: auto !important;
    height: 100% !important;
    max-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }
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
  canvas { max-height: 200px !important; }
  .slide, section {
    max-height: 100% !important;
    overflow: hidden !important;
  }
`;

// Generates script to show only the target slide in an iframe
function getSlideControlScript(slideIndex: number): string {
  return `
    <style id="slide-controller">${SLIDE_IFRAME_STYLES}</style>
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
}

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
  const isBuilding = Boolean('__building' in slide && slide.__building);
  const themeIsLight = isLightTheme(theme);
  const textPrimary = theme.textColors.primary;
  const textSecondary = theme.textColors.secondary;
  const textMuted = theme.textColors.muted;
  const accentColor = theme.accentColor;
  const fontFamily = theme.fontFamily;
  const titleShadow = themeIsLight ? "none" : "0 2px 20px rgba(0,0,0,0.3)";
  const hasRichHtml = htmlContent ? hasRichHtmlStyling(htmlContent) : false;

  const renderSlideContent = () => {
    if (!slide) return null;

    if (isBuilding) {
      return (
        <div className="flex w-full max-w-3xl flex-col gap-8 px-8">
          <div className="space-y-3 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Building live preview
            </div>
            <div className="mx-auto h-1.5 w-24 bg-[var(--color-accent)]" />
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                {slide.title || `Slide ${slideIndex + 1} in progress`}
              </h2>
              <p className="mx-auto max-w-xl text-sm text-[var(--text-secondary)]">
                {slide.subtitle || 'Khadim is drafting this slide and the preview will update as content lands.'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-glass-sm)]">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Draft copy</div>
              <div className="space-y-2">
                {'bullets' in slide && slide.bullets?.map((bullet, index) => (
                  <div key={`${bullet}-${index}`} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <span className="mt-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--text-primary)]" style={{ animationDelay: `${index * 120}ms` }} />
                    <span>{bullet}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--surface-bg-subtle)] p-4 shadow-[var(--shadow-glass-sm)]">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Current step</div>
              <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
                  Writing the next slide section
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--text-muted)]" style={{ animationDelay: '150ms' }} />
                  Syncing preview content
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--text-muted)]" style={{ animationDelay: '300ms' }} />
                  Preparing final layout
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
            Drafting slide content
          </div>
        </div>
      );
    }

    switch (slide.type) {
      case "title":
      case "section":
        return (
          <div className="text-center max-w-3xl">
            <div className="w-16 h-1 mx-auto mb-8 rounded-full" style={{ background: accentColor }} />
            {slide.title && (
              <h1
                className="text-3xl md:text-4xl font-bold mb-6 leading-tight tracking-tight"
                style={{
                  color: textPrimary,
                  fontFamily,
                  textShadow: titleShadow,
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
                  fontFamily,
                }}
              >
                {slide.subtitle}
              </p>
            )}
            <div className="w-24 h-0.5 mx-auto mt-10 rounded-full opacity-40" style={{ background: accentColor }} />
          </div>
        );

      case "quote":
        if ("quote" in slide) {
          return (
            <div className="text-center max-w-2xl px-8">
              <div className="text-5xl mb-6" style={{ color: accentColor }}>
                "
              </div>
              <p className="text-lg italic mb-6 leading-relaxed" style={{ color: textPrimary }}>
                {slide.quote}
              </p>
              {slide.attribution && (
                <p className="text-sm" style={{ color: textMuted }}>
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
                <h1 className="text-xl font-bold mb-6 text-center" style={{ color: textPrimary }}>
                  {slide.title}
                </h1>
              )}
              <div className="grid grid-cols-2 gap-6">
                <div className="p-4 rounded-xl backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.08)" }}>
                  {slide.leftTitle && (
                    <h2 className="text-base font-semibold mb-3" style={{ color: accentColor }}>
                      {slide.leftTitle}
                    </h2>
                  )}
                  <ul className="space-y-2 text-xs">
                    {slide.leftBullets?.map((bullet, index) => (
                      <li
                        key={`${bullet}-${index}`}
                        className="flex items-start gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span style={{ color: accentColor }}>→</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="p-4 rounded-xl backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.08)" }}>
                  {slide.rightTitle && (
                    <h2 className="text-base font-semibold mb-3" style={{ color: accentColor }}>
                      {slide.rightTitle}
                    </h2>
                  )}
                  <ul className="space-y-2 text-xs">
                    {slide.rightBullets?.map((bullet, index) => (
                      <li
                        key={`${bullet}-${index}`}
                        className="flex items-start gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span style={{ color: accentColor }}>→</span>
                        <span>{bullet}</span>
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
                <h1 className="text-xl font-bold mb-6 text-center" style={{ color: textPrimary }}>
                  {slide.title}
                </h1>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div
                  className="p-4 rounded-xl border-2"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    borderColor: `${accentColor}40`,
                  }}
                >
                  {slide.leftLabel && (
                    <h2
                      className="text-sm font-bold mb-4 text-center pb-2 border-b"
                      style={{
                        color: accentColor,
                        borderColor: `${accentColor}30`,
                      }}
                    >
                      {slide.leftLabel}
                    </h2>
                  )}
                  <ul className="space-y-2 text-xs">
                    {slide.leftItems?.map((item, index) => (
                      <li
                        key={`${item}-${index}`}
                        className="flex items-center gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: accentColor }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div
                  className="p-4 rounded-xl border-2"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    borderColor: `${accentColor}40`,
                  }}
                >
                  {slide.rightLabel && (
                    <h2
                      className="text-sm font-bold mb-4 text-center pb-2 border-b"
                      style={{
                        color: accentColor,
                        borderColor: `${accentColor}30`,
                      }}
                    >
                      {slide.rightLabel}
                    </h2>
                  )}
                  <ul className="space-y-2 text-xs">
                    {slide.rightItems?.map((item, index) => (
                      <li
                        key={`${item}-${index}`}
                        className="flex items-center gap-2"
                        style={{ color: textSecondary }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: accentColor }}
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
                <h1 className="text-xl font-bold mb-4" style={{ color: textPrimary }}>
                  {slide.title}
                </h1>
              )}
              <div
                className="w-full h-36 rounded-xl mb-4 flex items-center justify-center"
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
                <p className="text-xs" style={{ color: textMuted }}>
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
              <h1 className="text-xl font-bold text-center mb-4" style={{ color: textPrimary }}>
                {slide.title}
              </h1>
            )}
            {slide.subtitle && (
              <p className="text-sm text-center mb-4" style={{ color: textSecondary }}>
                {slide.subtitle}
              </p>
            )}
            {"bullets" in slide && slide.bullets && slide.bullets.length > 0 && (
              <ul className="text-xs space-y-2 mt-4 w-full max-w-md">
                {slide.bullets.map((bullet, index) => (
                  <li
                    key={`${bullet}-${index}`}
                    className="flex items-start gap-3"
                    style={{ color: textSecondary }}
                  >
                    <span
                      className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: accentColor }}
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
  if (!isBuilding && hasRichHtml && htmlContent && useIframe) {
    return (
      <div 
        className="w-full h-full relative rounded-xl overflow-hidden shadow-lg bg-black"
        style={{ 
          aspectRatio: "16/9",
          maxHeight: "100%",
        }}
      >
        <div 
          style={{
            width: "333%",
            height: "333%",
            transform: "scale(0.30)",
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <iframe
            key={`iframe-${slideIndex}`}
            srcDoc={htmlContent.replace('</head>', `${getSlideControlScript(slideIndex)}</head>`)}
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
      className="w-full max-w-4xl aspect-[16/9] rounded-xl shadow-lg flex flex-col items-center justify-center p-8 slide-animate overflow-hidden relative border border-[var(--glass-border)]"
      style={{
        background: isBuilding ? 'var(--surface-bg)' : getSlideBackground(slide?.type || "content", theme),
      }}
    >
      {!isBuilding && (
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
      )}
      {isBuilding && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)",
            backgroundSize: '28px 28px',
          }}
        />
      )}
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
        {renderSlideContent()}
      </div>
    </div>
  );
}
