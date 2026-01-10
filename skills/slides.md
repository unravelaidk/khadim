If the user asks to "create slides", "generate a presentation", "make a ppt",
"export to powerpoint", or similar, follow this process:

## Environment

You do NOT need a sandbox for slide creation. Use the `write_slides` tool to
create HTML slides with **Tailwind CSS** styling. The frontend parses embedded
JSON for native preview.

---

## CREATIVE DESIGN PHILOSOPHY

**CRITICAL: Every presentation should be UNIQUE and MEMORABLE.**

### NO EMOJIS - Use Real Icons & Images

**NEVER use emojis in slides.** They look cheap and AI-generated.

Instead, use:
1. **Inline SVG icons** - Clean, scalable, professional
2. **Icon libraries** - Heroicons, Lucide, Phosphor via CDN
3. **Real images** - Search for relevant photos/illustrations
4. **Abstract shapes** - CSS-generated circles, lines, patterns

```html
<!-- BAD: Emoji (looks AI-generated) -->
<span class="text-2xl">🚀</span>

<!-- GOOD: Inline SVG icon -->
<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M13 10V3L4 14h7v7l9-11h-7z"/>
</svg>

<!-- GOOD: Heroicons CDN -->
<script src="https://unpkg.com/heroicons@2.0.18/24/outline/index.js"></script>

<!-- GOOD: Abstract shape as icon -->
<div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl
            flex items-center justify-center">
  <div class="w-4 h-4 border-2 border-white rotate-45"></div>
</div>

<!-- GOOD: Simple geometric icon -->
<div class="w-10 h-10 relative">
  <div class="absolute inset-0 border-2 border-current rounded-full"></div>
  <div class="absolute top-1/2 left-1/2 w-3 h-3 bg-current rounded-full -translate-x-1/2 -translate-y-1/2"></div>
</div>
```

### Common SVG Icons Library

```html
<!-- Arrow Right -->
<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
</svg>

<!-- Check/Success -->
<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
</svg>

<!-- Lightning/Fast -->
<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
</svg>

<!-- Star/Quality -->
<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
</svg>

<!-- Chart/Growth -->
<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
</svg>

<!-- Users/Team -->
<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
</svg>

<!-- Globe/World -->
<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
</svg>

<!-- Lock/Security -->
<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
</svg>

<!-- Sparkle/Magic -->
<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
</svg>
```

### Using Real Images

For professional presentations, use actual images:

```html
<!-- Unsplash (free, high-quality) -->
<img src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=800"
     alt="Team collaboration" class="w-full h-64 object-cover rounded-xl"/>

<!-- Placeholder for prototyping -->
<div class="w-full h-64 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl
            flex items-center justify-center text-gray-500">
  <span>Image: Product Screenshot</span>
</div>

<!-- Abstract background pattern instead of image -->
<div class="w-full h-64 rounded-xl overflow-hidden relative">
  <div class="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-700"></div>
  <div class="absolute inset-0 opacity-30"
       style="background-image: radial-gradient(circle at 2px 2px, white 1px, transparent 0);
              background-size: 32px 32px;"></div>
</div>
```

---

DO NOT create generic, predictable slides. Instead:

### Break the Mold
- **Avoid symmetry** - Use asymmetric layouts, off-center text, unexpected positioning
- **Vary every slide** - No two slides should have the same structure
- **Use the full canvas** - Elements can touch edges, overlap, or break out of containers
- **Create visual rhythm** - Alternate between dense and sparse, large and intimate

### Layout Innovation
Instead of always centering everything, try:
- **Edge-aligned titles** - Position text at top-left, bottom-right, or along edges
- **Diagonal compositions** - Use `skew`, diagonal gradients, or angled dividers
- **Overlapping elements** - Layer text over shapes, cards over images
- **Split screens** - 70/30, 60/40, or dramatic 80/20 splits
- **Full-bleed backgrounds** - Let colors and images extend to all edges
- **Floating elements** - Cards, quotes, or stats that appear to float in space
- **Grid-breaking** - One element that deliberately breaks the grid pattern

