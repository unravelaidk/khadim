import { describe, expect, it, vi } from "vitest";
import { createResourceCommandActions, createShellCommandActions, filterCommandActions } from "../../../app/components/CommandPalette";

describe("command palette", () => {
  it("exposes real shell destinations", () => {
    const handlers = {
      newChat: vi.fn(),
      showChats: vi.fn(),
      showProjects: vi.fn(),
      showSettings: vi.fn(),
    };
    const actions = createShellCommandActions(handlers);

    expect(actions.map((action) => action.id)).toEqual([
      "new-chat",
      "show-chats",
      "show-projects",
      "show-settings",
    ]);

    actions[2].run();
    expect(handlers.showProjects).toHaveBeenCalledOnce();
  });

  it("opens chats and projects returned by the web repositories", () => {
    const openChat = vi.fn();
    const openProject = vi.fn();
    const actions = createResourceCommandActions({
      chats: [{ id: "chat-1", title: "Quarterly plan" }],
      projects: [{ id: "project-1", title: "Finance automation" }],
      openChat,
      openProject,
    });

    expect(filterCommandActions(actions, "quarterly").map((action) => action.id)).toEqual(["chat:chat-1"]);
    expect(filterCommandActions(actions, "finance").map((action) => action.id)).toEqual(["project:project-1"]);
    actions[0].run();
    actions[1].run();
    expect(openChat).toHaveBeenCalledWith("chat-1");
    expect(openProject).toHaveBeenCalledWith("project-1");
  });

  it("matches labels, descriptions, and aliases case-insensitively", () => {
    const actions = createShellCommandActions({
      newChat: vi.fn(),
      showChats: vi.fn(),
      showProjects: vi.fn(),
      showSettings: vi.fn(),
    });

    expect(filterCommandActions(actions, "WORKSPACE").map((action) => action.id)).toEqual(["show-chats", "show-projects"]);
    expect(filterCommandActions(actions, "provider").map((action) => action.id)).toEqual(["show-settings"]);
    expect(filterCommandActions(actions, "missing")).toEqual([]);
  });
});
