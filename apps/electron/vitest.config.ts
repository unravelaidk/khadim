import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["tests/integration/renderer/**/*.test.tsx", "happy-dom"],
      ["tests/e2e/renderer/**/*.test.tsx", "happy-dom"],
    ],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15_000,
  },
});
