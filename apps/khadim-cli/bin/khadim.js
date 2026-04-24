#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const PLATFORM_PACKAGE_BY_TARGET = {
  "x86_64-unknown-linux-gnu": "@khadim/cli-linux-x64",
  "aarch64-unknown-linux-gnu": "@khadim/cli-linux-arm64",
  "x86_64-apple-darwin": "@khadim/cli-darwin-x64",
  "aarch64-apple-darwin": "@khadim/cli-darwin-arm64",
};

function currentTargetTriple() {
  const { platform, arch } = process;
  if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-gnu";
  if (platform === "linux" && arch === "arm64") return "aarch64-unknown-linux-gnu";
  if (platform === "darwin" && arch === "x64") return "x86_64-apple-darwin";
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  throw new Error(`Unsupported platform: ${platform} (${arch})`);
}

function detectPackageManager() {
  const userAgent = process.env.npm_config_user_agent || "";
  if (/\bbun\//.test(userAgent)) return "bun";
  const execPath = process.env.npm_execpath || "";
  if (execPath.includes("bun")) return "bun";
  if (__dirname.includes(".bun/install/global") || __dirname.includes(".bun\\install\\global")) return "bun";
  return userAgent ? "npm" : null;
}

function reinstallHint() {
  return detectPackageManager() === "bun"
    ? "bun install -g @khadim/cli@latest"
    : "npm install -g @khadim/cli@latest";
}

const targetTriple = currentTargetTriple();
const platformPackage = PLATFORM_PACKAGE_BY_TARGET[targetTriple];
const binaryName = process.platform === "win32" ? "khadim-cli.exe" : "khadim-cli";
const localVendorRoot = path.join(__dirname, "..", "vendor");
const localBinaryPath = path.join(localVendorRoot, targetTriple, "khadim-cli", binaryName);

let vendorRoot;
try {
  const packageJsonPath = require.resolve(`${platformPackage}/package.json`);
  vendorRoot = path.join(path.dirname(packageJsonPath), "vendor");
} catch {
  if (existsSync(localBinaryPath)) {
    vendorRoot = localVendorRoot;
  } else {
    throw new Error(`Missing optional dependency ${platformPackage}. Reinstall Khadim: ${reinstallHint()}`);
  }
}

const binaryPath = path.join(vendorRoot, targetTriple, "khadim-cli", binaryName);
if (!existsSync(binaryPath)) {
  throw new Error(`Khadim native binary not found at ${binaryPath}. Reinstall Khadim: ${reinstallHint()}`);
}

const env = { ...process.env };
env[detectPackageManager() === "bun" ? "KHADIM_MANAGED_BY_BUN" : "KHADIM_MANAGED_BY_NPM"] = "1";

const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: "inherit",
  env,
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

const forwardSignal = (signal) => {
  if (child.killed) return;
  try {
    child.kill(signal);
  } catch {
    // Ignore races during shutdown.
  }
};

["SIGINT", "SIGTERM", "SIGHUP"].forEach((signal) => {
  process.on(signal, () => forwardSignal(signal));
});

const childResult = await new Promise((resolve) => {
  child.on("exit", (code, signal) => {
    if (signal) {
      resolve({ type: "signal", signal });
    } else {
      resolve({ type: "code", exitCode: code ?? 1 });
    }
  });
});

if (childResult.type === "signal") {
  process.kill(process.pid, childResult.signal);
} else {
  process.exit(childResult.exitCode);
}
