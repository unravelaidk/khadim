// scripts/install.mjs — copy built wasm + manifest into the khadim plugins dir
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const pluginId = "ts-hello-world";
const dataDir = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
const dest = join(dataDir, "khadim", "plugins", pluginId);

mkdirSync(dest, { recursive: true });

const wasm = join("build", "release.wasm");
if (!existsSync(wasm)) {
  console.error("✗ build/release.wasm not found — run `npm run build` first");
  process.exit(1);
}

copyFileSync(wasm, join(dest, "plugin.wasm"));
copyFileSync("plugin.toml", join(dest, "plugin.toml"));

console.log(`▸ Installed to ${dest}`);
console.log("✓ Done — enable it in Settings → Plugins");
