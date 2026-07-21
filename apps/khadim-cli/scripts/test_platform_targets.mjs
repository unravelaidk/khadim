import assert from "node:assert/strict";
import test from "node:test";

import {
  PLATFORM_TARGETS,
  assertRuntimeCompatibility,
  platformTarget,
} from "../src/platform-targets.js";

const cases = [
  ["linux", "x64", "linux-x64", "x86_64-unknown-linux-gnu", "khadim-cli"],
  ["linux", "arm64", "linux-arm64", "aarch64-unknown-linux-gnu", "khadim-cli"],
  ["darwin", "x64", "darwin-x64", "x86_64-apple-darwin", "khadim-cli"],
  ["darwin", "arm64", "darwin-arm64", "aarch64-apple-darwin", "khadim-cli"],
  ["win32", "x64", "win32-x64", "x86_64-pc-windows-msvc", "khadim-cli.exe"],
  ["win32", "arm64", "win32-arm64", "aarch64-pc-windows-msvc", "khadim-cli.exe"],
];

test("Node platform and architecture map to the release target table", () => {
  assert.equal(Object.keys(PLATFORM_TARGETS).length, cases.length);

  for (const [platform, arch, tag, target, binary] of cases) {
    const resolved = platformTarget(platform, arch);
    assert.equal(resolved.tag, tag);
    assert.equal(resolved.target, target);
    assert.equal(resolved.binary, binary);
    if (platform === "linux") {
      assert.equal(resolved.libc, "glibc");
      assert.equal(resolved.glibc_min, "2.35");
    }
  }
});

test("unsupported Node targets fail with an actionable platform tuple", () => {
  assert.throws(
    () => platformTarget("freebsd", "x64"),
    /Unsupported platform: freebsd \(x64\)/,
  );
});

test("GNU Linux targets enforce the published glibc baseline", () => {
  const target = platformTarget("linux", "x64");

  assert.equal(
    assertRuntimeCompatibility(target, {
      platform: "linux",
      glibcVersionRuntime: "2.35",
    }),
    target,
  );
  assert.equal(
    assertRuntimeCompatibility(target, {
      platform: "linux",
      glibcVersionRuntime: "2.99",
    }),
    target,
  );
  assert.throws(
    () =>
      assertRuntimeCompatibility(target, {
        platform: "linux",
        glibcVersionRuntime: "2.34",
      }),
    /requires glibc 2\.35\+/,
  );
});

test("musl Linux gets an actionable source-build error", () => {
  const target = platformTarget("linux", "arm64");

  assert.throws(
    () =>
      assertRuntimeCompatibility(target, {
        platform: "linux",
        glibcVersionRuntime: null,
      }),
    /musl-based distributions such as Alpine are not supported.*Build Khadim from source/,
  );
});

test("libc checks do not affect non-Linux targets", () => {
  const target = platformTarget("darwin", "arm64");
  assert.equal(
    assertRuntimeCompatibility(target, {
      platform: "darwin",
      glibcVersionRuntime: null,
    }),
    target,
  );
});
