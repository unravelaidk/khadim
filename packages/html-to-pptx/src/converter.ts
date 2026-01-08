/**
 * @khadim/html-to-pptx - Style Converter
 * Maps CSS properties to pptxgenjs equivalents
 */

import type { 
  ParsedStyles, 
  BoundingInfo,
  PptxTextOptions, 
  PptxShapeOptions,
  SlideDimensions,
  DEFAULT_SLIDE_DIMENSIONS
} from './types.js';

/**
 * Font mapping from web fonts to PowerPoint-safe fonts
 */
export const FONT_MAP: Record<string, string> = {
  // Sans-serif
  'Inter': 'Segoe UI',
  'Roboto': 'Segoe UI',
  'Open Sans': 'Segoe UI',
  'Lato': 'Segoe UI',
  'Montserrat': 'Segoe UI',
  'Poppins': 'Arial',
  'Nunito': 'Arial',
  'Source Sans Pro': 'Segoe UI',
  'system-ui': 'Segoe UI',
  'sans-serif': 'Arial',
  '-apple-system': 'Segoe UI',
  'BlinkMacSystemFont': 'Segoe UI',
  
  // Serif
  'Playfair Display': 'Georgia',
  'Cormorant Garamond': 'Georgia',
  'Merriweather': 'Georgia',
  'Lora': 'Georgia',
  'Georgia': 'Georgia',
  'serif': 'Georgia',
  'Times New Roman': 'Times New Roman',
  
  // Monospace
  'Fira Code': 'Consolas',
  'Source Code Pro': 'Consolas',
  'JetBrains Mono': 'Consolas',
  'Consolas': 'Consolas',
  'Monaco': 'Consolas',
  'monospace': 'Consolas',
  'Courier New': 'Courier New',
};

/**
 * Parse CSS color value to hex format (without #)
 */
export function colorToHex(color: string): string {
  // Already hex
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    // Expand shorthand (e.g., #fff -> ffffff)
    if (hex.length === 3) {
      return hex.split('').map(c => c + c).join('');
    }
    if (hex.length === 8) {
      // Remove alpha channel
      return hex.slice(0, 6);
    }
    return hex;
  }
  
  // Parse rgb/rgba
  const rgbMatch = color.match(/rgba?\(([^)]+)\)/);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map(p => parseFloat(p.trim()));
    const r = Math.round(Math.min(255, Math.max(0, parts[0] || 0)));
    const g = Math.round(Math.min(255, Math.max(0, parts[1] || 0)));
    const b = Math.round(Math.min(255, Math.max(0, parts[2] || 0)));
    return [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  
  // Named colors (basic set)
  const namedColors: Record<string, string> = {
    'white': 'ffffff',
    'black': '000000',
    'red': 'ff0000',
    'green': '00ff00',
    'blue': '0000ff',
    'yellow': 'ffff00',
    'cyan': '00ffff',
    'magenta': 'ff00ff',
    'transparent': '000000',
  };
  
  return namedColors[color.toLowerCase()] || '000000';
}

/**
 * Extract dominant color from CSS gradient
 */
export function extractGradientColor(gradient: string): string {
  // Match first color in gradient
  const colorPatterns = [
    /rgba?\([^)]+\)/g,
    /#[a-fA-F0-9]{3,8}/g,
  ];
  
  for (const pattern of colorPatterns) {
    const matches = gradient.match(pattern);
    if (matches && matches.length > 0) {
      // Return the first solid-looking color
      for (const match of matches) {
        const hex = colorToHex(match);
        // Skip near-transparent colors
        if (hex !== '000000' || !match.includes('0,')) {
          return hex;
        }
      }
      return colorToHex(matches[0]);
    }
  }
  
  return '000000';
}

/**
 * Parse CSS pixel value to number
 */
