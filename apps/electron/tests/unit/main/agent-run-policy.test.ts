import { describe, expect, it } from "vitest";
import type { AgentRun } from "../../../src/shared/types";
import { credentialPolicyArgs, executionPolicyArgs, processSupervisionArgs, skillRuntimeArgs } from "../../../src/main/agent-run-policy";

function run(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    projectId: "project-1",
    conversationId: "conversation-1",
    userMessageId: "user-1",
    assistantMessageId: "assistant-1",
    status: "running",
    createdAt: "2026-07-13T00:00:00.000Z",
    agent: { id: "everyday", name: "Everyday", systemPrompt: "Help carefully." },
    model: { id: "model-1", name: "Model", provider: "anthropic", model: "model-id", temperature: "0.2" },
    harness: "assistant",
    enabledTools: ["web", "files"],
    ...overrides,
  };
}

describe("executionPolicyArgs", () => {
  it("keeps Electron runs isolated from plaintext CLI-saved credentials", () => {
    expect(credentialPolicyArgs()).toEqual(["--ignore-saved-api-key"]);
  });

  it("passes the inherited parent-watch descriptor used by managed runs", () => {
    expect(processSupervisionArgs()).toEqual(["--parent-watch-fd", "3"]);
  });

  it("passes the saved assistant tool allowlist without implicit computer tools", () => {
    expect(executionPolicyArgs(run())).toEqual([
      "--tool-groups", "web,files",
      "--temperature", "0.2",
    ]);
  });

  it("enables only the native app bridge when a run has selected-artifact tools", () => {
    expect(executionPolicyArgs(run(), { artifactTools: true })).toEqual([
      "--tool-groups", "web,apps",
      "--temperature", "0.2",
    ]);
  });

  it("passes connected apps once when explicitly enabled with artifact tools", () => {
    expect(executionPolicyArgs(run({ enabledTools: ["apps"] }), { artifactTools: true })).toEqual([
      "--tool-groups", "apps",
      "--temperature", "0.2",
    ]);
  });

  it("adds computer tools only for an RPA run and removes unknown or duplicate groups", () => {
    expect(executionPolicyArgs(run({
      harness: "rpa",
      enabledTools: ["files", "files", "legacy-connector"],
      model: { ...run().model, temperature: "1" },
    }))).toEqual([
      "--tool-groups", "files,rpa",
      "--temperature", "1",
    ]);
  });

  it("uses the explicit none sentinel when every optional tool is disabled", () => {
    expect(executionPolicyArgs(run({ enabledTools: [], model: { ...run().model, temperature: undefined } })))
      .toEqual(["--tool-groups", "none"]);
  });

  it("rejects a corrupt persisted temperature instead of silently changing execution", () => {
    expect(() => executionPolicyArgs(run({ model: { ...run().model, temperature: "2.1" } })))
      .toThrow("temperature");
  });

  it("passes a validated custom provider endpoint from the immutable run", () => {
    expect(executionPolicyArgs(run({
      model: { ...run().model, baseUrl: "https://models.example.test/v1" },
    }))).toEqual([
      "--tool-groups", "web,files",
      "--temperature", "0.2",
      "--base-url", "https://models.example.test/v1",
    ]);
  });

  it("rejects unsafe or malformed custom provider endpoints", () => {
    for (const baseUrl of [
      "file:///tmp/model",
      "http://models.example.test/v1",
      "https://models.example.test/v1?key=secret",
      "https://models.example.test/v1#responses",
      "https://api-key@models.example.test/v1",
    ]) {
      expect(() => executionPolicyArgs(run({ model: { ...run().model, baseUrl } })))
        .toThrow("base URL");
    }
  });
});

describe("skillRuntimeArgs", () => {
  it("passes each enabled skill directory once and omits disabled skills", () => {
    expect(skillRuntimeArgs([
      { id: "one", name: "One", description: "", dir: "/skills/one", sourceDir: "/skills", enabled: true },
      { id: "one-copy", name: "One copy", description: "", dir: "/skills/one", sourceDir: "/skills", enabled: true },
      { id: "two", name: "Two", description: "", dir: "/skills/two", sourceDir: "/skills", enabled: false },
    ])).toEqual(["--skill-dir", "/skills/one"]);
  });
});
