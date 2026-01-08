/**
 * @khadim/html-to-pptx
 * Convert styled HTML slides to native, editable PowerPoint files
 */

import type { HtmlToPptxOptions, SlideDimensions } from './types.js';
import { createPresentation, extractSlideData, addSlideFromData, exportToFile, exportToBlob, exportToBase64 } from './pptx-builder.js';
import type { ExtractedSlide } from './pptx-builder.js';

// Re-export types and utilities
export * from './types.js';
export * from './converter.js';
export { createPresentation, extractSlideData, addSlideFromData, exportToFile, exportToBlob, exportToBase64 } from './pptx-builder.js';
export type { ExtractedSlide } from './pptx-builder.js';
