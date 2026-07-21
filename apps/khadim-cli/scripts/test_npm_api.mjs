import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.dirname(scriptDir);

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_update_notifier: "false", ...env },
  });
  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(" ")} failed`,
      result.stdout,
      result.stderr,
      result.error?.message,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return result.stdout;
}

test("npm tarball imports from a clean Node installation", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "khadim-npm-api-"));
  try {
    const stagingDir = path.join(tempRoot, "staging");
    const outputDir = path.join(tempRoot, "packed");
    const consumerDir = path.join(tempRoot, "consumer");
    mkdirSync(consumerDir, { recursive: true });
    writeFileSync(
      path.join(consumerDir, "package.json"),
      JSON.stringify({ name: "khadim-api-smoke", private: true, type: "module" }),
    );

    const version = "0.0.0-api-smoke";
    const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
    run(
      python,
      [
        path.join(scriptDir, "stage_npm_package.py"),
        "--version",
        version,
        "--package",
        "main",
        "--staging-dir",
        stagingDir,
        "--output-dir",
        outputDir,
      ],
      cliRoot,
    );

    const tarball = path.join(outputDir, `khadim-cli-npm-${version}.tgz`);
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    run(
      npm,
      [
        "install",
        "--offline",
        "--ignore-scripts",
        "--omit=optional",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        "--no-save",
        tarball,
      ],
      consumerDir,
      { npm_config_cache: path.join(tempRoot, "npm-cache") },
    );

    const installedRoot = path.join(
      consumerDir,
      "node_modules",
      "@unravelai",
      "khadim",
    );
    const installedManifest = JSON.parse(
      readFileSync(path.join(installedRoot, "package.json"), "utf8"),
    );
    assert.equal(installedManifest.main, "./dist/index.js");
    assert.equal(installedManifest.types, "./dist/index.d.ts");
    assert.equal(installedManifest.exports["."].import, "./dist/index.js");
    assert.ok(existsSync(path.join(installedRoot, "dist", "index.d.ts")));
    assert.equal(existsSync(path.join(installedRoot, "src")), false);

    const imported = run(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        [
          'import * as api from "@unravelai/khadim";',
          "const expected = [\"getModels\", \"getProviders\", \"resolveBinaryPath\", \"runAgent\", \"runAgentStream\"];",
          "for (const name of expected) { if (typeof api[name] !== \"function\") throw new Error(`Missing API export: ${name}`); }",
          "console.log(JSON.stringify(Object.keys(api).sort()));",
        ].join("\n"),
      ],
      consumerDir,
    );
    assert.deepEqual(JSON.parse(imported), [
      "getModels",
      "getProviders",
      "resolveBinaryPath",
      "runAgent",
      "runAgentStream",
    ]);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
});

test("compiled workspace API resolves paths from the package root", async () => {
  const { resolvePackageRoot } = await import("../dist/npm-api/resolve-binary.js");
  assert.equal(
    resolvePackageRoot(path.join(cliRoot, "dist", "npm-api")),
    cliRoot,
  );
  assert.equal(resolvePackageRoot(path.join(cliRoot, "dist")), cliRoot);
  assert.equal(resolvePackageRoot(path.join(cliRoot, "src")), cliRoot);
});
