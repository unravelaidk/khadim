// Slide Template System
// Premium themes and slide types for beautiful presentations

import type {
  SlideTheme,
  SlideType,
  SlideData,
  SlideTemplate
} from "../../types/slides";

export type { SlideTheme, SlideType, SlideData, SlideTemplate };

// ============================================
// THEME PRESETS - Professional Grade
// ============================================

export const SLIDE_THEMES = new Map<string, SlideTheme>([
  // ✨ BRASS - Warm gold & bronze metallic elegance
  ["brass", {
    id: "brass",
    name: "Brass",
    description: "Warm gold & bronze metallic elegance",
    backgrounds: {
      title: "linear-gradient(135deg, #0d0d0d 0%, #1a1510 30%, #2d2418 60%, #1a1510 100%)",
      content: "linear-gradient(160deg, #0a0a0a 0%, #141210 50%, #0d0b08 100%)",
      accent: "linear-gradient(135deg, #b8860b 0%, #daa520 50%, #cd853f 100%)",
      section: "linear-gradient(135deg, #1a1510 0%, #2d2418 100%)",
      quote: "linear-gradient(145deg, #0d0b08 0%, #1a1510 100%)",
      image: "linear-gradient(135deg, rgba(184, 134, 11, 0.15) 0%, rgba(45, 36, 24, 0.95) 100%)",
      twoColumn: "linear-gradient(160deg, #0d0b08 0%, #1a1510 100%)",
      comparison: "linear-gradient(160deg, #141210 0%, #0a0a0a 100%)",
    },
    pptxColors: {
      title: "1a1510", content: "0d0b08", accent: "daa520",
      section: "2d2418", quote: "0d0b08", image: "1a1510",
      twoColumn: "0d0b08", comparison: "141210",
    },
    textColors: {
      primary: "#f5f0e6",
      secondary: "rgba(245, 240, 230, 0.85)",
      muted: "rgba(218, 165, 32, 0.7)",
    },
    accentColor: "#daa520",
    fontFamily: "'Playfair Display', Georgia, serif",
    decorativeElements: {
      pattern: "radial-gradient(circle at 20% 80%, rgba(218, 165, 32, 0.08) 0%, transparent 50%)",
      shapes: true,
      glow: "rgba(218, 165, 32, 0.3)",
    },
  }],

  // 🌃 ONYX - Sleek dark sophistication
  ["onyx", {
    id: "onyx",
    name: "Onyx",
    description: "Sleek dark sophistication",
    backgrounds: {
      title: "linear-gradient(180deg, #0a0a0a 0%, #141414 50%, #1a1a1a 100%)",
      content: "linear-gradient(180deg, #050505 0%, #0a0a0a 50%, #0d0d0d 100%)",
      accent: "linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)",
      section: "linear-gradient(180deg, #0d0d0d 0%, #1a1a1a 100%)",
      quote: "linear-gradient(180deg, #080808 0%, #121212 100%)",
      image: "linear-gradient(180deg, rgba(10, 10, 10, 0.95) 0%, rgba(20, 20, 20, 0.9) 100%)",
      twoColumn: "linear-gradient(180deg, #0a0a0a 0%, #0d0d0d 100%)",
      comparison: "linear-gradient(180deg, #0d0d0d 0%, #0a0a0a 100%)",
    },
    pptxColors: {
      title: "0a0a0a", content: "050505", accent: "ffffff",
      section: "0d0d0d", quote: "080808", image: "0a0a0a",
      twoColumn: "0a0a0a", comparison: "0d0d0d",
    },
    textColors: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.75)",
      muted: "rgba(255, 255, 255, 0.45)",
    },
    accentColor: "#ffffff",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      pattern: "linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
      shapes: false,
    },
  }],

  // 💎 GLAMOUR - Luxurious dark with rose gold
  ["glamour", {
    id: "glamour",
    name: "Glamour",
    description: "Luxurious dark with rose gold",
    backgrounds: {
      title: "linear-gradient(135deg, #1a0a10 0%, #2d1520 40%, #1a0a10 100%)",
      content: "linear-gradient(160deg, #0d0508 0%, #1a0a10 100%)",
      accent: "linear-gradient(135deg, #e8b4b8 0%, #d4a3a8 50%, #c99297 100%)",
      section: "linear-gradient(135deg, #2d1520 0%, #1a0a10 100%)",
      quote: "linear-gradient(145deg, #0d0508 0%, #1a0a10 50%, #0d0508 100%)",
      image: "linear-gradient(135deg, rgba(232, 180, 184, 0.1) 0%, rgba(26, 10, 16, 0.95) 100%)",
      twoColumn: "linear-gradient(160deg, #0d0508 0%, #1a0a10 100%)",
      comparison: "linear-gradient(160deg, #1a0a10 0%, #0d0508 100%)",
    },
    pptxColors: {
      title: "1a0a10", content: "0d0508", accent: "e8b4b8",
      section: "2d1520", quote: "0d0508", image: "1a0a10",
      twoColumn: "0d0508", comparison: "1a0a10",
    },
    textColors: {
      primary: "#fff5f6",
      secondary: "rgba(255, 245, 246, 0.85)",
      muted: "rgba(232, 180, 184, 0.6)",
    },
    accentColor: "#e8b4b8",
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    decorativeElements: {
      pattern: "radial-gradient(ellipse at 80% 20%, rgba(232, 180, 184, 0.08) 0%, transparent 50%)",
      shapes: true,
      glow: "rgba(232, 180, 184, 0.2)",
    },
  }],

  // 🌊 COBALT - Deep blue professional
  ["cobalt", {
    id: "cobalt",
    name: "Cobalt",
    description: "Deep blue professional",
    backgrounds: {
      title: "linear-gradient(135deg, #0a1628 0%, #152238 50%, #1a2d4a 100%)",
      content: "linear-gradient(160deg, #050d18 0%, #0a1628 100%)",
      accent: "linear-gradient(135deg, #4a90d9 0%, #6ba3e8 100%)",
      section: "linear-gradient(135deg, #152238 0%, #1a2d4a 100%)",
      quote: "linear-gradient(145deg, #050d18 0%, #0a1628 100%)",
      image: "linear-gradient(135deg, rgba(74, 144, 217, 0.1) 0%, rgba(10, 22, 40, 0.95) 100%)",
      twoColumn: "linear-gradient(160deg, #050d18 0%, #0a1628 100%)",
      comparison: "linear-gradient(160deg, #0a1628 0%, #050d18 100%)",
    },
    pptxColors: {
      title: "0a1628", content: "050d18", accent: "4a90d9",
      section: "152238", quote: "050d18", image: "0a1628",
      twoColumn: "050d18", comparison: "0a1628",
    },
    textColors: {
      primary: "#f0f5ff",
      secondary: "rgba(240, 245, 255, 0.85)",
      muted: "rgba(74, 144, 217, 0.7)",
    },
    accentColor: "#4a90d9",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      pattern: "radial-gradient(circle at 90% 10%, rgba(74, 144, 217, 0.06) 0%, transparent 40%)",
      shapes: true,
      glow: "rgba(74, 144, 217, 0.25)",
    },
  }],

  // 🌿 EMERALD - Rich green elegance
  ["emerald", {
    id: "emerald",
    name: "Emerald",
    description: "Rich green elegance",
    backgrounds: {
      title: "linear-gradient(135deg, #0a1810 0%, #122818 50%, #1a3820 100%)",
      content: "linear-gradient(160deg, #050d08 0%, #0a1810 100%)",
      accent: "linear-gradient(135deg, #50c878 0%, #3cb371 100%)",
      section: "linear-gradient(135deg, #122818 0%, #1a3820 100%)",
      quote: "linear-gradient(145deg, #050d08 0%, #0a1810 100%)",
      image: "linear-gradient(135deg, rgba(80, 200, 120, 0.1) 0%, rgba(10, 24, 16, 0.95) 100%)",
      twoColumn: "linear-gradient(160deg, #050d08 0%, #0a1810 100%)",
      comparison: "linear-gradient(160deg, #0a1810 0%, #050d08 100%)",
    },
    pptxColors: {
      title: "0a1810", content: "050d08", accent: "50c878",
      section: "122818", quote: "050d08", image: "0a1810",
      twoColumn: "050d08", comparison: "0a1810",
    },
    textColors: {
      primary: "#f0fff5",
      secondary: "rgba(240, 255, 245, 0.85)",
      muted: "rgba(80, 200, 120, 0.6)",
    },
    accentColor: "#50c878",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      pattern: "radial-gradient(circle at 15% 85%, rgba(80, 200, 120, 0.06) 0%, transparent 40%)",
      shapes: true,
      glow: "rgba(80, 200, 120, 0.2)",
    },
  }],

  // 🏜️ SAND - Warm neutral minimalism
  ["sand", {
    id: "sand",
    name: "Sand",
    description: "Warm neutral minimalism",
    backgrounds: {
      title: "linear-gradient(135deg, #f5f0e8 0%, #ebe5da 50%, #e0d8c8 100%)",
      content: "linear-gradient(160deg, #faf8f5 0%, #f5f0e8 100%)",
      accent: "linear-gradient(135deg, #8b7355 0%, #a08060 100%)",
      section: "linear-gradient(135deg, #ebe5da 0%, #e0d8c8 100%)",
      quote: "linear-gradient(145deg, #faf8f5 0%, #f5f0e8 100%)",
      image: "linear-gradient(135deg, rgba(139, 115, 85, 0.1) 0%, rgba(245, 240, 232, 0.95) 100%)",
      twoColumn: "linear-gradient(160deg, #faf8f5 0%, #f5f0e8 100%)",
      comparison: "linear-gradient(160deg, #f5f0e8 0%, #faf8f5 100%)",
    },
    pptxColors: {
      title: "f5f0e8", content: "faf8f5", accent: "8b7355",
      section: "ebe5da", quote: "faf8f5", image: "f5f0e8",
      twoColumn: "faf8f5", comparison: "f5f0e8",
    },
    textColors: {
      primary: "#2d251c",
      secondary: "rgba(45, 37, 28, 0.75)",
      muted: "rgba(139, 115, 85, 0.8)",
    },
    accentColor: "#8b7355",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      shapes: false,
    },
  }],

  // 🌅 AMBER - Warm sunset glow
  ["amber", {
    id: "amber",
    name: "Amber",
    description: "Warm sunset glow",
    backgrounds: {
      title: "linear-gradient(135deg, #1a1008 0%, #2d1a10 40%, #3d2515 100%)",
      content: "linear-gradient(160deg, #0d0804 0%, #1a1008 100%)",
      accent: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
      section: "linear-gradient(135deg, #2d1a10 0%, #3d2515 100%)",
      quote: "linear-gradient(145deg, #0d0804 0%, #1a1008 100%)",
      image: "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(26, 16, 8, 0.95) 100%)",
      twoColumn: "linear-gradient(160deg, #0d0804 0%, #1a1008 100%)",
      comparison: "linear-gradient(160deg, #1a1008 0%, #0d0804 100%)",
    },
    pptxColors: {
      title: "1a1008", content: "0d0804", accent: "f59e0b",
      section: "2d1a10", quote: "0d0804", image: "1a1008",
      twoColumn: "0d0804", comparison: "1a1008",
    },
    textColors: {
      primary: "#fff8ed",
      secondary: "rgba(255, 248, 237, 0.85)",
      muted: "rgba(245, 158, 11, 0.7)",
    },
    accentColor: "#f59e0b",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      pattern: "radial-gradient(ellipse at 70% 30%, rgba(245, 158, 11, 0.1) 0%, transparent 50%)",
      shapes: true,
      glow: "rgba(245, 158, 11, 0.25)",
    },
  }],

  // 🧊 ARCTIC - Cool ice blue
  ["arctic", {
    id: "arctic",
    name: "Arctic",
    description: "Cool ice blue",
    backgrounds: {
      title: "linear-gradient(135deg, #e8f4f8 0%, #d0e8f2 50%, #b8dce8 100%)",
      content: "linear-gradient(160deg, #f5fafc 0%, #e8f4f8 100%)",
      accent: "linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)",
      section: "linear-gradient(135deg, #d0e8f2 0%, #b8dce8 100%)",
      quote: "linear-gradient(145deg, #f5fafc 0%, #e8f4f8 100%)",
      image: "linear-gradient(135deg, rgba(8, 145, 178, 0.1) 0%, rgba(232, 244, 248, 0.95) 100%)",
      twoColumn: "linear-gradient(160deg, #f5fafc 0%, #e8f4f8 100%)",
      comparison: "linear-gradient(160deg, #e8f4f8 0%, #f5fafc 100%)",
    },
    pptxColors: {
      title: "e8f4f8", content: "f5fafc", accent: "0891b2",
      section: "d0e8f2", quote: "f5fafc", image: "e8f4f8",
      twoColumn: "f5fafc", comparison: "e8f4f8",
    },
    textColors: {
      primary: "#0c4a6e",
      secondary: "rgba(12, 74, 110, 0.75)",
      muted: "rgba(8, 145, 178, 0.7)",
    },
    accentColor: "#0891b2",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      shapes: false,
    },
  }],

  // 🎭 MIST - Ethereal gray elegance
  ["mist", {
    id: "mist",
    name: "Mist",
    description: "Ethereal gray elegance",
    backgrounds: {
      title: "linear-gradient(135deg, #e8e8e8 0%, #d4d4d4 50%, #c0c0c0 100%)",
      content: "linear-gradient(160deg, #f5f5f5 0%, #ebebeb 100%)",
      accent: "linear-gradient(135deg, #374151 0%, #4b5563 100%)",
      section: "linear-gradient(135deg, #d4d4d4 0%, #c0c0c0 100%)",
      quote: "linear-gradient(145deg, #f5f5f5 0%, #ebebeb 100%)",
      image: "linear-gradient(135deg, rgba(55, 65, 81, 0.1) 0%, rgba(235, 235, 235, 0.95) 100%)",
      twoColumn: "linear-gradient(160deg, #f5f5f5 0%, #ebebeb 100%)",
      comparison: "linear-gradient(160deg, #ebebeb 0%, #f5f5f5 100%)",
    },
    pptxColors: {
      title: "e8e8e8", content: "f5f5f5", accent: "374151",
      section: "d4d4d4", quote: "f5f5f5", image: "e8e8e8",
      twoColumn: "f5f5f5", comparison: "ebebeb",
    },
    textColors: {
      primary: "#1f2937",
      secondary: "rgba(31, 41, 55, 0.75)",
      muted: "rgba(55, 65, 81, 0.6)",
    },
    accentColor: "#374151",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      shapes: false,
    },
  }],

  // 🎨 CHROMATIC - Vibrant creative gradient
  ["chromatic", {
    id: "chromatic",
    name: "Chromatic",
    description: "Vibrant creative gradient",
    backgrounds: {
      title: "linear-gradient(135deg, #fce4ec 0%, #e1bee7 25%, #b3e5fc 50%, #c8e6c9 75%, #fff9c4 100%)",
      content: "linear-gradient(160deg, #fafafa 0%, #f5f5f5 100%)",
      accent: "linear-gradient(135deg, #ec407a 0%, #ab47bc 50%, #42a5f5 100%)",
      section: "linear-gradient(135deg, #e1bee7 0%, #b3e5fc 100%)",
      quote: "linear-gradient(145deg, #fafafa 0%, #f5f5f5 100%)",
      image: "linear-gradient(135deg, rgba(236, 64, 122, 0.1) 0%, rgba(250, 250, 250, 0.95) 100%)",
      twoColumn: "linear-gradient(160deg, #fafafa 0%, #f5f5f5 100%)",
      comparison: "linear-gradient(160deg, #f5f5f5 0%, #fafafa 100%)",
    },
    pptxColors: {
      title: "e1bee7", content: "fafafa", accent: "ec407a",
      section: "b3e5fc", quote: "fafafa", image: "e1bee7",
      twoColumn: "fafafa", comparison: "f5f5f5",
    },
    textColors: {
      primary: "#1a1a2e",
      secondary: "rgba(26, 26, 46, 0.75)",
      muted: "rgba(171, 71, 188, 0.7)",
    },
    accentColor: "#ab47bc",
    fontFamily: "'Poppins', system-ui, sans-serif",
    decorativeElements: {
      shapes: true,
      glow: "rgba(171, 71, 188, 0.2)",
    },
  }],

  // 🏛️ STRUCTURAL - Architectural dark blue
  ["structural", {
    id: "structural",
    name: "Structural",
    description: "Architectural dark blue",
    backgrounds: {
      title: "linear-gradient(180deg, #0c1929 0%, #162d4a 50%, #1e3a5f 100%)",
      content: "linear-gradient(180deg, #081018 0%, #0c1929 100%)",
      accent: "linear-gradient(135deg, #c9a962 0%, #e0c080 100%)",
      section: "linear-gradient(180deg, #162d4a 0%, #1e3a5f 100%)",
      quote: "linear-gradient(180deg, #081018 0%, #0c1929 100%)",
      image: "linear-gradient(180deg, rgba(201, 169, 98, 0.08) 0%, rgba(12, 25, 41, 0.95) 100%)",
      twoColumn: "linear-gradient(180deg, #081018 0%, #0c1929 100%)",
      comparison: "linear-gradient(180deg, #0c1929 0%, #081018 100%)",
    },
    pptxColors: {
      title: "0c1929", content: "081018", accent: "c9a962",
      section: "162d4a", quote: "081018", image: "0c1929",
      twoColumn: "081018", comparison: "0c1929",
    },
    textColors: {
      primary: "#f5f5f0",
      secondary: "rgba(245, 245, 240, 0.8)",
      muted: "rgba(201, 169, 98, 0.7)",
    },
    accentColor: "#c9a962",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      pattern: "linear-gradient(90deg, rgba(201, 169, 98, 0.03) 1px, transparent 1px)",
      shapes: true,
      glow: "rgba(201, 169, 98, 0.15)",
    },
  }],

  // 🌙 MIDNIGHT - Deep purple night
  ["midnight", {
    id: "midnight",
    name: "Midnight",
    description: "Deep purple night",
    backgrounds: {
      title: "linear-gradient(135deg, #0f0a1a 0%, #1a1030 50%, #251545 100%)",
      content: "linear-gradient(160deg, #080510 0%, #0f0a1a 100%)",
      accent: "linear-gradient(135deg, #a855f7 0%, #c084fc 100%)",
      section: "linear-gradient(135deg, #1a1030 0%, #251545 100%)",
      quote: "linear-gradient(145deg, #080510 0%, #0f0a1a 100%)",
      image: "linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(15, 10, 26, 0.95) 100%)",
      twoColumn: "linear-gradient(160deg, #080510 0%, #0f0a1a 100%)",
      comparison: "linear-gradient(160deg, #0f0a1a 0%, #080510 100%)",
    },
    pptxColors: {
      title: "0f0a1a", content: "080510", accent: "a855f7",
      section: "1a1030", quote: "080510", image: "0f0a1a",
      twoColumn: "080510", comparison: "0f0a1a",
    },
    textColors: {
      primary: "#faf5ff",
      secondary: "rgba(250, 245, 255, 0.85)",
      muted: "rgba(168, 85, 247, 0.6)",
    },
    accentColor: "#a855f7",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      pattern: "radial-gradient(circle at 85% 15%, rgba(168, 85, 247, 0.08) 0%, transparent 40%)",
      shapes: true,
      glow: "rgba(168, 85, 247, 0.25)",
    },
  }],

  // ✨ MINIMALIST - Pure, clean, maximum whitespace
  ["minimalist", {
    id: "minimalist",
    name: "Minimalist",
    description: "Pure, clean design with maximum whitespace",
    backgrounds: {
      title: "#ffffff",
      content: "#ffffff",
      accent: "#fafafa",
      section: "#ffffff",
      quote: "#fafafa",
      image: "#ffffff",
      twoColumn: "#ffffff",
      comparison: "#fafafa",
    },
    pptxColors: {
      title: "ffffff", content: "ffffff", accent: "fafafa",
      section: "ffffff", quote: "fafafa", image: "ffffff",
      twoColumn: "ffffff", comparison: "fafafa",
    },
    textColors: {
      primary: "#1a1a1a",
      secondary: "rgba(26, 26, 26, 0.7)",
      muted: "rgba(26, 26, 26, 0.4)",
    },
    accentColor: "#1a1a1a",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      shapes: false,
    },
  }],

  // 📜 PAPER - Warm, elegant paper texture feel
  ["paper", {
    id: "paper",
    name: "Paper",
    description: "Warm cream tones with elegant paper feel",
    backgrounds: {
      title: "linear-gradient(180deg, #faf8f3 0%, #f5f1e8 100%)",
      content: "linear-gradient(180deg, #fdfcfa 0%, #faf8f3 100%)",
      accent: "linear-gradient(180deg, #f0ebe0 0%, #e8e2d5 100%)",
      section: "linear-gradient(180deg, #f5f1e8 0%, #ede8dc 100%)",
      quote: "linear-gradient(180deg, #fdfcfa 0%, #f8f5ee 100%)",
      image: "linear-gradient(180deg, #faf8f3 0%, #f5f1e8 100%)",
      twoColumn: "linear-gradient(180deg, #fdfcfa 0%, #faf8f3 100%)",
      comparison: "linear-gradient(180deg, #f8f5ee 0%, #fdfcfa 100%)",
    },
    pptxColors: {
      title: "faf8f3", content: "fdfcfa", accent: "f0ebe0",
      section: "f5f1e8", quote: "fdfcfa", image: "faf8f3",
      twoColumn: "fdfcfa", comparison: "f8f5ee",
    },
    textColors: {
      primary: "#3d3830",
      secondary: "rgba(61, 56, 48, 0.75)",
      muted: "rgba(139, 125, 105, 0.8)",
    },
    accentColor: "#8b7d69",
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    decorativeElements: {
      shapes: false,
    },
  }],

  // 🖤 NOIR - High contrast dramatic black
  ["noir", {
    id: "noir",
    name: "Noir",
    description: "High contrast dramatic black and white",
    backgrounds: {
      title: "#000000",
      content: "#000000",
      accent: "#0a0a0a",
      section: "#000000",
      quote: "#050505",
      image: "#000000",
      twoColumn: "#000000",
      comparison: "#050505",
    },
    pptxColors: {
      title: "000000", content: "000000", accent: "0a0a0a",
      section: "000000", quote: "050505", image: "000000",
      twoColumn: "000000", comparison: "050505",
    },
    textColors: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.8)",
      muted: "rgba(255, 255, 255, 0.5)",
    },
    accentColor: "#ffffff",
    fontFamily: "'Inter', system-ui, sans-serif",
    decorativeElements: {
      shapes: false,
    },
  }],

  // ============================================
  // DISTINCTIVE PREMIUM THEMES
  // ============================================

  // 🔥 BRUTALIST - Raw industrial power
  ["brutalist", {
    id: "brutalist",
    name: "Brutalist",
    description: "Raw industrial power with oversized typography",
    backgrounds: {
      title: "#f5f5f0",
      content: "#e8e8e0",
      accent: "#1a1a1a",
      section: "#f5f5f0",
      quote: "#1a1a1a",
      image: "#d4d4c8",
      twoColumn: "#e8e8e0",
      comparison: "#f5f5f0",
    },
    pptxColors: {
      title: "f5f5f0", content: "e8e8e0", accent: "1a1a1a",
      section: "f5f5f0", quote: "1a1a1a", image: "d4d4c8",
      twoColumn: "e8e8e0", comparison: "f5f5f0",
    },
    textColors: {
      primary: "#0a0a0a",
      secondary: "rgba(10, 10, 10, 0.8)",
      muted: "rgba(10, 10, 10, 0.5)",
    },
    accentColor: "#ff3d00",
    fontFamily: "'Space Mono', 'Courier New', monospace",
    decorativeElements: {
      pattern: "repeating-linear-gradient(90deg, #0a0a0a 0px, #0a0a0a 1px, transparent 1px, transparent 40px)",
      shapes: false,
    },
    typography: {
      displayFont: "'Bebas Neue', 'Impact', sans-serif",
      bodyFont: "'Space Mono', monospace",
      displayWeight: "400",
      headingStyle: "uppercase",
      letterSpacing: "0.05em",
    },
    effects: {
      noise: true,
      noiseOpacity: 0.03,
    },
    layout: {
      cardStyle: "brutal",
      borderRadius: "0",
    },
  }],

  // 🌈 VAPOR - Synthwave retrowave aesthetic
  ["vapor", {
    id: "vapor",
    name: "Vapor",
    description: "Synthwave neon dreams with retro-futuristic vibes",
    backgrounds: {
      title: "linear-gradient(180deg, #0f0028 0%, #1a0040 50%, #2d1b4e 100%)",
      content: "linear-gradient(180deg, #0a0018 0%, #140030 100%)",
      accent: "linear-gradient(135deg, #ff00ff 0%, #00ffff 100%)",
      section: "linear-gradient(180deg, #1a0040 0%, #2d1b4e 100%)",
      quote: "linear-gradient(180deg, #0f0028 0%, #1a0040 100%)",
      image: "linear-gradient(180deg, rgba(255, 0, 255, 0.1) 0%, rgba(0, 255, 255, 0.1) 100%)",
      twoColumn: "linear-gradient(180deg, #0a0018 0%, #140030 100%)",
      comparison: "linear-gradient(180deg, #140030 0%, #0a0018 100%)",
    },
    pptxColors: {
      title: "0f0028", content: "0a0018", accent: "ff00ff",
      section: "1a0040", quote: "0f0028", image: "140030",
      twoColumn: "0a0018", comparison: "140030",
    },
    textColors: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.85)",
      muted: "rgba(255, 0, 255, 0.7)",
    },
    accentColor: "#ff00ff",
    fontFamily: "'Orbitron', 'Audiowide', sans-serif",
    decorativeElements: {
      pattern: "linear-gradient(transparent 50%, rgba(255, 0, 255, 0.03) 50%)",
      shapes: true,
      glow: "rgba(255, 0, 255, 0.4)",
    },
    typography: {
      displayFont: "'Orbitron', sans-serif",
      bodyFont: "'Exo 2', sans-serif",
      displayWeight: "700",
      headingStyle: "uppercase",
      letterSpacing: "0.1em",
    },
    effects: {
      scanlines: true,
      overlay: "linear-gradient(180deg, transparent 0%, rgba(255, 0, 255, 0.05) 100%)",
    },
    animations: {
      entrance: "glitch",
      duration: "0.8s",
    },
  }],

  // 📰 EDITORIAL - Magazine sophistication
  ["editorial", {
    id: "editorial",
    name: "Editorial",
    description: "Magazine-style sophistication with dramatic whitespace",
    backgrounds: {
      title: "#faf9f7",
      content: "#ffffff",
      accent: "#f0ede8",
      section: "#faf9f7",
      quote: "#f5f3f0",
      image: "#faf9f7",
      twoColumn: "#ffffff",
      comparison: "#f5f3f0",
    },
    pptxColors: {
      title: "faf9f7", content: "ffffff", accent: "f0ede8",
      section: "faf9f7", quote: "f5f3f0", image: "faf9f7",
      twoColumn: "ffffff", comparison: "f5f3f0",
    },
    textColors: {
      primary: "#1a1a1a",
      secondary: "rgba(26, 26, 26, 0.7)",
      muted: "rgba(26, 26, 26, 0.4)",
    },
    accentColor: "#c41e3a",
    fontFamily: "'Fraunces', 'Georgia', serif",
    decorativeElements: {
      shapes: false,
    },
    typography: {
      displayFont: "'Fraunces', serif",
      bodyFont: "'Source Serif 4', serif",
      displayWeight: "900",
      headingStyle: "normal",
      letterSpacing: "-0.02em",
    },
    layout: {
      contentMaxWidth: "800px",
      padding: "80px",
      cardStyle: "outline",
    },
  }],

  // 🔷 NEOGEO - Bold geometric Bauhaus
  ["neogeo", {
    id: "neogeo",
    name: "Neo Geo",
    description: "Bold geometric shapes with Bauhaus-inspired primary colors",
    backgrounds: {
      title: "#fffef5",
      content: "#fffef5",
      accent: "#0052cc",
      section: "#ffcc00",
      quote: "#ff3366",
      image: "#fffef5",
      twoColumn: "#fffef5",
      comparison: "#00cc88",
    },
    pptxColors: {
      title: "fffef5", content: "fffef5", accent: "0052cc",
      section: "ffcc00", quote: "ff3366", image: "fffef5",
      twoColumn: "fffef5", comparison: "00cc88",
    },
    textColors: {
      primary: "#0a0a0a",
      secondary: "rgba(10, 10, 10, 0.85)",
      muted: "rgba(10, 10, 10, 0.5)",
    },
    accentColor: "#0052cc",
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    decorativeElements: {
      pattern: "radial-gradient(circle at 100% 0%, #ffcc00 0%, transparent 30%), radial-gradient(circle at 0% 100%, #ff3366 0%, transparent 25%)",
      shapes: true,
    },
    typography: {
      displayFont: "'Syne', sans-serif",
      bodyFont: "'DM Sans', sans-serif",
      displayWeight: "800",
      headingStyle: "normal",
    },
    layout: {
      borderRadius: "0",
      cardStyle: "solid",
    },
  }],

  // 🌿 ORGANIC - Nature-inspired softness
  ["organic", {
    id: "organic",
    name: "Organic",
    description: "Soft curves and nature-inspired earth tones",
    backgrounds: {
      title: "linear-gradient(160deg, #f7f5f0 0%, #ebe7df 100%)",
      content: "linear-gradient(160deg, #faf8f5 0%, #f2efe8 100%)",
      accent: "linear-gradient(135deg, #8b9a6b 0%, #a3b084 100%)",
      section: "linear-gradient(160deg, #e8e4d8 0%, #ddd8c8 100%)",
      quote: "linear-gradient(160deg, #f0ece2 0%, #e5e0d5 100%)",
      image: "linear-gradient(160deg, #f5f2ea 0%, #ebe7dd 100%)",
      twoColumn: "linear-gradient(160deg, #faf8f5 0%, #f2efe8 100%)",
      comparison: "linear-gradient(160deg, #f2efe8 0%, #faf8f5 100%)",
    },
    pptxColors: {
      title: "f7f5f0", content: "faf8f5", accent: "8b9a6b",
      section: "e8e4d8", quote: "f0ece2", image: "f5f2ea",
      twoColumn: "faf8f5", comparison: "f2efe8",
    },
    textColors: {
      primary: "#3d3d3d",
      secondary: "rgba(61, 61, 61, 0.75)",
      muted: "rgba(139, 154, 107, 0.8)",
    },
    accentColor: "#8b9a6b",
    fontFamily: "'Libre Baskerville', Georgia, serif",
    decorativeElements: {
      pattern: "radial-gradient(ellipse at 30% 70%, rgba(139, 154, 107, 0.08) 0%, transparent 50%)",
      shapes: true,
    },
    typography: {
      displayFont: "'Libre Baskerville', serif",
      bodyFont: "'Nunito', sans-serif",
      displayWeight: "400",
      headingStyle: "normal",
    },
    layout: {
      borderRadius: "24px",
      cardStyle: "soft",
    },
  }],

  // ✨ HOLOGRAPHIC - Iridescent future
  ["holographic", {
    id: "holographic",
    name: "Holographic",
    description: "Iridescent gradients with a futuristic feel",
    backgrounds: {
      title: "linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #4facfe 100%)",
      content: "linear-gradient(160deg, #0f0f1a 0%, #1a1a2e 100%)",
      accent: "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
      section: "linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%)",
      quote: "linear-gradient(160deg, #141428 0%, #1a1a2e 100%)",
      image: "linear-gradient(160deg, rgba(102, 126, 234, 0.15) 0%, rgba(240, 147, 251, 0.15) 100%)",
      twoColumn: "linear-gradient(160deg, #0f0f1a 0%, #1a1a2e 100%)",
      comparison: "linear-gradient(160deg, #1a1a2e 0%, #0f0f1a 100%)",
    },
    pptxColors: {
      title: "667eea", content: "0f0f1a", accent: "764ba2",
      section: "1a1a2e", quote: "141428", image: "667eea",
      twoColumn: "0f0f1a", comparison: "1a1a2e",
    },
    textColors: {
      primary: "#ffffff",
      secondary: "rgba(255, 255, 255, 0.85)",
      muted: "rgba(240, 147, 251, 0.7)",
    },
    accentColor: "#f093fb",
    fontFamily: "'Outfit', system-ui, sans-serif",
    decorativeElements: {
      pattern: "linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(240, 147, 251, 0.1) 50%, rgba(79, 172, 254, 0.1) 100%)",
      shapes: true,
      glow: "rgba(240, 147, 251, 0.3)",
    },
    typography: {
      displayFont: "'Outfit', sans-serif",
      bodyFont: "'Outfit', sans-serif",
      displayWeight: "700",
      headingStyle: "normal",
    },
    effects: {
      noise: true,
      noiseOpacity: 0.02,
    },
    animations: {
      entrance: "blur-in",
      duration: "0.6s",
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    },
    layout: {
      borderRadius: "20px",
      cardStyle: "glass",
    },
  }],
]);

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function getSlideBackground(
  slideType: SlideType,
  theme: SlideTheme
): string {
  return theme.backgrounds[slideType] || theme.backgrounds.content;
}