### Typography as Design
- **Massive display type** - Use 8xl, 9xl, or custom sizes for impact
- **Mixed weights in one line** - "The **BOLD** approach to *subtle* design"
- **Vertical text** - `writing-mode: vertical-rl` for accent text
- **Text as texture** - Faded, repeated text as background pattern
- **Dramatic size contrast** - Pair 120px headlines with 14px body text

### Unexpected Elements
- **Abstract shapes** - Floating circles, diagonal lines, geometric accents
- **Negative space as design** - Large empty areas that draw focus
- **Unconventional dividers** - Wavy lines, dots, dashes, arrows
- **Icon compositions** - Clusters of icons forming shapes
- **Data as art** - Charts and numbers integrated into the visual design

### Content Structure Variations
DON'T always use the same slide types. Mix these approaches:

1. **The Big Statement** - One sentence, massive typography, nothing else
2. **The Reveal** - Build tension with minimal content, then surprise
3. **The Mosaic** - Multiple small cards/elements creating a pattern
4. **The Comparison** - Side-by-side with clear visual distinction
5. **The Timeline** - Horizontal or vertical flow of events
6. **The Focus** - Single image/stat with supporting text tucked away
7. **The Grid** - Modular layout with 3, 4, 6, or 9 cells
8. **The Story** - Narrative flow that guides the eye across the slide
9. **The Data Hero** - Number or chart as the dominant visual
10. **The Quote Wall** - Multiple quotes in a collage arrangement

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
                                <svg class="w-7 h-7 text-slide-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                                </svg>
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
                                <svg class="w-7 h-7 text-slide-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                                </svg>
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
                                <svg class="w-7 h-7 text-slide-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
                                </svg>
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

**Classic Themes:**
| Theme          | Background | Accent    | Text      |
| -------------- | ---------- | --------- | --------- |
| Brass (Dark)   | `#0d0b08`  | `#daa520` | `#f5f0e6` |
| Cobalt (Dark)  | `#0a1628`  | `#4a90d9` | `#f0f5ff` |
| Emerald (Dark) | `#0a1810`  | `#50c878` | `#f0fff5` |
| Sand (Light)   | `#f5f0e8`  | `#8b7355` | `#2d251c` |

**Distinctive Premium Themes:**
| Theme          | Style           | Background | Accent    | Font Choice           |
| -------------- | --------------- | ---------- | --------- | --------------------- |
| Brutalist      | Raw industrial  | `#f5f5f0`  | `#ff3d00` | Bebas Neue + Space Mono |
| Vapor          | Synthwave neon  | `#0f0028`  | `#ff00ff` | Orbitron + Exo 2      |
| Editorial      | Magazine luxury | `#faf9f7`  | `#c41e3a` | Fraunces + Source Serif |
| Neo Geo        | Bauhaus bold    | `#fffef5`  | `#0052cc` | Syne + DM Sans        |
| Organic        | Nature soft     | `#f7f5f0`  | `#8b9a6b` | Libre Baskerville + Nunito |
| Holographic    | Iridescent      | `#0f0f1a`  | `#f093fb` | Outfit                |

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

> **IMPORTANT: Generate ONE slide at a time.** Do NOT write all slides in a
> single call. Instead:
>
> 1. Write the HTML structure with the first slide
> 2. Describe what you created to the user
> 3. Add the next slide by editing the content
> 4. Repeat until all slides are complete
>
> This allows the user to see progress and provide feedback.

### Workflow

1. **Use `write_slides`** to create the presentation HTML with the **first
   slide**
2. **For each additional slide:**
   - Call `write_slides` again with the updated HTML including the new slide
   - Briefly describe what you added (e.g., "Added Slide 2: Problem Statement")
3. **After all slides are complete**, tell the user they can:
   - View the presentation in the preview
   - Navigate using the slide controls
   - Click "Download PPTX" to export

> **NOTE:** Use `write_slides` tool - NOT `write_file`! Slides do NOT require a
> sandbox. They render natively in the preview panel.

---

## Best Practices

