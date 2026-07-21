import { describe, expect, it } from "vitest";
import { canPersistCredentialsSecurely, decodeModelCredential, encodeModelCredential, hasSameCredentialScope } from "../../../src/main/credential-storage-policy";

describe("credential storage policy", () => {
  it("rejects unavailable encryption on every platform", () => {
    expect(canPersistCredentialsSecurely("darwin", false)).toBe(false);
    expect(canPersistCredentialsSecurely("win32", false)).toBe(false);
    expect(canPersistCredentialsSecurely("linux", false, "gnome_libsecret")).toBe(false);
  });

  it("rejects Electron's Linux basic_text fallback", () => {
    expect(canPersistCredentialsSecurely("linux", true, "basic_text")).toBe(false);
  });

  it("accepts OS-backed providers", () => {
    expect(canPersistCredentialsSecurely("linux", true, "gnome_libsecret")).toBe(true);
    expect(canPersistCredentialsSecurely("linux", true, "kwallet6")).toBe(true);
    expect(canPersistCredentialsSecurely("darwin", true)).toBe(true);
    expect(canPersistCredentialsSecurely("win32", true)).toBe(true);
  });
});

describe("credential scope", () => {
  const original = { provider: "openai", model: "gpt-5", baseUrl: "https://api.openai.com/v1" };

  it("keeps a credential only for the same provider, model, and endpoint", () => {
    expect(hasSameCredentialScope(original, { ...original })).toBe(true);
    expect(hasSameCredentialScope({ provider: "ollama", model: "local" }, { provider: "ollama", model: "local" })).toBe(true);
  });

  it("rejects credentials rebound through a stable model ID", () => {
    expect(hasSameCredentialScope(original, { ...original, provider: "openrouter" })).toBe(false);
    expect(hasSameCredentialScope(original, { ...original, model: "gpt-5-mini" })).toBe(false);
    expect(hasSameCredentialScope(original, { ...original, baseUrl: "https://proxy.example/v1" })).toBe(false);
    expect(hasSameCredentialScope(original, { provider: original.provider, model: original.model })).toBe(false);
  });

  it("binds a credential payload to its exact provider destination", () => {
    const payload = encodeModelCredential(original, "provider-secret");
    expect(decodeModelCredential(original, payload)).toEqual({ secret: "provider-secret", legacy: false });
    expect(decodeModelCredential({ ...original, provider: "openrouter" }, payload)).toBeUndefined();
    expect(decodeModelCredential({ ...original, model: "gpt-5-mini" }, payload)).toBeUndefined();
    expect(decodeModelCredential({ ...original, baseUrl: "https://proxy.example/v1" }, payload)).toBeUndefined();
  });

  it("keeps legacy encrypted payloads readable for migration", () => {
    expect(decodeModelCredential(original, "legacy-secret")).toEqual({ secret: "legacy-secret", legacy: true });
  });
});
