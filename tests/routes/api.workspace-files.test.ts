import { beforeEach, describe, expect, it, vi } from "vitest";

const limitMock = vi.fn();
const whereMock = vi.fn();
const fromMock = vi.fn();
const selectMock = vi.fn();
const returningMock = vi.fn();
const whereUpdateMock = vi.fn();
const setMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn((column: string, value: string) => ({ column, value }));

vi.mock("drizzle-orm", () => ({
  eq: eqMock,
}));

vi.mock("../../app/lib/db", () => ({
  db: {
    select: selectMock,
    update: updateMock,
  },
  workspaceFiles: {
    id: "id",
  },
}));

const { loader, action } = await import("../../app/routes/api.workspace-files.$id");

describe("api.workspace-files", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });
    setMock.mockReturnValue({ where: whereUpdateMock });
    updateMock.mockReturnValue({ set: setMock });
    whereUpdateMock.mockReturnValue({ returning: returningMock });
  });

  it("returns workspace file JSON", async () => {
    limitMock.mockResolvedValue([{ id: "file-1", path: "src/index.ts", content: "const x = 1;" }]);

    const response = await loader({
      params: { id: "file-1" },
      request: new Request("http://local/api/workspace-files/file-1"),
    } as any);

    expect(await response.json()).toEqual({ file: { id: "file-1", path: "src/index.ts", content: "const x = 1;" } });
  });

  it("updates workspace file content", async () => {
    returningMock.mockResolvedValue([{ id: "file-1", path: "src/index.ts", content: "const y = 2;" }]);

    const formData = new FormData();
    formData.append("content", "const y = 2;");

    const response = await action({
      params: { id: "file-1" },
      request: new Request("http://local/api/workspace-files/file-1", {
        method: "PATCH",
        body: formData,
      }),
    } as any);

    expect(await response.json()).toEqual({ file: { id: "file-1", path: "src/index.ts", content: "const y = 2;" } });
  });
});
