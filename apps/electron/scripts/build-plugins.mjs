import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = resolve(root, "plugins/builtin/opencode");

await new Promise((resolveBuild, rejectBuild) => {
  const child = spawn("cargo", ["build", "--target", "wasm32-unknown-unknown", "--release"], {
    cwd: plugin,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.once("error", rejectBuild);
  child.once("close", (code) => code === 0 ? resolveBuild() : rejectBuild(new Error(`Cargo exited with code ${code ?? "unknown"}.`)));
});

const source = resolve(plugin, "target/wasm32-unknown-unknown/release/khadim_opencode_plugin.wasm");
const destination = resolve(plugin, "dist/opencode.wasm");
await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
