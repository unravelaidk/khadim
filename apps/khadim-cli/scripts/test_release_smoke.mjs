import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { platformTarget } from "../src/platform-targets.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.dirname(scriptDir);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      KHADIM_NO_UPDATE_CHECK: "1",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
    },
  });
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"),
  );
  return result.stdout;
}

test(
  "staged main and current-platform tarballs import and launch without publishing",
  { skip: process.platform === "win32" && "fixture uses a POSIX executable" },
  () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "khadim-release-smoke-test-"));
    try {
      const target = platformTarget();
      const artifacts = path.join(root, "artifacts", target.artifact);
      const output = path.join(root, "output");
      mkdirSync(artifacts, { recursive: true });
      const artifact = path.join(artifacts, target.artifact_file);
      const version = "0.0.0-smoke";
      writeFileSync(artifact, `#!/usr/bin/env sh\nprintf 'khadim-cli ${version}\\n'\n`);
      chmodSync(artifact, 0o755);

      const python = process.env.PYTHON ?? "python3";
      for (const packageName of ["main", target.tag]) {
        run(
          python,
          [
            path.join(scriptDir, "stage_npm_package.py"),
            "--version",
            version,
            "--package",
            packageName,
            "--artifact-dir",
            path.join(root, "artifacts"),
            "--output-dir",
            output,
          ],
          cliRoot,
        );
      }

      const smokeOutput = run(
        process.execPath,
        [
          path.join(scriptDir, "smoke_npm_release.mjs"),
          "--version",
          version,
          "--platform-tag",
          target.tag,
          "--main-tarball",
          path.join(output, `khadim-cli-npm-${version}.tgz`),
          "--platform-tarball",
          path.join(output, `khadim-cli-npm-${target.tag}-${version}.tgz`),
        ],
        cliRoot,
      );
      assert.match(smokeOutput, /npm release smoke passed/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  },
);
