import { statSync } from "node:fs";
import { win32 } from "node:path";

export interface ClaudeLaunchCommand {
  command: string;
  prefixArgs: string[];
}

export type ExecutableFileCheck = (path: string) => boolean;

const windowsShimExtensions = new Set([".cmd", ".bat", ".ps1"]);

function existingFile(path: string): boolean {
  try { return statSync(path).isFile(); }
  catch { return false; }
}

export function resolveWindowsClaudeShim(
  resolved: string,
  fileExists: ExecutableFileCheck = existingFile,
  resolveNode: () => string,
): ClaudeLaunchCommand {
  const extension = win32.extname(resolved).toLowerCase();
  if (!windowsShimExtensions.has(extension)) return { command: resolved, prefixArgs: [] };
  const shimDirectory = win32.dirname(resolved);
  const native = win32.join(shimDirectory, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  if (fileExists(native)) return { command: native, prefixArgs: [] };
  const cli = win32.join(shimDirectory, "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  if (fileExists(cli)) return { command: resolveNode(), prefixArgs: [cli] };
  throw new Error(
    "Khadim cannot spawn the configured Windows launcher script safely. Install the current Claude Code native build, or set Binary path to claude.exe.",
  );
}
