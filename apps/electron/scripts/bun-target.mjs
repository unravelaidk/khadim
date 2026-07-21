import { isAbsolute, join, resolve } from "node:path";

export function createBunStagingPlan({
  electronRoot,
  hostPlatform,
  binaryOverride,
  discoveredBinary,
  overrideWorkingDirectory,
}) {
  const configuredSource = binaryOverride?.trim() || discoveredBinary?.trim();
  if (!configuredSource) {
    throw new Error("Bun is required to package Khadim. Install Bun or set KHADIM_BUN_BINARY to a prebuilt Bun executable.");
  }
  const workingDirectory = overrideWorkingDirectory || process.cwd();
  const source = isAbsolute(configuredSource) ? configuredSource : resolve(workingDirectory, configuredSource);
  const executable = hostPlatform === "win32" ? "bun.exe" : "bun";
  return {
    source,
    destination: join(electronRoot, "build", "sidecar", executable),
    shouldChmod: hostPlatform !== "win32",
  };
}
