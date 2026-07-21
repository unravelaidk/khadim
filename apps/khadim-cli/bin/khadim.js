#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
async function loadPlatformTargets() {
  const candidates = [
    "../dist/platform-targets.js", // staged/published package
    "../dist/npm-api/platform-targets.js", // local npm API build
    "../src/platform-targets.js", // npm link from a fresh checkout
  ];
  for (const candidate of candidates) {
    const candidateUrl = new URL(candidate, import.meta.url);
    if (!existsSync(fileURLToPath(candidateUrl))) continue;
    return import(candidateUrl.href);
  }
  throw new Error(
    `Khadim launcher support module was not built. Run \`npm run build:npm-api\` in ${path.dirname(fileURLToPath(import.meta.url))}.`,
  );
}

const { assertRuntimeCompatibility, platformTarget } = await loadPlatformTargets();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

function detectPackageManager() {
  const userAgent = process.env.npm_config_user_agent || "";
  if (/\bbun\//.test(userAgent)) return "bun";
  const execPath = process.env.npm_execpath || "";
  if (execPath.includes("bun")) return "bun";
  if (__dirname.includes(".bun/install/global") || __dirname.includes(".bun\\install\\global")) return "bun";
  return userAgent ? "npm" : null;
}

function reinstallHint() {
  return detectPackageManager() === "bun"
    ? "bun install -g @unravelai/khadim@latest"
    : "npm install -g @unravelai/khadim@latest";
}

const currentTarget = assertRuntimeCompatibility(platformTarget());
const targetTriple = currentTarget.target;
const platformPackage = currentTarget.alias;
const rootPackageJson = require(path.join(__dirname, "..", "package.json"));
const packageName = rootPackageJson.name ?? "@unravelai/khadim";
const currentVersion = rootPackageJson.version ?? "0.0.0";
const binaryName = currentTarget.binary;
const packageRoot = path.join(__dirname, "..");
const localVendorRoot = path.join(packageRoot, "vendor");
const localBinaryPath = path.join(localVendorRoot, targetTriple, "khadim-cli", binaryName);
const localBinaryCandidates = [
  localBinaryPath,
  path.join(packageRoot, "target", "debug", binaryName),
  path.join(packageRoot, "target", "release", binaryName),
  path.join(packageRoot, "dist", "bin", binaryName),
];

let binaryPath = localBinaryCandidates.find((candidate) => existsSync(candidate));
if (!binaryPath) {
  try {
    const packageJsonPath = require.resolve(`${platformPackage}/package.json`);
    const vendorRoot = path.join(path.dirname(packageJsonPath), "vendor");
    const installedBinaryPath = path.join(vendorRoot, targetTriple, "khadim-cli", binaryName);
    if (existsSync(installedBinaryPath)) binaryPath = installedBinaryPath;
  } catch {
    // The actionable error below covers both an absent and an incomplete
    // platform package while still allowing npm link/install -g from source.
  }
}

if (!binaryPath) {
  throw new Error(
    `Missing optional dependency ${platformPackage} and no local Khadim build was found. Run npm run build or reinstall Khadim: ${reinstallHint()}`,
  );
}

function compareSemver(a, b) {
  const parse = (version) => String(version).split("-")[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function commandExists(command) {
  const checker = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(checker, args, { stdio: "ignore", shell: process.platform !== "win32" });
  return result.status === 0;
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const update = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
    update.on("error", (error) => resolve({ ok: false, error }));
    update.on("exit", (code) => resolve({ ok: code === 0, code }));
  });
}

async function npmViewLatestVersion() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName).replace("%40", "@")}/latest`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const metadata = await response.json();
    return typeof metadata.version === "string" ? metadata.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function askToUpdate(latestVersion) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Khadim ${latestVersion} is available (current ${currentVersion}). Update now? [Y/n] `);
    return !/^(n|no)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function maybeAutoUpdate() {
  if (process.env.KHADIM_NO_UPDATE_CHECK === "1" || process.env.KHADIM_SKIP_RESTART_UPDATE === "1" || process.env.CI === "true") return;
  const latestVersion = await npmViewLatestVersion();
  if (!latestVersion || compareSemver(latestVersion, currentVersion) <= 0) return;
  if (!(await askToUpdate(latestVersion))) {
    console.error(`Skipping update. To update later, run: ${reinstallHint()}`);
    return;
  }

  const manager = detectPackageManager() === "bun" ? "bun" : "npm";
  const command = manager === "bun" && commandExists("bun") ? "bun" : "npm";
  const args = command === "bun"
    ? ["install", "-g", `${packageName}@latest`]
    : ["install", "-g", `${packageName}@latest`];
  console.error(`Updating Khadim with: ${command} ${args.join(" ")}`);
  const result = await runCommand(command, args);
  if (!result.ok) {
    const reason = result.error ? result.error.message : `exit code ${result.code}`;
    console.error(`Khadim update failed (${reason}). Continuing with ${currentVersion}.`);
    return;
  }
  console.error("Khadim updated successfully. Restarting with the updated CLI...");
  const restarted = spawn(process.execPath, [process.argv[1], ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, KHADIM_SKIP_RESTART_UPDATE: "1" },
  });
  restarted.on("error", (error) => {
    console.error(`Failed to restart Khadim: ${error.message}`);
    process.exit(1);
  });
  const code = await new Promise((resolve) => restarted.on("exit", (exitCode) => resolve(exitCode ?? 1)));
  process.exit(code);
}

