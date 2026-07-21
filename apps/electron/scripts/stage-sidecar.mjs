import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSidecarStagingPlan } from "./sidecar-target.mjs";
import { createBunStagingPlan } from "./bun-target.mjs";

const electronRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliRoot = resolve(electronRoot, "../khadim-cli");

function buildSidecar(buildTarget) {
  const args = ["build", "--release", "--locked", "--manifest-path", join(cliRoot, "Cargo.toml")];
  if (buildTarget) args.push("--target", buildTarget);

  const result = spawnSync("cargo", args, { cwd: cliRoot, stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    throw new Error("Cargo is required to package Khadim. Install Rust or set KHADIM_CLI_BINARY to a prebuilt platform binary.");
  }
  if (result.status !== 0) throw new Error(`Khadim CLI release build failed with status ${result.status ?? "unknown"}.`);
}

function discoverBunBinary() {
  const command = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(command, ["bun"], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  return result.stdout.split(/\r?\n/).map((value) => value.trim()).find(Boolean);
}

const plan = createSidecarStagingPlan({
  electronRoot,
  cliRoot,
  cargoTargetDirectory: process.env.CARGO_TARGET_DIR,
  cargoBuildTarget: process.env.CARGO_BUILD_TARGET,
  hostPlatform: process.platform,
  binaryOverride: process.env.KHADIM_CLI_BINARY,
  overrideWorkingDirectory: process.cwd(),
});
if (plan.shouldBuild) buildSidecar(plan.buildTarget);
if (!existsSync(plan.source)) throw new Error(`Khadim CLI binary was not found at ${plan.source}`);

const bunPlan = createBunStagingPlan({
  electronRoot,
  hostPlatform: process.platform,
  binaryOverride: process.env.KHADIM_BUN_BINARY,
  discoveredBinary: discoverBunBinary(),
  overrideWorkingDirectory: process.cwd(),
});
if (!existsSync(bunPlan.source)) throw new Error(`Bun binary was not found at ${bunPlan.source}`);

const stagingDir = dirname(plan.destination);
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
copyFileSync(plan.source, plan.destination);
if (plan.shouldChmod) chmodSync(plan.destination, 0o755);
copyFileSync(bunPlan.source, bunPlan.destination);
if (bunPlan.shouldChmod) chmodSync(bunPlan.destination, 0o755);

console.log(`Staged Khadim sidecar: ${plan.destination}`);
console.log(`Staged Bun runtime: ${bunPlan.destination}`);
