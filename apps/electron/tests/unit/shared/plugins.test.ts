import { describe, expect, it } from "vitest";
import { isHarnessMode, isPluginHarnessId } from "../../../src/shared/plugins";

describe("plugin harness identifiers", () => {
  it("accepts built-in and bounded plugin harness identifiers", () => {
    const longestPluginId = `a${"b".repeat(127)}`;
    const longestCapabilityId = `c${"d".repeat(79)}`;

    expect(isHarnessMode("assistant")).toBe(true);
    expect(isHarnessMode("rpa")).toBe(true);
    expect(isPluginHarnessId(`plugin:${longestPluginId}/${longestCapabilityId}`)).toBe(true);
  });

  it("rejects malformed and overlong plugin harness identifiers", () => {
    expect(isPluginHarnessId("plugin:khadim.opencode/opencode/extra")).toBe(false);
    expect(isPluginHarnessId(`plugin:a${"b".repeat(128)}/opencode`)).toBe(false);
    expect(isPluginHarnessId(`plugin:khadim.opencode/a${"b".repeat(80)}`)).toBe(false);
    expect(isHarnessMode({ harness: "plugin:khadim.opencode/opencode" })).toBe(false);
  });
});
