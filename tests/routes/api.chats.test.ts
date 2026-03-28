import { beforeEach, describe, expect, it, vi } from "vitest";

const orderByMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const returningMock = vi.fn();
const valuesMock = vi.fn();
const insertMock = vi.fn();
const deleteWhereMock = vi.fn();
const deleteMock = vi.fn();
const descMock = vi.fn((column: string) => ({ column, direction: "desc" }));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column: string, value: string) => ({ column, value })),
  desc: descMock,
}));

vi.mock("../../app/lib/db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
    delete: deleteMock,
  },
  chats: {
    id: "id",
    updatedAt: "updated_at",
  },
}));

const { loader, action } = await import("../../app/routes/api.chats");

describe("api.chats", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    fromMock.mockReturnValue({ orderBy: orderByMock });
    selectMock.mockReturnValue({ from: fromMock });

    valuesMock.mockReturnValue({ returning: returningMock });
    insertMock.mockReturnValue({ values: valuesMock });

    deleteWhereMock.mockResolvedValue(undefined);
    deleteMock.mockReturnValue({ where: deleteWhereMock });
  });

  it("lists all chats", async () => {
    orderByMock.mockResolvedValue([{ id: "chat-1", title: "First" }]);

    const response = await loader({
      request: new Request("http://local/api/chats"),
    } as any);

    expect(orderByMock).toHaveBeenCalledWith({ column: "updated_at", direction: "desc" });
    expect(await response.json()).toEqual({ chats: [{ id: "chat-1", title: "First" }] });
  });

  it("creates chats without agent ownership", async () => {
    returningMock.mockResolvedValue([{ id: "chat-3", title: "New Chat" }]);

    const formData = new FormData();
    formData.append("title", "New Chat");

    const response = await action({
      request: new Request("http://local/api/chats", {
        method: "POST",
        body: formData,
      }),
    } as any);

    expect(valuesMock).toHaveBeenCalledWith({ title: "New Chat", workspaceId: null });
    expect(await response.json()).toEqual({ chat: { id: "chat-3", title: "New Chat" } });
  });
});
