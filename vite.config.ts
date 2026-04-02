import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";
import path from "path";

export default defineConfig(({ isSsrBuild }) => ({
  build: {
    rollupOptions: isSsrBuild
      ? {
          input: "./server/app.ts",
        }
      : undefined,
  },
  ssr: {
    // browser-only libs — never bundle into the SSR build
    external: ["@react-pdf/renderer", "react-pdf-tailwind"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@khadim/html-to-pptx": path.resolve(__dirname, "packages/html-to-pptx/src/index.ts"),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "@react-pdf/renderer",
      "react-pdf-tailwind",
    ],
  },
  plugins: [
    svgr({ include: "**/*.svg" }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
}));
