---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic AI aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## UX Audit Rule

If the user asks to evaluate or improve UI consistency, build a design system, audit a product UI, or inventory interface components, perform an interface inventory before proposing design changes or code. Treat this as a required step like React best practices.

### Interface Inventory Workflow

**Purpose**

Build a comprehensive collection of UI components and treatments to expose inconsistencies, establish scope, and lay the groundwork for a design system.

**Inputs to Gather**

- Product area or pages to audit
- Target platform(s): web, mobile, desktop
- Scope constraints: time, teams, or critical flows
- Existing design system or style guide links (if any)

**Steps**

1. **Open the product**
   - Navigate key screens and flows.
   - Get screenshot tools ready.
2. **Create an inventory template**
   - Use a slide deck or spreadsheet with category headers and space for thumbnails.
   - One category per section.
3. **Capture components**
   - Screenshot distinct treatments, not every instance.
   - Focus on variation: colors, borders, icons, sizes, states.
4. **Categorize and group**
   - Place screenshots in the right category.
   - Group by treatment so variation is obvious.
5. **Review with stakeholders**
   - Walk through patterns, inconsistencies, and scope.
   - Align on which variations are intentional vs accidental.

**Inventory Categories**

- **Typography**: headings, body, captions, links
- **Buttons**: primary, secondary, tertiary, destructive, icon buttons
- **Form fields**: inputs, selects, textareas, checkboxes, radios, toggles
- **Navigation**: top nav, side nav, breadcrumbs, tabs
- **Feedback**: alerts, banners, toasts, tooltips, inline validation
- **Content blocks**: cards, list items, tables, empty states
- **Media**: images, avatars, icons, video players
- **Data viz**: charts, graphs, dashboards
- **Overlays**: modals, drawers, popovers
- **Layout**: grids, spacing systems, containers

**Output Format**

- A single inventory document with sections per category
- Each section shows all unique treatments side by side
- Annotate with short notes on usage and variation

**Benefits to Call Out**

- Exposes inconsistencies and redundancy
- Establishes scope for redesign work
- Builds the case for a design system
- Supports responsive retrofit planning
- Prevents components from being missed later

**Guidance and Tips**

- Capture enough to reveal variation, not every instance
- Look for subtle differences: border radius, shadow, icon placement, text casing
- Separate intentional differentiation from accidental drift
- Keep the inventory accessible for cross-team review

**Deliverables**

- Inventory deck or sheet
- Summary of key inconsistencies and consolidation opportunities
- Suggested next steps: style guide, pattern library, or system tokens

## Design Thinking

Before coding, understand the context and commit to a bold aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, and more. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this unforgettable? What is the one thing someone will remember?

**Critical**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work. The key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color and theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space or controlled density.
- **Backgrounds and visual details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

Never use generic AI aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, or cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. Never converge on common choices across generations.

**Important**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Do not hold back. Show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
