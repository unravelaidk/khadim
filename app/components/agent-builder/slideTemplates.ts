// Slide Template System
// Premium themes and slide types for beautiful presentations

// ============================================
// THEME PRESETS - Professional Grade
// ============================================

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
]);

// ============================================
// SLIDE TYPES
// ============================================




// ============================================
// UTILITY FUNCTIONS
// ============================================

export function getSlideBackground(
  slideType: SlideType,
  theme: SlideTheme
): string {
  const typeKey = slideType === "twoColumn" ? "twoColumn" : slideType;
  return theme.backgrounds[typeKey] || theme.backgrounds.content;
}

export function getSlidePptxColor(
  slideType: SlideType,
  theme: SlideTheme
): string {
  const typeKey = slideType === "twoColumn" ? "twoColumn" : slideType;
  return theme.pptxColors[typeKey] || theme.pptxColors.content;
}

export function getDefaultTheme(): SlideTheme {
  return SLIDE_THEMES.get("brass")!;
}

export function getThemeById(id: string): SlideTheme {
  return SLIDE_THEMES.get(id) || SLIDE_THEMES.get("brass")!;
}

export function isLightTheme(theme: SlideTheme): boolean {
  return ["sand", "arctic", "mist", "chromatic"].includes(theme.id);
}

// ============================================
// CSS STYLES FOR SLIDES
// ============================================

export const slideAnimationStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@400;600;700&family=Poppins:wght@400;500;600;700&display=swap');

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

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

  .slide-animate {
    animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .slide-fade {
    animation: fadeIn 0.5s ease-out;
  }

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

  .gradient-text {
    background: linear-gradient(135deg, currentColor 0%, currentColor 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

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
];

export default SLIDE_TEMPLATES;