export function getSlidePptxColor(
  slideType: SlideType,
  theme: SlideTheme
): string {
  return theme.pptxColors[slideType] || theme.pptxColors.content;
}

export function getDefaultTheme(): SlideTheme {
  return SLIDE_THEMES.get("brass")!;
}

export function getThemeById(id: string): SlideTheme {
  return SLIDE_THEMES.get(id) || SLIDE_THEMES.get("brass")!;
}

export function isLightTheme(theme: SlideTheme): boolean {
  return ["sand", "arctic", "mist", "chromatic", "minimalist", "paper", "brutalist", "editorial", "neogeo", "organic"].includes(theme.id);
}

// ============================================
// CSS STYLES FOR SLIDES
// ============================================

export const slideAnimationStyles = `
  /* Premium Font Stack - Distinctive choices for each theme style */
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;700&family=Exo+2:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,700;9..144,900&family=Inter:wght@300;400;500;600;700&family=Libre+Baskerville:wght@400;700&family=Nunito:wght@400;600;700&family=Orbitron:wght@400;700;900&family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&family=Poppins:wght@400;500;600;700&family=Source+Serif+4:wght@400;600;700&family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');

  /* Core Animations */
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes blurIn {
    from { opacity: 0; filter: blur(20px); transform: scale(0.95); }
    to { opacity: 1; filter: blur(0); transform: scale(1); }
  }

  @keyframes slideLeft {
    from { opacity: 0; transform: translateX(50px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes zoomIn {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
  }

  @keyframes glitch {
    0% { opacity: 0; transform: translate(-5px, 5px); filter: hue-rotate(90deg); }
    25% { opacity: 0.8; transform: translate(5px, -5px); filter: hue-rotate(180deg); }
    50% { opacity: 0.6; transform: translate(-3px, 3px); filter: hue-rotate(270deg); }
    75% { opacity: 0.9; transform: translate(3px, -3px); filter: hue-rotate(360deg); }
    100% { opacity: 1; transform: translate(0, 0); filter: hue-rotate(0deg); }
  }

  /* Effects */
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }

  @keyframes glow {
    0%, 100% { box-shadow: 0 0 20px var(--glow-color, rgba(255,255,255,0.1)); }
    50% { box-shadow: 0 0 40px var(--glow-color, rgba(255,255,255,0.2)); }
  }

  @keyframes neonPulse {
    0%, 100% { text-shadow: 0 0 10px currentColor, 0 0 20px currentColor, 0 0 40px currentColor; }
    50% { text-shadow: 0 0 5px currentColor, 0 0 10px currentColor, 0 0 20px currentColor; }
  }

  @keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes scanline {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }

  /* Animation Classes */
  .slide-animate { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
  .slide-fade { animation: fadeIn 0.5s ease-out; }
  .slide-blur { animation: blurIn 0.7s cubic-bezier(0.16, 1, 0.3, 1); }
  .slide-left { animation: slideLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
  .slide-zoom { animation: zoomIn 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
  .slide-glitch { animation: glitch 0.8s cubic-bezier(0.16, 1, 0.3, 1); }

  /* Card Styles */
  .glassmorphism {
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
  }

  .glassmorphism-dark {
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
  }

  .card-brutal {
    background: #fff;
    border: 3px solid #0a0a0a;
    box-shadow: 6px 6px 0 #0a0a0a;
    border-radius: 0;
  }

  .card-soft {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 24px;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.05);
  }

  .card-outline {
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 4px;
  }

  /* Text Effects */
  .gradient-text {
    background: linear-gradient(135deg, currentColor 0%, currentColor 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .neon-text {
    text-shadow: 0 0 10px currentColor, 0 0 20px currentColor, 0 0 40px currentColor;
  }

  .text-stroke {
    -webkit-text-stroke: 2px currentColor;
    -webkit-text-fill-color: transparent;
  }

  /* Decorative Elements */
  .decorative-line {
    width: 60px;
    height: 3px;
    border-radius: 2px;
    margin: 0 auto;
  }

  .decorative-circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.08;
    pointer-events: none;
  }

  /* Noise/Grain Overlay */
  .noise-overlay::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    opacity: 0.03;
    pointer-events: none;
    mix-blend-mode: overlay;
  }

  /* Scanline Effect (for Vapor theme) */
  .scanlines::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.1) 2px,
      rgba(0, 0, 0, 0.1) 4px
    );
    pointer-events: none;
  }

  /* Holographic shimmer */
  .holo-shimmer {
    background: linear-gradient(
      135deg,
      rgba(102, 126, 234, 0.3) 0%,
      rgba(118, 75, 162, 0.3) 25%,
      rgba(240, 147, 251, 0.3) 50%,
      rgba(245, 87, 108, 0.3) 75%,
      rgba(79, 172, 254, 0.3) 100%
    );
    background-size: 400% 400%;
    animation: gradientShift 8s ease infinite;
  }
`;

