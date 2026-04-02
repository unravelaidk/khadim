import { useState } from "react";
import { getSlidePptxColor } from "../slideTemplates";
import type { 
  SlideData, 
  SlideTheme, 
} from "../../../types/slides";
import { extractSlideData } from "../utils/slideExtraction";
import { getSlideBodyText } from "../../SlidesPreview/utils";
import { showError, showSuccess } from "../../../lib/toast";

// ── Inline helpers (avoid pulling in the local @khadim/html-to-pptx pkg) ──

const FONT_MAP: Record<string, string> = {
  Inter: "Segoe UI", Roboto: "Segoe UI", "Open Sans": "Segoe UI",
  Lato: "Segoe UI", Montserrat: "Segoe UI", Poppins: "Arial",
  Nunito: "Arial", "Source Sans Pro": "Segoe UI", "system-ui": "Segoe UI",
  "sans-serif": "Arial", "-apple-system": "Segoe UI",
  "Bebas Neue": "Impact", Oswald: "Impact", Anton: "Impact",
  Raleway: "Segoe UI", "DM Sans": "Segoe UI", "Space Grotesk": "Segoe UI",
  Outfit: "Arial", "Playfair Display": "Georgia",
  "Cormorant Garamond": "Georgia", Merriweather: "Georgia",
  Lora: "Georgia", Georgia: "Georgia", serif: "Georgia",
  "Times New Roman": "Times New Roman", "Fira Code": "Consolas",
  "Source Code Pro": "Consolas", "JetBrains Mono": "Consolas",
  Consolas: "Consolas", Monaco: "Consolas", monospace: "Consolas",
  "Courier New": "Courier New",
};