- **Always include Tailwind CDN** for styling
- **Use premium fonts** - choose distinctive fonts that match your theme
- **Keep slides focused** - one main idea per slide
- **Use visual hierarchy** - accent colors, size contrast
- **Add data visualizations** with Chart.js when relevant
- **Include the JSON slide-data block** for frontend parsing
- **Match animation to theme** - use glitch for Vapor, blur-in for Holographic, etc.

---

## 6. Theme-Specific Design Patterns

### Brutalist Theme
```html
<!-- Oversized typography, harsh shadows, monospace -->
<script>
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          "display": ["Bebas Neue", "Impact", "sans-serif"],
          "mono": ["Space Mono", "Courier New", "monospace"],
        },
        colors: {
          "slide": {
            "bg": "#f5f5f0",
            "accent": "#ff3d00",
            "text": "#0a0a0a",
          },
        },
      },
    },
  };
</script>
<style>
  .card-brutal {
    background: #fff;
    border: 3px solid #0a0a0a;
    box-shadow: 6px 6px 0 #0a0a0a;
  }
</style>
<!-- Title: uppercase, massive size -->
<h1 class="font-display text-[120px] uppercase tracking-wide">BOLD STATEMENT</h1>
```

### Vapor/Synthwave Theme
```html
<!-- Neon gradients, scanlines, retro-futuristic -->
<script>
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          "display": ["Orbitron", "Audiowide", "sans-serif"],
          "sans": ["Exo 2", "sans-serif"],
        },
        colors: {
          "slide": {
            "bg": "#0f0028",
            "accent": "#ff00ff",
            "cyan": "#00ffff",
            "text": "#ffffff",
          },
        },
      },
    },
  };
</script>
<style>
  .neon-glow {
    text-shadow: 0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 40px #ff00ff;
  }
  .scanlines::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px);
    pointer-events: none;
  }
</style>
<!-- Gradient text with neon effect -->
<h1 class="font-display text-6xl uppercase tracking-[0.2em] bg-gradient-to-r from-slide-accent to-slide-cyan bg-clip-text text-transparent neon-glow">
  FUTURE VISION
</h1>
```

### Editorial Theme
```html
<!-- Refined serif, dramatic whitespace, subtle elegance -->
<script>
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          "display": ["Fraunces", "Georgia", "serif"],
          "serif": ["Source Serif 4", "Georgia", "serif"],
        },
        colors: {
          "slide": {
            "bg": "#faf9f7",
            "accent": "#c41e3a",
            "text": "#1a1a1a",
          },
        },
      },
    },
  };
</script>
<!-- Editorial drop cap style -->
<div class="max-w-3xl mx-auto">
  <span class="float-left text-[120px] leading-none font-display text-slide-accent mr-4">A</span>
  <p class="font-serif text-xl leading-relaxed text-slide-text/80">
    compelling story begins with a single, powerful idea that resonates...
  </p>
</div>
```

### Holographic Theme
```html
<!-- Iridescent gradients, glassmorphism, futuristic -->
<script>
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          "display": ["Outfit", "system-ui", "sans-serif"],
        },
        colors: {
          "slide": {
            "bg": "#0f0f1a",
            "accent": "#f093fb",
            "text": "#ffffff",
          },
        },
      },
    },
  };
</script>
<style>
  .holo-gradient {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #4facfe 100%);
    background-size: 400% 400%;
    animation: gradientShift 8s ease infinite;
  }
  @keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  .glass-card {
    background: rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
  }
</style>
<!-- Holographic title slide -->
<div class="holo-gradient p-1 rounded-2xl">
  <div class="bg-slide-bg rounded-xl p-12">
    <h1 class="font-display text-6xl font-bold">The Future Is Now</h1>
  </div>
</div>
```

### Animation Classes Reference

| Class          | Effect                    | Best For           |
| -------------- | ------------------------- | ------------------ |
| `slide-animate`| Slide up from bottom      | Default, elegant   |
| `slide-blur`   | Blur in with scale        | Holographic, soft  |
| `slide-glitch` | Glitch distortion effect  | Vapor, cyberpunk   |
| `slide-zoom`   | Zoom in from center       | Impact, emphasis   |
| `slide-left`   | Slide in from right       | Sequential content |
| `slide-fade`   | Simple fade in            | Subtle, minimal    |

