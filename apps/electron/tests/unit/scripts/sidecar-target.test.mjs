import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import { createSidecarStagingPlan } from "../../../scripts/sidecar-target.mjs";

const electronRoot = resolve("/workspace/apps/electron");
const cliRoot = resolve("/workspace/apps/khadim-cli");
const targetDirectory = resolve("/cargo-target");

describe("createSidecarStagingPlan", () => {
  it.each([
    { target: "x86_64-unknown-linux-gnu", host: "win32", executable: "khadim-cli" },
    { target: "aarch64-unknown-linux-gnu", host: "win32", executable: "khadim-cli" },
    { target: "x86_64-apple-darwin", host: "win32", executable: "khadim-cli" },
    { target: "aarch64-apple-darwin", host: "win32", executable: "khadim-cli" },
    { target: "x86_64-pc-windows-msvc", host: "linux", executable: "khadim-cli.exe" },
    { target: "aarch64-pc-windows-msvc", host: "darwin", executable: "khadim-cli.exe" },
  ])("uses target $target instead of host $host", ({ target, host, executable }) => {
    const plan = createSidecarStagingPlan({
      electronRoot,
      cliRoot,
      cargoTargetDirectory: targetDirectory,
      cargoBuildTarget: target,
      hostPlatform: host,
    });

    expect(plan).toMatchObject({
      executable,
      buildTarget: target,
      shouldBuild: true,
      shouldChmod: !executable.endsWith(".exe"),
      source: join(targetDirectory, target, "release", executable),
      destination: join(electronRoot, "build", "sidecar", executable),
    });
  });

  it.each([
    { host: "linux", executable: "khadim-cli" },
    { host: "darwin", executable: "khadim-cli" },
    { host: "win32", executable: "khadim-cli.exe" },
  ])("uses host $host when no Cargo target is configured", ({ host, executable }) => {
    const plan = createSidecarStagingPlan({
      electronRoot,
      cliRoot,
      cargoTargetDirectory: targetDirectory,
      hostPlatform: host,
    });

    expect(plan.source).toBe(join(targetDirectory, "release", executable));
    expect(plan.destination).toBe(join(electronRoot, "build", "sidecar", executable));
  });

  it("preserves a prebuilt binary override without scheduling a Cargo build", () => {
    const overrideWorkingDirectory = resolve("/workspace/release-job");
    const plan = createSidecarStagingPlan({
      electronRoot,
      cliRoot,
      cargoTargetDirectory: targetDirectory,
      cargoBuildTarget: "aarch64-pc-windows-msvc",
      hostPlatform: "linux",
      binaryOverride: "prebuilt/khadim-cli.exe",
      overrideWorkingDirectory,
    });

    expect(plan.shouldBuild).toBe(false);
    expect(plan.source).toBe(resolve(overrideWorkingDirectory, "prebuilt/khadim-cli.exe"));
    expect(plan.destination).toBe(join(electronRoot, "build", "sidecar", "khadim-cli.exe"));
  });

  it("resolves a relative Cargo target directory from the CLI crate", () => {
    const plan = createSidecarStagingPlan({
      electronRoot,
      cliRoot,
      cargoTargetDirectory: "../shared-target",
      cargoBuildTarget: "aarch64-apple-darwin",
      hostPlatform: "linux",
    });

    expect(plan.source).toBe(resolve(cliRoot, "../shared-target", "aarch64-apple-darwin", "release", "khadim-cli"));
  });
});
