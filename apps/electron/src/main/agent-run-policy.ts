import type { AgentRun, SkillEntry } from "../shared/types";
import { safeModelBaseUrl } from "./model-endpoint-policy";

const rendererToolGroups = ["web", "files", "apps"] as const;

/** Electron owns credentials; the CLI's separate plaintext settings never do. */
export function credentialPolicyArgs(): string[] {
  return ["--ignore-saved-api-key"];
}

/**
 * The fourth inherited pipe is held open by Electron for exactly as long as it
 * owns the run. Its EOF is the sidecar's hard parent-death signal.
 */
export function processSupervisionArgs(): string[] {
  return ["--parent-watch-fd", "3"];
}

/**
 * Convert the immutable run snapshot into the CLI's explicit execution-policy
 * flags. Omitting `--tool-groups` means full legacy access in the CLI, so this
 * helper always emits either a concrete allowlist or the `none` sentinel.
 */
export function executionPolicyArgs(
  run: Pick<AgentRun, "enabledTools" | "harness" | "model" | "multiAgent">,
  options: { artifactTools?: boolean } = {},
): string[] {
  const savedGroups = new Set(run.enabledTools);
  const groups: string[] = rendererToolGroups.filter((group) => (
    savedGroups.has(group) && !(options.artifactTools && group === "files")
  ));
  if (run.harness === "rpa") groups.push("rpa");
  // Artifact paths are virtual and must never reach the project-bound file
  // tools. The loopback environment contains only artifact_read/artifact_edit.
  if (options.artifactTools && !groups.includes("apps")) groups.push("apps");

  const args = ["--tool-groups", groups.length > 0 ? groups.join(",") : "none"];
  if (run.multiAgent) args.push("--multi-agent");
  const rawTemperature = run.model.temperature?.trim();
  if (rawTemperature) {
    const temperature = Number(rawTemperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      throw new Error("The saved model temperature must be a number between 0 and 2.");
    }
    args.push("--temperature", String(temperature));
  }
  const baseUrl = run.model.baseUrl?.trim();
  if (baseUrl) {
    args.push("--base-url", safeModelBaseUrl(
      baseUrl,
      "The saved model base URL must use HTTPS unless it points to localhost/loopback.",
    ));
  }
  return args;
}

export function skillRuntimeArgs(skills: SkillEntry[]): string[] {
  const directories = new Set(skills.filter((skill) => skill.enabled).map((skill) => skill.dir.trim()).filter(Boolean));
  return Array.from(directories).flatMap((directory) => ["--skill-dir", directory]);
}