### Card Style Classes

| Class              | Style                     | Best For           |
| ------------------ | ------------------------- | ------------------ |
| `glassmorphism`    | Frosted glass effect      | Dark themes        |
| `card-brutal`      | Hard shadow, no radius    | Brutalist          |
| `card-soft`        | Subtle shadow, rounded    | Organic, light     |
| `card-outline`     | Border only, transparent  | Editorial, minimal |

---

## 7. Creative Layout Examples

### The Big Statement (Single Powerful Line)
```html
<section class="slide flex items-end justify-start p-16 bg-black">
  <!-- Massive typography, edge-aligned -->
  <h1 class="font-display text-[140px] leading-[0.85] font-black text-white max-w-4xl">
    CHANGE<br/>EVERYTHING.
  </h1>
  <!-- Subtle accent in corner -->
  <div class="absolute top-12 right-12 w-3 h-3 bg-red-500 rounded-full"></div>
</section>
```

### Asymmetric Split (70/30)
```html
<section class="slide flex bg-slide-bg">
  <!-- Large content area -->
  <div class="w-[70%] flex flex-col justify-center p-20">
    <p class="text-slide-accent text-sm tracking-[4px] uppercase mb-4">Chapter 02</p>
    <h2 class="font-display text-6xl font-bold mb-8 leading-tight">
      The Unexpected<br/>Approach
    </h2>
    <p class="text-xl text-slide-text/70 max-w-xl leading-relaxed">
      Sometimes the best solutions come from looking at problems sideways.
    </p>
  </div>
  <!-- Accent sidebar -->
  <div class="w-[30%] bg-slide-accent flex items-center justify-center">
    <span class="font-display text-[200px] font-black text-black/10 rotate-90">02</span>
  </div>
</section>
```

### Diagonal Split
```html
<section class="slide relative overflow-hidden bg-white">
  <!-- Diagonal background -->
  <div class="absolute inset-0 bg-slide-accent" style="clip-path: polygon(60% 0, 100% 0, 100% 100%, 40% 100%);"></div>
  <!-- Content on white side -->
  <div class="relative z-10 h-full flex items-center p-20">
    <div class="max-w-lg">
      <h2 class="font-display text-5xl font-bold text-gray-900 mb-6">Two Worlds</h2>
      <p class="text-gray-600 text-lg">Where tradition meets innovation.</p>
    </div>
  </div>
  <!-- Content on colored side -->
  <div class="absolute right-20 top-1/2 -translate-y-1/2 text-right text-white z-10">
    <p class="text-sm tracking-widest uppercase mb-2">The Future</p>
    <p class="font-display text-4xl font-bold">Starts Here</p>
  </div>
</section>
```

### Floating Cards Mosaic
```html
<section class="slide relative p-16 bg-gradient-to-br from-gray-900 to-gray-800">
  <h2 class="font-display text-4xl font-bold text-white mb-4">Our Approach</h2>
  <!-- Scattered floating cards -->
  <div class="absolute top-24 left-20 w-56 p-6 glassmorphism rotate-[-3deg]">
    <p class="text-3xl mb-2">01</p>
    <p class="text-white/80">Research & Discovery</p>
  </div>
  <div class="absolute top-40 right-32 w-64 p-6 glassmorphism rotate-[2deg]">
    <p class="text-3xl mb-2">02</p>
    <p class="text-white/80">Strategic Planning</p>
  </div>
  <div class="absolute bottom-32 left-1/3 w-60 p-6 glassmorphism rotate-[-1deg]">
    <p class="text-3xl mb-2">03</p>
    <p class="text-white/80">Creative Execution</p>
  </div>
  <div class="absolute bottom-24 right-20 w-52 p-6 glassmorphism rotate-[4deg]">
    <p class="text-3xl mb-2">04</p>
    <p class="text-white/80">Launch & Iterate</p>
  </div>
</section>
```

