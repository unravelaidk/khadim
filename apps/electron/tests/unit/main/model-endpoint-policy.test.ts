import { describe, expect, it } from "vitest";
import { safeModelBaseUrl } from "../../../src/main/model-endpoint-policy";

describe("model endpoint policy", () => {
  it("requires TLS for remote model endpoints", () => {
    expect(() => safeModelBaseUrl("http://models.example/v1", "unsafe")).toThrow("unsafe");
    expect(safeModelBaseUrl("https://models.example/v1", "unsafe")).toBe("https://models.example/v1");
  });

  it("allows cleartext only on loopback development endpoints", () => {
    expect(safeModelBaseUrl("http://localhost:11434/v1", "unsafe")).toBe("http://localhost:11434/v1");
    expect(safeModelBaseUrl("http://127.0.0.1:11434/v1", "unsafe")).toBe("http://127.0.0.1:11434/v1");
    expect(safeModelBaseUrl("http://[::1]:11434/v1", "unsafe")).toBe("http://[::1]:11434/v1");
  });
});
