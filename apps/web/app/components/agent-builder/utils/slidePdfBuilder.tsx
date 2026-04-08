/**
 * Hybrid PDF builder using @react-pdf/renderer + react-pdf-tailwind.
 *
 * Strategy:
 *  1. Background image (from html2canvas) → pixel-perfect decorations.
 *  2. Native vector <Text> elements layered on top → crisp at any zoom,
 *     selectable, searchable, small file size.
 *
 * Exported helpers are pure functions / React elements that can be called
 * from useSlideExport without rendering to the DOM.
 */

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Font,
  pdf,
} from "@react-pdf/renderer";
import { createTw } from "react-pdf-tailwind";
import type { ExtractedSlideData } from "../../../types/slides";

// ── Tailwind helper (configurable later) ─────────────────────────────
const tw = createTw({});

// ── Font registration (sans / serif / mono) ──────────────────────────
// Use system-safe defaults that ship with @react-pdf
// Users can register custom fonts before calling buildPdf.
const SAFE_FONTS_REGISTERED = { current: false };

function ensureFonts() {
  if (SAFE_FONTS_REGISTERED.current) return;
  SAFE_FONTS_REGISTERED.current = true;

  try {
    // Register Inter from Google Fonts for nicer slides.
    Font.register({
      family: "Inter",
      fonts: [
        { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf", fontWeight: 400 },
        { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf", fontWeight: 600 },
        { src: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf", fontWeight: 700 },
        {
          src: "https://fonts.gstatic.com/s/inter/v20/UcCM3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTc2dthjQ.ttf",
          fontWeight: 400,
          fontStyle: "italic",
        },
      ],
    });
  } catch (e) {
    console.warn("Failed to register Inter font, falling back to Helvetica", e);
  }

  // Disable word hyphenation for slide text
  Font.registerHyphenationCallback((word) => [word]);
}

// ── Colour helpers ───────────────────────────────────────────────────

function cssToReactPdfColor(raw: string): string {
  if (!raw || raw === "transparent" || raw === "rgba(0, 0, 0, 0)") return "transparent";
  if (raw.startsWith("#")) return raw;
  const m = raw.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map((s) => s.trim());
    const [r, g, b] = parts.map((p) => Math.round(Math.min(255, Math.max(0, parseFloat(p) || 0))));
    const a = parts.length >= 4 ? parseFloat(parts[3]) : 1;
    if (a < 1) return `rgba(${r},${g},${b},${a})`;
    return `rgb(${r},${g},${b})`;
  }
  return raw;
}

// ── Font family mapper ───────────────────────────────────────────────

const FONT_MAP: Record<string, string> = {
  Inter: "Inter",
  Roboto: "Inter",
  "Open Sans": "Inter",
  Lato: "Inter",
  Montserrat: "Inter",
  Poppins: "Inter",
  "system-ui": "Inter",
  "sans-serif": "Inter",
  "-apple-system": "Inter",
  "Playfair Display": "Times-Roman",
  Georgia: "Times-Roman",
  "Cormorant Garamond": "Times-Roman",
  Merriweather: "Times-Roman",
  Lora: "Times-Roman",
  serif: "Times-Roman",
  "Times New Roman": "Times-Roman",
  "Fira Code": "Courier",
  "Source Code Pro": "Courier",
  "JetBrains Mono": "Courier",
  Consolas: "Courier",
  Monaco: "Courier",
  monospace: "Courier",
  "Courier New": "Courier",
};

function mapFontFamily(css: string): string {
  for (const f of css.split(",").map((s) => s.trim().replace(/['"]/g, ""))) {
    if (FONT_MAP[f]) return FONT_MAP[f];
  }
  return "Inter";
}

// ── Alignment helper ─────────────────────────────────────────────────

function mapAlign(a: string): "left" | "center" | "right" | "justify" {
  if (a === "center") return "center";
  if (a === "right" || a === "end") return "right";
  if (a === "justify") return "justify";
  return "left";
}

// ── Slide dimensions (pt — 1 pt = 1/72 inch) ────────────────────────
// 16:9 widescreen: 13.333 × 7.5 in → 960 × 540 pt
const SLIDE_W = 960;
const SLIDE_H = 540;
const PX_W = 1280;
const PX_H = 720;
const SX = SLIDE_W / PX_W;
const SY = SLIDE_H / PX_H;

// ── React-PDF Document ───────────────────────────────────────────────

interface SlideDocumentProps {
  title: string;
  author: string;
  slides: ExtractedSlideData[];
}

function SlideDocument({ title, author, slides }: SlideDocumentProps) {
  return (
    <Document title={title} author={author} creator="Khadim AI">
      {slides.map((slide, idx) => (
        <Page
          key={idx}
          size={[SLIDE_W, SLIDE_H]}
          style={tw("relative overflow-hidden")}
        >
          {/* Layer 1 — Background image (pixel-perfect decorations) */}
          {slide.backgroundImage && (
            <Image
              src={slide.backgroundImage}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: SLIDE_W,
                height: SLIDE_H,
              }}
            />
          )}

          {/* Layer 2 — Native vector text elements */}
          {slide.textElements.map((t, ti) => {
            const x = t.x * SX;
            const y = t.y * SY;
            const w = Math.max(t.w * SX, 20);
            const h = Math.max(t.h * SY, 12);

            // Skip off-slide
            if (x >= SLIDE_W || y >= SLIDE_H) return null;

            const fontSize = Math.max(Math.round(t.fontSize * 0.75), 6); // px → pt
            const color = cssToReactPdfColor(t.color);
            const fontFamily = mapFontFamily(t.fontFamily);
            const fontWeight = t.isBold ? "bold" : "normal";
            const fontStyle = t.isItalic ? "italic" : "normal";
            const textAlign = mapAlign(t.textAlign);

            return (
              <View
                key={ti}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: w,
                  height: h,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize,
                    fontFamily,
                    fontWeight,
                    fontStyle,
                    color,
                    textAlign,
                    lineHeight: t.lineSpacingMultiple && t.lineSpacingMultiple > 0
                      ? t.lineSpacingMultiple
                      : 1.25,
                    letterSpacing: t.letterSpacing
                      ? t.letterSpacing * 0.75
                      : undefined,
                  }}
                >
                  {t.text}
                </Text>
              </View>
            );
          })}
        </Page>
      ))}
    </Document>
  );
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Build a PDF blob from extracted slide data.
 * Uses background images for decorations and native <Text> for crisp,
 * selectable, searchable vector text.
 */
export async function buildSlidePdfBlob(
  slides: ExtractedSlideData[],
  title: string,
  author = "Khadim AI"
): Promise<Blob> {
  ensureFonts();

  const doc = React.createElement(SlideDocument, { title, author, slides });
  const instance = pdf(doc);
  const blob = await instance.toBlob();
  return blob;
}

/**
 * Build a PDF and trigger a browser download.
 */
export async function downloadSlidePdf(
  slides: ExtractedSlideData[],
  title: string,
  author = "Khadim AI"
): Promise<void> {
  const blob = await buildSlidePdfBlob(slides, title, author);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build a PDF and return as base64 string (for workspace upload).
 */
export async function buildSlidePdfBase64(
  slides: ExtractedSlideData[],
  title: string,
  author = "Khadim AI"
): Promise<{ base64: string; size: number }> {
  const blob = await buildSlidePdfBlob(slides, title, author);
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return { base64: btoa(binary), size: bytes.length };
}