await maybeAutoUpdate();

const env = { ...process.env };
env[detectPackageManager() === "bun" ? "KHADIM_MANAGED_BY_BUN" : "KHADIM_MANAGED_BY_NPM"] = "1";

const PARENT_WATCH_FD = 3;
const child = spawn(binaryPath, [...process.argv.slice(2), "--parent-watch-fd", String(PARENT_WATCH_FD)], {
  stdio: ["inherit", "inherit", "inherit", "pipe"],
  env,
});
const parentWatch = child.stdio[PARENT_WATCH_FD];

let childSettled = false;
const childResultPromise = new Promise((resolve) => {
  child.once("error", (error) => {
    if (childSettled) return;
    childSettled = true;
    resolve({ type: "error", error });
  });
  child.once("exit", (code, signal) => {
    if (childSettled) return;
    childSettled = true;
    if (signal) resolve({ type: "signal", signal });
    else resolve({ type: "code", exitCode: code ?? 1 });
  });
});

function closeParentWatch() {
  if (parentWatch && !parentWatch.destroyed) parentWatch.destroy();
}

async function settlesWithin(promise, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function stopManagedChild(signal) {
  closeParentWatch();
  if (await settlesWithin(childResultPromise, 1_000)) return;
  try {
    child.kill(signal);
  } catch {
    // The child may have exited between the watcher deadline and fallback.
  }
  if (await settlesWithin(childResultPromise, 3_000)) return;
  try {
    child.kill("SIGKILL");
  } catch {
    // The child may have exited between the deadline and escalation.
  }
}

let requestedSignal;
let shutdownPromise;
const signalHandlers = new Map();
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  const handler = () => {
    requestedSignal ??= signal;
    shutdownPromise ??= stopManagedChild(signal);
    void shutdownPromise.catch((error) => console.error(`Failed to stop Khadim: ${error.message}`));
  };
  signalHandlers.set(signal, handler);
  process.on(signal, handler);
}

const childResult = await childResultPromise;
closeParentWatch();
for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);

if (childResult.type === "error") {
  console.error(childResult.error);
  process.exit(1);
} else if (requestedSignal || childResult.type === "signal") {
  process.kill(process.pid, requestedSignal ?? childResult.signal);
} else {
  process.exit(childResult.exitCode);
}
