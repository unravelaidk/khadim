import dotenv from "dotenv";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(scriptDir, "..");
const rootEnv = path.resolve(webDir, "../../.env");

dotenv.config({ path: rootEnv });
dotenv.config();

const command = process.argv[2];

if (!command || !["generate", "migrate"].includes(command)) {
  console.error("Usage: tsx scripts/run-drizzle.ts <generate|migrate>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error(`DATABASE_URL is not set. Expected it in ${rootEnv}`);
  process.exit(1);
}

const drizzleBin = path.resolve(webDir, "node_modules/.bin/drizzle-kit");
const child = spawn(drizzleBin, [command], {
  cwd: webDir,
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