export function parsePixels(value: string): number {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Convert pixels to points (for font sizes)
 * Standard: 1pt = 1.333px (at 96 DPI)
 */
export function pxToPt(px: number): number {
  return Math.round(px * 0.75);
}

/**
 * Convert pixels to inches (for positioning)
 * Standard: 96 pixels per inch at screen resolution
 */
export function pxToInches(px: number, scaleFactor: number = 1): number {
  return (px / 96) * scaleFactor;
}

/**
 * Map font family to PowerPoint-safe font
 */
export function mapFontFamily(fontFamily: string): string {
  // Parse font family string (may contain multiple fonts)
  const fonts = fontFamily.split(',').map(f => f.trim().replace(/['"]/g, ''));
  
  for (const font of fonts) {
    if (FONT_MAP[font]) {
      return FONT_MAP[font];
    }
    // Check if font itself is PowerPoint-safe
    if (['Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana', 'Segoe UI', 'Consolas'].includes(font)) {
      return font;
    }
  }
  
  // Check for generic font types
  for (const font of fonts) {
    if (font.includes('sans')) return 'Arial';
    if (font.includes('serif')) return 'Georgia';
    if (font.includes('mono')) return 'Consolas';
  }
  
  return 'Arial'; // Default fallback
}

/**
 * Map CSS text-align to PPTX align
 */
export function mapTextAlign(textAlign: string): 'left' | 'center' | 'right' | 'justify' {
  const alignMap: Record<string, 'left' | 'center' | 'right' | 'justify'> = {
    'left': 'left',
    'start': 'left',
    'center': 'center',
    'right': 'right',
    'end': 'right',
    'justify': 'justify',
  };
  return alignMap[textAlign] || 'left';
}

/**
 * Check if font weight is bold
 */
export function isBoldWeight(fontWeight: string): boolean {
  const weight = parseInt(fontWeight, 10);
  if (!isNaN(weight)) {
    return weight >= 600;
  }
  return fontWeight === 'bold' || fontWeight === 'bolder';
}

/**
 * Convert parsed styles to PPTX text options
 */
export function convertToTextOptions(
  styles: ParsedStyles,
  bounds: BoundingInfo,
  slideDimensions: SlideDimensions
): PptxTextOptions {
  // Calculate position relative to slide
  const scaleX = slideDimensions.pptxWidth / slideDimensions.width;
  const scaleY = slideDimensions.pptxHeight / slideDimensions.height;
  
  // Parse values
  const fontSize = parsePixels(styles.fontSize);
  const paddingLeft = parsePixels(styles.paddingLeft);
  const paddingTop = parsePixels(styles.paddingTop);
  
  return {
    x: (bounds.x + paddingLeft) * scaleX,
    y: (bounds.y + paddingTop) * scaleY,
    w: bounds.width * scaleX,
    h: Math.max(bounds.height * scaleY, pxToInches(fontSize * 1.5)),
    fontSize: pxToPt(fontSize),
    fontFace: mapFontFamily(styles.fontFamily),
    color: colorToHex(styles.color),
    bold: isBoldWeight(styles.fontWeight),
    italic: styles.fontStyle === 'italic',
    underline: styles.textDecoration.includes('underline'),
    align: mapTextAlign(styles.textAlign),
    valign: 'top',
  };
}

/**
 * Convert parsed styles to PPTX shape options
 */
export function convertToShapeOptions(
  styles: ParsedStyles,
  bounds: BoundingInfo,
  slideDimensions: SlideDimensions
): PptxShapeOptions {
  const scaleX = slideDimensions.pptxWidth / slideDimensions.width;
  const scaleY = slideDimensions.pptxHeight / slideDimensions.height;
  
  // Parse background color (handle gradients)
  let bgColor = styles.backgroundColor;
  if (bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
    bgColor = 'rgb(0, 0, 0)';
  }
  
  const options: PptxShapeOptions = {
    x: bounds.x * scaleX,
    y: bounds.y * scaleY,
    w: bounds.width * scaleX,
    h: bounds.height * scaleY,
    fill: {
      color: colorToHex(bgColor),
    },
  };
  
  // Add border radius if present
  const borderRadius = parsePixels(styles.borderRadius);
  if (borderRadius > 0) {
    options.rectRadius = pxToInches(borderRadius);
  }
  
  // Parse box shadow (simplified)
  if (styles.boxShadow && styles.boxShadow !== 'none') {
    const shadowMatch = styles.boxShadow.match(/rgba?\([^)]+\)|#[a-fA-F0-9]+/);
    if (shadowMatch) {
      options.shadow = {
        type: 'outer',
        blur: 4,
        offset: 2,
        angle: 45,
        color: colorToHex(shadowMatch[0]),
        opacity: 0.4,
      };
    }
  }
  
  return options;
}

/**
 * Get slide background color from styles
 */
export function getSlideBackgroundColor(styles: ParsedStyles): string {
  const bgColor = styles.backgroundColor;
  
  // Check if it's a valid color
  if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
    return colorToHex(bgColor);
  }
  
  // Default to black for dark slides
  return '000000';
}
