import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = {
  create: vi.fn(),
  connect: vi.fn(),
};

const withSandboxProviderFallbackMock = vi.fn(
  async <T>(action: (sandboxProvider: typeof provider) => Promise<T>) => action(provider)
);

const chats = {
  id: "chats.id",
  workspaceId: "chats.workspaceId",
};

const workspaceFiles = {
  workspaceId: "workspace_files.workspaceId",
};

const artifacts = {
  chatId: "artifacts.chatId",
};

const projects = {
  chatId: "projects.chatId",
};

const selectMock = vi.fn();

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column: string, value: string) => ({ column, value })),
}));

vi.mock("../../app/agent/sandbox", () => ({
  getSandboxProvider: vi.fn(() => provider),
  withSandboxProviderFallback: withSandboxProviderFallbackMock,
}));

vi.mock("../../app/lib/db", () => ({
  db: {
    select: selectMock,
  },
  chats,
  workspaceFiles,
  artifacts,
  projects,
}));

const { action } = await import("../../app/routes/api.sandbox.connect");

describe("api.sandbox.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SANDBOX_SERVER_BOOT_WAIT_MS = "0";

    const sandbox = {
      id: "vm-1",
      writeFile: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
      spawn: vi.fn().mockResolvedValue({ pid: 123 }),
      exposeHttp: vi.fn().mockResolvedValue("https://preview.test"),
    };

    provider.create.mockResolvedValue(sandbox);
    provider.connect.mockResolvedValue(sandbox);

    selectMock.mockImplementation(() => ({
      from(table: unknown) {
        if (table === chats) {
          return {
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([{ id: "chat-1", workspaceId: null }]),
            })),
          };
        }

        if (table === workspaceFiles) {
          return {
            where: vi.fn().mockResolvedValue([]),
          };
        }

        if (table === artifacts) {
          return {
            where: vi.fn().mockResolvedValue([
              {
                filename: "demo-app/src/main.ts",
                content: "console.log('hello')",
              },
            ]),
          };
        }

        if (table === projects) {
          return {
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  projectType: "vite",
                  projectName: "demo-app",
                  devCommand: "npm run dev",
                  devPort: 4173,
                },
              ]),
            })),
          };
        }

        throw new Error(`Unexpected table: ${String(table)}`);
      },
    }));
  });

  it("returns an exposed preview url for restored app sessions", async () => {
    const formData = new FormData();
    formData.append("chatId", "chat-1");

    const response = await action({
      request: new Request("http://local/api/sandbox/connect", {
        method: "POST",
        body: formData,
      }),
    } as any);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        success: true,
        sandboxId: "vm-1",
        previewUrl: "https://preview.test",
        restorationStatus: "dev_server",
      })
    );

    const sandbox = await provider.create.mock.results[0]?.value;
    expect(sandbox.exec).toHaveBeenCalledWith("mkdir -p demo-app/src");
    expect(sandbox.writeFile).toHaveBeenCalledWith("demo-app/src/main.ts", "console.log('hello')");
    expect(sandbox.spawn).toHaveBeenCalledWith(["sh", "-c", "cd demo-app && npm run dev"]);
    expect(sandbox.exposeHttp).toHaveBeenCalledWith({ port: 4173 });
  });
});
