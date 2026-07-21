/**
 * Resolves the native khadim binary path.
 * Shared by the CLI launcher and the programmatic API.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRuntimeCompatibility,
  platformTarget,
} from "./platform-targets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

export function resolvePackageRoot(moduleDirectory = __dirname): string {
  const parent = path.dirname(moduleDirectory);
  return path.basename(moduleDirectory) === "npm-api" && path.basename(parent) === "dist"
    ? path.resolve(moduleDirectory, "..", "..")
    : parent;
}

export function currentTargetTriple(
  platform = process.platform,
  arch = process.arch,
): string {
  return platformTarget(platform, arch).target;
}

export async function resolveBinaryPath(): Promise<string> {
  const currentTarget = assertRuntimeCompatibility(platformTarget());
  const targetTriple = currentTarget.target;
  const platformPackage = currentTarget.alias;
  const binaryName = currentTarget.binary;

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

  // Try local vendor directory (dev/staging)
  const packageRoot = resolvePackageRoot();
  const localVendorRoot = path.join(packageRoot, "vendor");
  const localBinaryPath = path.join(localVendorRoot, targetTriple, "khadim-cli", binaryName);
  if (existsSync(localBinaryPath)) {
    return localBinaryPath;
  }

  // Dev mode: check cargo target dir (cargo build output)
  const devBinaryPath = path.join(packageRoot, "target", "debug", binaryName);
  if (existsSync(devBinaryPath)) {
    return devBinaryPath;
  }

  const releaseBinaryPath = path.join(packageRoot, "target", "release", binaryName);
  if (existsSync(releaseBinaryPath)) {
    return releaseBinaryPath;
  }

  throw new Error(
    `Khadim native binary not found for ${targetTriple}. Reinstall Khadim.`,
  );
}
