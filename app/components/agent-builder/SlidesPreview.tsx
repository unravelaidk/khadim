import { useState } from "react";
import { LuChevronLeft, LuChevronRight, LuCode, LuEye, LuDownload, LuMaximize2 } from "react-icons/lu";

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

// Gradient backgrounds for different slide types
const SLIDE_BACKGROUNDS = {
  title: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  content: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
  accent: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
};

export function SlidesPreview({ slides, htmlContent, onDownloadPptx, title = "Presentation" }: SlidesPreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");

  const goToSlide = (index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
    }
  };

  const slide = slides[currentSlide];

  return (
    <div className="border border-gb-border rounded-xl overflow-hidden bg-[#0d1117] shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-sm font-medium text-gray-300">{title}</span>
          <span className="text-xs text-gray-500">
            {slides.length} slides
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("preview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "preview" 
                  ? "bg-gray-700 text-white" 
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <LuEye className="w-3.5 h-3.5" />
              Preview
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === "code" 
                  ? "bg-gray-700 text-white" 
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <LuCode className="w-3.5 h-3.5" />
              Code
            </button>
          </div>
          
          {/* Download Button */}
          {onDownloadPptx && (
            <button
              onClick={onDownloadPptx}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <LuDownload className="w-3.5 h-3.5" />
              Download PPTX
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[500px]">
        {/* Slide Thumbnails Sidebar */}
        <div className="w-48 bg-[#0d1117] border-r border-gray-800 overflow-y-auto p-3 space-y-2">
          {slides.map((s, index) => (
            <button
              key={s.id}
              onClick={() => goToSlide(index)}
              className={`w-full relative rounded-lg overflow-hidden aspect-[16/9] border-2 transition-all ${
                index === currentSlide 
                  ? "border-indigo-500 ring-2 ring-indigo-500/30" 
                  : "border-gray-700 hover:border-gray-600"
              }`}
            >
              {/* Thumbnail */}
              <div 
                className="absolute inset-0 flex flex-col items-center justify-center p-2"
                style={{ background: SLIDE_BACKGROUNDS[s.type] }}
              >
                <span className="text-white text-[8px] font-bold text-center line-clamp-2">
                  {s.title || `Slide ${index + 1}`}
                </span>
              </div>
              {/* Slide Number */}
              <div className="absolute bottom-1 left-1 text-[10px] text-white/70 bg-black/30 px-1 rounded">
                {index + 1}
              </div>
            </button>
          ))}
        </div>

        {/* Main Slide View / Code View */}
        <div className="flex-1 flex flex-col">
          {viewMode === "preview" ? (
            <>
              {/* Slide Preview */}
              <div className="flex-1 flex items-center justify-center p-6 bg-[#1a1a2e]">
                <div 
                  className="w-full max-w-3xl aspect-[16/9] rounded-lg shadow-2xl flex flex-col items-center justify-center p-8 text-white"
                  style={{ background: SLIDE_BACKGROUNDS[slide?.type || "content"] }}
                >
                  {slide?.title && (
                    <h1 className="text-3xl font-bold text-center mb-4">
                      {slide.title}
                    </h1>
                  )}
                  {slide?.subtitle && (
                    <p className="text-xl opacity-80 text-center">
                      {slide.subtitle}
                    </p>
                  )}
                  {slide?.bullets && slide.bullets.length > 0 && (
                    <ul className="text-lg space-y-2 mt-4">
                      {slide.bullets.map((bullet, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-indigo-300">→</span>
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-t border-gray-800">
                <button
                  onClick={() => goToSlide(currentSlide - 1)}
                  disabled={currentSlide === 0}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <LuChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-sm text-gray-400">
                  {currentSlide + 1} / {slides.length}
                </span>
                <button
                  onClick={() => goToSlide(currentSlide + 1)}
                  disabled={currentSlide === slides.length - 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <LuChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            /* Code View */
            <div className="flex-1 overflow-auto bg-[#0d1117] p-4">
              <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap">
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
    .slide.title { background: linear-gradient(135deg, #667eea, #764ba2); }
    .slide.content { background: linear-gradient(135deg, #1a1a2e, #16213e); }
    .slide.accent { background: linear-gradient(135deg, #f093fb, #f5576c); }
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
