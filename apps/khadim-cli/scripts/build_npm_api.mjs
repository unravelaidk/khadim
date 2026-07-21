#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.dirname(scriptDir);
const outputDir = path.join(cliRoot, "dist", "npm-api");
const require = createRequire(import.meta.url);

let tscPath;
try {
  tscPath = require.resolve("typescript/bin/tsc");
} catch {
  throw new Error(
    "TypeScript is required to build the npm API. Run `npm install --workspaces=false` in apps/khadim-cli first.",
  );
}

rmSync(outputDir, { force: true, recursive: true });

const result = spawnSync(
  process.execPath,
  [tscPath, "--project", path.join(cliRoot, "tsconfig.npm.json")],
  { cwd: cliRoot, stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

mkdirSync(outputDir, { recursive: true });
for (const file of ["platform-targets.js", "platform-targets.d.ts"]) {
  copyFileSync(path.join(cliRoot, "src", file), path.join(outputDir, file));
}
