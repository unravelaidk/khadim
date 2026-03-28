import { beforeEach, describe, expect, it, vi } from "vitest";

const orderByMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const returningMock = vi.fn();
const valuesMock = vi.fn();
const insertMock = vi.fn();
const updateWhereMock = vi.fn();
const setMock = vi.fn();
const updateMock = vi.fn();
const limitMock = vi.fn();
const whereMock = vi.fn();

const descMock = vi.fn((column: string) => ({ column, direction: "desc" }));
const eqMock = vi.fn((column: string, value: string) => ({ column, value }));

const syncExistingArtifactsToWorkspaceMock = vi.fn();

vi.mock("drizzle-orm", () => ({
  desc: descMock,
  eq: eqMock,
  asc: vi.fn((column: string) => ({ column, direction: "asc" })),
}));

vi.mock("../../app/lib/workspace-sync", () => ({
  syncExistingArtifactsToWorkspace: syncExistingArtifactsToWorkspaceMock,
}));

vi.mock("../../app/lib/db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  },
  workspaces: {
    id: "id",
    updatedAt: "updated_at",
  },
  chats: {
    id: "id",
    workspaceId: "workspace_id",
  },
  workspaceFiles: {
    workspaceId: "workspace_id",
    path: "path",
  },
}));

const { loader, action } = await import("../../app/routes/api.workspaces");

describe("api.workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue({ orderBy: orderByMock, where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });
    valuesMock.mockReturnValue({ returning: returningMock });
    insertMock.mockReturnValue({ values: valuesMock });
    setMock.mockReturnValue({ where: updateWhereMock });
    updateMock.mockReturnValue({ set: setMock });
  });

  it("lists workspaces", async () => {
    orderByMock.mockResolvedValue([{ id: "ws-1", name: "Deck Workspace" }]);

    const response = await loader({} as any);

    expect(orderByMock).toHaveBeenCalledWith({ column: "updated_at", direction: "desc" });
    expect(await response.json()).toEqual({ workspaces: [{ id: "ws-1", name: "Deck Workspace" }] });
  });

  it("creates a workspace and links a chat", async () => {
    returningMock.mockResolvedValue([{ id: "ws-2", name: "Build Workspace", agentId: "build" }]);
    updateWhereMock.mockResolvedValue(undefined);

    const formData = new FormData();
    formData.append("name", "Build Workspace");
    formData.append("agentId", "build");
    formData.append("chatId", "chat-1");

    const response = await action({
      request: new Request("http://local/api/workspaces", { method: "POST", body: formData }),
    } as any);

    expect(valuesMock).toHaveBeenCalledWith({ name: "Build Workspace", agentId: "build", sourceChatId: "chat-1" });
    expect(syncExistingArtifactsToWorkspaceMock).toHaveBeenCalledWith("chat-1", "ws-2");
    expect(await response.json()).toEqual({ workspace: { id: "ws-2", name: "Build Workspace", agentId: "build" } });
  });
});
