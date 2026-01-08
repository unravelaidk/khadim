/**
 * @khadim/html-to-pptx - TypeScript Types
 * Interfaces for HTML to PPTX conversion
 */

import type PptxGenJS from 'pptxgenjs';


export interface ParsedStyles {
  backgroundColor: string;
  color: string;
  
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  textAlign: string;
  textDecoration: string;
  lineHeight: string;
  
  // Layout
  width: string;
  height: string;
  padding: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  margin: string;
  
  // Positioning
  position: string;
  top: string;
  left: string;
  right: string;
  bottom: string;
  
  // Other
  borderRadius: string;
  boxShadow: string;
  opacity: string;
  display: string;
}

/**
 * Bounding rectangle info for an element
 */
export interface BoundingInfo {
  x: number;      // left position in pixels
  y: number;      // top position in pixels
  width: number;  // width in pixels
  height: number; // height in pixels
}

/**
 * A parsed text node with its formatting
 */
export interface ParsedTextNode {
  text: string;
  styles: ParsedStyles;
  bounds: BoundingInfo;
  isBold: boolean;
  isItalic: boolean;
  isUnderline: boolean;
}

/**
 * A parsed DOM element with all extracted information
 */
export interface ParsedElement {
  tagName: string;
  textNodes: ParsedTextNode[];
  styles: ParsedStyles;
  bounds: BoundingInfo;
  children: ParsedElement[];
  isTextElement: boolean;
}

/**
 * Converted PPTX text options
 */
export interface PptxTextOptions {
  x: number;           // position in inches
  y: number;           // position in inches
  w: number | string;  // width in inches or percentage
  h: number;           // height in inches
  fontSize: number;    // font size in points
  fontFace: string;    // PowerPoint-safe font name
  color: string;       // hex color without #
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  valign: 'top' | 'middle' | 'bottom';
}

/**
 * Converted PPTX shape/fill options
 */
export interface PptxShapeOptions {
  x: number;           // position in inches
  y: number;           // position in inches
  w: number | string;  // width in inches or percentage
  h: number;           // height in inches
  fill: {
    color: string;     // hex color without #
    transparency?: number;
  };
  rectRadius?: number; // border radius in inches
  shadow?: {
    type: 'outer' | 'inner';
    blur: number;
    offset: number;
    angle: number;
    color: string;
    opacity: number;
  };
}

/**
 * Slide conversion result
 */
export interface ConvertedSlide {
  background: string;  // hex color
  elements: Array<{
    type: 'text' | 'shape';
    content?: string;
    textOptions?: PptxTextOptions;
    shapeOptions?: PptxShapeOptions;
  }>;
}

/**
 * Options for HTML to PPTX conversion
 */
export interface HtmlToPptxOptions {
  filename?: string;
  title?: string;
  author?: string;
  layout?: 'LAYOUT_16x9' | 'LAYOUT_16x10' | 'LAYOUT_4x3' | 'LAYOUT_WIDE';
}

/**
 * Slide dimensions for layout calculations
 */
export interface SlideDimensions {
  width: number;   // slide width in pixels (source)
  height: number;  // slide height in pixels (source)
  pptxWidth: number;   // slide width in inches (target)
  pptxHeight: number;  // slide height in inches (target)
}

/**
 * Default slide dimensions (16:9 widescreen)
 */
export const DEFAULT_SLIDE_DIMENSIONS: SlideDimensions = {
  width: 1280,
  height: 720,
  pptxWidth: 13.333,   // PowerPoint widescreen width
  pptxHeight: 7.5,     // PowerPoint widescreen height
};

export type { PptxGenJS };