### The Data Hero
```html
<section class="slide flex items-center justify-center bg-black text-white">
  <div class="text-center">
    <!-- Giant number -->
    <p class="font-display text-[280px] font-black leading-none bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
      97%
    </p>
    <!-- Supporting context -->
    <p class="text-2xl text-white/60 mt-4 tracking-wide">
      of users reported improved productivity
    </p>
    <!-- Small attribution -->
    <p class="text-sm text-white/30 mt-8">Based on 10,000+ user surveys, Q4 2024</p>
  </div>
</section>
```

### Vertical Text Accent
```html
<section class="slide relative flex items-center bg-slide-bg p-20">
  <!-- Vertical text on left edge -->
  <div class="absolute left-8 top-1/2 -translate-y-1/2">
    <p class="text-slide-accent/30 text-sm tracking-[8px] uppercase"
       style="writing-mode: vertical-rl; transform: rotate(180deg);">
      Innovation Series
    </p>
  </div>
  <!-- Main content -->
  <div class="ml-20">
    <h2 class="font-display text-6xl font-bold mb-6">Think Vertically</h2>
    <p class="text-xl text-slide-text/70 max-w-xl">
      Sometimes changing perspective means changing direction entirely.
    </p>
  </div>
  <!-- Decorative element -->
  <div class="absolute right-0 top-0 w-1/3 h-full bg-gradient-to-l from-slide-accent/10 to-transparent"></div>
</section>
```

### Overlapping Elements
```html
<section class="slide relative flex items-center justify-center bg-gray-100">
  <!-- Background shape -->
  <div class="absolute w-[500px] h-[500px] rounded-full bg-blue-500/20 -translate-x-20"></div>
  <div class="absolute w-[400px] h-[400px] rounded-full bg-purple-500/20 translate-x-40 translate-y-20"></div>
  <!-- Overlapping card -->
  <div class="relative z-10 bg-white p-12 shadow-2xl rounded-2xl max-w-lg -rotate-2">
    <h2 class="font-display text-4xl font-bold text-gray-900 mb-4">Layer by Layer</h2>
    <p class="text-gray-600">Building complexity through simple overlapping elements.</p>
  </div>
  <!-- Offset accent card -->
  <div class="absolute z-20 right-1/4 bottom-1/4 bg-black text-white p-6 rounded-xl rotate-3">
    <p class="font-mono text-sm">depth++;clarity++;</p>
  </div>
</section>
```

### Timeline Flow
```html
<section class="slide flex flex-col justify-center p-20 bg-white">
  <h2 class="font-display text-4xl font-bold text-gray-900 mb-16">The Journey</h2>
  <!-- Horizontal timeline -->
  <div class="relative">
    <!-- Line -->
    <div class="absolute top-6 left-0 right-0 h-0.5 bg-gray-200"></div>
    <!-- Points -->
    <div class="flex justify-between relative z-10">
      <div class="text-center">
        <div class="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mx-auto">1</div>
        <p class="font-bold mt-4">Discovery</p>
        <p class="text-sm text-gray-500">Week 1-2</p>
      </div>
      <div class="text-center">
        <div class="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold mx-auto">2</div>
        <p class="font-bold mt-4">Design</p>
        <p class="text-sm text-gray-500">Week 3-4</p>
      </div>
      <div class="text-center">
        <div class="w-12 h-12 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold mx-auto">3</div>
        <p class="font-bold mt-4">Develop</p>
        <p class="text-sm text-gray-500">Week 5-8</p>
      </div>
      <div class="text-center">
        <div class="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold mx-auto">4</div>
        <p class="font-bold mt-4">Launch</p>
        <p class="text-sm text-gray-500">Week 9</p>
      </div>
    </div>
  </div>
</section>
```

