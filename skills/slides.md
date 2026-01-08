If the user asks to "create slides", "generate a presentation", "make a ppt",
"export to powerpoint", or similar, follow this process:

## Environment

You are running in a **Deno sandbox**. Create beautiful HTML slides using
**Tailwind CSS** for styling. The frontend parses embedded JSON for native
preview.

---

## 1. Plan & Outline

Create a Markdown outline based on the user's topic:

```markdown
# Presentation Title

## Slide 1: Title Slide

## Slide 2: Problem/Introduction

## Slide 3: Key Data

## Slide 4: Solution

## Slide 5: Call to Action
```

---

## 2. Create Premium HTML Slides

Write an `index.html` file with embedded slide data and Tailwind CSS.

### Required HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PRESENTATION_TITLE</title>

        <!-- Tailwind CSS -->
        <script src="https://cdn.tailwindcss.com"></script>

        <!-- Premium Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link
            href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Inter:wght@300;400;500;600;700&display=swap"
            rel="stylesheet"
        >

        <!-- Chart.js for data visualization -->
        <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1"></script>

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
                }
            ]
        </script>

        <script>
            tailwind.config = {
                theme: {
                    extend: {
                        fontFamily: {
                            "display": [
                                "Playfair Display",
                                "Georgia",
                                "serif",
                            ],
                            "sans": [
                                "Inter",
                                "system-ui",
                                "sans-serif",
                            ],
                        },
                        colors: {
                            "slide": {
                                "bg": "#0d0b08",
                                "card": "#1a1510",
                                "accent": "#daa520",
                                "text": "#f5f0e6",
                                "muted":
                                    "rgba(218, 165, 32, 0.7)",
                            },
                        },
                    },
                },
            };
        </script>

        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            html {
                scroll-behavior: smooth;
            }

            .slide {
                min-height: 100vh;
                scroll-snap-align: start;
                position: relative;
                overflow: hidden;
            }

            .chapter-marker {
                position: absolute;
                font-family: "Playfair Display", serif;
                font-weight: 900;
                font-size: 300px;
                opacity: 0.03;
                top: -50px;
                right: 40px;
                z-index: 0;
                pointer-events: none;
            }

            .glow {
                box-shadow: 0 0 60px rgba(218, 165, 32, 0.15);
            }

            .gradient-text {
                background: linear-gradient(
                    135deg,
                    #daa520 0%,
                    #f5d76e 100%
                );
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
        </style>
    </head>
    <body class="bg-slide-bg text-slide-text">
        <div
            class="scroll-snap-y scroll-snap-mandatory h-screen overflow-y-scroll"
        >
            <!-- SLIDE 1: Title -->
            <section
                class="slide flex items-center justify-center bg-gradient-to-br from-[#0d0b08] via-[#1a1510] to-[#0d0b08]"
            >
                <div class="chapter-marker">1</div>
                <div class="text-center max-w-4xl px-12 z-10">
                    <div
                        class="w-20 h-1 bg-slide-accent mx-auto mb-8 rounded-full"
                    >
                    </div>
                    <h1
                        class="font-display text-6xl md:text-7xl font-bold mb-6 leading-tight"
                    >
                        Your Bold Title
                    </h1>
                    <p
                        class="font-sans text-2xl text-slide-text/70 font-light tracking-wide"
                    >
                        Compelling subtitle that captures attention
                    </p>
                    <div
                        class="w-32 h-0.5 bg-slide-accent/40 mx-auto mt-12 rounded-full"
                    >
                    </div>
                </div>
            </section>

            <!-- SLIDE 2: Problem / Two-Column Layout -->
            <section
                class="slide flex items-center bg-gradient-to-br from-[#0d0b08] to-[#1a1510] p-16"
            >
                <div class="chapter-marker">P</div>

                <div class="w-1/2 pr-16 z-10">
                    <p
                        class="font-display text-slide-accent text-sm tracking-[3px] uppercase mb-3"
                    >
                        The Challenge
                    </p>
                    <h2
                        class="font-display text-5xl font-bold mb-6 leading-tight"
                    >
                        The Problem Statement
                    </h2>
                    <p
                        class="font-sans text-lg text-slide-text/80 mb-8 leading-relaxed"
                    >
                        Describe the core problem here. Make it relatable and
                        impactful.
                    </p>
                    <blockquote
                        class="font-display text-2xl text-slide-accent/80 italic mb-10 border-l-4 border-slide-accent pl-6"
                    >
                        "A compelling statistic or quote that emphasizes the
                        problem."
                    </blockquote>

                    <div class="grid grid-cols-2 gap-8">
                        <div
                            class="p-6 bg-white/5 rounded-xl border border-white/10"
                        >
                            <h4 class="font-display text-xl font-bold mb-2">
                                Key Stat 1
                            </h4>
                            <p class="font-sans text-slide-text/70">
                                Supporting detail here.
                            </p>
                        </div>
                        <div
                            class="p-6 bg-white/5 rounded-xl border border-white/10"
                        >
                            <h4 class="font-display text-xl font-bold mb-2">
                                Key Stat 2
                            </h4>
                            <p class="font-sans text-slide-text/70">
                                Supporting detail here.
                            </p>
                        </div>
                    </div>
                </div>

                <div class="w-1/2 flex flex-col items-center justify-center">
                    <p
                        class="font-display text-slide-accent text-sm tracking-[3px] uppercase mb-6"
                    >
                        Data Visualization
                    </p>
                    <div
                        class="w-full h-80 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center"
                    >
                        <canvas id="chart1"></canvas>
                    </div>
                </div>
            </section>

            <!-- SLIDE 3: Solution / Features -->
            <section
                class="slide flex items-center bg-gradient-to-br from-[#1a1510] to-[#0d0b08] p-16"
            >
                <div class="chapter-marker">S</div>
                <div class="max-w-6xl mx-auto z-10">
                    <div class="text-center mb-16">
                        <p
                            class="font-display text-slide-accent text-sm tracking-[3px] uppercase mb-3"
                        >
                            Our Solution
                        </p>
                        <h2 class="font-display text-5xl font-bold mb-4">
                            How We Solve It
                        </h2>
                    </div>

                    <div class="grid grid-cols-3 gap-8">
                        <div
                            class="p-8 bg-white/5 rounded-2xl border border-white/10 hover:border-slide-accent/50 transition-all glow"
                        >
                            <div
                                class="w-14 h-14 bg-slide-accent/20 rounded-xl flex items-center justify-center mb-6"
                            >
                                <span class="text-2xl">🚀</span>
                            </div>
                            <h3 class="font-display text-2xl font-bold mb-3">
                                Feature One
                            </h3>
                            <p
                                class="font-sans text-slide-text/70 leading-relaxed"
                            >
                                Brief description of this feature and its
                                benefit.
                            </p>
                        </div>
                        <div
                            class="p-8 bg-white/5 rounded-2xl border border-white/10 hover:border-slide-accent/50 transition-all"
                        >
                            <div
                                class="w-14 h-14 bg-slide-accent/20 rounded-xl flex items-center justify-center mb-6"
                            >
                                <span class="text-2xl">⚡</span>
                            </div>
                            <h3 class="font-display text-2xl font-bold mb-3">
                                Feature Two
                            </h3>
                            <p
                                class="font-sans text-slide-text/70 leading-relaxed"
                            >
                                Brief description of this feature and its
                                benefit.
                            </p>
                        </div>
                        <div
                            class="p-8 bg-white/5 rounded-2xl border border-white/10 hover:border-slide-accent/50 transition-all"
                        >
                            <div
                                class="w-14 h-14 bg-slide-accent/20 rounded-xl flex items-center justify-center mb-6"
                            >
                                <span class="text-2xl">✨</span>
                            </div>
                            <h3 class="font-display text-2xl font-bold mb-3">
                                Feature Three
                            </h3>
                            <p
                                class="font-sans text-slide-text/70 leading-relaxed"
                            >
                                Brief description of this feature and its
                                benefit.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- SLIDE 4: Quote / Emphasis -->
            <section
                class="slide flex items-center justify-center bg-gradient-to-br from-slide-accent/10 to-[#0d0b08] p-16"
            >
                <div class="text-center max-w-4xl z-10">
                    <span class="font-display text-8xl text-slide-accent/30"
                    >"</span>
                    <blockquote
                        class="font-display text-4xl font-semibold leading-relaxed mb-8 -mt-8"
                    >
                        A powerful quote or key message that you want to
                        emphasize.
                    </blockquote>
                    <cite class="font-sans text-slide-accent tracking-wide">
                        — Attribution Name, Title
                    </cite>
                </div>
            </section>

            <!-- SLIDE 5: Call to Action -->
            <section
                class="slide flex items-center justify-center bg-gradient-to-br from-[#0d0b08] via-[#1a1510] to-[#0d0b08]"
            >
                <div class="text-center max-w-3xl px-12 z-10">
                    <div
                        class="w-20 h-1 bg-slide-accent mx-auto mb-10 rounded-full"
                    >
                    </div>
                    <h2 class="font-display text-6xl font-bold mb-6">
                        Ready to Start?
                    </h2>
                    <p class="font-sans text-xl text-slide-text/70 mb-10">
                        contact@company.com
                    </p>
                    <div
                        class="inline-flex items-center gap-3 px-8 py-4 bg-slide-accent text-slide-bg font-sans font-semibold rounded-full"
                    >
                        Get Started Today →
                    </div>
                </div>
            </section>
        </div>

        <script>
            // Optional: Initialize charts if needed
            const ctx = document.getElementById("chart1");
            if (ctx) {
                new Chart(ctx, {
                    type: "bar",
                    data: {
                        labels: [
                            "Category A",
                            "Category B",
                            "Category C",
                            "Category D",
                        ],
                        datasets: [{
                            data: [65, 45, 80, 55],
                            backgroundColor: [
                                "#daa520",
                                "#8b7355",
                                "#c9b5a3",
                                "#5a4a3a",
                            ],
                            borderRadius: 8,
                        }],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                grid: {
                                    color:
                                        "rgba(255,255,255,0.05)",
                                },
                                ticks: { color: "#f5f0e6" },
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: "#f5f0e6" },
                            },
                        },
                    },
                });
            }
        </script>
    </body>
