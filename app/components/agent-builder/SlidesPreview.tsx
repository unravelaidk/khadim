import { useState } from "react";
import { LuChevronLeft, LuChevronRight, LuCode, LuEye, LuDownload, LuPresentation } from "react-icons/lu";

export interface SlideData {
  id: number;
  type: "title" | "content" | "accent";
  title?: string;
  subtitle?: string;
  bullets?: string[];
  background?: string;
}

interface SlidesPreviewProps {
  slides: SlideData[];
  htmlContent?: string;
  onDownloadPptx?: () => void;
  title?: string;
}

// Brand-aligned slide backgrounds using the app's color palette
const SLIDE_BACKGROUNDS = {
  title: "linear-gradient(135deg, #8B1D3D 0%, #5C5C5C 100%)",
  content: "linear-gradient(135deg, #2D2D2D 0%, #1A1A1A 100%)",
  accent: "linear-gradient(135deg, #8B1D3D 0%, #A0A0A0 100%)",
};

// Solid colors for PPTX (gradients not well supported)
const PPTX_BACKGROUNDS = {
  title: "8B1D3D",
  content: "2D2D2D",
  accent: "8B1D3D",
};

export function SlidesPreview({ slides, htmlContent, onDownloadPptx, title = "Presentation" }: SlidesPreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [isDownloading, setIsDownloading] = useState(false);

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
    }
  };

  const downloadAsPptx = async () => {
    if (onDownloadPptx) {
      onDownloadPptx();
      return;
    }

    setIsDownloading(true);
    try {
      // Dynamic import for client-side only
      const pptxgenjs = await import("pptxgenjs");
      const pptx = new pptxgenjs.default();
      pptx.title = title;
      pptx.author = "Khadim AI";

      for (const slide of slides) {
        const pptSlide = pptx.addSlide();
        pptSlide.background = { color: PPTX_BACKGROUNDS[slide.type] };

        if (slide.title) {
          pptSlide.addText(slide.title, {
            x: 0.5,
            y: slide.type === "title" ? 2.0 : 0.5,
            w: "90%",
            h: 1,
            fontSize: slide.type === "title" ? 36 : 28,
            bold: true,
            color: "FFFFFF",
            align: "center",
          });
        }

        if (slide.subtitle) {
          pptSlide.addText(slide.subtitle, {
            x: 0.5,
            y: slide.type === "title" ? 3.2 : 1.5,
            w: "90%",
            h: 0.6,
            fontSize: 18,
            color: "CCCCCC",
            align: "center",
          });
        }

        if (slide.bullets && slide.bullets.length > 0) {
          pptSlide.addText(
            slide.bullets.map(b => ({ text: b, options: { bullet: true } })),
            {
              x: 0.75,
              y: slide.title ? 2.0 : 1.0,
              w: "85%",
              h: 3,
              fontSize: 16,
              color: "FFFFFF",
              valign: "top",
            }
          );
        }
      }

      await pptx.writeFile({ fileName: `${title.replace(/[^a-z0-9]/gi, "_")}.pptx` });
    } catch (error) {
      console.error("Error generating PPTX:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const slide = slides[currentSlide];

  return (
    <div className="border border-gb-border rounded-lg overflow-hidden bg-gb-bg-card shadow-[var(--shadow-gb-md)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gb-bg-subtle border-b border-gb-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gb-accent/10 flex items-center justify-center">
            <LuPresentation className="w-4 h-4 text-gb-accent" />
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
            
            {/* Download PPTX Button - Blends with toggle */}
            <button
              onClick={downloadAsPptx}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-gb-text-muted hover:text-gb-text hover:bg-gb-bg-card disabled:opacity-50"
            >
              <LuDownload className="w-3.5 h-3.5" />
              {isDownloading ? "..." : "Export"}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[420px]">
        {/* Slide Thumbnails Sidebar */}
        <div className="w-40 bg-gb-bg-subtle border-r border-gb-border overflow-y-auto p-2 space-y-2">
          {slides.map((s, index) => (
            <button
              key={s.id}
              onClick={() => goToSlide(index)}
              className={`w-full relative rounded-lg overflow-hidden aspect-[16/9] border-2 transition-all ${
                index === currentSlide 
                  ? "border-gb-accent ring-2 ring-gb-accent/20" 
                  : "border-gb-border hover:border-gb-border-medium"
              }`}
            >
              {/* Thumbnail */}
              <div 
                className="absolute inset-0 flex flex-col items-center justify-center p-1.5"
                style={{ background: SLIDE_BACKGROUNDS[s.type] }}
              >
                <span className="text-white text-[7px] font-medium text-center line-clamp-2 px-1">
                  {s.title || `Slide ${index + 1}`}
                </span>
              </div>
              {/* Slide Number */}
              <div className="absolute bottom-0.5 left-0.5 text-[9px] text-white/80 bg-black/40 px-1 rounded-sm font-medium">
                {index + 1}
              </div>
            </button>
          ))}
        </div>

        {/* Main Slide View / Code View */}
        <div className="flex-1 flex flex-col bg-gb-bg">
          {viewMode === "preview" ? (
            <>
              {/* Slide Preview */}
              <div className="flex-1 flex items-center justify-center p-4">
                <div 
                  className="w-full max-w-2xl aspect-[16/9] rounded-lg shadow-[var(--shadow-gb-lg)] flex flex-col items-center justify-center p-6 text-white"
                  style={{ background: SLIDE_BACKGROUNDS[slide?.type || "content"] }}
                >
                  {slide?.title && (
                    <h1 className="text-2xl font-bold text-center mb-3">
                      {slide.title}
                    </h1>
                  )}
                  {slide?.subtitle && (
                    <p className="text-base opacity-80 text-center">
                      {slide.subtitle}
                    </p>
                  )}
                  {slide?.bullets && slide.bullets.length > 0 && (
                    <ul className="text-sm space-y-1.5 mt-3 text-left w-full max-w-md">
                      {slide.bullets.map((bullet, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-white/60 mt-0.5">•</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Navigation */}
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
                  {slides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => goToSlide(index)}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${
                        index === currentSlide 
                          ? "bg-gb-accent w-3" 
                          : "bg-gb-border-dark hover:bg-gb-text-muted"
                      }`}
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
                {htmlContent || generateHTMLFromSlides(slides, title)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper to generate HTML from slide data
function generateHTMLFromSlides(slides: SlideData[], title: string): string {
  const slidesHTML = slides.map((slide, i) => {
    let content = "";
    if (slide.title) content += `      <h1>${slide.title}</h1>\n`;
    if (slide.subtitle) content += `      <p>${slide.subtitle}</p>\n`;
    if (slide.bullets?.length) {
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
    .slides { height: 100vh; overflow-y: scroll; scroll-snap-type: y mandatory; }
    .slide { min-height: 100vh; scroll-snap-align: start; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px; color: white; }
    .slide.title { background: linear-gradient(135deg, #8B1D3D, #5C5C5C); }
    .slide.content { background: linear-gradient(135deg, #2D2D2D, #1A1A1A); }
    .slide.accent { background: linear-gradient(135deg, #8B1D3D, #A0A0A0); }
  </style>
</head>
<body>
  <div class="slides">
${slidesHTML}
  </div>
</body>
</html>`;
}

export default SlidesPreview;
