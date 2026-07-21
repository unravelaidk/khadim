import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createBunStagingPlan } from "../../../scripts/bun-target.mjs";

describe("Bun staging target", () => {
  const electronRoot = resolve("/repo/apps/electron");

  it("stages a discovered Unix Bun binary beside the Khadim CLI", () => {
    expect(createBunStagingPlan({
      electronRoot,
      hostPlatform: "linux",
      discoveredBinary: "/opt/bun/bin/bun",
      overrideWorkingDirectory: "/repo",
    })).toEqual({
      source: "/opt/bun/bin/bun",
      destination: join(electronRoot, "build", "sidecar", "bun"),
      shouldChmod: true,
    });
  });

  it("prefers a relative override and uses the Windows executable name", () => {
    expect(createBunStagingPlan({
      electronRoot,
      hostPlatform: "win32",
      binaryOverride: "vendor/bun.exe",
      discoveredBinary: "C:\\bun\\bun.exe",
      overrideWorkingDirectory: "/repo",
    })).toEqual({
      source: resolve("/repo/vendor/bun.exe"),
      destination: join(electronRoot, "build", "sidecar", "bun.exe"),
      shouldChmod: false,
    });
  });

  it("fails with packaging guidance when Bun cannot be resolved", () => {
    expect(() => createBunStagingPlan({ electronRoot, hostPlatform: "linux" })).toThrow("KHADIM_BUN_BINARY");
  });
});