function mapFont(css: string): string {
  for (const f of css.split(",").map((s) => s.trim().replace(/['"]/g, ""))) {
    if (FONT_MAP[f]) return FONT_MAP[f];
    if (["Arial","Calibri","Cambria","Georgia","Times New Roman","Verdana","Segoe UI","Consolas"].includes(f)) return f;
  }
  return "Arial";
}

function cssColorToHex(color: string): string {
  if (color.startsWith("#")) {
    const h = color.slice(1);
    if (h.length === 3) return h.split("").map((c) => c + c).join("");
    if (h.length === 8) return h.slice(0, 6);
    return h;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((p) => Math.round(Math.min(255, Math.max(0, parseFloat(p.trim()) || 0))));
    return [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  const named: Record<string, string> = { white: "ffffff", black: "000000", transparent: "000000" };
  return named[color.toLowerCase()] || "000000";
}

function pptxAlign(a: string): "left" | "center" | "right" | "justify" {
  if (a === "center") return "center";
  if (a === "right" || a === "end") return "right";
  if (a === "justify") return "justify";
  return "left";
}

interface UseSlideExportProps {
  slides: SlideData[];
  htmlContent?: string;
  title: string;
  currentTheme: SlideTheme;
  onDownloadPptx?: () => void;
  workspaceId?: string | null;
}

export function useSlideExport({
  slides,
  htmlContent,
  title,
  currentTheme,
  onDownloadPptx,
  workspaceId,
}: UseSlideExportProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadAsPptx = async () => {
    if (onDownloadPptx) {
      onDownloadPptx();
      return;
    }

    setIsDownloading(true);
    try {
      const pptxgenjs = await import("pptxgenjs");
      const pptx = new pptxgenjs.default();
      pptx.title = title;
      pptx.author = "Khadim AI";
      pptx.layout = "LAYOUT_WIDE";

      for (const slide of slides) {
        const pptSlide = pptx.addSlide();
        const bgColor = getSlidePptxColor(slide.type, currentTheme);
        pptSlide.background = { color: bgColor };

        // Handle light theme text color
        const textColor = currentTheme.id === "minimal" && 
          (slide.type === "content" || slide.type === "quote" || slide.type === "twoColumn" || slide.type === "comparison")
          ? "1a1a1a" : "FFFFFF";

        if (slide.title) {
          const isTitleSlide = slide.type === "title" || slide.type === "section";
          pptSlide.addText(slide.title, {
            x: 0.5,
            y: isTitleSlide ? 2.0 : 0.5,
            w: "90%",
            h: 1.2,
            fontSize: isTitleSlide ? 44 : 32,
            bold: true,
            color: textColor,
            align: "center",
          });
        }

        const bodyText = getSlideBodyText(slide);
        if (bodyText) {
          pptSlide.addText(bodyText, {
            x: 0.5,
            y: 2.0,
            w: "90%",
            h: 3.5,
            fontSize: 18,
            color: textColor,
            align: "left",
            valign: "top"
          });
        }
      }

      await pptx.writeFile({ fileName: `${title.replace(/[^a-z0-9]/gi, "_")}.pptx` });
    } catch (error) {
      console.error("Error generating PPTX:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadAsStyledPptx = async () => {
    if (!htmlContent) {
      console.error("No HTML content available for styled PPTX export");
      return;
    }

    setIsDownloading(true);
    
    try {
      const { createPresentation, addSlideFromData, exportToFile } = await import("@khadim/html-to-pptx");

      const extractedSlides = await extractSlideData({
        slides,
        htmlContent,
        mode: "editable"
      });

      if (extractedSlides.length > 0) {
        const pptx = createPresentation({
          title: title,
          author: "Khadim AI",
          layout: "LAYOUT_WIDE",
        });

        for (const data of extractedSlides) {
          addSlideFromData(pptx, data, { width: 1280, height: 720, pptxWidth: 13.33, pptxHeight: 7.5 });
        }

        await exportToFile(pptx, `${title.replace(/[^a-z0-9]/gi, "_")}.pptx`);
      }
    } catch (error) {
      console.error("Error generating PPTX:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  /**
   * Hybrid PPTX export — pixel-perfect background + editable text.
   *
   * 1. Renders each slide in an iframe, hides text, captures the
   *    background / decorations as a high-res image via html2canvas.
   * 2. Extracts every text element with its computed position, size,
   *    font, color, weight, etc.
   * 3. Builds a PPTX where each slide has the captured image as a
   *    full-bleed background and native editable text boxes on top.
   *
   * Result: visuals match the HTML exactly, and every piece of text
   * is still selectable / editable in PowerPoint.
   */
  const downloadAsImagePptx = async () => {
    if (!htmlContent) {
      showError("No HTML content available for PPTX export.");
      return;
    }

    setIsDownloading(true);

    try {
      // "editable" mode already captures a background image (text hidden)
      // AND extracts text elements — exactly what the hybrid needs.
      const extractedSlides = await extractSlideData({
        slides,
        htmlContent,
        mode: "editable",
      });

      if (extractedSlides.length === 0) {
        showError("No slides could be captured.");
        return;
      }

      const pptxgenjs = await import("pptxgenjs");
      const pptx = new pptxgenjs.default();
      pptx.title = title;
      pptx.author = "Khadim AI";
      pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in (16:9)

      // Slide dimensions (px → inches)
      const W_PX = 1280;
      const H_PX = 720;
      const W_IN = 13.333;
      const H_IN = 7.5;
      const SX = W_IN / W_PX;
      const SY = H_IN / H_PX;

      for (const data of extractedSlides) {
        const slide = pptx.addSlide();

        // ── 1. Background image (pixel-perfect) ────────────────────
        if (data.backgroundImage) {
          slide.addImage({
            data: data.backgroundImage,
            x: 0,
            y: 0,
            w: "100%",
            h: "100%",
          });
        } else {
          slide.background = { color: cssColorToHex(data.backgroundColor) };
        }

        // ── 2. Editable text boxes ─────────────────────────────────
        for (const t of data.textElements) {
          const x = t.x * SX;
          const y = t.y * SY;
          const w = Math.max(t.w * SX, 0.8);
          const h = Math.max(t.h * SY, 0.35);

          // Skip off-slide elements
          if (x >= W_IN || y >= H_IN) continue;

          const opts: Record<string, unknown> = {
            x,
            y,
            w,
            h,
            fontSize: Math.round(t.fontSize * 0.75), // px → pt
            fontFace: mapFont(t.fontFamily),
            color: cssColorToHex(t.color),
            bold: t.isBold,
            italic: t.isItalic,
            align: pptxAlign(t.textAlign),
            valign: "middle",
            wrap: true,
            transparent: true, // no text-box fill
          };

          if (t.lineSpacingMultiple && t.lineSpacingMultiple > 0) {
            opts.lineSpacingMultiple = Math.round(t.lineSpacingMultiple * 100) / 100;
          }
          if (t.letterSpacing && t.letterSpacing !== 0) {
            opts.charSpacing = Math.round(t.letterSpacing * 0.75);
          }

          slide.addText(t.text, opts);
        }
      }

      const safeTitle = title.replace(/[^a-z0-9]/gi, "_");
      await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
      showSuccess("PPTX downloaded successfully.");
    } catch (error) {
      console.error("Error generating hybrid PPTX:", error);
      showError("Failed to export PPTX.");
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadAsPdf = async () => {
    if (!htmlContent) {
      window.print();
      return;
    }

    setIsDownloading(true);

    try {
      const { downloadSlidePdf } = await import("../utils/slidePdfBuilder");

      // "editable" mode captures background image (text hidden) + text elements
      const extractedSlides = await extractSlideData({
        slides,
        htmlContent,
        mode: "editable",
      });

      if (extractedSlides.length === 0) {
        showError("No slides could be captured.");
        return;
      }

      await downloadSlidePdf(extractedSlides, title);
      showSuccess("PDF downloaded successfully.");
    } catch (error) {
      console.error("Error generating PDF:", error);
      // Fallback to window.print if react-pdf fails
      try {
        window.print();
      } catch (_) {
        showError(`Failed to export PDF: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const savePdfToWorkspace = async () => {
    if (!workspaceId) {
      showError("Open a workspace to save this PDF there.");
      return;
    }

    if (!htmlContent) {
      showError("No slide HTML is available to save as PDF.");
      return;
    }

    setIsDownloading(true);

    try {
      const { buildSlidePdfBase64 } = await import("../utils/slidePdfBuilder");

      const extractedSlides = await extractSlideData({
        slides,
        htmlContent,
        mode: "editable",
      });

      if (extractedSlides.length === 0) {
        showError("No slides could be captured.");
        return;
      }

      const { base64, size } = await buildSlidePdfBase64(extractedSlides, title);

      const formData = new FormData();
      formData.append("workspaceId", workspaceId);
      formData.append("path", `exports/${title.replace(/[^a-z0-9]/gi, "_")}.pdf`);
      formData.append("content", `base64:${base64}`);
      formData.append("mimeType", "application/pdf");
      formData.append("size", String(size));

      const response = await fetch("/api/workspace-files", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to save PDF to workspace");
      }

      showSuccess("PDF saved to workspace.");
    } catch (error) {
      console.error("Error saving PDF to workspace:", error);
      showError("Failed to save PDF to workspace.");
    } finally {
      setIsDownloading(false);
    }
  };

  return {
    isDownloading,
    downloadAsPptx,
    downloadAsStyledPptx,
    downloadAsImagePptx,
    downloadAsPdf,
    savePdfToWorkspace,
  };
}
