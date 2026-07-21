import { afterEach, describe, expect, it } from "vitest";
import {
  createNativeToolHost,
  NativeToolError,
  type NativeTool,
  type NativeToolHost,
} from "../../../src/main/native-tool-host";

function tool(
  name: string,
  execute: NativeTool["execute"] = async (input) => ({ content: JSON.stringify(input) }),
): NativeTool {
  return {
    definition: {
      name,
      description: `Execute ${name}`,
      parameters: { type: "object", additionalProperties: false },
    },
    execute,
  };
}

describe("native tool host", () => {
  let host: NativeToolHost | null = null;

  afterEach(async () => {
    await host?.close();
    host = null;
  });

  it("exports and dispatches a composed set of tools", async () => {
    host = await createNativeToolHost([
      tool("gmail_search", async (input) => ({ content: `searched:${input.query}` })),
      tool("calendar_list", async () => ({ content: "listed" })),
    ]);
    const definitions = JSON.parse(host.env.KHADIM_NATIVE_TOOLS) as Array<{ name: string }>;
    const response = await fetch(`${host.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/gmail_search`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${host.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ input: { query: "invoice" } }),
    });

    expect(definitions.map(({ name }) => name)).toEqual(["gmail_search", "calendar_list"]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ content: "searched:invoice" });
  });

  it("rejects duplicate and path-unsafe tool names before binding", async () => {
    await expect(createNativeToolHost([tool("gmail_search"), tool("gmail_search")]))
      .rejects.toThrow("Duplicate native tool name");
    await expect(createNativeToolHost([tool("gmail/search")]))
      .rejects.toThrow("must match");
  });

  it("enforces authentication, routing, JSON, and request size boundaries", async () => {
    host = await createNativeToolHost([tool("gmail_search")], { maxRequestBytes: 32 });
    const url = host.env.KHADIM_NATIVE_TOOL_RPC_URL;
    const headers = { authorization: `Bearer ${host.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };

    const unauthorized = await fetch(`${url}/tool/gmail_search`, { method: "POST", body: "{}" });
    const missing = await fetch(`${url}/tool/not_registered`, { method: "POST", headers, body: "{}" });
    const malformed = await fetch(`${url}/tool/gmail_search`, { method: "POST", headers, body: "{" });
    const oversized = await fetch(`${url}/tool/gmail_search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { value: "x".repeat(40) } }),
    });

    expect(unauthorized.status).toBe(401);
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ content: "Native tool request must be valid JSON." });
    expect(oversized.status).toBe(413);
  });

  it("preserves typed failures and hides unexpected internal errors", async () => {
    host = await createNativeToolHost([
      tool("reauthorize", async () => { throw new NativeToolError(403, "Reconnect Gmail."); }),
      tool("provider_failure", async () => { throw new Error("secret provider response"); }),
    ]);
    const headers = { authorization: `Bearer ${host.env.KHADIM_NATIVE_TOOL_RPC_TOKEN}` };
    const invoke = (name: string) => fetch(`${host?.env.KHADIM_NATIVE_TOOL_RPC_URL}/tool/${name}`, {
      method: "POST",
      headers,
      body: "{}",
    });

    const expected = await invoke("reauthorize");
    const unexpected = await invoke("provider_failure");

    expect(expected.status).toBe(403);
    await expect(expected.json()).resolves.toEqual({ content: "Reconnect Gmail." });
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({ content: "Native tool failed." });
  });

  it("closes idempotently", async () => {
    host = await createNativeToolHost([tool("gmail_search")]);
    await Promise.all([host.close(), host.close()]);
  });
});
