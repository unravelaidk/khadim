import { describe, expect, it, vi } from "vitest";
import { createGmailNativeTools } from "../../../src/main/gmail-native-tools";
import { NativeToolError } from "../../../src/main/native-tool-host";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Gmail native tools", () => {
  it("searches with bounded parameters and returns untrusted message metadata", async () => {
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]): Promise<Response> => {
      const value = String(url);
      if (value.includes("/messages?")) return response({ messages: [{ id: "message-1" }] });
      return response({
        id: "message-1",
        threadId: "thread-1",
        snippet: "Pay this invoice",
        payload: { headers: [
          { name: "From", value: "Vendor <vendor@example.com>" },
          { name: "Subject", value: "Invoice" },
          { name: "Date", value: "Mon, 20 Jul 2026 10:00:00 +0000" },
        ] },
      });
    });
    const tools = createGmailNativeTools({ accessToken: async () => "access-token" }, fetcher);
    const search = tools.find((tool) => tool.definition.name === "gmail_search")!;

    const result = await search.execute({ query: "from:vendor@example.com", maxResults: 5 });
    const content = JSON.parse(result.content) as { warning: string; results: Array<{ threadId: string; subject: string }> };

    expect(content.warning).toContain("untrusted");
    expect(content.results).toEqual([expect.objectContaining({ threadId: "thread-1", subject: "Invoice" })]);
    expect(String(fetcher.mock.calls[0][0])).toContain("maxResults=5");
    expect(fetcher.mock.calls.flatMap((call) => Object.values((call[1]?.headers ?? {}) as Record<string, string>))).not.toContain("refresh-secret");
  });

  it("normalizes model-generated maxResults values instead of failing the tool call", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: Parameters<typeof fetch>[0]): Promise<Response> => {
      urls.push(String(url));
      return response({ messages: [] });
    });
    const search = createGmailNativeTools({ accessToken: async () => "access-token" }, fetcher as typeof fetch)[0];

    await search.execute({ query: "in:inbox", maxResults: "50" });
    await search.execute({ query: "in:inbox", maxResults: "many" });

    expect(urls[0]).toContain("maxResults=20");
    expect(urls[1]).toContain("maxResults=10");
  });

  it("decodes and bounds plain-text thread content", async () => {
    const text = "Hello from Gmail";
    const fetcher = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]): Promise<Response> => response({
      id: "thread-1",
      messages: [{
        id: "message-1",
        payload: {
          headers: [{ name: "From", value: "sender@example.com" }, { name: "Subject", value: "Status" }],
          mimeType: "multipart/alternative",
          parts: [{ mimeType: "text/plain", body: { data: Buffer.from(text).toString("base64url") } }],
        },
      }],
    }));
    const read = createGmailNativeTools({ accessToken: async () => "access-token" }, fetcher)
      .find((tool) => tool.definition.name === "gmail_get_thread")!;

    const result = await read.execute({ threadId: "thread-1" });
    const content = JSON.parse(result.content) as { messages: Array<{ text: string }> };

    expect(content.messages[0].text).toBe(text);
    expect(result.metadata).toMatchObject({ threadId: "thread-1", messageCount: 1, truncated: false });
  });

  it("maps expired access and provider throttling to safe tool errors", async () => {
    const locked = createGmailNativeTools({ accessToken: async () => { throw new Error("Reconnect Gmail in Apps."); } })[0];
    await expect(locked.execute({ query: "in:inbox" })).rejects.toMatchObject({ status: 403 });

    const throttled = createGmailNativeTools({ accessToken: async () => "token" }, async () => response({}, 429))[0];
    try {
      await throttled.execute({ query: "in:inbox" });
      throw new Error("Expected throttling error");
    } catch (cause) {
      expect(cause).toBeInstanceOf(NativeToolError);
      expect(cause).toMatchObject({ status: 429, message: "Gmail rate limited this request. Try again shortly." });
    }
  });

  it("rejects oversized provider responses before parsing them", async () => {
    const oversized = createGmailNativeTools(
      { accessToken: async () => "token" },
      async () => new Response("{}", { status: 200, headers: { "content-length": "9000000" } }),
    )[0];

    await expect(oversized.execute({ query: "in:inbox" })).rejects.toMatchObject({
      status: 502,
      message: "Gmail returned more data than this tool can safely process.",
    });
  });
});
