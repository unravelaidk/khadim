import { constants, accessSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, extname, join } from "node:path";

export interface ResolveExecutableOptions {
  fallback: string;
  searchDirectories?: ReadonlyArray<string>;
}

function executable(path: string): boolean {
  try {
    accessSync(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandExtensions(command: string): string[] {
  if (process.platform !== "win32" || extname(command)) return [""];
  return (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").map((value) => value.toLowerCase());
}

export function resolveExecutable(configured: string | undefined, options: ResolveExecutableOptions): string {
  const value = configured?.trim() || options.fallback;
  const expanded = value.startsWith("~/") || value.startsWith("~\\") ? join(homedir(), value.slice(2)) : value;
  if (expanded.includes("/") || expanded.includes("\\")) return expanded;
  const extensions = commandExtensions(expanded);
  const directories = [
    ...(process.env.PATH ?? "").split(delimiter),
    ...(options.searchDirectories ?? []),
    join(homedir(), ".local", "bin"),
    join(homedir(), ".bun", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  for (const directory of directories) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `${expanded}${extension}`);
      if (existsSync(candidate) && executable(candidate)) return candidate;
    }
  }
  return expanded;
}
