import type { SlideData, SlideTheme } from '../../types/slides';

const SLIDE_SCRIPT_RE = /<script id=["']slide-data["'][^>]*>([\s\S]*?)<\/script>/i;
// Matches the opening tag even when the closing </script> hasn't arrived yet
const SLIDE_SCRIPT_PARTIAL_RE = /<script id=["']slide-data["'][^>]*>([\s\S]+)/i;

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
  // Try complete script tag first
  const match = htmlContent.match(SLIDE_SCRIPT_RE);
  if (match?.[1]) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      if (!parsed.every((s: any) => s && typeof s === 'object' && 'type' in s)) return null;
      return parsed as SlideData[];
    } catch {
      return null;
    }
  }

  // Try partial streaming content: the closing </script> hasn't arrived yet
  const partial = htmlContent.match(SLIDE_SCRIPT_PARTIAL_RE);
  if (!partial?.[1]) return null;

  // Strip any trailing </script> or HTML that leaked in
  let jsonFragment = partial[1].replace(/<\/script[\s\S]*$/i, '').trim();
  if (!jsonFragment.startsWith('[')) return null;

  // Try to extract complete slide objects from the partial JSON array.
  // Strategy: find all complete {...} objects at the top level of the array.
  try {
    // If it happens to be valid JSON already, use it directly
    const parsed = JSON.parse(jsonFragment);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const valid = parsed.filter((s: any) => s && typeof s === 'object' && 'type' in s);
      return valid.length > 0 ? valid as SlideData[] : null;
    }
  } catch {
    // Expected — the JSON is incomplete. Try to salvage complete objects.
  }

  // Find all complete JSON objects in the partial array by balanced-brace matching
  const slides: SlideData[] = [];
  let depth = 0;
  let objStart = -1;

  for (let i = 0; i < jsonFragment.length; i++) {
    const ch = jsonFragment[i];
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          const obj = JSON.parse(jsonFragment.slice(objStart, i + 1));
          if (obj && typeof obj === 'object' && 'type' in obj) {
            slides.push(obj as SlideData);
          }
        } catch {
          // Incomplete object, skip
        }
        objStart = -1;
      }
    }
  }

  return slides.length > 0 ? slides : null;
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
  const slideDataJson = JSON.stringify(slides, null, 2);
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
  <meta name="slide-theme" content="${theme.id}">
  <script id="slide-data" type="application/json">
${slideDataJson}
  </script>
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
