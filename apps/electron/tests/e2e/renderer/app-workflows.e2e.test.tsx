import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEventEnvelope, AgentRunRecoverySnapshot, AgentRunRequest, AppSettings, ArtifactDraft, Conversation, KhadimDesktopApi, Project } from "../../../src/shared/types";
import App from "../../../src/renderer/src/App";

const projectA: Project = {
  id: "project-a",
  name: "Quarterly planning",
  rootPath: "/tmp/quarterly-planning",
  createdAt: "2026-07-13T08:00:00.000Z",
  updatedAt: "2026-07-13T08:00:00.000Z",
  lastOpenedAt: "2026-07-13T08:00:00.000Z",
};

const projectB: Project = {
  id: "project-b",
  name: "Customer support",
  rootPath: "/tmp/customer-support",
  createdAt: "2026-07-13T09:00:00.000Z",
  updatedAt: "2026-07-13T09:00:00.000Z",
  lastOpenedAt: "2026-07-13T09:00:00.000Z",
};

function createDesktopApi() {
  const chats = new Map<string, Conversation[]>([[projectA.id, []], [projectB.id, []]]);
  const artifacts = new Map<string, ArtifactDraft[]>([[projectA.id, []], [projectB.id, []]]);
  let activeProject = projectA;
  let listener: ((envelope: AgentEventEnvelope) => void) | null = null;
  const settings: AppSettings = {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    models: [{
      id: "model-1",
      name: "Claude Sonnet",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      isDefault: true,
      isActive: true,
      hasApiKey: true,
    }],
    activeProjectId: projectA.id,
    workspace: projectA.rootPath,
    harness: "assistant",
    theme: "light",
    hasApiKey: true,
  };

  const start = vi.fn(async (request: AgentRunRequest) => ({ runId: request.runId }));
  const api: KhadimDesktopApi = {
    agent: {
      start,
      abort: vi.fn(async () => undefined),
      recover: vi.fn(async () => []),
      acknowledge: vi.fn(async () => undefined),
      onEvent: (nextListener) => {
        listener = nextListener;
        return () => { listener = null; };
      },
    },
    projects: {
      list: vi.fn(async () => [projectA, projectB]),
      add: vi.fn(async () => projectB),
      open: vi.fn(async (projectId) => {
        activeProject = projectId === projectA.id ? projectA : projectB;
        settings.activeProjectId = activeProject.id;
        settings.workspace = activeProject.rootPath;
        return { ...activeProject, lastOpenedAt: new Date().toISOString() };
      }),
      checkAvailability: vi.fn(async (projectId) => ({ project: projectId === projectA.id ? projectA : projectB, available: true as const })),
      rename: vi.fn(async (projectId, name) => ({ ...(projectId === projectA.id ? projectA : projectB), name })),
      relocate: vi.fn(async (projectId, rootPath) => ({ ...(projectId === projectA.id ? projectA : projectB), rootPath })),
      remove: vi.fn(async (projectId) => ({ removedProjectId: projectId, activeProject: projectId === projectA.id ? projectB : projectA })),
      chooseDirectory: vi.fn(async () => null),
    },
    conversations: {
      list: vi.fn(async (projectId) => structuredClone(chats.get(projectId) ?? [])),
      save: vi.fn(async (conversation) => {
        const current = chats.get(conversation.projectId) ?? [];
        chats.set(conversation.projectId, [structuredClone(conversation), ...current.filter((item) => item.id !== conversation.id)]);
      }),
      remove: vi.fn(async (projectId, id) => {
        chats.set(projectId, (chats.get(projectId) ?? []).filter((conversation) => conversation.id !== id));
      }),
    },
    artifacts: {
      list: vi.fn(async (projectId) => structuredClone(artifacts.get(projectId) ?? [])),
      save: vi.fn(async (projectId, drafts) => { artifacts.set(projectId, structuredClone(drafts)); }),
      exportPdf: vi.fn(async () => ({ canceled: false, filePath: "/tmp/artifact.pdf" })),
      preview: vi.fn(async () => ({ url: "about:blank?revision=1" })),
      stopPreview: vi.fn(async () => undefined),
    },
    settings: {
      get: vi.fn(async () => structuredClone(settings)),
      save: vi.fn(async (update) => {
        activeProject = update.workspace === projectB.rootPath ? projectB : projectA;
        Object.assign(settings, update, {
          activeProjectId: activeProject.id,
          workspace: activeProject.rootPath,
          models: update.models.map((model) => ({ ...model, hasApiKey: true })),
          hasApiKey: true,
        });
        return structuredClone(settings);
      }),
      chooseWorkspace: vi.fn(async () => null),
    },
    models: { catalog: vi.fn(async () => [{ id: "anthropic", name: "Anthropic", models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }] }]), syncCodex: vi.fn(async () => structuredClone(settings)) },
    auth: {
      codexConnected: vi.fn(async () => false),
      startCodexLogin: vi.fn(async () => ({ authUrl: "https://auth.openai.com/oauth/authorize" })),
      codexLoginStatus: vi.fn(async () => ({ status: "pending" as const })),
    },
    search: {
      get: vi.fn(async () => ({ activeProvider: "duckduckgo" as const, providers: [{ id: "duckduckgo" as const, name: "DuckDuckGo", description: "No-key search", configured: true, credentialStatus: "not-required" as const, requiresApiKey: false }] })),
      save: vi.fn(async (update) => ({ activeProvider: update.activeProvider, providers: [{ id: "duckduckgo" as const, name: "DuckDuckGo", description: "No-key search", configured: true, credentialStatus: "not-required" as const, requiresApiKey: false }] })),
    },
    google: {
      get: vi.fn(async () => ({ configured: false, connected: false, credentialStatus: "missing" as const, scopes: [] })),
      connect: vi.fn(async () => ({ configured: false, connected: false, credentialStatus: "missing" as const, scopes: [] })),
      disconnect: vi.fn(async () => ({ configured: false, connected: false, credentialStatus: "missing" as const, scopes: [] })),
    },
    discord: {
      get: vi.fn(async () => ({ configured: false, connected: false, enabled: false, guildId: "", projectId: projectA.id, harness: "assistant" as const, allowAllGuildUsers: false, allowedUserIds: [], allowedRoleIds: [], allowedChannelIds: [], ignoredChannelIds: [], freeResponseChannelIds: [], noThreadChannelIds: [], requireMention: true, threadRequireMention: false, autoThread: true })),
      save: vi.fn(async (update) => ({ configured: true, connected: true, botName: "Khadim", ...update })),
      disconnect: vi.fn(async () => ({ configured: true, connected: false, enabled: false, guildId: "", projectId: projectA.id, harness: "assistant" as const, allowAllGuildUsers: false, allowedUserIds: [], allowedRoleIds: [], allowedChannelIds: [], ignoredChannelIds: [], freeResponseChannelIds: [], noThreadChannelIds: [], requireMention: true, threadRequireMention: false, autoThread: true })),
      onStatus: vi.fn(() => () => undefined),
    },
    skills: {
      discover: vi.fn(async () => []),
      toggle: vi.fn(async () => undefined),
    },
    shell: { openExternal: vi.fn(async () => undefined) },
  };

  return {
    api,
    chats,
    artifacts,
    start,
    emit(envelope: AgentEventEnvelope) {
      if (!listener) throw new Error("Agent event listener is not attached");
      listener(envelope);
    },
  };
}

