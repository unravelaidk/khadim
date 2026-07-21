import { readFileSync } from "node:fs";

function readPlatformManifest() {
  // Published packages place this module in dist/. Local TypeScript builds
  // place it in dist/npm-api/. The source tree keeps it in src/.
  const candidates = [
    new URL("../platform-targets.json", import.meta.url),
    new URL("../../platform-targets.json", import.meta.url),
  ];
  let missingError;
  for (const manifestUrl of candidates) {
    try {
      return JSON.parse(readFileSync(manifestUrl, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      missingError = error;
    }
  }
  throw missingError;
}

const parsedTargets = readPlatformManifest();

export const PLATFORM_TARGETS = Object.freeze(
  Object.fromEntries(
    Object.entries(parsedTargets).map(([tag, config]) => [
      tag,
      Object.freeze({ tag, ...config }),
    ]),
  ),
);

const targetsByNodePlatform = new Map();
for (const target of Object.values(PLATFORM_TARGETS)) {
  const key = `${target.os}:${target.cpu}`;
  if (targetsByNodePlatform.has(key)) {
    throw new Error(`Duplicate Khadim platform target for ${key}`);
  }
  targetsByNodePlatform.set(key, target);
}

export function platformTarget(platform = process.platform, arch = process.arch) {
  const target = targetsByNodePlatform.get(`${platform}:${arch}`);
  if (!target) {
    throw new Error(`Unsupported platform: ${platform} (${arch})`);
  }
  return target;
}

function runtimeGlibcVersion() {
  try {
    return process.report?.getReport()?.header?.glibcVersionRuntime ?? null;
  } catch {
    return null;
  }
}

function compareVersion(left, right) {
  const parts = (version) =>
    String(version)
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const leftParts = parts(left);
  const rightParts = parts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function assertRuntimeCompatibility(
  target,
  {
    platform = process.platform,
    glibcVersionRuntime = runtimeGlibcVersion(),
  } = {},
) {
  if (platform !== "linux" || target.libc !== "glibc") return target;

  const minimum = target.glibc_min;
  if (!glibcVersionRuntime) {
    throw new Error(
      `Unsupported Linux libc for Khadim ${target.tag}: the prebuilt binary requires glibc ${minimum}+; musl-based distributions such as Alpine are not supported. Build Khadim from source on this host instead.`,
    );
  }
  if (minimum && compareVersion(glibcVersionRuntime, minimum) < 0) {
    throw new Error(
      `Unsupported glibc ${glibcVersionRuntime} for Khadim ${target.tag}: the prebuilt binary requires glibc ${minimum}+. Build Khadim from source on this host instead.`,
    );
  }
  return target;
}
