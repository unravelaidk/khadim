/**
 * @khadim/html-to-pptx - DOM Parser
 * Extracts text content and computed styles from DOM elements
 */

import type { 
  ParsedStyles, 
  BoundingInfo, 
  ParsedElement, 
  ParsedTextNode,
  SlideDimensions,
  DEFAULT_SLIDE_DIMENSIONS 
} from './types.js';

/**
 * Extract computed CSS styles from an element
 */
export function extractComputedStyles(
  element: HTMLElement,
  computedStyle?: CSSStyleDeclaration
): ParsedStyles {
  const style = computedStyle || window.getComputedStyle(element);
  
  return {
    // Colors
    backgroundColor: style.backgroundColor || 'transparent',
    color: style.color || 'rgb(0, 0, 0)',
    
    // Typography
    fontFamily: style.fontFamily || 'sans-serif',
    fontSize: style.fontSize || '16px',
    fontWeight: style.fontWeight || 'normal',
    fontStyle: style.fontStyle || 'normal',
    textAlign: style.textAlign || 'left',
    textDecoration: style.textDecoration || 'none',
    lineHeight: style.lineHeight || 'normal',
    
    // Layout
    width: style.width || 'auto',
    height: style.height || 'auto',
    padding: style.padding || '0px',
    paddingTop: style.paddingTop || '0px',
    paddingRight: style.paddingRight || '0px',
    paddingBottom: style.paddingBottom || '0px',
    paddingLeft: style.paddingLeft || '0px',
    margin: style.margin || '0px',
    
    // Positioning
    position: style.position || 'static',
    top: style.top || 'auto',
    left: style.left || 'auto',
    right: style.right || 'auto',
    bottom: style.bottom || 'auto',
    
    // Other
    borderRadius: style.borderRadius || '0px',
    boxShadow: style.boxShadow || 'none',
    opacity: style.opacity || '1',
    display: style.display || 'block',
  };
}

/**
 * Get bounding rectangle info for an element
 */
export function getBoundingInfo(element: HTMLElement): BoundingInfo {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Check if font weight indicates bold
 */
function isBold(fontWeight: string): boolean {
  const weight = parseInt(fontWeight, 10);
  if (!isNaN(weight)) {
    return weight >= 600;
  }
  return fontWeight === 'bold' || fontWeight === 'bolder';
}

/**
 * Check if an element is a text-containing element
 */
function isTextElement(element: HTMLElement): boolean {
  const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'U', 'LI', 'LABEL'];
  return textTags.includes(element.tagName);
}

/**
 * Check if an element has direct text content (not just in children)
 */
function hasDirectTextContent(element: HTMLElement): boolean {
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      return true;
    }
  }
  return false;
}

/**
 * Extract text content with inline formatting from an element
 */
export function extractTextNodes(
  element: HTMLElement,
  containerBounds?: BoundingInfo
): ParsedTextNode[] {
  const textNodes: ParsedTextNode[] = [];
  const bounds = containerBounds || getBoundingInfo(element);
  
  // Process child nodes
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        const styles = extractComputedStyles(element);
        textNodes.push({
          text,
          styles,
          bounds,
          isBold: isBold(styles.fontWeight),
          isItalic: styles.fontStyle === 'italic',
          isUnderline: styles.textDecoration.includes('underline'),
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childElement = node as HTMLElement;
      const childStyles = extractComputedStyles(childElement);
      
      // Handle inline formatting elements
      if (['STRONG', 'B', 'EM', 'I', 'U', 'SPAN', 'A'].includes(childElement.tagName)) {
        const text = childElement.textContent?.trim();
        if (text) {
          textNodes.push({
            text,
            styles: childStyles,
            bounds: getBoundingInfo(childElement),
            isBold: isBold(childStyles.fontWeight) || ['STRONG', 'B'].includes(childElement.tagName),
            isItalic: childStyles.fontStyle === 'italic' || ['EM', 'I'].includes(childElement.tagName),
            isUnderline: childStyles.textDecoration.includes('underline') || childElement.tagName === 'U',
          });
        }
      } else {
        // Recursively extract from other elements
        textNodes.push(...extractTextNodes(childElement));
      }
    }
  }
  
  return textNodes;
}

/**
 * Parse a single DOM element into a ParsedElement
 */
export function parseElement(
  element: HTMLElement,
  depth: number = 0
): ParsedElement {
  const styles = extractComputedStyles(element);
  const bounds = getBoundingInfo(element);
  const tagName = element.tagName;
  const isText = isTextElement(element) || hasDirectTextContent(element);
  
  const parsed: ParsedElement = {
    tagName,
    textNodes: isText ? extractTextNodes(element) : [],
    styles,
    bounds,
    children: [],
    isTextElement: isText,
  };
  
  // Parse children (limit depth to avoid performance issues)
  if (depth < 10) {
    for (const child of Array.from(element.children)) {
      if (child instanceof HTMLElement) {
        // Skip hidden elements
        const childDisplay = window.getComputedStyle(child).display;
        if (childDisplay !== 'none') {
          parsed.children.push(parseElement(child, depth + 1));
        }
      }
    }
  }
  
  return parsed;
}

/**
 * Parse a slide element and extract all content
 * Returns flat list of text elements for PPTX generation
 */
export function parseSlideElement(
  slideElement: HTMLElement
): ParsedElement {
  return parseElement(slideElement);
}

/**
 * Flatten a parsed element tree to get all text elements
 */
export function flattenTextElements(parsed: ParsedElement): ParsedElement[] {
  const result: ParsedElement[] = [];
  
  if (parsed.isTextElement && parsed.textNodes.length > 0) {
    result.push(parsed);
  }
  
  for (const child of parsed.children) {
    result.push(...flattenTextElements(child));
  }
  
  return result;
}

/**
 * Get the background color from a slide element
 * Handles gradients by extracting the first/dominant color
 */
export function extractBackgroundColor(element: HTMLElement): string {
  const style = window.getComputedStyle(element);
  const bgColor = style.backgroundColor;
  const bgImage = style.backgroundImage;
  
  // Check for solid background color first
  if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
    return bgColor;
  }
  
  // Try to extract color from gradient
  if (bgImage && bgImage.includes('gradient')) {
    const colorMatch = bgImage.match(/rgba?\([^)]+\)|#[a-fA-F0-9]{3,8}/);
    if (colorMatch) {
      return colorMatch[0];
    }
  }
  
  // Default to black
  return 'rgb(0, 0, 0)';
}