describe("project chat workflow", () => {
  afterEach(cleanup);

  beforeEach(() => {
    localStorage.clear();
  });

  it("uses the top navigation as predictable places rather than creation shortcuts", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByRole("textbox", { name: "Message Khadim" });
    await user.type(composer, "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Khadim home" }));
    expect(await screen.findByRole("heading", { name: "Quarterly planning" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.getByRole("textbox", { name: "Message Khadim" })).toHaveValue("Keep this draft");

    await user.click(screen.getByRole("button", { name: "Studio" }));
    expect(await screen.findByRole("heading", { name: "Artifacts" })).toBeInTheDocument();
    expect(desktop.artifacts.get(projectA.id)).toEqual([]);
    expect(screen.getByRole("button", { name: "Studio" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Chat" })).toHaveAttribute("aria-pressed", "false");
  });

  it("settles a failed agent launch without leaving an unhandled rejection", async () => {
    const desktop = createDesktopApi();
    desktop.start.mockRejectedValueOnce(new Error("The agent process could not start."));
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole("textbox", { name: "Message Khadim" }), "Edit this{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("The agent process could not start.");
  });

  it("creates document, website, and canvas artifacts in one persistent Studio workspace", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Studio" }));
    await user.click(await screen.findByRole("button", { name: "Document" }));

    expect(screen.getByRole("textbox", { name: "Artifact title" })).toHaveValue("Untitled document");
    expect(screen.getByTitle("Untitled document editable page")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Write" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(desktop.artifacts.get(projectA.id)?.[0]).toMatchObject({
      schemaVersion: 2,
      kind: "document",
      content: { format: "document-html", html: expect.stringContaining("same HTML drives") },
    }));
    await user.click(screen.getByRole("tab", { name: "Source" }));
    expect(screen.getByRole("complementary", { name: "Project files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /document\.html/ })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByRole("toolbar", { name: "Preview size" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export PDF" }));
    await waitFor(() => expect(desktop.api.artifacts.exportPdf).toHaveBeenCalledWith(projectA.id, expect.any(String)));

    await user.click(screen.getByRole("button", { name: "Back to artifacts" }));
    await user.click(screen.getByRole("button", { name: "Create artifact" }));
    await user.click(screen.getByRole("menuitem", { name: /Website/ }));
    expect(desktop.artifacts.get(projectA.id)?.[0]).toMatchObject({
      kind: "site",
      content: { format: "web-project", framework: "react-router", entryFile: "/src/router.jsx" },
    });
    expect(screen.getByRole("toolbar", { name: "Preview size" })).toBeInTheDocument();
    await waitFor(() => expect(desktop.api.artifacts.preview).toHaveBeenCalledWith(expect.objectContaining({
      projectId: projectA.id,
      framework: "react-router",
      entryFile: "/src/router.jsx",
      files: expect.objectContaining({ "/package.json": expect.any(String), "/src/router.jsx": expect.any(String), "/src/styles.css": expect.any(String) }),
    })));
    expect(await screen.findByTitle("Untitled website preview")).toHaveAttribute("src", "about:blank?revision=1");
    await user.click(screen.getByRole("tab", { name: "Design" }));
    expect(await screen.findByText("Click text to edit · drag blocks to arrange")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Code" }));
    expect(screen.getByText("Edit website files directly")).toBeInTheDocument();
    expect(screen.queryByText(/React Router|Puck|Vite|Bun included/)).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Project files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /router\.jsx/ })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByText("Preview updates as you work")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Preview size" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mobile 390 × 844" }));
    expect(screen.getByText("Mobile · 390 × 844")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to artifacts" }));
    await waitFor(() => expect(desktop.api.artifacts.stopPreview).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Create artifact" }));
    await user.click(screen.getByRole("menuitem", { name: /Canvas/ }));
    expect(screen.getByRole("img", { name: "Canvas artwork" })).toBeInTheDocument();
    expect(desktop.artifacts.get(projectA.id)?.[0]).toMatchObject({ kind: "canvas", content: { format: "excalidraw" } });
  });

  it("keeps Studio beside chat and applies an agent edit through the normal run snapshot", async () => {
    const desktop = createDesktopApi();
    vi.mocked(desktop.api.artifacts.preview!).mockResolvedValueOnce({ url: "about:blank?revision=1" }).mockRejectedValue(new Error("src/StudioPage.jsx: Unexpected token"));
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Studio" }));
    await user.click(await screen.findByRole("button", { name: "Website" }));

    expect(screen.getByRole("region", { name: "Main chat beside Untitled website" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message Khadim" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Choose agent, currently Everyday/ })).toBeInTheDocument();
    expect(screen.queryByText("Build alongside the preview")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message Studio agent" })).not.toBeInTheDocument();
    expect(await screen.findByTitle("Untitled website preview")).toHaveAttribute("src", "about:blank?revision=1");
    const paneSeparator = screen.getByRole("separator", { name: "Resize Studio conversation pane" });
    expect(paneSeparator).toHaveAttribute("aria-valuenow", "520");
    paneSeparator.focus();
    await user.keyboard("{ArrowRight}");
    expect(paneSeparator).toHaveAttribute("aria-valuenow", "536");
    await user.dblClick(paneSeparator);
    expect(paneSeparator).toHaveAttribute("aria-valuenow", "520");

    const mainComposer = screen.getByRole("textbox", { name: "Message Khadim" });
    await user.type(mainComposer, "Make the headline shorter{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));

    const request = desktop.start.mock.calls[0][0];
    expect(request).toMatchObject({
      projectId: projectA.id,
      artifactId: expect.any(String),
      enabledTools: ["web", "files"],
    });
    expect(request.prompt).toContain("Make the headline shorter");
    expect(request.prompt).toContain("artifact_read");
    expect(request.prompt).toContain("artifact_edit");
    expect(desktop.chats.get(projectA.id)?.[0]?.runs?.[0]).toMatchObject({
      artifactId: request.artifactId,
      agent: expect.objectContaining({ id: "everyday", name: "Everyday" }),
      model: expect.objectContaining({ provider: "anthropic", model: "claude-sonnet-4-5" }),
      harness: "assistant",
    });

    act(() => desktop.emit({
      runId: request.runId,
      sequence: 1,
      event: { event_type: "step_start", content: "Inspecting the selected artifact", metadata: { id: "read-studio", tool: "artifact_read", artifactId: request.artifactId } },
    }));
    expect(await screen.findByText(/artifact_read|selected artifact/i)).toBeInTheDocument();
    act(() => desktop.emit({ runId: request.runId, sequence: 2, event: { event_type: "step_complete", content: "Artifact inspected", metadata: { id: "read-studio", title: "Read selected artifact", tool: "artifact_read", artifactId: request.artifactId, result: "Found starter-heading" } } }));
    act(() => desktop.emit({
      runId: request.runId,
      sequence: 3,
      event: {
        event_type: "step_complete",
        content: "Updated the selected artifact.",
        metadata: {
          id: "edit-studio",
          title: "Updated Untitled website",
          tool: "artifact_edit",
          artifactId: request.artifactId,
          artifactTitle: "Untitled website",
          artifactEdit: { componentPatches: [{ id: "starter-heading", props: { text: "A shorter headline" } }] },
          changeCount: 1,
          result: "Updated the selected artifact.",
        },
      },
    }));
    act(() => desktop.emit({ runId: request.runId, sequence: 4, event: { event_type: "text_delta", content: "Updated the headline." } }));

    await waitFor(() => {
      const artifact = desktop.artifacts.get(projectA.id)?.[0];
      if (artifact?.content.format !== "web-project") throw new Error("Expected web project");
      expect(artifact.content.visual?.data.content).toHaveLength(2);
      expect(artifact.content.previewHtml).toContain("A shorter headline");
      expect(artifact.content.previewHtml).toContain("Created in Khadim Studio");
    });
    expect(screen.getByText("Updated Untitled website")).toBeInTheDocument();
    expect(screen.getByText("1 change")).toBeInTheDocument();
    expect(screen.getByText("Updated the headline.")).toBeInTheDocument();
    expect(desktop.chats.get(projectA.id)?.[0]?.runs?.[0]).toMatchObject({ status: "running" });

    act(() => desktop.emit({ runId: request.runId, sequence: 5, event: { event_type: "done" } }));

    await waitFor(() => expect(desktop.chats.get(projectA.id)?.[0]?.runs?.[0]).toMatchObject({ status: "complete" }));
    expect(screen.getByText("Updated the headline.")).toBeInTheDocument();
    expect(screen.queryByText(/componentPatches/)).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("Latest changes couldn’t be shown");
    expect(screen.getByTitle("Untitled website preview")).toHaveAttribute("src", "about:blank?revision=1");
    await user.click(screen.getByRole("button", { name: "Open source" }));
    expect(screen.getByRole("tab", { name: "Code" })).toHaveAttribute("aria-selected", "true");
  });

  it("searches global destinations from the command palette with the keyboard", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    const commandSearch = await screen.findByRole("combobox", { name: "Search or run a command" });
    await user.click(commandSearch);
    expect(screen.getByRole("listbox", { name: "Commands" })).toBeInTheDocument();
    await user.type(commandSearch, "Customer support");
    expect(screen.getByRole("option", { name: /Customer support/ })).toBeInTheDocument();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(desktop.api.projects.open).toHaveBeenCalledWith(projectB.id));
    expect(await screen.findByRole("button", { name: "Customer support Current project" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("listbox", { name: "Commands" })).not.toBeInTheDocument();
  });

  it("previews chats under an inactive project before switching project context", async () => {
    const desktop = createDesktopApi();
    const savedAt = "2026-07-13T09:30:00.000Z";
    desktop.chats.set(projectB.id, [{
      id: "chat-refund",
      projectId: projectB.id,
      engineSessionKey: "electron.v1.refund",
      title: "Handle refund request",
      createdAt: savedAt,
      updatedAt: savedAt,
      messages: [
        { id: "user-refund", role: "user", content: "Review the refund request", createdAt: savedAt, status: "complete" },
        { id: "assistant-refund", role: "assistant", content: "The request is ready for review.", createdAt: savedAt, status: "complete" },
      ],
    }]);
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Expand Customer support" }));
    await waitFor(() => expect(desktop.api.conversations.list).toHaveBeenCalledWith(projectB.id));
    expect(desktop.api.projects.open).not.toHaveBeenCalledWith(projectB.id);

    await user.click(await screen.findByRole("button", { name: "Handle refund request" }));
    await waitFor(() => expect(desktop.api.projects.open).toHaveBeenCalledWith(projectB.id));
    expect(await screen.findByText("The request is ready for review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Handle refund request" })).toHaveAttribute("aria-current", "page");
  });

  it("handles slash commands locally instead of sending them to the agent", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByRole("textbox", { name: "Message Khadim" });
    await user.type(composer, "/model{Enter}");

    expect((await screen.findAllByText(/Claude Sonnet/)).length).toBeGreaterThan(0);
    expect(desktop.start).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "/new{Enter}");
    expect(await screen.findByText("Where should we begin?")).toBeInTheDocument();
    expect(desktop.start).not.toHaveBeenCalled();
  });

  it("creates an agent and applies its behavior and connectors to a run", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Agents/ }));
    await user.click(screen.getByRole("button", { name: "New agent" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Customer follow-up");
    await user.type(screen.getByRole("textbox", { name: "Behavior" }), "Write concise customer replies and ask before sending.");
    await user.click(screen.getByRole("button", { name: /Project files/ }));
    await user.click(screen.getByRole("button", { name: "Create agent" }));

    expect(screen.getByRole("heading", { name: "Customer follow-up" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start a new chat with Customer follow-up" }));
    await user.type(await screen.findByRole("textbox", { name: "Message Khadim" }), "Reply to Alex{Enter}");

    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    expect(desktop.start.mock.calls[0][0]).toMatchObject({
      prompt: "Reply to Alex",
      systemPrompt: "Write concise customer replies and ask before sending.",
      enabledTools: ["web"],
    });
    expect(JSON.parse(localStorage.getItem("khadim.agents.v1") ?? "[]")).toEqual([
      expect.objectContaining({ name: "Customer follow-up", type: "agent", connectors: ["web"] }),
    ]);
  });

  it("keeps a running chat and its generated artifact bound to the originating project", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByRole("textbox", { name: "Message Khadim" });
    await user.type(composer, "Build quarterly brief{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const firstRun = desktop.start.mock.calls[0][0];
    expect(firstRun).toMatchObject({ projectId: projectA.id, prompt: "Build quarterly brief" });
    expect(firstRun.conversationId).toBeTruthy();
    expect(firstRun.engineSessionKey).toMatch(/^electron\.v1\./);
    expect(desktop.chats.get(projectA.id)?.[0]?.runs).toEqual([
      expect.objectContaining({
        id: firstRun.runId,
        projectId: projectA.id,
        conversationId: firstRun.conversationId,
        status: "running",
        agent: expect.objectContaining({ id: "everyday", name: "Everyday" }),
        model: expect.objectContaining({ provider: "anthropic", model: "claude-sonnet-4-5" }),
        harness: "assistant",
        enabledTools: ["web", "files"],
      }),
    ]);

    act(() => desktop.emit({
      runId: firstRun.runId,
      sequence: 1,
      event: { event_type: "text_delta", content: "```html\n<!doctype html><html><head><title>Quarterly brief</title></head><body><h1>Quarterly brief</h1></body></html>\n```" },
    }));

    await user.click(await screen.findByRole("button", { name: /Customer support Local project/ }));
    await screen.findByRole("heading", { name: "Customer support" });

    act(() => desktop.emit({ runId: firstRun.runId, sequence: 2, event: { event_type: "done" } }));
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.[0]?.messages.at(-1)?.status).toBe("complete"));
    expect(desktop.chats.get(projectA.id)?.[0]?.runs?.[0]).toEqual(expect.objectContaining({ status: "complete", completedAt: expect.any(String) }));
    expect(desktop.chats.get(projectB.id)).toEqual([]);

    await user.click(screen.getByRole("button", { name: /Quarterly planning Local project/ }));
    await user.click((await screen.findAllByRole("button", { name: "Build quarterly brief" }))[0]);
    expect(await screen.findByRole("button", { name: /Open artifact Quarterly brief/ })).toBeInTheDocument();
    expect(screen.queryByText(/<!doctype html>/i)).not.toBeInTheDocument();
    expect(document.querySelector(".md-code-block")).not.toBeInTheDocument();

    const followUp = screen.getByRole("textbox", { name: "Message Khadim" });
    await user.type(followUp, "Add the risks{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(2));
    const secondRun = desktop.start.mock.calls[1][0];
    expect(secondRun).toMatchObject({
      projectId: projectA.id,
      conversationId: firstRun.conversationId,
      engineSessionKey: firstRun.engineSessionKey,
      prompt: "Add the risks",
    });

    act(() => desktop.emit({ runId: secondRun.runId, sequence: 1, event: { event_type: "done" } }));
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.[0]?.messages.at(-1)?.status).toBe("complete"));
    await user.click(screen.getByRole("button", { name: "Delete Build quarterly brief" }));
    expect(desktop.chats.get(projectA.id)).toHaveLength(1);
    await user.click(await screen.findByRole("button", { name: "Confirm delete Build quarterly brief" }));
    await user.click(screen.getByRole("button", { name: /Artifacts/ }));
    expect(await screen.findByText("Quarterly brief")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /From “Build quarterly brief”/ })).not.toBeInTheDocument();
  });

  it("switches the visible project when Settings saves a different project folder", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    vi.mocked(desktop.api.settings.chooseWorkspace).mockResolvedValueOnce(projectB.rootPath);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Where should we begin?");
    await user.click((await screen.findAllByRole("button", { name: "Settings" }))[0]);
    await user.click(await screen.findByRole("button", { name: "Project" }));
    await user.click(screen.getByRole("button", { name: "Choose project folder" }));
    expect(screen.getByDisplayValue(projectB.rootPath)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(desktop.api.conversations.list).toHaveBeenCalledWith(projectB.id));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Customer support Current project/ })).toBeInTheDocument();
  });

  it("disables a project whose folder disappeared and lets the user locate it", async () => {
    const desktop = createDesktopApi();
    vi.mocked(desktop.api.projects.checkAvailability).mockImplementation(async (projectId) => projectId === projectB.id
      ? { project: projectB, available: false as const, reason: "missing" as const }
      : { project: projectA, available: true as const });
    vi.mocked(desktop.api.projects.chooseDirectory).mockResolvedValueOnce("/tmp/customer-support-restored");
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("button", { name: /Customer support Folder unavailable/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Locate Customer support" }));

    await waitFor(() => expect(desktop.api.projects.relocate).toHaveBeenCalledWith(projectB.id, "/tmp/customer-support-restored"));
    expect(screen.getByRole("button", { name: /Customer support Local project/ })).toBeEnabled();
  });

  it("replays buffered run events once and acknowledges them only after saving the chat", async () => {
    const desktop = createDesktopApi();
    const savedAt = "2026-07-13T10:00:00.000Z";
    desktop.chats.set(projectA.id, [{
      id: "chat-recovered",
      projectId: projectA.id,
      engineSessionKey: "electron.v1.recovered",
      title: "Recovered chat",
      createdAt: savedAt,
      updatedAt: savedAt,
      messages: [
        { id: "user-recovered", role: "user", content: "Continue", createdAt: savedAt, status: "complete" },
        { id: "assistant-recovered", role: "assistant", content: "Hello", createdAt: savedAt, status: "streaming", runId: "run-recovered" },
      ],
      runs: [{
        id: "run-recovered",
        projectId: projectA.id,
        conversationId: "chat-recovered",
        userMessageId: "user-recovered",
        assistantMessageId: "assistant-recovered",
        status: "running",
        createdAt: savedAt,
        lastEventSequence: 1,
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help with everyday work." },
        model: { id: "model-1", name: "Claude Sonnet", provider: "anthropic", model: "claude-sonnet-4-5" },
        harness: "assistant",
        enabledTools: ["web", "files"],
      }],
    }]);
    vi.mocked(desktop.api.agent.recover).mockResolvedValueOnce([{
      runId: "run-recovered",
      projectId: projectA.id,
      conversationId: "chat-recovered",
      assistantMessageId: "assistant-recovered",
      engineSessionKey: "electron.v1.recovered",
      events: [
        { sequence: 2, event: { event_type: "text_delta", content: " world" } },
        { sequence: 3, event: { event_type: "done" } },
      ],
      terminal: true,
      droppedEventCount: 0,
      nextSequence: 4,
    }]);
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(desktop.api.agent.acknowledge).toHaveBeenCalledWith("run-recovered"));
    expect(desktop.chats.get(projectA.id)?.[0]?.messages.at(-1)).toEqual(expect.objectContaining({ content: "Hello world", status: "complete" }));
    expect(desktop.chats.get(projectA.id)?.[0]?.runs?.[0]).toEqual(expect.objectContaining({ status: "complete", lastEventSequence: 3 }));

    await user.click(await screen.findByRole("button", { name: "Recovered chat" }));
    expect(await screen.findByText("Hello world")).toBeInTheDocument();
    expect(screen.queryByText(/interrupted when Khadim closed/i)).not.toBeInTheDocument();
  });

  it("repairs and saves a terminal run whose assistant message was left streaming before acknowledging replay", async () => {
    const desktop = createDesktopApi();
    const savedAt = "2026-07-13T10:00:00.000Z";
    desktop.chats.set(projectA.id, [{
      id: "chat-partial-terminal",
      projectId: projectA.id,
      engineSessionKey: "electron.v1.partial-terminal",
      title: "Partially saved terminal chat",
      createdAt: savedAt,
      updatedAt: savedAt,
      messages: [
        { id: "user-partial", role: "user", content: "Continue", createdAt: savedAt, status: "complete" },
        { id: "assistant-partial", role: "assistant", content: "Finished", createdAt: savedAt, status: "streaming", runId: "run-partial" },
      ],
      runs: [{
        id: "run-partial",
        projectId: projectA.id,
        conversationId: "chat-partial-terminal",
        userMessageId: "user-partial",
        assistantMessageId: "assistant-partial",
        status: "complete",
        createdAt: savedAt,
        completedAt: savedAt,
        lastEventSequence: 2,
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
        model: { id: "model-1", name: "Claude Sonnet", provider: "anthropic", model: "claude-sonnet-4-5" },
        harness: "assistant",
        enabledTools: ["web", "files"],
      }],
    }]);
    vi.mocked(desktop.api.agent.recover).mockResolvedValueOnce([{
      runId: "run-partial",
      projectId: projectA.id,
      conversationId: "chat-partial-terminal",
      assistantMessageId: "assistant-partial",
      engineSessionKey: "electron.v1.partial-terminal",
      events: [{ sequence: 2, event: { event_type: "done" } }],
      terminal: true,
      droppedEventCount: 0,
      nextSequence: 3,
    }]);
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    render(<App />);

    await waitFor(() => expect(desktop.api.agent.acknowledge).toHaveBeenCalledWith("run-partial"));
    expect(desktop.chats.get(projectA.id)?.[0]?.messages.at(-1)?.status).toBe("complete");
    expect(desktop.api.conversations.save).toHaveBeenCalledWith(expect.objectContaining({ id: "chat-partial-terminal" }));
  });

  it("deduplicates a live event that races with the recovery snapshot", async () => {
    const desktop = createDesktopApi();
    const savedAt = "2026-07-13T10:00:00.000Z";
    desktop.chats.set(projectA.id, [{
      id: "chat-race",
      projectId: projectA.id,
      engineSessionKey: "electron.v1.race",
      title: "Recovery race",
      createdAt: savedAt,
      updatedAt: savedAt,
      messages: [
        { id: "user-race", role: "user", content: "Continue", createdAt: savedAt, status: "complete" },
        { id: "assistant-race", role: "assistant", content: "", createdAt: savedAt, status: "streaming", runId: "run-race" },
      ],
      runs: [{
        id: "run-race",
        projectId: projectA.id,
        conversationId: "chat-race",
        userMessageId: "user-race",
        assistantMessageId: "assistant-race",
        status: "running",
        createdAt: savedAt,
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
        model: { id: "model-1", name: "Claude Sonnet", provider: "anthropic", model: "claude-sonnet-4-5" },
        harness: "assistant",
        enabledTools: ["web", "files"],
      }],
    }]);
    let resolveRecovery!: (snapshots: Awaited<ReturnType<KhadimDesktopApi["agent"]["recover"]>>) => void;
    vi.mocked(desktop.api.agent.recover).mockReturnValueOnce(new Promise((resolve) => { resolveRecovery = resolve; }));
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    render(<App />);

    act(() => desktop.emit({ runId: "run-race", sequence: 1, event: { event_type: "text_delta", content: "Hello" } }));
    await act(async () => resolveRecovery([{
      runId: "run-race",
      projectId: projectA.id,
      conversationId: "chat-race",
      assistantMessageId: "assistant-race",
      engineSessionKey: "electron.v1.race",
      events: [{ sequence: 1, event: { event_type: "text_delta", content: "Hello" } }],
      terminal: false,
      droppedEventCount: 0,
      nextSequence: 2,
    }]));

    await waitFor(() => expect(desktop.chats.get(projectA.id)?.[0]?.messages.at(-1)?.content).toBe("Hello"));
    act(() => desktop.emit({ runId: "run-race", sequence: 2, event: { event_type: "done" } }));
    await waitFor(() => expect(desktop.api.agent.acknowledge).toHaveBeenCalledWith("run-race"));
    expect(desktop.chats.get(projectA.id)?.[0]?.messages.at(-1)?.content).toBe("Hello");
  });

  it("keeps a deleted generated artifact out of the library after its source chat is reloaded", async () => {
    const desktop = createDesktopApi();
    const createdAt = "2026-07-13T10:00:00.000Z";
    desktop.chats.set(projectA.id, [{
      id: "chat-report",
      projectId: projectA.id,
      engineSessionKey: "electron.v1.report",
      title: "Create a report",
      createdAt,
      updatedAt: createdAt,
      messages: [
        { id: "user-report", role: "user", content: "Create a report", createdAt, status: "complete" },
        {
          id: "assistant-report",
          role: "assistant",
          content: "```html\n<html><head><title>Annual report</title></head><body><h1>Annual report</h1></body></html>\n```",
          createdAt,
          status: "complete",
          runId: "run-report",
        },
      ],
    }]);
    desktop.artifacts.set(projectA.id, [{
      id: "artifact-assistant-report",
      projectId: projectA.id,
      title: "Annual report",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "ready",
      content: {
        format: "html",
        html: "<html><head><title>Annual report</title></head><body><h1>Annual report</h1></body></html>",
        baselineHtml: "<html><head><title>Annual report</title></head><body><h1>Annual report</h1></body></html>",
      },
      provenance: {
        origin: "agent",
        runId: "run-report",
        messageId: "assistant-report",
        conversationId: "chat-report",
        conversationTitle: "Create a report",
      },
      createdAt,
      updatedAt: createdAt,
    }]);
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    const firstRender = render(<App />);

    await user.click(await screen.findByRole("button", { name: /Artifacts/ }));
    expect(await screen.findByRole("button", { name: "Open source chat Create a report" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Annual report" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete Annual report" }));

    await waitFor(() => expect(desktop.artifacts.get(projectA.id)).toEqual([
      expect.objectContaining({
        id: "artifact-assistant-report",
        content: { format: "html", html: "", baselineHtml: "" },
        deletedAt: expect.any(String),
        provenance: expect.objectContaining({ messageId: "assistant-report" }),
      }),
    ]));
    expect(screen.queryByText("Annual report")).not.toBeInTheDocument();

    firstRender.unmount();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Create a report" }));
    expect(screen.queryByRole("button", { name: "Open artifact Annual report" })).not.toBeInTheDocument();
    expect(screen.getByText("Removed from Artifacts")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Artifacts/ }));
    expect(screen.queryByText("Annual report")).not.toBeInTheDocument();
    expect(screen.getByText("Make something you can keep working on.")).toBeInTheDocument();
  });

  it("links featured, recent, and earlier artifacts to source chats that still exist", async () => {
    const desktop = createDesktopApi();
    const sourceChats: Conversation[] = Array.from({ length: 5 }, (_, index) => {
      const number = index + 1;
      const createdAt = `2026-07-13T0${number}:00:00.000Z`;
      return {
        id: `chat-${number}`,
        projectId: projectA.id,
        engineSessionKey: `electron.v1.chat-${number}`,
        title: `Source chat ${number}`,
        createdAt,
        updatedAt: createdAt,
        messages: [],
      };
    });
    desktop.chats.set(projectA.id, sourceChats);
    desktop.artifacts.set(projectA.id, sourceChats.map((conversation, index) => ({
      id: `artifact-${index + 1}`,
      projectId: projectA.id,
      title: `Artifact ${index + 1}`,
      schemaVersion: 2 as const,
      kind: "site" as const,
      lifecycle: "ready" as const,
      content: {
        format: "html" as const,
        html: `<html><title>Artifact ${index + 1}</title></html>`,
        baselineHtml: `<html><title>Artifact ${index + 1}</title></html>`,
      },
      provenance: {
        origin: "agent" as const,
        messageId: `assistant-${index + 1}`,
        conversationId: conversation.id,
        conversationTitle: conversation.title,
      },
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    })));
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Artifacts/ }));
    for (const conversation of sourceChats) {
      expect(await screen.findByRole("button", { name: `Open source chat ${conversation.title}` })).toBeInTheDocument();
    }
  });

  it("records an aborted process event as a stopped run", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByRole("textbox", { name: "Message Khadim" });
    await user.type(composer, "Start a long task{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const run = desktop.start.mock.calls[0][0];
    act(() => desktop.emit({
      runId: run.runId,
      sequence: 1,
      event: { event_type: "error", content: "Run stopped.", metadata: { reason: "aborted" } },
    }));

    await waitFor(() => expect(desktop.chats.get(projectA.id)?.[0]?.runs?.[0]?.status).toBe("stopped"));
    expect(desktop.chats.get(projectA.id)?.[0]?.messages.at(-1)).toEqual(expect.objectContaining({ content: "Run stopped.", status: "error" }));
    expect(desktop.api.agent.acknowledge).toHaveBeenCalledWith(run.runId);
    expect(screen.getByText("Run stopped", { selector: ".error-label" })).toBeInTheDocument();
  });

  it("offers a quiet recovery path without announcing every streamed token", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByRole("textbox", { name: "Message Khadim" });
    await user.type(composer, "Prepare the report{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const run = desktop.start.mock.calls[0][0];
    act(() => desktop.emit({
      runId: run.runId,
      sequence: 1,
      event: { event_type: "error", content: "The provider was unavailable." },
    }));

    expect(await screen.findByText("Run failed", { selector: ".error-label" })).toBeInTheDocument();
    expect(screen.getByRole("log", { name: "Chat messages" })).toHaveAttribute("aria-live", "off");
    await user.click(screen.getByRole("button", { name: "Edit and retry" }));
    expect(screen.getByRole("textbox", { name: "Message Khadim" })).toHaveValue("Prepare the report");
  });

  it("keeps the chat locked until an aborted process has exited and its terminal state is saved", async () => {
    const desktop = createDesktopApi();
    let stoppedSnapshot: AgentRunRecoverySnapshot | null = null;
    let finishAbort!: () => void;
    vi.mocked(desktop.api.agent.recover).mockImplementation(async () => stoppedSnapshot ? [stoppedSnapshot] : []);
    vi.mocked(desktop.api.agent.abort).mockImplementation(() => new Promise<void>((resolve) => { finishAbort = resolve; }));
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByRole("textbox", { name: "Message Khadim" });
    await user.type(composer, "Start a long task{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const run = desktop.start.mock.calls[0][0];
    const saved = desktop.chats.get(projectA.id)?.[0];
    const assistant = saved?.messages.find((message) => message.id === run.assistantMessageId);
    expect(saved).toBeDefined();
    expect(assistant).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Stop response" }));
    await waitFor(() => expect(desktop.api.agent.abort).toHaveBeenCalledWith(run.runId));
    const activeComposer = screen.getByRole("textbox", { name: "Message Khadim" });
    await user.type(activeComposer, "Wait for teardown{Enter}");
    expect(desktop.start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Stop response" })).toBeInTheDocument();

    stoppedSnapshot = {
      runId: run.runId,
      projectId: projectA.id,
      conversationId: saved!.id,
      assistantMessageId: assistant!.id,
      engineSessionKey: saved!.engineSessionKey,
      events: [{ sequence: 1, event: { event_type: "error", content: "Run stopped.", metadata: { reason: "aborted" } } }],
      terminal: true,
      droppedEventCount: 0,
      nextSequence: 2,
    };
    act(() => finishAbort());

    await waitFor(() => expect(desktop.api.agent.acknowledge).toHaveBeenCalledWith(run.runId));
    expect(desktop.chats.get(projectA.id)?.[0]?.runs?.[0]?.status).toBe("stopped");
    expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
    expect(activeComposer).toHaveValue("Wait for teardown");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(2));
  });

  it("stops a run while its initial chat save is still pending without starting the CLI", async () => {
    const desktop = createDesktopApi();
    const persistConversation = vi.mocked(desktop.api.conversations.save).getMockImplementation()!;
    let releaseInitialSave!: () => void;
    const initialSaveMayFinish = new Promise<void>((resolve) => { releaseInitialSave = resolve; });
    let saveCount = 0;
    vi.mocked(desktop.api.conversations.save).mockImplementation(async (conversation) => {
      saveCount += 1;
      if (saveCount === 1) await initialSaveMayFinish;
      await persistConversation(conversation);
    });
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByRole("textbox", { name: "Message Khadim" });
    await user.type(composer, "Stop before launch{Enter}");
    await user.click(await screen.findByRole("button", { name: "Stop response" }));

    expect(desktop.start).not.toHaveBeenCalled();
    expect(desktop.api.agent.abort).not.toHaveBeenCalled();
    act(() => releaseInitialSave());

    await waitFor(() => expect(desktop.chats.get(projectA.id)?.[0]?.runs?.[0]?.status).toBe("stopped"));
    expect(desktop.start).not.toHaveBeenCalled();
    expect(desktop.api.agent.abort).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
  });

  it("asks main to cancel immediately while the start IPC is still pending", async () => {
    const desktop = createDesktopApi();
    let releaseStart!: (result: { runId: string }) => void;
    desktop.start.mockImplementation(() => new Promise((resolve) => { releaseStart = resolve; }));
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByRole("textbox", { name: "Message Khadim" });
    await user.type(composer, "Cancel during startup{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const run = desktop.start.mock.calls[0][0];
    const saved = desktop.chats.get(projectA.id)?.[0];
    const assistant = saved?.messages.find((message) => message.id === run.assistantMessageId);
    expect(saved).toBeDefined();
    expect(assistant).toBeDefined();
    vi.mocked(desktop.api.agent.recover).mockResolvedValue([{
      runId: run.runId,
      projectId: projectA.id,
      conversationId: run.conversationId,
      assistantMessageId: run.assistantMessageId,
      engineSessionKey: run.engineSessionKey,
      events: [{ sequence: 1, event: { event_type: "error", content: "Run stopped.", metadata: { reason: "aborted" } } }],
      terminal: true,
      droppedEventCount: 0,
      nextSequence: 2,
    }]);

    await user.click(screen.getByRole("button", { name: "Stop response" }));
    await waitFor(() => expect(desktop.api.agent.abort).toHaveBeenCalledWith(run.runId));
    expect(screen.getByRole("button", { name: "Stop response" })).toBeInTheDocument();
    act(() => releaseStart({ runId: run.runId }));

    await waitFor(() => expect(desktop.api.agent.acknowledge).toHaveBeenCalledWith(run.runId));
    expect(desktop.chats.get(projectA.id)?.[0]?.runs?.[0]?.status).toBe("stopped");
    expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
  });

  it("waits for terminal chat persistence before deleting the chat and its replay buffer", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByRole("textbox", { name: "Message Khadim" });
    await user.type(composer, "Finish then delete{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const run = desktop.start.mock.calls[0][0];
    const persistConversation = vi.mocked(desktop.api.conversations.save).getMockImplementation()!;
    let releaseTerminalSave!: () => void;
    const terminalSaveMayFinish = new Promise<void>((resolve) => { releaseTerminalSave = resolve; });
    vi.mocked(desktop.api.conversations.save).mockImplementation(async (conversation) => {
      if (conversation.runs?.some((candidate) => candidate.id === run.runId && candidate.status === "complete")) {
        await terminalSaveMayFinish;
      }
      await persistConversation(conversation);
    });

    act(() => desktop.emit({ runId: run.runId, sequence: 1, event: { event_type: "done" } }));
    await user.click(await screen.findByRole("button", { name: "Delete Finish then delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm delete Finish then delete" }));
    expect(desktop.api.conversations.remove).not.toHaveBeenCalled();

    act(() => releaseTerminalSave());
    await waitFor(() => expect(desktop.api.conversations.remove).toHaveBeenCalledWith(projectA.id, run.conversationId));
    expect(desktop.api.agent.acknowledge).toHaveBeenCalledWith(run.runId);
    expect(desktop.chats.get(projectA.id)).toEqual([]);
  });
});
