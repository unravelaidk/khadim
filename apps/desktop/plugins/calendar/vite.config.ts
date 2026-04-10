import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cssInjectedByJs from "vite-plugin-css-injected-by-js";
import { resolve } from "path";

/**
 * Khadim plugin build config.
 *
 * Outputs a single self-contained ESM file (`ui.js`) that:
 *   - Bundles React + ReactDOM (no external dependencies)
 *   - Inlines all CSS via vite-plugin-css-injected-by-js
 *   - Registers web components as side effects on load
 *
 * The file is served at runtime via khadim-plugin://{pluginId}/ui.js
 * and injected as <script type="module"> by usePluginScripts.
 */
export default defineConfig({
  plugins: [
    react(),
    // Injects any CSS imports into the JS bundle so the single
    // ui.js file is truly self-contained (no separate .css file).
    cssInjectedByJs(),
  ],

  define: {
    // React (and some deps) reference process.env.NODE_ENV at runtime.
    // The webview has no `process` global, so we must inline it at build time.
    "process.env.NODE_ENV": JSON.stringify("production"),
  },

  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      // ESM lets the browser use <script type="module"> — already done by
      // usePluginScripts in the host app.
      formats: ["es"],
      // Output as "ui.js" so it matches the plugin.toml declaration.
      fileName: () => "ui.js",
    },

    rollupOptions: {
      output: {
        // Keep everything in a single file — no code-splitting.
        // This is intentional: we serve one file per plugin.
        inlineDynamicImports: true,
      },
    },

    // Output directly into the plugin directory next to plugin.toml.
    // Vite warns when outDir is the project root — this is intentional here
    // because plugins are self-contained directories, not typical web apps.
    outDir: ".",
    emptyOutDir: false,

    minify: true,

    // Source maps are optional — enable during development if needed
    sourcemap: false,
  },
});
