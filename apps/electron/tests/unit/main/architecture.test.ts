import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  }));
  return nested.flat();
}

async function importsIn(directory: string): Promise<string[]> {
  const files = await sourceFiles(directory);
  const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
  return contents.flatMap((content) => [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]));
}

describe("main-process onion architecture", () => {
  it("keeps domain modules independent of application and infrastructure", async () => {
    const imports = await importsIn(join(__dirname, "../../../src/main/domain"));
    expect(imports.filter((value) => value.includes("application") || value.includes("infrastructure") || value === "electron")).toEqual([]);
  });

  it("keeps application modules independent of infrastructure and Electron", async () => {
    const imports = await importsIn(join(__dirname, "../../../src/main/application"));
    expect(imports.filter((value) => value.includes("infrastructure") || value === "electron" || value.startsWith("discord.js"))).toEqual([]);
  });
});
