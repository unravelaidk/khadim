import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { SkillEntry } from "../../shared/types";
import type { DocumentRepository, SkillRepository } from "../domain/repositories";

function friendlyName(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function metadata(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const match = content.trim().match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return result;
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && value) result[key] = value;
  }
  return result;
}

function description(content: string): string {
  const body = content.trim().replace(/^---\s*\n[\s\S]*?\n---/, "");
  return body.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("#"))?.slice(0, 200) ?? "";
}

export class FilesystemSkillRepository implements SkillRepository {
  constructor(
    private readonly directories: () => string[],
    private readonly enabledState: DocumentRepository<Record<string, boolean>>,
  ) {}

  async discover(): Promise<SkillEntry[]> {
    const enabled = await this.enabledState.read();
    const skills = new Map<string, SkillEntry>();
    for (const sourceDir of this.directories()) {
      const entries = await readdir(sourceDir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = join(sourceDir, entry.name);
        const content = await readFile(join(dir, "SKILL.md"), "utf8").catch(() => null);
        if (!content) continue;
        const fields = metadata(content);
        const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
        skills.set(entry.name, {
          id: entry.name,
          name: fields.name ?? heading ?? friendlyName(entry.name),
          description: fields.description ?? description(content),
          dir,
          sourceDir,
          enabled: enabled[entry.name] !== false,
          author: fields.author,
          version: fields.version,
        });
      }
    }
    return [...skills.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  async setEnabled(skillId: string, enabled: boolean): Promise<void> {
    if (typeof skillId !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/.test(skillId)) throw new Error("Invalid skill ID");
    if (typeof enabled !== "boolean") throw new Error("Invalid skill state");
    const state = await this.enabledState.read();
    await this.enabledState.write({ ...state, [skillId]: enabled });
  }

  flush(): Promise<void> {
    return this.enabledState.flush();
  }
}
