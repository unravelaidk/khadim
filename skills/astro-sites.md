If the user asks to create a **simple website**, **landing page**, **portfolio**, **blog**, **documentation site**, or any **content-focused website** with minimal JavaScript interactivity, use Astro.

**When to use Astro:**
- Static websites (landing pages, portfolios, blogs)
- Content-focused sites
- Sites that don't need heavy client-side interactivity
- When performance is critical (Astro ships zero JS by default)

**When NOT to use Astro (use React Router or Vite instead):**
- Complex web apps with lots of interactivity
- Games or real-time applications
- Apps requiring heavy client-side state management

## Steps:

1. **Create the Plan**:
   - Call `create_plan` first with the project description, steps, and estimated tool calls.

2. **Scaffold the Astro Project**:
   - Use `create_web_app` with `type: "astro"` and choose an appropriate template.
   - Or use `shell`: `npm create astro@latest <project-name> -- --template <template> --yes`
   - The `--yes` flag skips prompts for non-interactive mode.
   
   **Available Templates:**
   | Template | Use Case |
   |----------|----------|
   | `basics` | General purpose starter (recommended default) |
   | `blog` | Blog with markdown support |
   | `starlight` | Documentation sites |
   | `starlog` | Changelog/release notes site |
   | `portfolio` | Portfolio/personal site |
   | `minimal` | Bare bones starter |

3. **Install Tailwind CSS** (recommended for styling):
   - Run: `cd <project-name> && npx astro add tailwind --yes`

4. **Install Dependencies**:
   - Run: `cd <project-name> && npm install`

5. **Create Pages**:
   - Astro pages go in `src/pages/`
   - Use `write_file` to create pages like `src/pages/index.astro`
   
   **Example Astro Page:**
   ```astro
   ---
   // Component Script (runs at build time)
   const title = "Welcome to My Site";
   ---
   
   <html lang="en">
     <head>
       <meta charset="utf-8" />
       <meta name="viewport" content="width=device-width" />
       <title>{title}</title>
     </head>
     <body class="bg-gray-900 text-white min-h-screen">
       <main class="container mx-auto px-4 py-16">
         <h1 class="text-4xl font-bold">{title}</h1>
         <p class="mt-4 text-gray-400">This is a simple Astro site.</p>
       </main>
     </body>
   </html>
   ```

6. **Create Components** (optional):
   - Astro components go in `src/components/`
   - Can use `.astro`, `.jsx`, `.tsx`, `.vue`, or `.svelte` files

7. **Build the Site**:
   - Run: `cd <project-name> && npm run build`

8. **Serve the Preview**:
   - **CRITICAL**: Astro outputs to `<project-name>/dist`
   - Use: `expose_preview({ port: 8000, startServer: true, root: "<project-name>/dist" })`

## Astro File Structure:
```
<project-name>/
├── src/
│   ├── pages/          # Routes (index.astro = /)
│   ├── components/     # Reusable components
│   ├── layouts/        # Page layouts
│   └── styles/         # Global styles
├── public/             # Static assets
├── astro.config.mjs    # Astro configuration
└── package.json
```

## Tips:
- Astro uses file-based routing: `src/pages/about.astro` → `/about`
- Use `---` fences for component script (runs at build time)
- Tailwind classes work directly in Astro templates
- For interactive components, add React/Vue with `npx astro add react`
