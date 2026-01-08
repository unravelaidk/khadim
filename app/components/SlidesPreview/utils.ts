import type { SlideData, SlideTheme } from '../../types/slides';

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
