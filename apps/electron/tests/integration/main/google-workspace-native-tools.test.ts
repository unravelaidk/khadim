import { describe, expect, it, vi } from "vitest";
import { createGoogleCalendarNativeTools, createGoogleDriveNativeTools } from "../../../src/main/google-workspace-native-tools";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Google Drive native tools", () => {
  it("searches Drive with a bounded encoded query and returns untrusted metadata", async () => {
    const fetcher = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]): Promise<Response> => json({
      files: [{ id: "file-1", name: "Quarterly plan", mimeType: "application/vnd.google-apps.document", capabilities: { canDownload: true } }],
    }));
    const search = createGoogleDriveNativeTools({ accessToken: async () => "access-token" }, fetcher as typeof fetch)
      .find((tool) => tool.definition.name === "google_drive_search")!;

    const result = await search.execute({ query: "customer's plan", maxResults: "80" });
    const content = JSON.parse(result.content) as { warning: string; results: Array<{ id: string; name: string }> };
    const url = new URL(String(fetcher.mock.calls[0][0]));

    expect(content.warning).toContain("untrusted");
    expect(content.results).toEqual([expect.objectContaining({ id: "file-1", name: "Quarterly plan" })]);
    expect(url.searchParams.get("pageSize")).toBe("20");
    expect(url.searchParams.get("q")).toContain("customer\\'s plan");
    expect((fetcher.mock.calls[0][1]?.headers as Record<string, string>).authorization).toBe("Bearer access-token");
  });

  it("exports Google Docs and bounds the returned text", async () => {
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = String(input);
      if (url.includes("fields=")) return json({ id: "file-1", name: "Brief", mimeType: "application/vnd.google-apps.document", capabilities: { canDownload: true } });
      return new Response("Hello from Drive", { status: 200, headers: { "content-type": "text/plain" } });
    });
    const read = createGoogleDriveNativeTools({ accessToken: async () => "access-token" }, fetcher as typeof fetch)
      .find((tool) => tool.definition.name === "google_drive_read")!;

    const result = await read.execute({ fileId: "file-1" });
    const content = JSON.parse(result.content) as { text: string; truncated: boolean };

    expect(content).toMatchObject({ text: "Hello from Drive", truncated: false });
    expect(String(fetcher.mock.calls[1][0])).toContain("/export?mimeType=text%2Fplain");
  });

  it("rejects unsupported binary files before downloading them", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => json({ id: "image-1", name: "Photo", mimeType: "image/png", capabilities: { canDownload: true } }));
    const read = createGoogleDriveNativeTools({ accessToken: async () => "access-token" }, fetcher as typeof fetch)
      .find((tool) => tool.definition.name === "google_drive_read")!;

    await expect(read.execute({ fileId: "image-1" })).rejects.toMatchObject({ status: 400 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Google Calendar native tools", () => {
  it("lists calendars and upcoming events with explicit time bounds", async () => {
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      const url = String(input);
      if (url.includes("calendarList")) return json({ items: [{ id: "primary@example.com", summary: "Work", primary: true }] });
      return json({ items: [{ id: "event-1", summary: "Planning", start: { dateTime: "2026-07-22T09:00:00Z" }, end: { dateTime: "2026-07-22T10:00:00Z" } }] });
    });
    const tools = createGoogleCalendarNativeTools({ accessToken: async () => "access-token" }, fetcher as typeof fetch);

    const calendars = await tools.find((tool) => tool.definition.name === "google_calendar_list_calendars")!.execute({});
    const events = await tools.find((tool) => tool.definition.name === "google_calendar_list_events")!.execute({
      calendarId: "primary@example.com",
      timeMin: "2026-07-22",
      timeMax: "2026-07-23",
      query: "planning",
      maxResults: 5,
    });
    const eventUrl = new URL(String(fetcher.mock.calls[1][0]));

    expect(JSON.parse(calendars.content)).toMatchObject({ calendars: [expect.objectContaining({ summary: "Work" })] });
    expect(JSON.parse(events.content)).toMatchObject({ warning: expect.stringContaining("untrusted"), events: [expect.objectContaining({ summary: "Planning" })] });
    expect(eventUrl.pathname).toContain("/calendars/primary%40example.com/events");
    expect(eventUrl.searchParams.get("timeMin")).toBe("2026-07-22T00:00:00.000Z");
    expect(eventUrl.searchParams.get("timeMax")).toBe("2026-07-23T00:00:00.000Z");
    expect(eventUrl.searchParams.get("q")).toBe("planning");
  });

  it("maps missing grants to a reconnectable permission error", async () => {
    const eventTool = createGoogleCalendarNativeTools({ accessToken: async () => "access-token" }, async () => json({}, 403))
      .find((tool) => tool.definition.name === "google_calendar_list_events")!;

    await expect(eventTool.execute({})).rejects.toMatchObject({
      status: 403,
      message: "Google Calendar access is unavailable. Update Google Workspace access in Apps.",
    });
  });
});
