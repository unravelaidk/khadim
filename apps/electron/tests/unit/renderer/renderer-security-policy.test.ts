import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const rendererEntryUrl = new URL("../../../src/renderer/index.html", import.meta.url);

describe("renderer content security policy", () => {
  it("allows HTTPS images used by chat markdown without opening remote scripts or connections", async () => {
    const html = await readFile(rendererEntryUrl, "utf8");
    const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1];

    expect(policy).toContain("img-src 'self' data: blob: https:");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("connect-src 'self'");
  });
});
