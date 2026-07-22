import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeToolMcpHostManager } from "../../../src/main/native-tool-mcp-host";
import type { NativeTool } from "../../../src/main/native-tool-host";

describe("NativeToolMcpHostManager", () => {
  const managers: NativeToolMcpHostManager[] = [];

  afterEach(async () => {
    await Promise.all(managers.splice(0).map((manager) => manager.stopAll()));
  });

  it("authenticates MCP clients, executes enabled tools, and revokes them when a run closes", async () => {
    const execute = vi.fn(async (input: Record<string, unknown>) => ({ content: `hello ${String(input.name)}` }));
    const tool: NativeTool = {
      definition: {
        name: "artifact_read",
        description: "Read the selected artifact.",
        parameters: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
          additionalProperties: false,
        },
      },
      execute,
    };
    const manager = new NativeToolMcpHostManager();
    managers.push(manager);
    const endpoint = await manager.prepare("chat-one", [tool]);
    const client = new Client({ name: "khadim-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint.url), {
      requestInit: { headers: { Authorization: `Bearer ${endpoint.token}` } },
    });
    await client.connect(transport);

    await expect(client.listTools()).resolves.toMatchObject({ tools: [{ name: "artifact_read" }] });
    await expect(client.callTool({ name: "artifact_read", arguments: { name: "site" } })).resolves.toMatchObject({
      content: [{ type: "text", text: "hello site" }],
    });
    expect(execute).toHaveBeenCalledWith({ name: "site" });

    await manager.clear("chat-one");
    await expect(client.listTools()).resolves.toEqual({ tools: [] });
    await expect(client.callTool({ name: "artifact_read", arguments: {} })).resolves.toMatchObject({ isError: true });
    await client.close();
  });

  it("rejects clients without the per-chat bearer token", async () => {
    const manager = new NativeToolMcpHostManager();
    managers.push(manager);
    const endpoint = await manager.prepare("chat-two", []);
    const client = new Client({ name: "khadim-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint.url));

    await expect(client.connect(transport)).rejects.toThrow(/401|unauthorized/i);
  });
});
