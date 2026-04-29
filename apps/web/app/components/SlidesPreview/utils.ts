import type { SlideData, SlideTheme } from '../../types/slides';

const SLIDE_SCRIPT_RE = /<script\s+[^>]*id=["']slide-data["'][^>]*>([\s\S]*?)<\/script>/i;
// Matches the opening tag even when the closing </script> hasn't arrived yet
const SLIDE_SCRIPT_PARTIAL_RE = /<script\s+[^>]*id=["']slide-data["'][^>]*>([\s\S]+)/i;

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
const VALID_SLIDE_TYPES = new Set(['title', 'content', 'accent', 'section', 'quote', 'image', 'twoColumn', 'comparison']);

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/h[1-6]>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function extractHtmlHeading(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  return match?.[1] ? stripHtml(match[1]) : undefined;
}

function extractHtmlListItems(value: string): string[] {
  const items = [...value.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => stripHtml(match[1] || ''))
    .filter(Boolean);
  if (items.length > 0) return items;

  const stripped = stripHtml(value);
  return stripped
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.flatMap((item) => {
      if (typeof item === 'string') return looksLikeHtml(item) ? extractHtmlListItems(item) : [item];
      return item == null ? [] : [String(item)];
    }).filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    if (looksLikeHtml(value)) {
      const items = extractHtmlListItems(value);
      return items.length > 0 ? items : undefined;
    }
    return value
      .split(/\n|•|- /)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
}

function coerceSlide(raw: unknown, index: number): SlideData | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const rawType = typeof record.type === 'string' ? record.type : undefined;
  const type = rawType && VALID_SLIDE_TYPES.has(rawType)
    ? rawType
    : index === 0
      ? 'title'
      : 'content';
  const htmlHeading = extractHtmlHeading(record.content ?? record.body ?? record.text ?? record.html);
  const title = typeof record.title === 'string'
    ? record.title
    : typeof record.heading === 'string'
      ? record.heading
      : typeof record.name === 'string'
        ? record.name
        : htmlHeading;
  const subtitle = typeof record.subtitle === 'string'
    ? record.subtitle
    : typeof record.description === 'string'
      ? record.description
      : undefined;
  const bullets = toStringArray(record.bullets ?? record.points ?? record.items ?? record.content ?? record.body ?? record.text ?? record.html)
    ?.filter((item) => item !== title);
  const id = typeof record.id === 'number' ? record.id : index + 1;

  if (type === 'quote') {
    return {
      id,
      type,
      title,
      quote: typeof record.quote === 'string' ? record.quote : bullets?.join(' ') || title || '',
      attribution: typeof record.attribution === 'string' ? record.attribution : undefined,
    };
  }

  if (type === 'image') {
    return {
      id,
      type,
      title,
      imageUrl: typeof record.imageUrl === 'string'
        ? record.imageUrl
        : typeof record.image === 'string'
          ? record.image
          : undefined,
      caption: typeof record.caption === 'string' ? record.caption : subtitle,
    };
  }

  if (type === 'twoColumn') {
    return {
      id,
      type,
      title,
      leftTitle: typeof record.leftTitle === 'string' ? record.leftTitle : 'One',
      leftBullets: toStringArray(record.leftBullets ?? record.left ?? record.column1) ?? [],
      rightTitle: typeof record.rightTitle === 'string' ? record.rightTitle : 'Two',
      rightBullets: toStringArray(record.rightBullets ?? record.right ?? record.column2) ?? [],
    };
  }

  if (type === 'comparison') {
    return {
      id,
      type,
      title,
      leftLabel: typeof record.leftLabel === 'string' ? record.leftLabel : 'Option A',
      leftItems: toStringArray(record.leftItems ?? record.left) ?? [],
      rightLabel: typeof record.rightLabel === 'string' ? record.rightLabel : 'Option B',
      rightItems: toStringArray(record.rightItems ?? record.right) ?? [],
    };
  }

  return {
    id,
    type: type as 'title' | 'content' | 'accent' | 'section',
    title: title || (type === 'title' ? 'Untitled Presentation' : `Slide ${index + 1}`),
    subtitle,
    bullets,
  } as SlideData;
}

function normalizeParsedSlides(parsed: unknown): SlideData[] | null {
  const candidate = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { slides?: unknown }).slides)
      ? (parsed as { slides: unknown[] }).slides
      : null;

  if (!candidate || candidate.length === 0) return null;
  const valid = candidate
    .map((slide, index) => coerceSlide(slide, index))
    .filter((slide): slide is SlideData => Boolean(slide));
  return valid.length > 0 ? valid : null;
}

export function parseSlidesFromHtml(htmlContent: string): SlideData[] | null {
  // Try complete script tag first
  const match = htmlContent.match(SLIDE_SCRIPT_RE);
  if (match?.[1]) {
    try {
      return normalizeParsedSlides(JSON.parse(match[1].trim()));
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
    return normalizeParsedSlides(parsed);
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
          const slide = coerceSlide(obj, slides.length);
          if (slide) {
            slides.push(slide);
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
