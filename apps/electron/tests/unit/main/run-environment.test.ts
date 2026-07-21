import { describe, expect, it } from "vitest";
import { buildRunEnvironment } from "../../../src/main/run-environment";

describe("run environment", () => {
  it("pairs a stored key only with the configured endpoint", () => {
    const env = buildRunEnvironment({
      PATH: "/bin",
      OPENAI_API_KEY: "old-openai",
      ANTHROPIC_API_KEY: "other-provider",
      OPENAI_BASE_URL: "https://hostile.example/v1",
      KHADIM_BASE_URL: "https://also-hostile.example/v1",
    }, "openai", "stored-openai");

    expect(env).toMatchObject({ PATH: "/bin", OPENAI_API_KEY: "stored-openai", KHADIM_RUN_API_KEY: "stored-openai" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_BASE_URL).toBeUndefined();
    expect(env.KHADIM_BASE_URL).toBeUndefined();
  });

  it("restores only selected-provider inherited authentication when no stored key exists", () => {
    const env = buildRunEnvironment({
      OPENAI_API_KEY: "selected",
      KHADIM_API_KEY: "selected-fallback",
      ANTHROPIC_OAUTH_TOKEN: "unrelated",
    }, "openai");

    expect(env.OPENAI_API_KEY).toBe("selected");
    expect(env.KHADIM_API_KEY).toBe("selected-fallback");
    expect(env.ANTHROPIC_OAUTH_TOKEN).toBeUndefined();
    expect(env.KHADIM_RUN_API_KEY).toBeUndefined();
  });

  it("restores a validated configured endpoint after scrubbing inherited overrides", () => {
    const env = buildRunEnvironment({
      OPENAI_BASE_URL: "https://hostile.example/v1",
      KHADIM_BASE_URL: "https://also-hostile.example/v1",
    }, "openai", "key", "https://approved.example/v1");

    expect(env.OPENAI_BASE_URL).toBe("https://approved.example/v1");
    expect(env.KHADIM_BASE_URL).toBeUndefined();
  });

  it("never rebinds an ambient official-provider key to a custom endpoint", () => {
    const env = buildRunEnvironment({
      OPENAI_API_KEY: "official-only",
      KHADIM_API_KEY: "official-fallback",
    }, "openai", undefined, "https://custom.example/v1");

    expect(env.OPENAI_BASE_URL).toBe("https://custom.example/v1");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.KHADIM_API_KEY).toBeUndefined();
    expect(env.KHADIM_RUN_API_KEY).toBeUndefined();
  });

  it("keeps selected ambient cloud credentials while removing other providers", () => {
    const env = buildRunEnvironment({
      AWS_PROFILE: "work",
      AWS_SECRET_ACCESS_KEY: "bedrock-secret",
      OPENAI_API_KEY: "unrelated",
    }, "amazon-bedrock");

    expect(env.AWS_PROFILE).toBe("work");
    expect(env.AWS_SECRET_ACCESS_KEY).toBe("bedrock-secret");
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("does not expose unrelated launcher secrets to agent tools", () => {
    const env = buildRunEnvironment({
      PATH: "/usr/bin",
      HOME: "/home/user",
      TMPDIR: "/tmp",
      SystemRoot: "C:\\Windows",
      NPM_TOKEN: "npm-secret",
      DATABASE_URL: "postgres://secret",
      SENTRY_AUTH_TOKEN: "sentry-secret",
      SSH_AUTH_SOCK: "/tmp/ssh-agent",
    }, "openai");

    expect(env).toMatchObject({ PATH: "/usr/bin", HOME: "/home/user", TMPDIR: "/tmp", SystemRoot: "C:\\Windows" });
    expect(env.NPM_TOKEN).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.SENTRY_AUTH_TOKEN).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
  });
});
