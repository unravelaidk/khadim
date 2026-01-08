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
      window.print(); // Fallback
      return;
    }

    setIsDownloading(true);

    try {
      // Use the same extraction logic but in 'image' mode (captures full slide visual)
      const extractedSlides = await extractSlideData({
         slides,
         htmlContent,
         mode: "image"
      });
      
      const jsPDF = (await import("jspdf")).jsPDF;
      // Initialize with 16:9 landscape format (approx A4 landscape is 297x210, 16:9 matches screen better)
      // 1280px x 720px at 96 DPI is approx 13.33in x 7.5in.
      // jsPDF units: 'pt', 'mm', 'cm', 'in'. 
      // Let's use points or just fit to standard landscape page.
      
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [1280, 720] // Exact match to our extraction size
      });

      extractedSlides.forEach((slide, index) => {
        if (index > 0) pdf.addPage([1280, 720], "landscape");
        
        if (slide.backgroundImage) {
          // Add the full slide image
          pdf.addImage(
            slide.backgroundImage, 
            "PNG", 
            0, 
            0, 
            1280, 
            720,
            undefined, 
            "FAST"
          );
        } else {
            // Fallback if no image (shouldn't happen with our logic)
            pdf.setFillColor(slide.backgroundColor);
            pdf.rect(0, 0, 1280, 720, "F");
        }
      });

      pdf.save(`${title.replace(/[^a-z0-9]/gi, "_")}.pdf`);

    } catch (error) {
      console.error("Error generating PDF:", error);
      // Fallback to print if jspdf fails
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
