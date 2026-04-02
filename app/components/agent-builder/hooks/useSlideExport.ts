import { useState } from "react";
import { getSlidePptxColor } from "../slideTemplates";
import type { 
  SlideData, 
  SlideTheme, 
} from "../../../types/slides";
import { extractSlideData } from "../utils/slideExtraction";
import { getSlideBodyText } from "../../SlidesPreview/utils";
import { showError, showSuccess } from "../../../lib/toast";

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
   * Pixel-perfect PPTX export: captures each slide as a high-resolution
   * image via html2canvas and embeds it as a full-bleed slide background.
   * Output matches the on-screen rendering exactly.
   */
  const downloadAsImagePptx = async () => {
    if (!htmlContent) {
      showError("No HTML content available for PPTX export.");
      return;
    }

    setIsDownloading(true);

    try {
      // Capture every slide as a full-resolution image
      const imageSlides = await extractSlideData({
        slides,
        htmlContent,
        mode: "image",
      });

      if (imageSlides.length === 0) {
        showError("No slides could be captured.");
        return;
      }

      const pptxgenjs = await import("pptxgenjs");
      const pptx = new pptxgenjs.default();
      pptx.title = title;
      pptx.author = "Khadim AI";
      pptx.layout = "LAYOUT_WIDE"; // 13.33" × 7.5" (16:9)

      for (const imgSlide of imageSlides) {
        const slide = pptx.addSlide();

        if (imgSlide.backgroundImage) {
          // Full-bleed image covering the entire slide
          slide.addImage({
            data: imgSlide.backgroundImage,
            x: 0,
            y: 0,
            w: "100%",
            h: "100%",
          });
        }
      }

      const safeTitle = title.replace(/[^a-z0-9]/gi, "_");
      await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
      showSuccess("PPTX downloaded successfully.");
    } catch (error) {
      console.error("Error generating image-based PPTX:", error);
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
      // Extract full slide images + text for searchable PDF
      const [imageSlides, editableSlides] = await Promise.all([
        extractSlideData({ slides, htmlContent, mode: "image" }),
        extractSlideData({ slides, htmlContent, mode: "editable" }),
      ]);

      const jsPDF = (await import("jspdf")).jsPDF;

      const width = 1280;
      const height = 720;

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [width, height],
        compress: true
      });

      for (let i = 0; i < slides.length; i++) {
        if (i > 0) pdf.addPage([width, height], "landscape");

        const imageSlide = imageSlides[i];
        const editableSlide = editableSlides[i];

        // Full slide screenshot as background — pixel-perfect
        if (imageSlide?.backgroundImage) {
          pdf.addImage(imageSlide.backgroundImage, "PNG", 0, 0, width, height, undefined, "FAST");
        }

        // Invisible text layer for copy/paste and search
        if (editableSlide?.textElements?.length) {
          pdf.setTextColor(0, 0, 0);
          const gState = new (pdf as any).GState({ opacity: 0 });
          pdf.setGState(gState);

          for (const textEl of editableSlide.textElements) {
            if (!textEl.text?.trim()) continue;

            const fontStyle = textEl.isBold && textEl.isItalic ? "bolditalic"
              : textEl.isBold ? "bold"
              : textEl.isItalic ? "italic"
              : "normal";

            pdf.setFont("helvetica", fontStyle);
            pdf.setFontSize(textEl.fontSize || 16);

            const x = textEl.x + 5;
            const y = textEl.y + (textEl.fontSize || 16);
            const maxWidth = textEl.w - 10;
            const lines = pdf.splitTextToSize(textEl.text, maxWidth);

            pdf.text(lines, x, y, {
              maxWidth,
              align: textEl.textAlign === "center" ? "center" :
                     textEl.textAlign === "right" ? "right" : "left"
            });
          }

          const resetGState = new (pdf as any).GState({ opacity: 1 });
          pdf.setGState(resetGState);
        }
      }

      pdf.save(`${title.replace(/[^a-z0-9]/gi, "_")}.pdf`);

    } catch (error) {
      console.error("Error generating PDF:", error);
      window.print();
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
      const [imageSlides, editableSlides] = await Promise.all([
        extractSlideData({ slides, htmlContent, mode: "image" }),
        extractSlideData({ slides, htmlContent, mode: "editable" }),
      ]);

      const jsPDF = (await import("jspdf")).jsPDF;
      const width = 1280;
      const height = 720;
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [width, height],
        compress: true,
      });

      for (let i = 0; i < slides.length; i++) {
        if (i > 0) pdf.addPage([width, height], "landscape");

        const imageSlide = imageSlides[i];
        const editableSlide = editableSlides[i];

        if (imageSlide?.backgroundImage) {
          pdf.addImage(imageSlide.backgroundImage, "PNG", 0, 0, width, height, undefined, "FAST");
        }

        if (editableSlide?.textElements?.length) {
          pdf.setTextColor(0, 0, 0);
          const gState = new (pdf as any).GState({ opacity: 0 });
          pdf.setGState(gState);

          for (const textEl of editableSlide.textElements) {
            if (!textEl.text?.trim()) continue;
            const fontStyle = textEl.isBold && textEl.isItalic ? "bolditalic"
              : textEl.isBold ? "bold"
              : textEl.isItalic ? "italic"
              : "normal";
            pdf.setFont("helvetica", fontStyle);
            pdf.setFontSize(textEl.fontSize || 16);
            const x = textEl.x + 5;
            const y = textEl.y + (textEl.fontSize || 16);
            const maxWidth = textEl.w - 10;
            const lines = pdf.splitTextToSize(textEl.text, maxWidth);
            pdf.text(lines, x, y, {
              maxWidth,
              align: textEl.textAlign === "center" ? "center" : textEl.textAlign === "right" ? "right" : "left",
            });
          }

          const resetGState = new (pdf as any).GState({ opacity: 1 });
          pdf.setGState(resetGState);
        }
      }

      const arrayBuffer = pdf.output("arraybuffer");
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      const formData = new FormData();
      formData.append("workspaceId", workspaceId);
      formData.append("path", `exports/${title.replace(/[^a-z0-9]/gi, "_")}.pdf`);
      formData.append("content", `base64:${base64}`);
      formData.append("mimeType", "application/pdf");
      formData.append("size", String(bytes.length));

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
