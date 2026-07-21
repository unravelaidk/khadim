import { isAbsolute, join, resolve } from "node:path";

/**
 * Build a deterministic plan for locating and staging the native CLI.
 *
 * Cargo target triples describe the artifact being produced, so they take
 * precedence over the build host when choosing the executable suffix.
 */
export function createSidecarStagingPlan({
  electronRoot,
  cliRoot,
  cargoTargetDirectory,
  cargoBuildTarget,
  hostPlatform,
  binaryOverride,
  overrideWorkingDirectory = process.cwd(),
}) {
  const buildTarget = cargoBuildTarget || undefined;
  const targetDirectory = cargoTargetDirectory
    ? (isAbsolute(cargoTargetDirectory) ? cargoTargetDirectory : resolve(cliRoot, cargoTargetDirectory))
    : join(cliRoot, "target");
  const targetsWindows = buildTarget
    ? buildTarget.split("-").includes("windows")
    : hostPlatform === "win32";
  const executable = targetsWindows ? "khadim-cli.exe" : "khadim-cli";
  const buildOutput = join(
    targetDirectory,
    ...(buildTarget ? [buildTarget] : []),
    "release",
    executable,
  );

  return {
    buildTarget,
    executable,
    targetDirectory,
    buildOutput,
    source: binaryOverride ? resolve(overrideWorkingDirectory, binaryOverride) : buildOutput,
    destination: join(electronRoot, "build", "sidecar", executable),
    shouldBuild: !binaryOverride,
    shouldChmod: !targetsWindows,
  };
}
