#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.dirname(scriptDir);

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`Expected --name value arguments, got: ${argv.join(" ")}`);
    }
    values.set(flag, value);
  }
  for (const required of [
    "--version",
    "--platform-tag",
    "--main-tarball",
    "--platform-tarball",
  ]) {
    if (!values.has(required)) throw new Error(`Missing required argument ${required}`);
  }
  return {
    version: values.get("--version"),
    platformTag: values.get("--platform-tag"),
    mainTarball: path.resolve(values.get("--main-tarball")),
    platformTarball: path.resolve(values.get("--platform-tarball")),
  };
}

function packagePath(nodeModules, packageName) {
  return path.join(nodeModules, ...packageName.split("/"));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
    env: {
      ...process.env,
      CI: "true",
      KHADIM_NO_UPDATE_CHECK: "1",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_offline: "true",
      npm_config_update_notifier: "false",
      ...options.env,
    },
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    [
      `${command} ${args.join(" ")} failed with status ${result.status}`,
      result.stdout,
      result.stderr,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return result.stdout.trim();
}

function loadTargets() {
  return JSON.parse(
    readFileSync(path.join(cliRoot, "platform-targets.json"), "utf8"),
  );
}

function verifyCurrentPlatform(target, platformTag) {
  assert.equal(
    `${process.platform}-${process.arch}`,
    platformTag,
    `Release smoke must run ${platformTag} on its matching native runner`,
  );
  assert.equal(target.os, process.platform);
  assert.equal(target.cpu, process.arch);
}

function npmInstall(npm, installRoot, tarball, cache) {
  mkdirSync(installRoot, { recursive: true });
  writeFileSync(
    path.join(installRoot, "package.json"),
    JSON.stringify({ name: "khadim-release-smoke", private: true, type: "module" }),
  );
  run(
    npm,
    [
      "install",
      "--ignore-scripts",
      "--omit=optional",
      "--no-package-lock",
      "--no-save",
      tarball,
    ],
    { cwd: installRoot, env: { npm_config_cache: cache } },
  );
}

function assertVersionOutput(output, version, subject) {
  assert.equal(output, `khadim-cli ${version}`, `${subject} returned an unexpected version`);
}

function smokeRelease({ version, platformTag, mainTarball, platformTarball }) {
  const targets = loadTargets();
  const target = targets[platformTag];
  assert.ok(target, `Unknown platform tag ${platformTag}`);
  verifyCurrentPlatform(target, platformTag);

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "khadim-release-smoke-"));
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  try {
    const consumerRoot = path.join(tempRoot, "consumer");
    const platformRoot = path.join(tempRoot, "platform");
    const cache = path.join(tempRoot, "npm-cache");
    npmInstall(npm, consumerRoot, mainTarball, cache);
    npmInstall(npm, platformRoot, platformTarball, cache);

    const consumerModules = path.join(consumerRoot, "node_modules");
    const mainPackageRoot = packagePath(consumerModules, "@unravelai/khadim");
    const stagedPlatformRoot = packagePath(
      path.join(platformRoot, "node_modules"),
      "@unravelai/khadim",
    );
    const aliasedPlatformRoot = packagePath(consumerModules, target.alias);
    cpSync(stagedPlatformRoot, aliasedPlatformRoot, { recursive: true });

    const mainManifest = JSON.parse(
      readFileSync(path.join(mainPackageRoot, "package.json"), "utf8"),
    );
    const platformManifest = JSON.parse(
      readFileSync(path.join(aliasedPlatformRoot, "package.json"), "utf8"),
    );
    assert.equal(mainManifest.version, version);
    assert.equal(platformManifest.version, `${version}-${platformTag}`);
    assert.deepEqual(platformManifest.os, [target.os]);
    assert.deepEqual(platformManifest.cpu, [target.cpu]);
    if (target.os === "linux") {
      assert.deepEqual(platformManifest.libc, [target.libc]);
      assert.equal(target.glibc_min, "2.35");
    }

    run(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        [
          'import * as api from "@unravelai/khadim";',
          "const required = [\"getModels\", \"getProviders\", \"resolveBinaryPath\", \"runAgent\", \"runAgentStream\"];",
          "for (const name of required) { if (typeof api[name] !== \"function\") throw new Error(`Missing API export: ${name}`); }",
        ].join("\n"),
      ],
      { cwd: consumerRoot },
    );

    const nativeBinary = path.join(
      aliasedPlatformRoot,
      "vendor",
      target.target,
      "khadim-cli",
      target.binary,
    );
    assertVersionOutput(
      run(nativeBinary, ["--version"], { cwd: consumerRoot }),
      version,
      "staged native binary",
    );

    const launcher = path.join(mainPackageRoot, "bin", "khadim.js");
    assertVersionOutput(
      run(process.execPath, [launcher, "--version"], { cwd: consumerRoot }),
      version,
      "installed npm launcher",
    );
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
}

smokeRelease(parseArgs(process.argv.slice(2)));
console.log("npm release smoke passed");
