import { describe, expect, it } from "vitest";
import { encodePluginInput, encodePluginOperation } from "../../../src/main/plugins/core-abi";

const decoder = new TextDecoder();

describe("plugin core ABI serialization", () => {
  it("passes operation names as raw UTF-8 and inputs as JSON", () => {
    expect(decoder.decode(encodePluginOperation("harness.endpoint"))).toBe("harness.endpoint");
    expect(decoder.decode(encodePluginInput({ projectPath: "/workspace" }))).toBe('{"projectPath":"/workspace"}');
    expect(decoder.decode(encodePluginInput(undefined))).toBe("null");
  });
});
