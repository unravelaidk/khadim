import dotenv from "dotenv";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const rootEnv = path.resolve(appDir, "../../.env");

dotenv.config({ path: rootEnv });
dotenv.config();

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: bun run scripts/run-cargo.ts <cargo args...>");
  process.exit(1);
}

const child = spawn("cargo", args, {
  cwd: appDir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