</html>
```

---

## 3. Design Patterns to Use

### Typography

- **Titles**: `font-display text-5xl md:text-6xl font-bold`
- **Subtitles**:
  `font-display text-sm tracking-[3px] uppercase text-slide-accent`
- **Body**: `font-sans text-lg text-slide-text/80 leading-relaxed`
- **Quotes**: `font-display text-2xl italic text-slide-accent/80`

### Layout Patterns

- **Two-Column**: `flex items-center` with `w-1/2` children
- **Three Cards**: `grid grid-cols-3 gap-8`
- **Centered**: `flex items-center justify-center` + `text-center max-w-4xl`

### Decorative Elements

- **Accent Lines**: `w-20 h-1 bg-slide-accent rounded-full`
- **Chapter Markers**: Large faded numbers in background
- **Cards**: `p-8 bg-white/5 rounded-2xl border border-white/10`
- **Glow Effect**: `box-shadow: 0 0 60px rgba(218, 165, 32, 0.15)`

### Color Themes (Tailwind config)

| Theme          | Background | Accent    | Text      |
| -------------- | ---------- | --------- | --------- |
| Brass (Dark)   | `#0d0b08`  | `#daa520` | `#f5f0e6` |
| Cobalt (Dark)  | `#0a1628`  | `#4a90d9` | `#f0f5ff` |
| Emerald (Dark) | `#0a1810`  | `#50c878` | `#f0fff5` |
| Sand (Light)   | `#f5f0e8`  | `#8b7355` | `#2d251c` |

---

## 4. Slide Types Reference

| Type         | Layout                            | Use Case               |
| ------------ | --------------------------------- | ---------------------- |
| Title        | Centered, large typography        | Opening/closing        |
| Two-Column   | 50/50 split with content + visual | Problem, solution      |
| Feature Grid | 3-column card grid                | Features, benefits     |
| Quote        | Centered large quote              | Emphasis, testimonials |
| Data         | Chart + explanation               | Statistics, metrics    |
| Comparison   | Side-by-side cards                | Before/after, options  |

---

## 5. Execution Steps

1. **Use `write_file`** to create `index.html` with the template above
2. **Call `expose_preview`** to serve the HTML
3. Tell the user they can:
   - View the presentation in the preview
   - Navigate by scrolling
   - Click "Download PPTX" to get PowerPoint file

---

## Best Practices

- **Always include Tailwind CDN** for styling
- **Use premium fonts** (Playfair Display + Inter)
- **Keep slides focused** - one main idea per slide
- **Use visual hierarchy** - accent colors, size contrast
- **Add data visualizations** with Chart.js when relevant
- **Include the JSON slide-data block** for frontend parsing
