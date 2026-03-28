import type { SlideData, SlideTheme } from '../../types/slides';

const SLIDE_SCRIPT_RE = /<script id=["']slide-data["'][^>]*>([\s\S]*?)<\/script>/i;

/**
 * Checks if HTML content has rich styling that requires iframe rendering
 */
export function hasRichHtmlStyling(htmlContent: string | undefined): boolean {
  if (!htmlContent) return false;
  return (
    htmlContent.includes('tailwindcss') ||
    htmlContent.includes('cdn.tailwindcss.com') ||
    htmlContent.includes('class="slide') ||
    htmlContent.includes('font-display') ||
    htmlContent.includes('bg-gradient') ||
    htmlContent.includes('grid-cols')
  );
}

/**
 * Parses SlideData[] from HTML containing a <script id="slide-data"> tag
 */
export function parseSlidesFromHtml(htmlContent: string): SlideData[] | null {
  const match = htmlContent.match(SLIDE_SCRIPT_RE);
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((s: any) => s && typeof s === 'object' && 'type' in s)) return null;
    return parsed as SlideData[];
  } catch {
    return null;
  }
}

/**
 * Extracts the <title> from HTML content
 */
export function extractPresentationTitle(htmlContent: string): string {
  const match = htmlContent.match(/<title>([^<]*)<\/title>/i);
  return match?.[1]?.trim() || 'Presentation';
}

/**
 * Extracts theme name from HTML via data-theme attr or meta tag
 */
export function extractPresentationTheme(htmlContent: string): string | undefined {
  const themeMatch = htmlContent.match(/data-theme=["']([^"']+)["']/i);
  if (themeMatch?.[1]) return themeMatch[1];
  const metaMatch = htmlContent.match(/<meta name=["']slide-theme["'] content=["']([^"']+)["']/i);
  return metaMatch?.[1];
}

/**
 * Extracts body text from a slide for basic PPTX export
 */
export function getSlideBodyText(slide: SlideData): string | undefined {
  if (slide.subtitle) return slide.subtitle;
  if ('bullets' in slide && slide.bullets?.length) return slide.bullets.join('\n');
  if (slide.type === 'quote' && 'quote' in slide) return slide.quote;
  if (slide.type === 'twoColumn') {
    return [...(slide.leftBullets || []), ...(slide.rightBullets || [])].join('\n');
  }
  if (slide.type === 'comparison') {
    return [...(slide.leftItems || []), ...(slide.rightItems || [])].join('\n');
  }
  if (slide.type === 'image') return slide.caption;
  return undefined;
}

/**
 * Generates HTML markup from slide data with theme styling
 */
export function generateHTMLFromSlides(
  slides: SlideData[], 
  title: string, 
  theme: SlideTheme
): string {
  const slidesHTML = slides.map((slide, i) => {
    let content = '';
    if (slide.title) content += `      <h1>${slide.title}</h1>\n`;
    if (slide.subtitle) content += `      <p>${slide.subtitle}</p>\n`;
    
    if (slide.type === 'quote' && 'quote' in slide) {
      content += `      <blockquote>"${slide.quote}"</blockquote>\n`;
      if (slide.attribution) {
        content += `      <cite>— ${slide.attribution}</cite>\n`;
      }
    }
    
    if ('bullets' in slide && slide.bullets?.length) {
      content += '      <ul>\n';
      slide.bullets.forEach(b => content += `        <li>${b}</li>\n`);
      content += '      </ul>\n';
    }
    
    return `    <section class="slide ${slide.type}" data-slide="${i + 1}">\n${content}    </section>`;
  }).join('\n\n');

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
