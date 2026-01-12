import { useState } from "react";
import { getSlidePptxColor } from "../slideTemplates";
import type { 
  SlideData, 
  SlideTheme, 
  ShapeData, 
  ExtractedSlideData 
} from "../../../types/slides";
import { extractSlideData } from "../utils/slideExtraction";

interface UseSlideExportProps {
  slides: SlideData[];
  htmlContent?: string;
  title: string;
  currentTheme: SlideTheme;
  onDownloadPptx?: () => void;
}

export function useSlideExport({
  slides,
  htmlContent,
  title,
  currentTheme,
  onDownloadPptx,
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

        // Add other content based on slide type (simplified for basic export)
        if (slide.content) {
          pptSlide.addText(slide.content, {
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

  const downloadAsPdf = async () => {
    if (!htmlContent) {
      window.print();
      return;
    }

    setIsDownloading(true);

    try {
      // Extract slides in editable mode to get both background image AND text elements
      const extractedSlides = await extractSlideData({
        slides,
        htmlContent,
        mode: "editable" // Get text elements for overlay
      });

      // Also get full slide images for backgrounds
      const imageSlides = await extractSlideData({
        slides,
        htmlContent,
        mode: "image"
      });

      const jsPDF = (await import("jspdf")).jsPDF;

      // Use higher resolution for crisp output
      const width = 1280;
      const height = 720;

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [width, height],
        compress: true
      });

      // Helper to convert CSS color to RGB
      const parseColor = (color: string): { r: number; g: number; b: number } => {
        if (!color || color === 'transparent') return { r: 255, g: 255, b: 255 };

        // Handle rgb/rgba
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
          return {
            r: parseInt(rgbMatch[1]),
            g: parseInt(rgbMatch[2]),
            b: parseInt(rgbMatch[3])
          };
        }

        // Handle hex
        const hexMatch = color.match(/#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})/);
        if (hexMatch) {
          return {
            r: parseInt(hexMatch[1], 16),
            g: parseInt(hexMatch[2], 16),
            b: parseInt(hexMatch[3], 16)
          };
        }

        return { r: 255, g: 255, b: 255 };
      };

      for (let i = 0; i < extractedSlides.length; i++) {
        if (i > 0) pdf.addPage([width, height], "landscape");

        const imageSlide = imageSlides[i];
        const editableSlide = extractedSlides[i];

        // Add full slide image as background (preserves exact visual)
        if (imageSlide?.backgroundImage) {
          pdf.addImage(
            imageSlide.backgroundImage,
            "PNG",
            0,
            0,
            width,
            height,
            undefined,
            "FAST"
          );
        }

        // Add invisible text layer for selectability/searchability (OCR-style)
        // Text is fully transparent but still selectable in PDF viewers
        if (editableSlide?.textElements && editableSlide.textElements.length > 0) {
          // Set text to be invisible (transparent) but still selectable
          pdf.setTextColor(0, 0, 0);
          // Use GState to make text fully transparent
          const gState = new (pdf as any).GState({ opacity: 0 });
          pdf.setGState(gState);

          for (const textEl of editableSlide.textElements) {
            if (!textEl.text || textEl.text.trim().length === 0) continue;

            // Set font to match original styling for proper positioning
            const fontStyle = textEl.isBold && textEl.isItalic
              ? "bolditalic"
              : textEl.isBold
                ? "bold"
                : textEl.isItalic
                  ? "italic"
                  : "normal";

            pdf.setFont("helvetica", fontStyle);
            pdf.setFontSize(textEl.fontSize || 16);

            // Position text to overlay exactly on the image text
            const x = textEl.x + 5;
            const y = textEl.y + (textEl.fontSize || 16);

            const maxWidth = textEl.w - 10;
            const lines = pdf.splitTextToSize(textEl.text, maxWidth);

            pdf.text(lines, x, y, {
              maxWidth: maxWidth,
              align: textEl.textAlign === "center" ? "center" :
                     textEl.textAlign === "right" ? "right" : "left"
            });
          }

          // Reset opacity for any future additions
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

  return {
    isDownloading,
    downloadAsPptx,
    downloadAsStyledPptx,
    downloadAsPdf
  };
}
