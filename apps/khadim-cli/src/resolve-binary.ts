/**
 * Resolves the native khadim binary path.
 * Shared by the CLI launcher and the programmatic API.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const PLATFORM_PACKAGE_BY_TARGET: Record<string, string> = {
  "x86_64-unknown-linux-gnu": "@unravelai/khadim-linux-x64",
  "aarch64-unknown-linux-gnu": "@unravelai/khadim-linux-arm64",
  "x86_64-apple-darwin": "@unravelai/khadim-darwin-x64",
  "aarch64-apple-darwin": "@unravelai/khadim-darwin-arm64",
};

function currentTargetTriple(): string {
  const { platform, arch } = process;
  if (platform === "linux" && arch === "x64") return "x86_64-unknown-linux-gnu";
  if (platform === "linux" && arch === "arm64") return "aarch64-unknown-linux-gnu";
  if (platform === "darwin" && arch === "x64") return "x86_64-apple-darwin";
  if (platform === "darwin" && arch === "arm64") return "aarch64-apple-darwin";
  throw new Error(`Unsupported platform: ${platform} (${arch})`);
}

export async function resolveBinaryPath(): Promise<string> {
  const targetTriple = currentTargetTriple();
  const platformPackage = PLATFORM_PACKAGE_BY_TARGET[targetTriple];
  const binaryName = process.platform === "win32" ? "khadim-cli.exe" : "khadim-cli";

  // Try local vendor directory (dev/staging)
  const localVendorRoot = path.join(__dirname, "..", "vendor");
  const localBinaryPath = path.join(localVendorRoot, targetTriple, "khadim-cli", binaryName);

  // Try optional dependency npm package
  try {
    const pkgJsonPath = require.resolve(`${platformPackage}/package.json`);
    const vendorRoot = path.join(path.dirname(pkgJsonPath), "vendor");
    const binaryPath = path.join(vendorRoot, targetTriple, "khadim-cli", binaryName);
    if (existsSync(binaryPath)) {
      return binaryPath;
    }
  } catch {
    // Package not installed, fall through
  }

  if (existsSync(localBinaryPath)) {
    return localBinaryPath;
  }

  throw new Error(
    `Khadim native binary not found for ${targetTriple}. Reinstall Khadim.`,
  );
}
