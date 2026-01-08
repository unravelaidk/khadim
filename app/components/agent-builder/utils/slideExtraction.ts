
import html2canvas from "html2canvas";
import type { SlideData, ExtractedSlideData, ShapeData } from "../../../types/slides";

export interface ExtractionOptions {
  slides: SlideData[];
  htmlContent: string;
  mode: "editable" | "image"; // 'editable' separates text/shapes, 'image' captures full slide
  onProgress?: (current: number, total: number) => void;
}

export async function extractSlideData({
  slides,
  htmlContent,
  mode,
  onProgress
}: ExtractionOptions): Promise<ExtractedSlideData[]> {
  // Create a hidden container for rendering slides
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "1280px";
  container.style.height = "720px";
  document.body.appendChild(container);

  const extractedSlides: ExtractedSlideData[] = [];

  try {
    for (let i = 0; i < slides.length; i++) {
        if (onProgress) onProgress(i, slides.length);

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
          const iframeWindow = iframe.contentWindow;
          const slideRect = slideElement.getBoundingClientRect();
          
          let backgroundImage: string | undefined;
          let textElements: ExtractedSlideData['textElements'] = [];
          let shapeElements: ExtractedSlideData['shapeElements'] = [];
          let backgroundColor = 'rgb(15, 23, 42)'; // Default

          // Capture background logic
          try {
            const contentElementsToHide: HTMLElement[] = [];
            
            if (mode === 'editable') {
                // If editable, we hide text and content cards to capture ONLY the background
                // 1. All text containing elements
                const textSelector = 'h1, h2, h3, h4, h5, h6, p, span, li, a, strong, em, b, i, label, button';
                slideElement.querySelectorAll(textSelector).forEach(el => contentElementsToHide.push(el as HTMLElement));
                
                // 2. Divs that have text content (cards)
                slideElement.querySelectorAll('div').forEach(el => {
                  const div = el as HTMLElement;
                  if (div.innerText && div.innerText.trim().length > 0) {
                     const style = iframeWindow.getComputedStyle(div);
                     const hasBg = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
                     const hasBorder = parseFloat(style.borderWidth) > 0 && style.borderColor !== 'transparent';
                     if (hasBg || hasBorder) {
                       contentElementsToHide.push(div);
                     }
                  }
                });
            }

            // Store original visibility
            const originalVisibility: Map<HTMLElement, string> = new Map();
            contentElementsToHide.forEach(el => {
              originalVisibility.set(el, el.style.visibility);
              el.style.visibility = 'hidden';
            });
            
            // Capture canvas
            const canvas = await html2canvas(slideElement, {
              width: 1280,
              height: 720,
              scale: 1, // 1:1 scale is usually enough for 1280x720, maybe 2 for high def PDF? 
              // For PDF we might want higher quality, but let's stick to 1 for consistency with PPTX first
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

          // Extract text and shapes ONLY if in editable mode
          if (mode === 'editable') {
              const style = iframeWindow.getComputedStyle(slideElement);
              backgroundColor = style.backgroundColor;
              if (backgroundColor === 'rgba(0, 0, 0, 0)' || backgroundColor === 'transparent') {
                const bgImage = style.backgroundImage;
                if (bgImage && bgImage.includes('gradient')) {
                  const colorMatch = bgImage.match(/rgba?\([^)]+\)|#[a-fA-F0-9]{3,8}/);
                  backgroundColor = colorMatch ? colorMatch[0] : 'rgb(15, 23, 42)';
                }
              }

              // Reuse the complex extraction logic here...
              // (I will duplicate the logic from the previous file to ensure robust extraction)
              
              const primarySelectors = 'h1, h2, h3, h4, h5, h6, p';
              const secondarySelectors = 'li, a, label, button';
              const processedElements = new Set<Element>();
              
              const processElement = (element: HTMLElement) => {
                if (processedElements.has(element)) return;
                for (const processed of processedElements) {
                  if (processed.contains(element)) return;
                }
                
                const elStyle = iframeWindow.getComputedStyle(element);
                if (elStyle.display === 'none' || elStyle.visibility === 'hidden' || elStyle.opacity === '0') return;
                
                let text = element.innerText?.trim(); 
                if (!text) text = element.textContent?.trim() || '';
                if (!text) return;
                
                if (element.tagName.toLowerCase().startsWith('h')) {
                    text = text.replace(/\s+/g, ' ');
                }
                
                const elRect = element.getBoundingClientRect();
                if (elRect.width < 5 || elRect.height < 5) return;
                
                const x = Math.max(0, elRect.left - slideRect.left);
                const y = Math.max(0, elRect.top - slideRect.top);
                if (x > slideRect.width || y > slideRect.height) return;
                
                const fontWeight = elStyle.fontWeight;
                const isBold = parseInt(fontWeight, 10) >= 600 || fontWeight === 'bold' || fontWeight === 'bolder';
                
                let color = elStyle.color || 'rgb(255, 255, 255)';
                if (color === 'rgba(0, 0, 0, 0)' || color === 'transparent') color = 'rgb(255, 255, 255)';
                
                textElements.push({
                  text,
                  x,
                  y,
                  w: elRect.width,
                  h: elRect.height,
                  fontSize: parseFloat(elStyle.fontSize) || 16,
                  fontFamily: 'Arial',
                  color,
                  backgroundColor: elStyle.backgroundColor,
                  isBold,
                  isItalic: elStyle.fontStyle === 'italic',
                  textAlign: elStyle.textAlign || 'center',
                });
                
                processedElements.add(element);
                element.querySelectorAll('*').forEach(child => processedElements.add(child));
              };
              
              slideElement.querySelectorAll(primarySelectors).forEach(el => processElement(el as HTMLElement));
              slideElement.querySelectorAll(secondarySelectors).forEach(el => processElement(el as HTMLElement));
              slideElement.querySelectorAll('div').forEach(el => {
                const div = el as HTMLElement;
                const text = div.textContent?.trim();
                if (!text) return;
                let alreadyCovered = false;
                for (const processed of processedElements) {
                  if (processed.contains(div) || div.contains(processed)) {
                    alreadyCovered = true;
                    break;
                  }
                }
                if (!alreadyCovered) {
                  const hasChildDivWithText = Array.from(div.querySelectorAll('div')).some(child => child.textContent?.trim());
                  if (!hasChildDivWithText) processElement(div);
                }
              });
              
              textElements.sort((a, b) => {
                const yDiff = a.y - b.y;
                if (Math.abs(yDiff) > 30) return yDiff;
                return a.x - b.x;
              });

              // Shapes
              slideElement.querySelectorAll('div').forEach(el => {
                const div = el as HTMLElement;
                const divStyle = iframeWindow.getComputedStyle(div);
                const divRect = div.getBoundingClientRect();
                
                if (divRect.width < 20 || divRect.height < 20) return;
                if (divStyle.display === 'none' || divStyle.visibility === 'hidden') return;
                
                const bgColor = divStyle.backgroundColor;
                const borderColor = divStyle.borderColor;
                const borderWidth = parseFloat(divStyle.borderWidth) || 0;
                const borderRadius = parseFloat(divStyle.borderRadius) || 0;
                const opacity = parseFloat(divStyle.opacity) || 1;
                
                const hasVisibleBg = bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';
                const hasVisibleBorder = borderWidth > 0 && borderColor && borderColor !== 'transparent';
                
                if (!hasVisibleBg && !hasVisibleBorder) return;
                
                const hasContent = div.innerText && div.innerText.trim().length > 0;
                if (!hasContent) return;
                
                const hasDirectText = Array.from(div.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
                if (hasDirectText) return;
                
                const x = Math.max(0, divRect.left - slideRect.left);
                const y = Math.max(0, divRect.top - slideRect.top);
                if (x > slideRect.width || y > slideRect.height) return;
                
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
          }

          extractedSlides.push({
            backgroundColor,
            backgroundImage,
            textElements: mode === 'editable' ? textElements : [],
            shapeElements: mode === 'editable' ? (shapeElements.length > 0 ? shapeElements : undefined) : undefined,
          });
        }
    }
  } finally {
    document.body.removeChild(container);
  }

  return extractedSlides;
}
