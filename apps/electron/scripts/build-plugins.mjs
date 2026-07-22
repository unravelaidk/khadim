import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plugins = [
  {
    directory: "opencode",
    artifact: "khadim_opencode_plugin.wasm",
    destination: "opencode.wasm",
  },
  {
    directory: "claude-code",
    artifact: "khadim_claude_code_plugin.wasm",
    destination: "claude-code.wasm",
  },
  {
    directory: "codex",
    artifact: "khadim_codex_plugin.wasm",
    destination: "codex.wasm",
  },
  {
    directory: "cursor",
    artifact: "khadim_cursor_plugin.wasm",
    destination: "cursor.wasm",
  },
  {
    directory: "grok",
    artifact: "khadim_grok_plugin.wasm",
    destination: "grok.wasm",
  },
];

for (const definition of plugins) {
  const plugin = resolve(root, "plugins/builtin", definition.directory);
  await new Promise((resolveBuild, rejectBuild) => {
    const child = spawn("cargo", ["build", "--target", "wasm32-unknown-unknown", "--release"], {
      cwd: plugin,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", rejectBuild);
    child.once("close", (code) => code === 0 ? resolveBuild() : rejectBuild(new Error(`Cargo exited with code ${code ?? "unknown"}.`)));
  });

  const source = resolve(plugin, "target/wasm32-unknown-unknown/release", definition.artifact);
  const destination = resolve(plugin, definition.destination);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}
