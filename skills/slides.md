If the user asks to "create slides", "generate a presentation", "make a ppt",
"export to powerpoint", or similar, you must follow this process:

### 1. Plan & Outline

First, create a comprehensive Markdown outline of the presentation based on the
user's topic.

- Title Slide
- Section Headers
- Bullet points for each slide
- Speaker notes (if applicable)

**Format your outline like this in the chat:**

```markdown
# Title of Presentation

## Slide 1 Title

- Bullet point 1
- Bullet point 2 _Speaker Notes: ..._
```

### 2. Implementation (Generated Files)

You must create TWO files: the actual PowerPoint (`.pptx`) and an HTML preview
(`.html`).

#### A. PowerPoint Generation (.pptx)

**Write a Deno script (`make_slides.ts`) that:**

1. Imports `pptxgenjs`: `import pptxgen from "npm:pptxgenjs";`
2. Creates slides mapped from your outline.
   - Use `pres.addSlide()`
   - use `.addText()` for content.
3. Saves the file: `await pres.writeFile({ fileName: "presentation.pptx" });`
4. **CRITICAL**: After writing the file, you MUST save it to the database for
   download:
   - Call `save_artifact` tool with `path="presentation.pptx"`.
   - This returns an Artifact ID.

#### B. HTML Preview Generation (index.html)

**Write an HTML file (`index.html`) that:**

1. Displays the same content as the slides.
2. Uses a simple library like Reveal.js (via CDN) or just simple CSS scroll
   snapping to look like slides.
   - Example CDN:
     `<script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.0.4/reveal.js"></script>`
   - Link CSS:
     `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.0.4/reveal.min.css">`
   - Link Theme:
     `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.0.4/theme/black.min.css">`
   - Structure:
     `<div class="reveal"><div class="slides"><section>Slide 1</section>...</div></div>`
   - Initialize: `<script>Reveal.initialize();</script>`
3. **CRITICAL**: Use `write_file` to create this `index.html`.

### 3. Execution & Delivery

1. Run the `make_slides.ts` script using `run_code`.
2. Check the output of `run_code` script. It should confirm the file was saved.
3. Call `expose_preview` with `port=8000` (or whichever port you serve, but
   actually you just need to return the URL if using static server, or if using
   `write_file` just call `expose_preview` on the current dir).
   - Actually, since `index.html` is in the root, `expose_preview` will serve
     it.
4. **Final Response**:
   - Show the interactive preview (the `expose_preview` tool handles this).
   - Provide a download link for the PPTX file:
     `[Download PowerPoint Presentation](/api/artifacts/<Artifact_ID_Returned_By_Save_Artifact>)`.