// ============================================
// TEMPLATE PRESETS
// ============================================

export const SLIDE_TEMPLATES: SlideTemplate[] = [
  {
    id: "pitch-deck",
    name: "Pitch Deck",
    description: "Perfect for startup pitches and investor presentations",
    theme: "brass",
    slides: [
      { id: 1, type: "title", title: "Your Startup Name", subtitle: "Tagline that captures your vision" },
      { id: 2, type: "content", title: "The Problem", bullets: ["Pain point 1", "Pain point 2", "Pain point 3"] },
      { id: 3, type: "accent", title: "Our Solution", subtitle: "How we solve it" },
      { id: 4, type: "twoColumn", title: "Why Now?", leftTitle: "Market Trends", leftBullets: ["Trend 1", "Trend 2"], rightTitle: "Our Edge", rightBullets: ["Advantage 1", "Advantage 2"] },
      { id: 5, type: "content", title: "Business Model", bullets: ["Revenue stream 1", "Revenue stream 2"] },
      { id: 6, type: "quote", quote: "The best time to build was yesterday. The next best time is now.", attribution: "Industry Expert" },
      { id: 7, type: "title", title: "Let's Connect", subtitle: "email@company.com" },
    ],
  },
  {
    id: "tech-talk",
    name: "Tech Talk",
    description: "Ideal for technical presentations and demos",
    theme: "midnight",
    slides: [
      { id: 1, type: "title", title: "Technology Deep Dive", subtitle: "Exploring the architecture" },
      { id: 2, type: "section", title: "Architecture Overview" },
      { id: 3, type: "content", title: "Key Components", bullets: ["Component 1", "Component 2", "Component 3"] },
      { id: 4, type: "comparison", title: "Before & After", leftLabel: "Old Approach", leftItems: ["Slow", "Complex"], rightLabel: "New Approach", rightItems: ["Fast", "Simple"] },
      { id: 5, type: "accent", title: "Live Demo", subtitle: "See it in action" },
      { id: 6, type: "content", title: "Results", bullets: ["Metric 1: 50% improvement", "Metric 2: 2x performance"] },
      { id: 7, type: "title", title: "Questions?", subtitle: "github.com/yourproject" },
    ],
  },
  {
    id: "business-proposal",
    name: "Business Proposal",
    description: "Professional template for business proposals",
    theme: "cobalt",
    slides: [
      { id: 1, type: "title", title: "Business Proposal", subtitle: "Company Name | Date" },
      { id: 2, type: "content", title: "Executive Summary", bullets: ["Key point 1", "Key point 2", "Key point 3"] },
      { id: 3, type: "twoColumn", title: "Our Approach", leftTitle: "Strategy", leftBullets: ["Step 1", "Step 2"], rightTitle: "Timeline", rightBullets: ["Phase 1", "Phase 2"] },
      { id: 4, type: "section", title: "Investment & Returns" },
      { id: 5, type: "comparison", title: "Pricing Options", leftLabel: "Basic", leftItems: ["Feature 1", "Feature 2"], rightLabel: "Premium", rightItems: ["All Basic features", "Extra features"] },
      { id: 6, type: "accent", title: "Why Choose Us", bullets: ["Experience", "Track record", "Support"] },
      { id: 7, type: "title", title: "Next Steps", subtitle: "Let's schedule a call" },
    ],
  },
  {
    id: "creative-portfolio",
    name: "Creative Portfolio",
    description: "Showcase creative work with visual impact",
    theme: "glamour",
    slides: [
      { id: 1, type: "title", title: "Creative Portfolio", subtitle: "Your Name | Designer" },
      { id: 2, type: "quote", quote: "Design is not just what it looks like. Design is how it works.", attribution: "Steve Jobs" },
      { id: 3, type: "section", title: "Featured Projects" },
      { id: 4, type: "image", title: "Project Alpha", caption: "Brand identity redesign" },
      { id: 5, type: "image", title: "Project Beta", caption: "Web application design" },
      { id: 6, type: "content", title: "Services", bullets: ["Brand Design", "UI/UX Design", "Motion Graphics"] },
      { id: 7, type: "accent", title: "Let's Create Together", subtitle: "hello@yoursite.com" },
    ],
  },
  {
    id: "educational",
    name: "Educational",
    description: "Clear and engaging for teaching and training",
    theme: "emerald",
    slides: [
      { id: 1, type: "title", title: "Course Title", subtitle: "Learning Objectives" },
      { id: 2, type: "content", title: "What You'll Learn", bullets: ["Topic 1", "Topic 2", "Topic 3", "Topic 4"] },
      { id: 3, type: "section", title: "Module 1: Introduction" },
      { id: 4, type: "content", title: "Key Concepts", bullets: ["Concept A explained", "Concept B explained"] },
      { id: 5, type: "twoColumn", title: "Practice", leftTitle: "Examples", leftBullets: ["Example 1", "Example 2"], rightTitle: "Exercises", rightBullets: ["Try this", "Then this"] },
      { id: 6, type: "quote", quote: "Education is the most powerful weapon you can use to change the world.", attribution: "Nelson Mandela" },
      { id: 7, type: "accent", title: "Summary & Next Steps", bullets: ["Key takeaway 1", "Key takeaway 2", "Assignment details"] },
    ],
  },
  {
    id: "minimal-keynote",
    name: "Minimal Keynote",
    description: "Clean and sophisticated for executive presentations",
    theme: "sand",
    slides: [
      { id: 1, type: "title", title: "Annual Report", subtitle: "Fiscal Year 2024" },
      { id: 2, type: "content", title: "Highlights", bullets: ["Revenue growth: 25%", "New markets: 3", "Team size: 150+"] },
      { id: 3, type: "section", title: "Strategic Initiatives" },
      { id: 4, type: "twoColumn", title: "Progress", leftTitle: "Completed", leftBullets: ["Initiative 1", "Initiative 2"], rightTitle: "In Progress", rightBullets: ["Initiative 3", "Initiative 4"] },
      { id: 5, type: "comparison", title: "Year over Year", leftLabel: "2023", leftItems: ["$10M revenue", "100 employees"], rightLabel: "2024", rightItems: ["$12.5M revenue", "150 employees"] },
      { id: 6, type: "content", title: "2025 Outlook", bullets: ["Goal 1", "Goal 2", "Goal 3"] },
      { id: 7, type: "title", title: "Thank You", subtitle: "Questions?" },
    ],
  },
  {
    id: "noir-luxury",
    name: "Noir Luxury",
    description: "High-contrast, dramatic black and white for bold statements",
    theme: "noir",
    slides: [
      { id: 1, type: "title", title: "The New Era", subtitle: "Bold. Stark. Uncompromising." },
      { id: 2, type: "quote", quote: "Simplicity is the ultimate sophistication.", attribution: "Leonardo da Vinci" },
      { id: 3, type: "section", title: "Core Principles" },
      { id: 4, type: "content", title: "Market Analysis", bullets: ["Dominant share", "Rapid growth", "High retention"] },
      { id: 5, type: "comparison", title: "Versus Competition", leftLabel: "Us", leftItems: ["Focused", "Premium"], rightLabel: "Them", rightItems: ["Generic", "Commodity"] },
      { id: 6, type: "accent", title: "Vision 2025", subtitle: "Defining the future" },
      { id: 7, type: "title", title: "Join Us", subtitle: "contact@luxury.brand" },
    ],
  },
  {
    id: "paper-doc",
    name: "Paper Doc",
    description: "Warm, textured feel for literary or human-centric topics",
    theme: "paper",
    slides: [
      { id: 1, type: "title", title: "Our Story", subtitle: "A journey of craftsmanship" },
      { id: 2, type: "content", title: "Chapter One", bullets: ["The beginning", "First struggles", "Initial success"] },
      { id: 3, type: "twoColumn", title: "Values", leftTitle: "Tradition", leftBullets: ["Quality", "Heritage"], rightTitle: "Innovation", rightBullets: ["Adaptability", "Future-proof"] },
      { id: 4, type: "quote", quote: "Every great story happens when someone decides not to give up.", attribution: "Spryte Loriano" },
      { id: 5, type: "section", title: "The Methodology" },
      { id: 6, type: "content", title: "Process", bullets: ["Research", "Drafting", "Refining", "Publishing"] },
      { id: 7, type: "title", title: "The End", subtitle: "Thank you for reading" },
    ],
  },
  {
    id: "vibrant-flow",
    name: "Vibrant Flow",
    description: "Colorful, creative gradients for dynamic energy",
    theme: "chromatic",
    slides: [
      { id: 1, type: "title", title: "Creative Spark", subtitle: "Igniting innovation" },
      { id: 2, type: "accent", title: "The Big Idea", subtitle: "Changing the game" },
      { id: 3, type: "content", title: "Features", bullets: ["Dynamic color", "fluid motion", "Engaging layout"] },
      { id: 4, type: "image", title: "Visual Impact", caption: "Show, don't just tell" },
      { id: 5, type: "comparison", title: "Before vs After", leftLabel: "Bland", leftItems: ["Gray", "Static"], rightLabel: "Bold", rightItems: ["Colorful", "Dynamic"] },
      { id: 6, type: "section", title: "Execution Plan" },
      { id: 7, type: "title", title: "Let's Go", subtitle: "Start the journey" },
    ],
  },
  {
    id: "arctic-frost",
    name: "Arctic Frost",
    description: "Cool, refreshing blue tones for healthcare or clean tech",
    theme: "arctic",
    slides: [
      { id: 1, type: "title", title: "Clean Energy", subtitle: "Powering the future" },
      { id: 2, type: "content", title: "Mission", bullets: ["Sustainability", "Efficiency", "Reliability"] },
      { id: 3, type: "twoColumn", title: "Impact", leftTitle: "Global", leftBullets: ["Reduced carbon", "Better air"], rightTitle: "Local", rightBullets: ["Job creation", "Lower costs"] },
      { id: 4, type: "section", title: "Solutions" },
      { id: 5, type: "comparison", title: "Energy Sources", leftLabel: "Fossil", leftItems: ["Finite", "Polluting"], rightLabel: "Renewable", rightItems: ["Infinite", "Clean"] },
      { id: 6, type: "accent", title: "Goal: Net Zero", subtitle: "By 2030" },
      { id: 7, type: "title", title: "Partner With Us", subtitle: "Together we can" },
    ],
  },
  {
    id: "amber-glow",
    name: "Amber Glow",
    description: "Warm, inviting sunset tones for hospitality or lifestyle",
    theme: "amber",
    slides: [
      { id: 1, type: "title", title: "Summer Collection", subtitle: "Warmth & Style" },
      { id: 2, type: "image", title: "Inspiration", caption: "Golden hour moments" },
      { id: 3, type: "content", title: "Trends", bullets: ["Earth tones", "Natural fabrics", "Relaxed fits"] },
      { id: 4, type: "section", title: "Lookbook" },
      { id: 5, type: "twoColumn", title: "Materials", leftTitle: "Cotton", leftBullets: ["Breathable", "Soft"], rightTitle: "Linen", rightBullets: ["Durable", "Classic"] },
      { id: 6, type: "quote", quote: "Style is a way to say who you are without having to speak.", attribution: "Rachel Zoe" },
      { id: 7, type: "title", title: "Shop Now", subtitle: "Available online" },
    ],
  },
  {
    id: "structural-blue",
    name: "Structural Blue",
    description: "Solid, architectural reliability for construction or finance",
    theme: "structural",
    slides: [
      { id: 1, type: "title", title: "Q3 Financials", subtitle: "Stability & Growth" },
      { id: 2, type: "content", title: "Key Metrics", bullets: ["Revenue: +15%", "EBITDA: +8%", "Margins: 22%"] },
      { id: 3, type: "section", title: "Market Analysis" },
      { id: 4, type: "twoColumn", title: "Performance", leftTitle: "Domestic", leftBullets: ["Strong demand", "High volume"], rightTitle: "International", rightBullets: ["Emerging markets", "Currency headwinds"] },
      { id: 5, type: "comparison", title: "Forecast", leftLabel: "Conservative", leftItems: ["5% growth"], rightLabel: "Optimistic", rightItems: ["12% growth"] },
      { id: 6, type: "accent", title: "Strategic Outlook", subtitle: "Long-term value" },
      { id: 7, type: "title", title: "Q&A", subtitle: "Investor relations" },
    ],
  },
  {
    id: "mist-grey",
    name: "Mist Grey",
    description: "Subtle, ethereal elegance for fashion or art",
    theme: "mist",
    slides: [
      { id: 1, type: "title", title: "Modern Art", subtitle: "Exploring the void" },
      { id: 2, type: "quote", quote: "Less is more.", attribution: "Mies van der Rohe" },
      { id: 3, type: "content", title: "Themes", bullets: ["Silence", "Space", "Form"] },
      { id: 4, type: "section", title: "Gallery" },
      { id: 5, type: "image", title: "Exhibit A", caption: "Untitled, 2024" },
      { id: 6, type: "twoColumn", title: "Critique", leftTitle: "Form", leftBullets: ["Balanced", "Subtle"], rightTitle: "Meaning", rightBullets: ["Open", "Interpretive"] },
      { id: 7, type: "title", title: "Visit Us", subtitle: "Gallery hours" },
    ],
  },
  {
    id: "onyx-dark",
    name: "Onyx Dark",
    description: "Premium, sleek darkness for high-end tech",
    theme: "onyx",
    slides: [
      { id: 1, type: "title", title: "Pro Series X", subtitle: "Redefining performance" },
      { id: 2, type: "content", title: "Specs", bullets: ["8-core processor", "32GB RAM", "4TB SSD"] },
      { id: 3, type: "accent", title: "Speed", subtitle: "Unmatched velocity" },
      { id: 4, type: "comparison", title: "Benchmark", leftLabel: "Available", leftItems: ["Standard speed", "Average loading"], rightLabel: "Pro Series", rightItems: ["Instant load", "Zero latency"] },
      { id: 5, type: "section", title: "Design" },
      { id: 6, type: "image", title: "The Chassis", caption: "Aerospace grade aluminum" },
      { id: 7, type: "title", title: "Pre-order", subtitle: "Coming soon" },
    ],
  },
  {
    id: "pure-minimal",
    name: "Pure Minimal",
    description: "Essential, distraction-free design",
    theme: "minimalist",
    slides: [
      { id: 1, type: "title", title: "Focus", subtitle: "The art of concentration" },
      { id: 2, type: "content", title: "Principles", bullets: ["De-clutter", "Prioritize", "Execute"] },
      { id: 3, type: "section", title: "Method" },
      { id: 4, type: "twoColumn", title: "Routine", leftTitle: "Morning", leftBullets: ["Plan", "Review"], rightTitle: "Deep Work", rightBullets: ["Create", "Build"] },
      { id: 5, type: "quote", quote: "Simplicity is the keynote of all true elegance.", attribution: "Coco Chanel" },
      { id: 6, type: "accent", title: "Result", subtitle: "Clarity" },
      { id: 7, type: "title", title: "Begin", subtitle: "Start today" },
    ],
  },

  // ============================================
  // DISTINCTIVE PREMIUM TEMPLATES
  // ============================================

  {
    id: "brutalist-manifesto",
    name: "Brutalist Manifesto",
    description: "Raw, industrial power for bold statements and disruption",
    theme: "brutalist",
    slides: [
      { id: 1, type: "title", title: "NO MORE RULES", subtitle: "A manifesto for change" },
      { id: 2, type: "quote", quote: "BREAK THE MOLD. BUILD SOMETHING RAW.", attribution: "The New Guard" },
      { id: 3, type: "section", title: "THE PROBLEM" },
      { id: 4, type: "content", title: "What's Wrong", bullets: ["Conformity kills creativity", "Safe is forgettable", "Average is invisible"] },
      { id: 5, type: "comparison", title: "OLD VS NEW", leftLabel: "THEN", leftItems: ["Polished", "Safe", "Boring"], rightLabel: "NOW", rightItems: ["Raw", "Bold", "Unforgettable"] },
      { id: 6, type: "accent", title: "THE SOLUTION", subtitle: "Embrace the brutal truth" },
      { id: 7, type: "title", title: "JOIN US", subtitle: "hello@brutal.design" },
    ],
  },
  {
    id: "synthwave-future",
    name: "Synthwave Future",
    description: "Neon-soaked retro-futurism for tech and gaming",
    theme: "vapor",
    slides: [
      { id: 1, type: "title", title: "NEON DREAMS", subtitle: "Welcome to the future" },
      { id: 2, type: "section", title: "ENTER THE GRID" },
      { id: 3, type: "content", title: "Features", bullets: ["Hyperspeed processing", "Neural interface", "Quantum memory", "Holographic display"] },
      { id: 4, type: "quote", quote: "The future is already here — it's just not evenly distributed.", attribution: "William Gibson" },
      { id: 5, type: "twoColumn", title: "Specifications", leftTitle: "Hardware", leftBullets: ["8K resolution", "120Hz refresh"], rightTitle: "Software", rightBullets: ["AI-powered", "Cloud sync"] },
      { id: 6, type: "accent", title: "LAUNCH DATE", subtitle: "2025.01.01" },
      { id: 7, type: "title", title: "PRE-ORDER NOW", subtitle: "neon.tech" },
    ],
  },
  {
    id: "editorial-story",
    name: "Editorial Story",
    description: "Magazine-style sophistication for narratives and thought leadership",
    theme: "editorial",
    slides: [
      { id: 1, type: "title", title: "The Art of Storytelling", subtitle: "A visual essay" },
      { id: 2, type: "quote", quote: "Every great design begins with an even better story.", attribution: "Lorinda Mamo" },
      { id: 3, type: "section", title: "Chapter One" },
      { id: 4, type: "content", title: "The Craft", bullets: ["Begin with why", "Show, don't tell", "Leave space for wonder", "End with impact"] },
      { id: 5, type: "twoColumn", title: "Form & Function", leftTitle: "Design", leftBullets: ["Typography", "Whitespace", "Hierarchy"], rightTitle: "Content", rightBullets: ["Voice", "Narrative", "Emotion"] },
      { id: 6, type: "image", title: "Visual Poetry", caption: "Where words meet design" },
      { id: 7, type: "title", title: "Fin", subtitle: "Thank you for reading" },
    ],
  },
  {
    id: "neogeo-bold",
    name: "Neo Geo Bold",
    description: "Bauhaus-inspired geometric boldness for creative agencies",
    theme: "neogeo",
    slides: [
      { id: 1, type: "title", title: "THINK DIFFERENT", subtitle: "Creative Agency" },
      { id: 2, type: "section", title: "OUR WORK" },
      { id: 3, type: "content", title: "Services", bullets: ["Brand Strategy", "Visual Identity", "Digital Experience", "Motion Design"] },
      { id: 4, type: "comparison", title: "Before & After", leftLabel: "Ordinary", leftItems: ["Generic", "Forgettable"], rightLabel: "Extraordinary", rightItems: ["Distinctive", "Memorable"] },
      { id: 5, type: "twoColumn", title: "Process", leftTitle: "Discover", leftBullets: ["Research", "Insight"], rightTitle: "Create", rightBullets: ["Ideate", "Execute"] },
      { id: 6, type: "quote", quote: "Form follows function.", attribution: "Louis Sullivan" },
      { id: 7, type: "title", title: "LET'S CREATE", subtitle: "hello@neogeo.studio" },
    ],
  },
  {
    id: "organic-wellness",
    name: "Organic Wellness",
    description: "Nature-inspired softness for wellness and lifestyle brands",
    theme: "organic",
    slides: [
      { id: 1, type: "title", title: "Return to Nature", subtitle: "Wellness reimagined" },
      { id: 2, type: "quote", quote: "In every walk with nature, one receives far more than he seeks.", attribution: "John Muir" },
      { id: 3, type: "section", title: "Our Philosophy" },
      { id: 4, type: "content", title: "Core Values", bullets: ["Sustainability first", "Mindful ingredients", "Holistic approach", "Community care"] },
      { id: 5, type: "twoColumn", title: "Products", leftTitle: "Body", leftBullets: ["Natural oils", "Plant extracts"], rightTitle: "Mind", rightBullets: ["Meditation guides", "Wellness rituals"] },
      { id: 6, type: "image", title: "From Earth", caption: "Ethically sourced, lovingly crafted" },
      { id: 7, type: "title", title: "Begin Your Journey", subtitle: "organic.wellness" },
    ],
  },
  {
    id: "holographic-launch",
    name: "Holographic Launch",
    description: "Iridescent futurism for product launches and tech reveals",
    theme: "holographic",
    slides: [
      { id: 1, type: "title", title: "THE NEXT DIMENSION", subtitle: "Product Launch 2025" },
      { id: 2, type: "section", title: "REVEALING" },
      { id: 3, type: "content", title: "Key Features", bullets: ["Holographic display", "Neural sync", "Quantum processing", "Infinite storage"] },
      { id: 4, type: "accent", title: "Revolutionary", subtitle: "Nothing like it exists" },
      { id: 5, type: "comparison", title: "Evolution", leftLabel: "Yesterday", leftItems: ["2D interfaces", "Limited AI"], rightLabel: "Tomorrow", rightItems: ["3D holographics", "Sentient computing"] },
      { id: 6, type: "quote", quote: "The best way to predict the future is to invent it.", attribution: "Alan Kay" },
      { id: 7, type: "title", title: "AVAILABLE SOON", subtitle: "holographic.tech" },
    ],
  },
];

export default SLIDE_TEMPLATES;
