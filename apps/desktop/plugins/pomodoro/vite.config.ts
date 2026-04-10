import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cssInjectedByJs from "vite-plugin-css-injected-by-js";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), cssInjectedByJs()],

  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },

  build: {
    lib: {
      entry: resolve(__dirname, "src/index.tsx"),
      formats: ["es"],
      fileName: () => "ui.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    outDir: ".",
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
  },
});
