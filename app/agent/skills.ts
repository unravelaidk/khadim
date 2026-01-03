import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function loadSkills(): Promise<string> {
    let skillsContent = "";
    try {
        const skillsDir = path.join(process.cwd(), "skills");

        try {
            await fs.access(skillsDir);
        } catch {
            return "";
        }

        const entries = await fs.readdir(skillsDir, { withFileTypes: true });
        const skillFiles = entries.filter(e => e.isFile() && e.name.endsWith(".md"));

        if (skillFiles.length > 0) {
            skillsContent = "\n\nUSER DEFINED SKILLS:\n";
            for (const file of skillFiles) {
                const content = await fs.readFile(path.join(skillsDir, file.name), "utf-8");
                skillsContent += `## ${file.name}\n${content}\n\n`;
            }
        }
    } catch (error) {
        console.warn("Failed to load skills:", error);
    }

    return skillsContent;
}
