import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "plugin-worker": resolve("src/main/plugins/plugin-worker.ts"),
        },
        output: {
          entryFileNames: "[name].js",
        },
        external: ["electron-liquid-glass"],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      // Electron loads the production renderer from file://. Keeping editor
      // styles in the main CSS asset avoids Vite's fetch-based lazy CSS preload,
      // which cannot reliably load Puck/Monaco chunks from a packaged file URL.
      cssCodeSplit: false,
    },
  },
});
