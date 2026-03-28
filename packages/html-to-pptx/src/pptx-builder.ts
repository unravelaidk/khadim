/**
 * @khadim/html-to-pptx - PPTX Builder
 * Wrapper around pptxgenjs for generating PowerPoint files
 */

import PptxGenJS from 'pptxgenjs';
import type { 
  HtmlToPptxOptions, 
  SlideDimensions,
} from './types.js';
import { colorToHex, mapFontFamily, pxToPt, mapTextAlign, isBoldWeight } from './converter.js';

// Default dimensions for 16:9 widescreen
const defaultDimensions: SlideDimensions = {
  width: 1280,
  height: 720,
  pptxWidth: 13.333,
  pptxHeight: 7.5,
};

/**
 * Extracted text element data
 */
interface ExtractedText {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  isBold: boolean;
  isItalic: boolean;
  textAlign: string;
  lineSpacingMultiple?: number;
  letterSpacing?: number;
}

/**
 * Extracted shape element data (cards, boxes, circles)
 */
interface ExtractedShape {
  type: 'rect' | 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
}

/**
 * Extracted slide data
 */
export interface ExtractedSlide {
  backgroundColor: string;
  backgroundImage?: string; // Base64 data URL of the slide background
  textElements: ExtractedText[];
  shapeElements?: ExtractedShape[];
}

/**
 * Create a new PPTX presentation
 */
export function createPresentation(options?: HtmlToPptxOptions): PptxGenJS {
  const pptx = new PptxGenJS();
  
  if (options?.title) {
    pptx.title = options.title;
  }
  if (options?.author) {
    pptx.author = options.author;
  }
  
  // Set layout to widescreen (16:9)
  pptx.layout = options?.layout || 'LAYOUT_WIDE';
  
  return pptx;
}

/**
 * Check if an element is a leaf text node (has text but no child elements with text)
 */
function isLeafTextElement(element: HTMLElement, win: Window): boolean {
  // Check if this element has any visible text content
  const hasText = element.textContent?.trim();
  if (!hasText) return false;
  
  // Check if children contain text - if so, this is not a leaf
  for (const child of Array.from(element.children)) {
    const childEl = child as HTMLElement;
    if (childEl.textContent?.trim()) {
      // Child has text, so this element is not a leaf
      return false;
    }
  }
  
  // Has text and no children with text = leaf
  return true;
}

/**
 * Recursively find all leaf text elements
 */
function findLeafTextElements(
  element: HTMLElement, 
  win: Window,
  results: HTMLElement[] = []
): HTMLElement[] {
  const style = win.getComputedStyle(element);
  
  // Skip hidden elements
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return results;
  }
  
  // Check if this is a leaf text element
  const text = element.textContent?.trim();
  if (text) {
    // Check children - if any child has text, recurse into children
    let childHasText = false;
    for (const child of Array.from(element.children)) {
      if ((child as HTMLElement).textContent?.trim()) {
        childHasText = true;
        break;
      }
    }
    
    if (!childHasText) {
      // This is a leaf - it has text but no children with text
      results.push(element);
      return results;
    }
  }
  
  // Recurse into children
  for (const child of Array.from(element.children)) {
    findLeafTextElements(child as HTMLElement, win, results);
  }
  
  return results;
}

/**
 * Extract all text elements from a slide element
 * This should be called while the element is still rendered in the DOM
 */
export function extractSlideData(
  slideElement: HTMLElement,
  win: Window,
  containerRect?: DOMRect
): ExtractedSlide {
  const slideRect = containerRect || slideElement.getBoundingClientRect();
  const style = win.getComputedStyle(slideElement);
  
  // Get background color - try multiple sources
  let backgroundColor = style.backgroundColor;
  if (backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') {
    // Try background-image (gradient)
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage.includes('gradient')) {
      // Extract first color from gradient
      const colorMatch = bgImage.match(/rgba?\([^)]+\)|#[a-fA-F0-9]{3,8}/);
      backgroundColor = colorMatch ? colorMatch[0] : 'rgb(15, 23, 42)';
    } else {
      backgroundColor = 'rgb(15, 23, 42)'; // Default dark slate
    }
  }
  
  const textElements: ExtractedText[] = [];
  
  // Find all leaf text elements (elements that have text but whose children don't)
  const leafElements = findLeafTextElements(slideElement, win);
  
  for (const element of leafElements) {
    const text = element.textContent?.trim();
    if (!text) continue;
    
    const elStyle = win.getComputedStyle(element);
    const elRect = element.getBoundingClientRect();
    
    // Skip if element is not visible
    if (elRect.width < 1 || elRect.height < 1) continue;
    
    // Calculate position relative to slide
    const x = Math.max(0, elRect.left - slideRect.left);
    const y = Math.max(0, elRect.top - slideRect.top);
    
    // Skip elements outside the slide bounds
    if (x > slideRect.width || y > slideRect.height) continue;
    
    const fontWeight = elStyle.fontWeight;
    const isBold = parseInt(fontWeight, 10) >= 600 || fontWeight === 'bold' || fontWeight === 'bolder';
    
    // Get text color - handle gradient text by checking parent
    let color = elStyle.color || 'rgb(255, 255, 255)';
    if (color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
      color = 'rgb(255, 255, 255)';
    }
    
    textElements.push({
      text,
      x,
      y,
      w: elRect.width,
      h: elRect.height,
      fontSize: parseFloat(elStyle.fontSize) || 16,
      fontFamily: elStyle.fontFamily,
      color,
      backgroundColor: elStyle.backgroundColor,
      isBold,
      isItalic: elStyle.fontStyle === 'italic',
      textAlign: elStyle.textAlign || 'left',
    });
  }
  
  // Sort by position (top to bottom, left to right) for better reading order
  textElements.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 20) return yDiff; // Different rows
    return a.x - b.x; // Same row, sort by x
  });
  
  return {
    backgroundColor,
    textElements,
  };
}

