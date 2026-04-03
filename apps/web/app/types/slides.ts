export interface SlideTheme {
  id: string;
  name: string;
  description: string;
  backgrounds: {
    title: string;
    content: string;
    accent: string;
    section: string;
    quote: string;
    image: string;
    twoColumn: string;
    comparison: string;
  };
  pptxColors: {
    title: string;
    content: string;
    accent: string;
    section: string;
    quote: string;
    image: string;
    twoColumn: string;
    comparison: string;
  };
  textColors: {
    primary: string;
    secondary: string;
    muted: string;
  };
  accentColor: string;
  fontFamily: string;
  decorativeElements?: {
    pattern?: string;
    shapes?: boolean;
    glow?: string;
  };
  // Enhanced theming properties
  typography?: {
    displayFont: string;
    bodyFont: string;
    monoFont?: string;
    displayWeight?: string;
    headingStyle?: 'uppercase' | 'capitalize' | 'normal';
    letterSpacing?: string;
  };
  effects?: {
    noise?: boolean;
    noiseOpacity?: number;
    grain?: boolean;
    scanlines?: boolean;
    blur?: string;
    overlay?: string;
  };
  animations?: {
    entrance?: 'fade' | 'slide-up' | 'slide-left' | 'zoom' | 'blur-in' | 'glitch';
    stagger?: number;
    duration?: string;
    easing?: string;
  };
  layout?: {
    contentMaxWidth?: string;
    padding?: string;
    borderRadius?: string;
    cardStyle?: 'glass' | 'solid' | 'outline' | 'brutal' | 'soft';
  };
}

// ============================================
// SLIDE INTERFACES
// ============================================

export type SlideType =
  | "title"
  | "content"
  | "accent"
  | "section"
  | "quote"
  | "image"
  | "twoColumn"
  | "comparison";

export interface BaseSlide {
  id: number;
  type: SlideType;
  title?: string;
  subtitle?: string;
  background?: string;
}

export interface TitleSlide extends BaseSlide {
  type: "title";
  title: string;
  subtitle?: string;
}

export interface ContentSlide extends BaseSlide {
  type: "content";
  title?: string;
  bullets?: string[];
}

export interface AccentSlide extends BaseSlide {
  type: "accent";
  title: string;
  subtitle?: string;
  bullets?: string[];
}

export interface SectionSlide extends BaseSlide {
  type: "section";
  title: string;
  subtitle?: string;
}

export interface QuoteSlide extends BaseSlide {
  type: "quote";
  quote: string;
  attribution?: string;
}

export interface ImageSlide extends BaseSlide {
  type: "image";
  title?: string;
  imageUrl?: string;
  caption?: string;
}

export interface TwoColumnSlide extends BaseSlide {
  type: "twoColumn";
  title?: string;
  leftTitle?: string;
  leftBullets?: string[];
  rightTitle?: string;
  rightBullets?: string[];
}

export interface ComparisonSlide extends BaseSlide {
  type: "comparison";
  title?: string;
  leftLabel?: string;
  leftItems?: string[];
  rightLabel?: string;
  rightItems?: string[];
}

export type SlideData =
  | TitleSlide
  | ContentSlide
  | AccentSlide
  | SectionSlide
  | QuoteSlide
  | ImageSlide
  | TwoColumnSlide
  | ComparisonSlide;

export interface SlideTemplate {
  id: string;
  name: string;
  description: string;
  theme: string;
  slides: SlideData[];
}

export interface ShapeData {
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

export interface ExtractedSlideData {
  backgroundColor: string;
  backgroundImage?: string;
  textElements: Array<{
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
  }>;
  shapeElements?: ShapeData[];
}
