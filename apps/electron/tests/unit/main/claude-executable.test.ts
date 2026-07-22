import { describe, expect, it, vi } from "vitest";
import { resolveWindowsClaudeShim } from "../../../src/main/plugins/claude-executable";

describe("Claude Code Windows executable resolution", () => {
  it("prefers the native package executable next to an npm launcher shim", () => {
    const native = "C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe";
    const fileExists = vi.fn((path: string) => path === native);

    expect(resolveWindowsClaudeShim(
      "C:\\Users\\dev\\AppData\\Roaming\\npm\\claude.cmd",
      fileExists,
      () => "C:\\Program Files\\nodejs\\node.exe",
    )).toEqual({ command: native, prefixArgs: [] });
  });

  it("runs the package JavaScript entry through Node when no native executable exists", () => {
    const cli = "C:\\Users\\dev\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js";
    const fileExists = vi.fn((path: string) => path === cli);

    expect(resolveWindowsClaudeShim(
      "C:\\Users\\dev\\AppData\\Roaming\\npm\\claude.cmd",
      fileExists,
      () => "C:\\Program Files\\nodejs\\node.exe",
    )).toEqual({ command: "C:\\Program Files\\nodejs\\node.exe", prefixArgs: [cli] });
  });

  it("rejects launcher scripts that Node can't spawn safely", () => {
    expect(() => resolveWindowsClaudeShim(
      "C:\\tools\\claude.ps1",
      () => false,
      () => "node.exe",
    )).toThrow("cannot spawn the configured Windows launcher script");
  });
});