/**
 * Add a slide from extracted data
 */
export function addSlideFromData(
  pptx: PptxGenJS,
  data: ExtractedSlide,
  dimensions: SlideDimensions = defaultDimensions
): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  
  // Set background - prefer image if available for 1:1 fidelity
  if (data.backgroundImage) {
    slide.background = { data: data.backgroundImage };
  } else {
    const bgHex = colorToHex(data.backgroundColor);
    slide.background = { color: bgHex };
  }
  
  // Scale factors
  const scaleX = dimensions.pptxWidth / dimensions.width;
  const scaleY = dimensions.pptxHeight / dimensions.height;
  
  // Add shape elements (cards, boxes, circles) - Add these FIRST so they are behind text
  if (data.shapeElements) {
    for (const shape of data.shapeElements) {
      const x = shape.x * scaleX;
      const y = shape.y * scaleY;
      const w = Math.max(shape.w * scaleX, 0.5);
      const h = Math.max(shape.h * scaleY, 0.5);
      
      // Skip shapes that would be off-slide
      if (x >= dimensions.pptxWidth || y >= dimensions.pptxHeight) continue;
      
      const fillColor = colorToHex(shape.fill);
      
      const shapeOpts: any = {
        x,
        y,
        w,
        h,
        fill: { color: fillColor, transparency: shape.opacity ? (1 - shape.opacity) * 100 : 0 },
        line: shape.borderColor ? { color: colorToHex(shape.borderColor), width: shape.borderWidth || 1 } : undefined,
      };

      // Add rounded corners for rectangles
      if (shape.type !== 'ellipse' && shape.borderRadius && shape.borderRadius > 0) {
        // Convert px border-radius to inches (pptxgenjs uses inches for rectRadius)
        shapeOpts.rectRadius = (shape.borderRadius / 96) * (dimensions.pptxWidth / dimensions.width);
      }

      slide.addShape(shape.type === 'ellipse' ? 'ellipse' : 'roundRect', shapeOpts);
    }
  }
  
  // Add text elements
  for (const textEl of data.textElements) {
    const x = textEl.x * scaleX;
    const y = textEl.y * scaleY;
    const w = Math.max(textEl.w * scaleX, 1);
    const h = Math.max(textEl.h * scaleY, 0.4);
    
    // Skip text that would be off-slide
    if (x >= dimensions.pptxWidth || y >= dimensions.pptxHeight) continue;
    
    const textOpts: any = {
      x,
      y,
      w,
      h,
      fontSize: pxToPt(textEl.fontSize),
      fontFace: mapFontFamily(textEl.fontFamily),
      color: colorToHex(textEl.color),
      bold: textEl.isBold,
      italic: textEl.isItalic,
      align: mapTextAlign(textEl.textAlign),
      valign: 'middle',
      wrap: true,
    };

    // Add line spacing if available
    if (textEl.lineSpacingMultiple && textEl.lineSpacingMultiple > 0) {
      textOpts.lineSpacingMultiple = Math.round(textEl.lineSpacingMultiple * 100) / 100;
    }

    // Add letter spacing (pptxgenjs uses charSpacing in points, 100 = 1pt)
    if (textEl.letterSpacing && textEl.letterSpacing !== 0) {
      textOpts.charSpacing = Math.round(textEl.letterSpacing * 0.75);
    }

    slide.addText(textEl.text, textOpts);
  }
  
  return slide;
}


export async function exportToFile(
  pptx: PptxGenJS,
  filename: string = 'presentation.pptx'
): Promise<void> {
  if (!filename.endsWith('.pptx')) {
    filename = `${filename}.pptx`;
  }
  await pptx.writeFile({ fileName: filename });
}

/**
 * Export presentation as blob
 */
export async function exportToBlob(pptx: PptxGenJS): Promise<Blob> {
  const output = await pptx.write({ outputType: 'blob' });
  return output as Blob;
}

/**
 * Export presentation as base64 string
 */
export async function exportToBase64(pptx: PptxGenJS): Promise<string> {
  const output = await pptx.write({ outputType: 'base64' });
  return output as string;
}

