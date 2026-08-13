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
 * Plugin harnesses own their native Agent/Task/collaboration tools, so they do
 * not pass through Khadim's Rust coordinator. Team mode gives the primary the
 * same bounded delegation guidance while leaving the decision to delegate to
 * the selected harness.
 */
export function pluginTeamInstructions(enabled: boolean | undefined): string {
  if (!enabled) return "";
  return [
    "Team mode is enabled. You remain the primary agent responsible for the final result.",
    "Use this harness's native subagent or delegation tools only for focused work that is genuinely independent and benefits from a separate context.",
    "When two or more helper tasks are independent, launch them together. Do not delegate trivial, sequential, or duplicate work.",
    "Give each helper a concrete objective and incorporate its findings before responding.",
  ].join(" ");
}

/**
 * Convert the immutable run snapshot into the CLI's execution-policy flags.
 * Every native run emits the same concrete tool and temperature policy. Team
 * mode adds read-only helpers without changing the primary agent's authority.
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
