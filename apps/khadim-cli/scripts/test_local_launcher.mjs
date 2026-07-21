import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
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
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function copy(root, from, to) {
  const destination = path.join(root, to);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(path.join(cliRoot, from), destination);
}

function stageLayout(root, layout) {
  copy(root, "bin/khadim.js", "bin/khadim.js");
  copy(root, "package.json", "package.json");
  copy(root, "platform-targets.json", "platform-targets.json");
  if (layout === "source") {
    copy(root, "src/platform-targets.js", "src/platform-targets.js");
  } else if (layout === "local-build") {
    copy(root, "dist/npm-api/platform-targets.js", "dist/npm-api/platform-targets.js");
  } else {
    copy(root, "dist/npm-api/platform-targets.js", "dist/platform-targets.js");
  }

  const target = platformTarget();
  const binary = layout === "staged-package"
    ? path.join(root, "vendor", target.target, "khadim-cli", target.binary)
    : path.join(root, "target", "debug", target.binary);
  mkdirSync(path.dirname(binary), { recursive: true });
  copyFileSync(process.execPath, binary);
  chmodSync(binary, 0o755);

  const fixture = path.join(root, "fake-native.mjs");
  writeFileSync(fixture, String.raw`
import { createReadStream, fstatSync } from "node:fs";

const watchArgs = process.argv
  .map((value, index) => value === "--parent-watch-fd" ? index : -1)
  .filter((index) => index >= 0);
if (watchArgs.length !== 1) throw new Error("expected exactly one --parent-watch-fd");
const watchFd = Number(process.argv[watchArgs[0] + 1]);
if (watchFd !== 3) throw new Error("expected parent watch on fd 3");
fstatSync(watchFd);

if (process.argv.includes("--hold-for-parent-eof")) {
  const watch = createReadStream("", { fd: watchFd, autoClose: false });
  watch.resume();
  watch.once("end", () => {
    process.stdout.write("WATCH_EOF\n", () => process.exit(0));
  });
  watch.once("error", (error) => {
    console.error(error);
    process.exit(97);
  });
  process.stdout.write("READY:" + process.pid + "\n");
} else {
  process.stdout.write("WATCH_FD_OK\n");
}
`);
  return fixture;
}

function assertCommand(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 10_000,
    ...options,
  });
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"),
  );
}

function isolatedNpmEnv(root, prefix) {
  return {
    ...process.env,
    CI: "true",
    KHADIM_NO_UPDATE_CHECK: "1",
    npm_config_audit: "false",
    npm_config_cache: path.join(root, "npm-cache"),
    npm_config_fund: "false",
    npm_config_prefix: prefix,
    npm_config_update_notifier: "false",
  };
}

function assertInstalledLauncher(prefix, env, fixture) {
  const launcher = process.platform === "win32"
    ? path.join(prefix, "khadim.cmd")
    : path.join(prefix, "bin", "khadim");
  assertCommand(launcher, [fixture], {
    env,
    shell: process.platform === "win32",
  });
}

for (const layout of ["source", "local-build", "staged-package"]) {
  test(`launcher resolves the ${layout} module layout`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), `khadim-launcher-${layout}-`));
    try {
      stageLayout(root, layout);
      const fixture = path.join(root, "fake-native.mjs");
      const result = spawnSync(process.execPath, [path.join(root, "bin", "khadim.js"), fixture], {
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          CI: "true",
          KHADIM_NO_UPDATE_CHECK: "1",
        },
      });
      assert.equal(
        result.status,
        0,
        [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n"),
      );
      assert.match(result.stdout, /WATCH_FD_OK/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
}

test("local install lifecycle builds the npm API layout used by the launcher", () => {
  const packageJson = JSON.parse(readFileSync(path.join(cliRoot, "package.json"), "utf8"));
  assert.match(packageJson.scripts.build, /npm run build:npm-api/);
  assert.equal(packageJson.scripts.prepare, "npm run build:npm-api");
});

for (const install of ["link", "install-global"]) {
  test(`npm ${install === "link" ? "link" : "install -g ."} launches an isolated local build`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), `khadim-${install}-`));
    const packageRoot = path.join(root, "package");
    const prefix = path.join(root, "prefix");
    try {
      const fixture = stageLayout(packageRoot, "source");
      const manifestPath = path.join(packageRoot, "package.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      delete manifest.scripts.prepare;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const env = isolatedNpmEnv(root, prefix);
      const args = install === "link"
        ? ["link", "--workspaces=false", "--ignore-scripts", "--no-audit", "--no-fund"]
        : ["install", "-g", ".", "--workspaces=false", "--ignore-scripts", "--omit=optional", "--no-audit", "--no-fund"];
      assertCommand(npmCommand, args, { cwd: packageRoot, env });
      assertInstalledLauncher(prefix, env, fixture);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
}

test("abrupt launcher death closes fd3 so the native child exits", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "khadim-launcher-parent-watch-"));
  let launcher;
  let nativePid;
  try {
    const fixture = stageLayout(root, "source");
    launcher = spawn(
      process.execPath,
      [path.join(root, "bin", "khadim.js"), fixture, "--hold-for-parent-eof"],
      {
        env: {
          ...process.env,
          CI: "true",
          KHADIM_NO_UPDATE_CHECK: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    launcher.stdout.setEncoding("utf8");
    launcher.stderr.setEncoding("utf8");
    launcher.stdout.on("data", (chunk) => { stdout += chunk; });
    launcher.stderr.on("data", (chunk) => { stderr += chunk; });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`native child did not become ready: ${stdout}\n${stderr}`)),
        5_000,
      );
      timeout.unref?.();
      const inspect = () => {
        const match = stdout.match(/READY:(\d+)/);
        if (!match) return;
        clearTimeout(timeout);
        nativePid = Number(match[1]);
        launcher.stdout.removeListener("data", inspect);
        resolve();
      };
      launcher.stdout.on("data", inspect);
      launcher.once("error", reject);
      launcher.once("exit", (code, signal) => {
        if (!nativePid) reject(new Error(`launcher exited before native readiness (${code ?? signal}): ${stderr}`));
      });
      inspect();
    });

    const closed = once(launcher, "close");
    assert.equal(launcher.kill("SIGKILL"), true);
    await Promise.race([
      closed,
      new Promise((_, reject) => {
        const timeout = setTimeout(() => reject(new Error("launcher/native stdio did not close")), 5_000);
        timeout.unref?.();
      }),
    ]);
    assert.match(stdout, /WATCH_EOF/);
  } finally {
    if (launcher && launcher.exitCode === null && launcher.signalCode === null) launcher.kill("SIGKILL");
    if (nativePid) {
      try {
        process.kill(nativePid, "SIGKILL");
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    }
    rmSync(root, { force: true, recursive: true });
  }
});
