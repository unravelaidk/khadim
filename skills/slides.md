If the user asks to "create slides", "generate a presentation", "make a ppt",
"export to powerpoint", or similar, follow this process:

## Environment

You are running in a **Deno sandbox**. The PowerPoint generation happens in the
**browser** using PptxGenJS. Your job is to create an HTML file with embedded
slide data that the frontend can render natively.

---

## 1. Plan & Outline

Create a Markdown outline based on the user's topic:

```markdown
# Presentation Title

## Slide 1: Title Slide

- Main title
- Subtitle

## Slide 2: Introduction

- Key point 1
- Key point 2
```

---

## 2. Create the HTML Slides File

Write an `index.html` file with this **exact structure**. The frontend will
parse this to render a native slide preview.

### Required HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PRESENTATION_TITLE</title>

        <!-- CRITICAL: Include slide data as JSON for frontend parsing -->
        <script id="slide-data" type="application/json">
            [
                {
                    "id": 1,
                    "type": "title",
                    "title": "Main Title",
                    "subtitle": "Subtitle text"
                },
                {
                    "id": 2,
                    "type": "content",
                    "title": "Section Title",
                    "bullets": ["Point 1", "Point 2", "Point 3"]
                },
                {
                    "id": 3,
                    "type": "accent",
                    "title": "Key Takeaway",
                    "bullets": ["Important point"]
                }
            ]
        </script>

        <!-- PptxGenJS for browser-side PPTX generation -->
        <script
            src="https://cdn.jsdelivr.net/gh/gitbrent/PptxGenJS@3.12.0/dist/pptxgen.bundle.js"
        ></script>

        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: "Inter", system-ui, sans-serif;
                background: #1a1a2e;
            }
            .slides {
                height: 100vh;
                overflow-y: scroll;
                scroll-snap-type: y mandatory;
            }
            .slide {
                min-height: 100vh;
                scroll-snap-align: start;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                padding: 60px;
                color: white;
            }
            .slide.title {
                background: linear-gradient(
                    135deg,
                    #667eea 0%,
                    #764ba2 100%
                );
            }
            .slide.content {
                background: linear-gradient(
                    135deg,
                    #1a1a2e 0%,
                    #16213e 100%
                );
            }
            .slide.accent {
                background: linear-gradient(
                    135deg,
                    #f093fb 0%,
                    #f5576c 100%
                );
            }
            .slide h1 {
                font-size: 3.5rem;
                margin-bottom: 1rem;
                text-align: center;
            }
            .slide h2 {
                font-size: 2.5rem;
                margin-bottom: 2rem;
            }
            .slide p {
                font-size: 1.5rem;
                opacity: 0.8;
            }
            .slide ul {
                font-size: 1.5rem;
                line-height: 2.2;
                list-style: none;
            }
            .slide li::before {
                content: "→ ";
                color: #667eea;
            }

            .download-btn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 24px;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 1rem;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                z-index: 1000;
            }
            .download-btn:hover {
                background: #5a6fd6;
            }
        </style>
    </head>
    <body>
        <div class="slides" id="slides-container"></div>

        <button class="download-btn" onclick="downloadPPTX()">
            ⬇ Download PPTX
        </button>

        <script>
            // Parse and render slides
            const slideData = JSON.parse(
                document.getElementById("slide-data")
                    .textContent,
            );
            const container = document.getElementById(
                "slides-container",
            );

            slideData.forEach((slide) => {
                const section = document.createElement(
                    "section",
                );
                section.className = `slide ${slide.type}`;
                section.dataset.slide = slide.id;

                let html = "";
                if (slide.title) {
                    html += `<h1>${slide.title}</h1>`;
                }
                if (slide.subtitle) {
                    html += `<p>${slide.subtitle}</p>`;
                }
                if (slide.bullets && slide.bullets.length) {
                    html += "<ul>" + slide.bullets.map((b) =>
                        `<li>${b}</li>`
                    ).join("") + "</ul>";
                }
                section.innerHTML = html;
                container.appendChild(section);
            });

            // PPTX download function
            function downloadPPTX() {
                const pptx = new PptxGenJS();
                pptx.layout = "LAYOUT_WIDE";

                slideData.forEach((s) => {
                    const slide = pptx.addSlide();

                    // Background
                    const bgColors = {
                        title: "667eea",
                        content: "1a1a2e",
                        accent: "f5576c",
                    };
                    slide.background = {
                        color: bgColors[s.type] || "1a1a2e",
                    };

                    // Title
                    if (s.title) {
                        slide.addText(s.title, {
                            x: 0.5,
                            y: s.type === "title" ? 2 : 0.5,
                            w: "90%",
                            h: 1.5,
                            fontSize: s.type === "title"
                                ? 44
                                : 36,
                            bold: true,
                            color: "FFFFFF",
                            align: "center",
                        });
                    }

                    // Subtitle
                    if (s.subtitle) {
                        slide.addText(s.subtitle, {
                            x: 0.5,
                            y: 3.5,
                            w: "90%",
                            h: 0.75,
                            fontSize: 24,
                            color: "FFFFFF",
                            align: "center",
                        });
                    }

                    // Bullets
                    if (s.bullets && s.bullets.length) {
                        const bullets = s.bullets.map(
                            (text) => ({
                                text,
                                options: {
                                    bullet: true,
                                    color: "FFFFFF",
                                },
                            })
                        );
                        slide.addText(bullets, {
                            x: 0.5,
                            y: 1.8,
                            w: "90%",
                            h: 4,
                            fontSize: 24,
                            color: "FFFFFF",
                        });
                    }
                });

                pptx.writeFile({
                    fileName: "presentation.pptx",
                });
            }
        </script>
    </body>
</html>
```

---

## 3. Slide Types

Use these types for variety:

- **"title"** - Purple gradient, for title/intro slides
- **"content"** - Dark blue, for main content
- **"accent"** - Pink gradient, for emphasis/conclusion

---

## 4. Execution Steps

1. **Use `write_file`** to create `index.html` with the above structure
2. **Call `expose_preview`** to serve the HTML
3. Tell the user they can:
   - View the presentation in the preview
   - Click "Download PPTX" to get PowerPoint file

---

## Important

- **Always include the `<script id="slide-data">` JSON block** - this enables
  the frontend to parse and render slides natively
- Keep content concise - max 4-5 bullets per slide
- Use all three slide types for visual variety
