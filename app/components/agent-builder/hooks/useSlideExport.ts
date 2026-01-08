import { useState } from "react";
import { getSlidePptxColor } from "../slideTemplates";
import type { 
  SlideData, 
  SlideTheme, 
  ShapeData, 
  ExtractedSlideData 
} from "../../../types/slides";

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
      const html2canvas = (await import("html2canvas")).default;

      // Create a hidden container for rendering slides
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "1280px";
      container.style.height = "720px";
      document.body.appendChild(container);

      // Collect extracted slide data (not DOM elements)
      const extractedSlides: ExtractedSlideData[] = [];

      for (let i = 0; i < slides.length; i++) {
        // Create iframe for this slide
        const iframe = document.createElement("iframe");
        iframe.style.width = "1280px";
        iframe.style.height = "720px";
        iframe.style.border = "none";
        container.innerHTML = "";
        container.appendChild(iframe);

        // Inject HTML with slide isolation
        const slideControlScript = `
          <style>
            html, body {
              margin: 0;
              padding: 0;
              overflow: hidden;
              width: 1280px !important;
              height: 720px !important;
            }
          </style>
          <script>
            window.addEventListener('load', function() {
              const slides = document.querySelectorAll('section.slide, .slide, section');
              slides.forEach((slide, index) => {
                if (index !== ${i}) {
                  slide.style.display = 'none';
                } else {
                  slide.style.display = 'flex';
                  slide.style.width = '1280px';
                  slide.style.height = '720px';
                  slide.style.minHeight = '720px';
                  slide.style.maxHeight = '720px';
                  slide.style.overflow = 'hidden';
                }
              });
            });
          </script>
        `;
        
        const modifiedHtml = htmlContent.replace('</head>', `${slideControlScript}</head>`);
        
        // Write to iframe
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) continue;
        
        iframeDoc.open();
        iframeDoc.write(modifiedHtml);
        iframeDoc.close();

        // Wait for content to load (including Tailwind CDN)
        await new Promise(resolve => {
          iframe.onload = resolve;
          setTimeout(resolve, 2000);
        });

        // Extra wait for Tailwind to apply
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get the slide element by index and extract data while still in iframe
        const allSlideElements = iframeDoc.querySelectorAll('section.slide, .slide, section');
        const slideElement = allSlideElements[i] as HTMLElement;
        if (slideElement && iframe.contentWindow) {
          // Use the iframe's window for getComputedStyle
          const iframeWindow = iframe.contentWindow;
          const slideRect = slideElement.getBoundingClientRect();
          
          // Capture slide as background image for 1:1 visual fidelity
          // Hide CONTENT elements only so background/decorative elements are captured
          let backgroundImage: string | undefined;
          try {
            // Find and hide content elements (text and content cards)
            // We want to keep decorative blobs visible for the screenshot
            const contentElementsToHide: HTMLElement[] = [];
            
            // 1. All text containing elements
            const textSelector = 'h1, h2, h3, h4, h5, h6, p, span, li, a, strong, em, b, i, label, button';
            slideElement.querySelectorAll(textSelector).forEach(el => contentElementsToHide.push(el as HTMLElement));
            
            // 2. Divs that have text content (cards)
            slideElement.querySelectorAll('div').forEach(el => {
              const div = el as HTMLElement;
              // Check if it has direct text or contains text elements
              if (div.innerText && div.innerText.trim().length > 0) {
                 // Check if it's a "card" (has background/border)
                 const style = iframeWindow.getComputedStyle(div);
                 const hasBg = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
                 const hasBorder = parseFloat(style.borderWidth) > 0 && style.borderColor !== 'transparent';
                 
                 // If it's a visible card with text, hide it (will be extracted as shape+text)
                 if (hasBg || hasBorder) {
                   contentElementsToHide.push(div);
                 }
              }
            });

            // Store original visibility
            const originalVisibility: Map<HTMLElement, string> = new Map();
            contentElementsToHide.forEach(el => {
              originalVisibility.set(el, el.style.visibility);
              el.style.visibility = 'hidden';
            });
            
            // Capture only the background (slide element with decorative blobs)
            const canvas = await html2canvas(slideElement, {
              width: 1280,
              height: 720,
              scale: 1,
              useCORS: true,
              allowTaint: true,
              backgroundColor: null,
              logging: false,
            });
            backgroundImage = canvas.toDataURL('image/png');
            
            // Restore visibility
            contentElementsToHide.forEach(el => {
              el.style.visibility = originalVisibility.get(el) || '';
            });
          } catch (err) {
            console.warn('Failed to capture slide background:', err);
          }
          
          // Extract data manually using iframe's window context
          const style = iframeWindow.getComputedStyle(slideElement);
          let backgroundColor = style.backgroundColor;
          if (backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') {
            const bgImage = style.backgroundImage;
            if (bgImage && bgImage.includes('gradient')) {
              const colorMatch = bgImage.match(/rgba?\([^)]+\)|#[a-fA-F0-9]{3,8}/);
              backgroundColor = colorMatch ? colorMatch[0] : 'rgb(15, 23, 42)';
            } else {
              backgroundColor = 'rgb(15, 23, 42)'; // Default dark slate
            }
          }
          
          // Extract all text elements using leaf element detection
          const textElements: Array<{
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
          }> = [];
          
          // Collect outermost text containers only (avoid nested duplicates)
          // Priority order: h1-h6, p first, then other elements
          const primarySelectors = 'h1, h2, h3, h4, h5, h6, p';
          const secondarySelectors = 'li, a, label, button';
          
          const processedElements = new Set<Element>();
          
          const processElement = (element: HTMLElement) => {
            // Skip if already processed or is descendant of processed element
            if (processedElements.has(element)) return;
            for (const processed of processedElements) {
              if (processed.contains(element)) return;
            }
            
            const elStyle = iframeWindow.getComputedStyle(element);
            
            // Skip hidden elements
            if (elStyle.display === 'none' || elStyle.visibility === 'hidden' || elStyle.opacity === '0') {
              return;
            }
            
            // Get full text content (includes nested text)
            // Use innerText to preserve spacing better than textContent
            let text = element.innerText?.trim(); 
            // Fallback to textContent if innerText is empty (sometimes happens with specific visibility)
            if (!text) text = element.textContent?.trim() || '';
            
            if (!text) return;
            
            // Clean up newlines for PPTX title single-line handling
            if (element.tagName.toLowerCase().startsWith('h')) {
                text = text.replace(/\s+/g, ' ');
            }
            
            const elRect = element.getBoundingClientRect();
            
            // Skip tiny elements
            if (elRect.width < 5 || elRect.height < 5) return;
            
            const x = Math.max(0, elRect.left - slideRect.left);
            const y = Math.max(0, elRect.top - slideRect.top);
            
            // Skip elements outside the slide
            if (x > slideRect.width || y > slideRect.height) return;
            
            const fontWeight = elStyle.fontWeight;
            const isBold = parseInt(fontWeight, 10) >= 600 || fontWeight === 'bold' || fontWeight === 'bolder';
            
            // Get text color
            let color = elStyle.color || 'rgb(255, 255, 255)';
            if (color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
              color = 'rgb(255, 255, 255)';
            }
            
            textElements.push({
              text,
              x,
              y,
              w: elRect.width,
              h: elRect.height,
              fontSize: parseFloat(elStyle.fontSize) || 16,
              fontFamily: 'Arial', // Force standard font compatibility
              color,
              backgroundColor: elStyle.backgroundColor,
              isBold,
              isItalic: elStyle.fontStyle === 'italic',
              textAlign: elStyle.textAlign || 'center',
            });
            
            // Mark this element and all descendants as processed
            processedElements.add(element);
            element.querySelectorAll('*').forEach(child => processedElements.add(child));
          };
          
          // Process primary elements first (headers, paragraphs)
          slideElement.querySelectorAll(primarySelectors).forEach(el => {
            processElement(el as HTMLElement);
          });
          
          // Then secondary elements
          slideElement.querySelectorAll(secondarySelectors).forEach(el => {
            processElement(el as HTMLElement);
          });
          
          // Finally, look for divs that contain text but weren't covered
          slideElement.querySelectorAll('div').forEach(el => {
            const div = el as HTMLElement;
            const text = div.textContent?.trim();
            if (!text) return;
            
            // Check if this div's text is already covered
            let alreadyCovered = false;
            for (const processed of processedElements) {
              if (processed.contains(div) || div.contains(processed)) {
                alreadyCovered = true;
                break;
              }
            }
            
            if (!alreadyCovered) {
              // Check if it's a leaf div (no child divs with text)
              const hasChildDivWithText = Array.from(div.querySelectorAll('div'))
                .some(child => child.textContent?.trim());
              
              if (!hasChildDivWithText) {
                processElement(div);
              }
            }
          });
          
          // Sort by position for better reading order
          textElements.sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) > 30) return yDiff;
            return a.x - b.x;
          });
          
          // Extract shape elements (cards, boxes) - ONLY if they contain text
          // Pure decorative blobs (empty, blurred) are left in the background image
          const shapeElements: ShapeData[] = [];
          
          // Find divs that look like cards (have visible background or border)
          slideElement.querySelectorAll('div').forEach(el => {
            const div = el as HTMLElement;
            const divStyle = iframeWindow.getComputedStyle(div);
            const divRect = div.getBoundingClientRect();
            
            // Skip tiny or hidden elements
            if (divRect.width < 20 || divRect.height < 20) return;
            if (divStyle.display === 'none' || divStyle.visibility === 'hidden') return;
            
            const bgColor = divStyle.backgroundColor;
            const borderColor = divStyle.borderColor;
            const borderWidth = parseFloat(divStyle.borderWidth) || 0;
            const borderRadius = parseFloat(divStyle.borderRadius) || 0;
            const opacity = parseFloat(divStyle.opacity) || 1;
            
            // Only include if it has visible background or border
            const hasVisibleBg = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
            const hasVisibleBorder = borderWidth > 0 && borderColor && borderColor !== 'transparent';
            
            if (!hasVisibleBg && !hasVisibleBorder) return;
            
            // CRITICAL: Only extract shapes that HAVE CONTENT (text)
            // Empty shapes are assumed to be decorative (blobs, gradients) and are left in the BG image
            const hasContent = div.innerText && div.innerText.trim().length > 0;
            
            if (!hasContent) return;
            
            // Skip if this contains direct text (those are handled as text elements)
            const hasDirectText = Array.from(div.childNodes).some(
              node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
            );
            if (hasDirectText) return;
            
            const x = Math.max(0, divRect.left - slideRect.left);
            const y = Math.max(0, divRect.top - slideRect.top);
            
            // Skip elements outside the slide
            if (x > slideRect.width || y > slideRect.height) return;
            
            // Determine if it's a circle (border-radius >= 50% of dimensions)
            const isCircle = borderRadius >= Math.min(divRect.width, divRect.height) / 2;
            
            shapeElements.push({
              type: isCircle ? 'ellipse' : 'rect',
              x,
              y: y,
              w: divRect.width,
              h: divRect.height,
              fill: hasVisibleBg ? bgColor : 'transparent',
              borderColor: hasVisibleBorder ? borderColor : undefined,
              borderWidth: hasVisibleBorder ? borderWidth : undefined,
              borderRadius,
              opacity,
            });
          });
          
          extractedSlides.push({
            backgroundColor,
            backgroundImage,
            textElements,
            shapeElements: shapeElements.length > 0 ? shapeElements : undefined,
          });
        }
      }

      // Clean up
      document.body.removeChild(container);

      // Build PPTX from extracted data
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

  const downloadAsPdf = () => {
    window.print();
  };

  return {
    isDownloading,
    downloadAsPptx,
    downloadAsStyledPptx,
    downloadAsPdf
  };
}