### Grid Breaking Element
```html
<section class="slide p-20 bg-gray-50">
  <div class="grid grid-cols-3 gap-8">
    <!-- Regular grid items -->
    <div class="bg-white p-8 rounded-xl shadow-sm">
      <h3 class="font-bold text-xl mb-2">Feature One</h3>
      <p class="text-gray-600">Standard grid item with consistent styling.</p>
    </div>
    <div class="bg-white p-8 rounded-xl shadow-sm">
      <h3 class="font-bold text-xl mb-2">Feature Two</h3>
      <p class="text-gray-600">Another consistent element in the grid.</p>
    </div>
    <!-- GRID BREAKER - spans and overlaps -->
    <div class="bg-gradient-to-br from-blue-600 to-purple-600 p-8 rounded-xl shadow-2xl text-white
                col-span-1 row-span-2 -mr-12 -mb-12 relative z-10 transform hover:scale-105 transition-transform">
      <h3 class="font-bold text-2xl mb-4">The Hero Feature</h3>
      <p class="text-white/80">This element breaks the grid to draw attention and create visual interest.</p>
      <div class="mt-8">
        <span class="px-4 py-2 bg-white/20 rounded-full text-sm">Learn More →</span>
      </div>
    </div>
    <div class="bg-white p-8 rounded-xl shadow-sm">
      <h3 class="font-bold text-xl mb-2">Feature Three</h3>
      <p class="text-gray-600">Back to the regular pattern.</p>
    </div>
    <div class="bg-white p-8 rounded-xl shadow-sm">
      <h3 class="font-bold text-xl mb-2">Feature Four</h3>
      <p class="text-gray-600">Consistency with a twist.</p>
    </div>
  </div>
</section>
```

### The Reveal (Minimal to Maximum)
```html
<section class="slide flex items-center justify-center bg-black">
  <!-- Minimal: just a question -->
  <div class="text-center">
    <p class="text-white/40 text-lg tracking-widest uppercase mb-8">The Question</p>
    <h2 class="font-display text-7xl font-bold text-white">What if?</h2>
    <!-- Hidden detail that suggests more -->
    <div class="mt-16 opacity-30">
      <div class="w-px h-20 bg-white mx-auto"></div>
      <p class="text-sm text-white/50 mt-4">scroll to discover</p>
    </div>
  </div>
</section>
```

### Quote Wall Collage
```html
<section class="slide p-12 bg-gray-100">
  <h2 class="font-display text-3xl font-bold text-gray-900 mb-8">What People Say</h2>
  <!-- Staggered quote layout -->
  <div class="grid grid-cols-3 gap-6">
    <div class="bg-white p-6 rounded-xl shadow-sm">
      <p class="text-lg italic mb-4">"Absolutely transformed our workflow."</p>
      <p class="text-sm text-gray-500">— Sarah K., CEO</p>
    </div>
    <div class="bg-blue-600 text-white p-6 rounded-xl col-span-2 row-span-2">
      <p class="text-2xl italic mb-6">"The best decision we made this year. Nothing else comes close."</p>
      <p class="text-white/70">— Michael R., CTO at TechCorp</p>
    </div>
    <div class="bg-white p-6 rounded-xl shadow-sm">
      <p class="text-lg italic mb-4">"Simple, elegant, powerful."</p>
      <p class="text-sm text-gray-500">— James L., Designer</p>
    </div>
    <div class="bg-gray-900 text-white p-6 rounded-xl">
      <p class="text-lg italic mb-4">"Finally, someone gets it."</p>
      <p class="text-gray-400 text-sm">— Anonymous</p>
    </div>
    <div class="bg-white p-6 rounded-xl shadow-sm col-span-2">
      <p class="text-lg italic mb-4">"We saw 3x improvement in the first month alone."</p>
      <p class="text-sm text-gray-500">— Lisa M., Operations Lead</p>
    </div>
  </div>
</section>
```

---

## 8. Slide Variety Checklist

Before finalizing any presentation, verify:

- [ ] **No two consecutive slides have the same layout**
- [ ] **At least one slide uses asymmetric design**
- [ ] **Typography sizes vary dramatically across slides**
- [ ] **At least one slide has minimal content (1-2 elements)**
- [ ] **At least one slide has rich content (5+ elements)**
- [ ] **Color/background changes create rhythm**
- [ ] **Decorative elements are used sparingly but effectively**
- [ ] **There's a visual "hero" moment in the deck**
- [ ] **Transitions feel intentional, not random**
