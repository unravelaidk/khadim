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
      answerQuestion: vi.fn(async () => undefined),
      answerApproval: vi.fn(async () => undefined),
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

    await user.click(screen.getByRole("button", { name: "Studio Beta" }));
    expect(await screen.findByRole("heading", { name: "Artifacts" })).toBeInTheDocument();
    expect(desktop.artifacts.get(projectA.id)).toEqual([]);
    expect(screen.getByRole("button", { name: "Studio Beta" })).toHaveAttribute("aria-pressed", "true");
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

  it("surfaces a harness question in the composer and sends its answer to the active run", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole("textbox", { name: "Message Khadim" }), "Prepare the release{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const run = desktop.start.mock.calls[0][0];

    act(() => desktop.emit({
      runId: run.runId,
      sequence: 1,
      event: {
        event_type: "question",
        metadata: {
          requestId: "request-one",
          questions: [{
            id: "delivery",
            header: "Delivery",
            question: "When should this ship?",
            options: [],
          }],
        },
      },
    }));

    expect(await screen.findByText("When should this ship?")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message Khadim" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Custom answer" }), "Tomorrow");
    await user.click(screen.getByRole("button", { name: "Send answers" }));

    await waitFor(() => expect(desktop.api.agent.answerQuestion).toHaveBeenCalledWith(
      run.runId,
      "request-one",
      { delivery: ["Tomorrow"] },
    ));
    expect(screen.queryByText("When should this ship?")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message Khadim" })).toHaveFocus());
  });

  it("surfaces a harness approval and sends the selected decision", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByRole("textbox", { name: "Message Khadim" }), "Run the checks{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const run = desktop.start.mock.calls[0][0];

    act(() => desktop.emit({
      runId: run.runId,
      sequence: 1,
      event: {
        event_type: "approval",
        metadata: { requestId: "approval-one", kind: "command", title: "Run this command?", detail: "bun test" },
      },
    }));

    expect(await screen.findByText("Run this command?")).toBeInTheDocument();
    expect(screen.getByText("bun test")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message Khadim" })).not.toBeInTheDocument();
    await user.click(screen.getByText("More permission options"));
    await user.click(screen.getByRole("button", { name: "Allow session" }));

    await waitFor(() => expect(desktop.api.agent.answerApproval).toHaveBeenCalledWith(
      run.runId,
      "approval-one",
      "acceptForSession",
    ));
    expect(screen.queryByText("Run this command?")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message Khadim" })).toHaveFocus());
  });

  it("creates document, website, and canvas artifacts in one persistent Studio workspace", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Studio Beta" }));
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
    expect(screen.getByRole("application", { name: "Canvas artwork" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Canvas layers and assets" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Canvas settings" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Canvas tools" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Rectangle$/ }));
    expect(screen.getByRole("button", { name: "Hide Rectangle" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "X position" })).toHaveValue(96);
    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(screen.getAllByText("Rectangle copy")).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryAllByText("Rectangle copy")).toHaveLength(0);
    await waitFor(() => expect(desktop.artifacts.get(projectA.id)?.[0]?.content).toMatchObject({
      format: "khadim-canvas",
      sceneVersion: 1,
      frame: { width: 960, height: 600 },
      elements: [expect.objectContaining({ type: "rectangle", x: 96, y: 88, width: 180, height: 120 })],
    }));
    expect(desktop.artifacts.get(projectA.id)?.[0]).toMatchObject({ kind: "canvas", content: { format: "khadim-canvas", sceneVersion: 1 } });
  });

  it("opens a Canvas with chat hidden, toggles it on and off, and remembers per canvas while other canvases default hidden", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Studio Beta" }));
    await user.click(await screen.findByRole("button", { name: "Create artifact" }));
    await user.click(await screen.findByRole("menuitem", { name: /Canvas/ }));

    // A newly created Canvas opens with the main chat hidden by default. The
    // pane stays mounted (to preserve component-local state) but is hidden,
    // inert, and absent from the accessibility tree, so a normal role query
    // cannot find it.
    expect(screen.queryByRole("region", { name: /Main chat beside/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize Studio conversation pane" })).not.toBeInTheDocument();
    const showChat = screen.getByRole("button", { name: "Show chat" });
    expect(showChat).toHaveAttribute("aria-pressed", "false");
    // The hidden pane is still in the DOM but carries hidden/inert so it is
    // excluded from the accessibility tree and cannot steal focus.
    const hiddenPane = document.querySelector(".studio-main-chat-pane");
    expect(hiddenPane).not.toBeNull();
    expect(hiddenPane).toHaveAttribute("hidden");
    expect(hiddenPane).toHaveAttribute("inert");
    expect(hiddenPane).toHaveAttribute("aria-hidden", "true");

    // Revealing the chat shows the chat region and the resize separator immediately,
    // and removes the hidden/inert accessibility attributes from the pane.
    await user.click(showChat);
    const shownPane = await screen.findByRole("region", { name: /Main chat beside/ });
    expect(shownPane).toBeInTheDocument();
    expect(shownPane).not.toHaveAttribute("hidden");
    expect(shownPane).not.toHaveAttribute("inert");
    expect(shownPane).not.toHaveAttribute("aria-hidden");
    expect(screen.getByRole("separator", { name: "Resize Studio conversation pane" })).toBeInTheDocument();
    const hideChat = screen.getByRole("button", { name: "Hide chat" });
    expect(hideChat).toHaveAttribute("aria-pressed", "true");

    // Hiding the chat removes both the region (from the a11y tree) and the separator.
    await user.click(hideChat);
    expect(screen.queryByRole("region", { name: /Main chat beside/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize Studio conversation pane" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show chat" })).toHaveAttribute("aria-pressed", "false");
    const collapsedPane = document.querySelector(".studio-main-chat-pane");
    expect(collapsedPane).toHaveAttribute("hidden");
    expect(collapsedPane).toHaveAttribute("inert");
    // The toggle button keeps focus after hiding so it remains the way back.
    expect(hideChat).toHaveFocus();

    // Reopen the same Canvas and confirm the previously chosen (hidden) state is remembered.
    await user.click(screen.getByRole("button", { name: "Back to artifacts" }));
    await user.click(await screen.findByRole("button", { name: "Continue editing Untitled canvas" }));
    expect(screen.queryByRole("region", { name: /Main chat beside/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show chat" })).toHaveAttribute("aria-pressed", "false");

    // A different Canvas defaults to hidden chat and exposes its own toggle.
    await user.click(screen.getByRole("button", { name: "Back to artifacts" }));
    await user.click(await screen.findByRole("button", { name: "Create artifact" }));
    await user.click(await screen.findByRole("menuitem", { name: /Canvas/ }));
    expect(screen.queryByRole("region", { name: /Main chat beside/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show chat" })).toHaveAttribute("aria-pressed", "false");
  });

  it("preserves Composer attachment state across Canvas chat Hide/Show without remounting the chat pane", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Studio Beta" }));
    await user.click(await screen.findByRole("button", { name: "Create artifact" }));
    await user.click(await screen.findByRole("menuitem", { name: /Canvas/ }));

    // Reveal the chat and add a Composer attachment (real component-local state).
    await user.click(screen.getByRole("button", { name: "Show chat" }));
    expect(await screen.findByRole("region", { name: /Main chat beside/ })).toBeInTheDocument();
    const fileInput = document.querySelector<HTMLInputElement>(".composer-file-input")!;
    expect(fileInput).not.toBeNull();
    await user.upload(fileInput, new File(["plan content"], "plan.md", { type: "text/markdown" }));
    expect(await screen.findByText("plan.md")).toBeInTheDocument();

    // Hide the chat: the pane becomes hidden/inert but stays mounted.
    await user.click(screen.getByRole("button", { name: "Hide chat" }));
    expect(screen.queryByRole("region", { name: /Main chat beside/ })).not.toBeInTheDocument();
    const collapsedPane = document.querySelector(".studio-main-chat-pane");
    expect(collapsedPane).toHaveAttribute("hidden");
    expect(collapsedPane).toHaveAttribute("inert");
    // The attachment badge is still rendered in the mounted (but hidden) subtree.
    expect(collapsedPane?.textContent).toContain("plan.md");

    // Show the chat again: the Composer-local attachment survives the toggle.
    await user.click(screen.getByRole("button", { name: "Show chat" }));
    expect(await screen.findByRole("region", { name: /Main chat beside/ })).toBeInTheDocument();
    expect(screen.getByText("plan.md")).toBeInTheDocument();
  });

  it("keeps the chat always visible and toggle-free for website and document Studio artifacts", async () => {
    const desktop = createDesktopApi();
    vi.mocked(desktop.api.artifacts.preview!).mockResolvedValue({ url: "about:blank?revision=1" });
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Studio Beta" }));
    await user.click(await screen.findByRole("button", { name: "Document" }));
    expect(screen.getByRole("region", { name: /Main chat beside/ })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize Studio conversation pane" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide chat" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to artifacts" }));
    await user.click(await screen.findByRole("button", { name: "Create artifact" }));
    await user.click(await screen.findByRole("menuitem", { name: /Website/ }));
    expect(screen.getByRole("region", { name: "Main chat beside Untitled website" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize Studio conversation pane" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide chat" })).not.toBeInTheDocument();
  });

  it("keeps Studio beside chat and applies an agent edit through the normal run snapshot", async () => {
    const desktop = createDesktopApi();
    vi.mocked(desktop.api.artifacts.preview!).mockResolvedValueOnce({ url: "about:blank?revision=1" }).mockResolvedValue({ url: "about:blank?revision=2" });
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Studio Beta" }));
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
    await waitFor(() => expect(screen.getByTitle("Untitled website preview")).toHaveAttribute("src", "about:blank?revision=2"));
    expect(screen.getByText("Changes applied to the artifact.")).toBeInTheDocument();
  });

  it("refreshes an open document page as soon as an agent edit is applied", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Studio Beta" }));
    await user.click(await screen.findByRole("button", { name: "Document" }));
    expect(screen.getByTitle("Untitled document editable page")).toHaveAttribute("srcdoc", expect.stringContaining("A clear title for the work"));

    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Turn this into a field report{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const request = desktop.start.mock.calls[0][0];
    const revisedHtml = "<!doctype html><html><body><h1>Field report</h1><p>The inspection is complete.</p></body></html>";

    act(() => desktop.emit({
      runId: request.runId,
      sequence: 1,
      event: {
        event_type: "step_complete",
        content: "Updated the report.",
        metadata: {
          id: "edit-document",
          title: "Updated document",
          tool: "artifact_edit",
          artifactId: request.artifactId,
          artifactEdit: { title: "Field report", html: revisedHtml },
          changeCount: 2,
        },
      },
    }));

    await waitFor(() => expect(screen.getByTitle("Field report editable page")).toHaveAttribute("srcdoc", expect.stringContaining("The inspection is complete")));
    expect(desktop.artifacts.get(projectA.id)?.[0]).toMatchObject({ title: "Field report", content: { format: "document-html", html: revisedHtml } });

    act(() => desktop.emit({ runId: request.runId, sequence: 2, event: { event_type: "done" } }));
    expect(await screen.findByText("Changes applied to the artifact.")).toBeInTheDocument();
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
    expect(await screen.findByRole("button", { name: "Plan my week" })).toBeInTheDocument();
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
    await user.type(screen.getByRole("textbox", { name: "Instructions" }), "Write concise customer replies and ask before sending.");
    await user.click(screen.getByText("Advanced setup"));
    await user.click(screen.getByRole("button", { name: /Project files/ }));
    await user.click(screen.getByRole("button", { name: "Create agent" }));

    expect(screen.getByRole("button", { name: /Customer follow-up.*Owns customer follow-up work/ })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Start chat with Customer follow-up" }));
    await user.type(await screen.findByRole("textbox", { name: "Message Khadim" }), "Reply to Alex{Enter}");

    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    expect(desktop.start.mock.calls[0][0]).toMatchObject({
      prompt: "Reply to Alex",
      systemPrompt: "Write concise customer replies and ask before sending.",
      enabledTools: ["web"],
      enabledApps: [],
    });
    expect(JSON.parse(localStorage.getItem("khadim.agents.v1") ?? "[]")).toEqual([
      expect.objectContaining({ name: "Customer follow-up", type: "agent", connectors: ["web"] }),
    ]);
  });

  it("generates an agent draft with the active model without adding a chat", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Agents/ }));
    await user.click(screen.getByRole("button", { name: "New agent" }));
    await user.type(screen.getByRole("textbox", { name: "Describe your agent" }), "Follow up with customers after meetings and ask before sending.");
    await user.click(screen.getByRole("button", { name: "Generate with AI" }));
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const generationRun = desktop.start.mock.calls[0][0];
    expect(generationRun).toMatchObject({ enabledTools: [], enabledApps: [] });
    expect(generationRun.systemPrompt).toContain("Return only valid JSON");

    act(() => desktop.emit({ runId: generationRun.runId, sequence: 1, event: { event_type: "text_delta", content: JSON.stringify({ name: "Customer care", description: "Keeps customer conversations moving.", prompt: "Draft warm follow-ups and always ask before sending.", connectors: ["web", "apps"], appAccess: ["gmail"], color: "coral" }) } }));
    act(() => desktop.emit({ runId: generationRun.runId, sequence: 2, event: { event_type: "done" } }));

    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Customer care");
    expect(screen.getByRole("textbox", { name: "Instructions" })).toHaveValue("Draft warm follow-ups and always ask before sending.");
    expect(screen.getByText("Draft ready. Review it below or create it now.")).toBeInTheDocument();
    await waitFor(() => expect(desktop.chats.get(projectA.id)).toEqual([]));
  });

  it("configures a template agent with a scoped Google app allowlist and supports edit and delete", async () => {
    const desktop = createDesktopApi();
    vi.mocked(desktop.api.google.get).mockResolvedValue({
      configured: true,
      connected: true,
      credentialStatus: "ready",
      email: "owner@example.com",
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
      ],
    });
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Agents/ }));
    const newAgentButton = screen.getByRole("button", { name: "New agent" });
    const templateButton = screen.getByRole("button", { name: "Use a template" });
    await user.click(templateButton);
    expect(screen.getByRole("dialog", { name: "Agent templates" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Customer follow-up/ })).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Agent templates" })).not.toBeInTheDocument();
    expect(newAgentButton).toHaveFocus();
    await user.click(templateButton);
    await user.click(screen.getByRole("button", { name: /Meeting brief/ }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Meeting brief");
    await user.click(screen.getByText("Advanced setup"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Environment" }), "rpa");
    expect(screen.getByRole("button", { name: /Google Calendar/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Google Drive/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Gmail\b/ })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Create agent" }));

    await user.click(screen.getByRole("button", { name: "Edit agent" }));
    const description = screen.getByRole("textbox", { name: "Short responsibility" });
    await user.clear(description);
    await user.type(description, "Prepares the agenda and decision brief.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Prepares the agenda and decision brief.", { selector: ".agent-library-copy > small" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start chat with Meeting brief" }));
    await user.type(await screen.findByRole("textbox", { name: "Message Khadim" }), "Brief tomorrow's meeting{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    expect(desktop.start.mock.calls[0][0]).toMatchObject({
      prompt: "Brief tomorrow's meeting",
      enabledTools: ["files", "apps"],
      enabledApps: ["calendar", "drive"],
    });
    expect(desktop.chats.get(projectA.id)?.[0]?.runs?.[0]).toMatchObject({ harness: "rpa", enabledApps: ["calendar", "drive"] });

    await user.click(screen.getByRole("button", { name: /Agents/ }));
    expect(screen.getByRole("heading", { name: "Recent work" })).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(screen.getByText("Existing chats keep their saved run snapshots.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("khadim.agents.v1") ?? "[]")).toEqual([]));
    expect(screen.getByRole("button", { name: /Everyday.*practical generalist/ })).toBeInTheDocument();
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

  it("unlocks a chat when project recovery no longer reports its active run", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByRole("textbox", { name: "Message Khadim" }), "Recoverless task{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const run = desktop.start.mock.calls[0][0];

    await user.click(await screen.findByRole("button", { name: /Customer support Local project/ }));
    await screen.findByRole("heading", { name: "Customer support" });
    await user.click(screen.getByRole("button", { name: /Quarterly planning Local project/ }));
    await user.click((await screen.findAllByRole("button", { name: "Recoverless task" }))[0]);

    expect(await screen.findByRole("textbox", { name: "Message Khadim" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.[0]?.runs?.find((item) => item.id === run.runId)?.status).toBe("error"));
  });

  it("switches the visible project when Settings saves a different project folder", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    vi.mocked(desktop.api.settings.chooseWorkspace).mockResolvedValueOnce(projectB.rootPath);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("button", { name: "Plan my week" });
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

  it("runs two chats concurrently without a global send lock and stops only the selected chat's run", async () => {
    const desktop = createDesktopApi();
    // Defer the terminal recovery snapshot for the first run so it stays running
    // while the second chat starts and stops. The second run resolves normally.
    let resolveFirstRecover!: (snapshots: Awaited<ReturnType<KhadimDesktopApi["agent"]["recover"]>>) => void;
    const firstRecover = new Promise<Awaited<ReturnType<KhadimDesktopApi["agent"]["recover"]>>>((resolve) => {
      resolveFirstRecover = resolve;
    });
    let recoverCallIndex = 0;
    vi.mocked(desktop.api.agent.recover).mockImplementation(async () => {
      recoverCallIndex += 1;
      // Initial load recovery + the first stopRun call both happen before the
      // second stop; return the deferred promise for stop calls on the first run.
      return recoverCallIndex <= 2 ? firstRecover : [];
    });
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Plan my week" });

    // Start chat A.
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Work on chat A{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const runA = desktop.start.mock.calls[0][0];
    const chatAId = runA.conversationId;
    act(() => desktop.emit({ runId: runA.runId, sequence: 1, event: { event_type: "text_delta", content: "A is working" } }));
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.[0]?.messages.at(-1)?.content).toBe("A is working"));

    // While chat A is still running, open a new chat. The welcome composer must
    // be enabled (not locked by chat A's run) so the second run can start.
    await user.click(screen.getByRole("button", { name: /New chat/ }));
    expect(await screen.findByRole("button", { name: "Plan my week" })).toBeInTheDocument();
    const welcomeComposer = screen.getByRole("textbox", { name: "Message Khadim" });
    expect(welcomeComposer).not.toBeDisabled();
    await user.type(welcomeComposer, "Work on chat B{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(2));
    const runB = desktop.start.mock.calls[1][0];
    const chatBId = runB.conversationId;
    expect(chatBId).not.toBe(chatAId);
    act(() => desktop.emit({ runId: runB.runId, sequence: 1, event: { event_type: "text_delta", content: "B is working" } }));
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.[0]?.messages.at(-1)?.content).toBe("B is working"));

    // Both runs are active simultaneously and isolated per conversation.
    expect(desktop.chats.get(projectA.id)).toHaveLength(2);
    const chatA = desktop.chats.get(projectA.id)?.find((c) => c.id === chatAId);
    const chatB = desktop.chats.get(projectA.id)?.find((c) => c.id === chatBId);
    expect(chatA?.runs?.[0]?.status).toBe("running");
    expect(chatB?.runs?.[0]?.status).toBe("running");

    // Switch back to chat A and stop its run. Chat B must keep running.
    await user.click(screen.getByRole("button", { name: "Work on chat A" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message Khadim" })).toHaveValue(""));
    expect(screen.getByRole("button", { name: "Stop response" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop response" }));
    await waitFor(() => expect(desktop.api.agent.abort).toHaveBeenCalledWith(runA.runId));
    expect(desktop.api.agent.abort).not.toHaveBeenCalledWith(runB.runId);

    // Release the first run's terminal recovery so it finalizes as stopped.
    act(() => resolveFirstRecover([{
      runId: runA.runId,
      projectId: projectA.id,
      conversationId: chatAId,
      assistantMessageId: runA.assistantMessageId,
      engineSessionKey: runA.engineSessionKey,
      events: [{ sequence: 2, event: { event_type: "error", content: "Run stopped.", metadata: { reason: "aborted" } } }],
      terminal: true,
      droppedEventCount: 0,
      nextSequence: 3,
    }]));

    await waitFor(() => expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatAId)?.runs?.[0]?.status).toBe("stopped"));
    // Chat B is still running and was never aborted.
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatBId)?.runs?.[0]?.status).toBe("running");
    expect(desktop.api.agent.abort).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Work on chat B" }));
    expect(await screen.findByRole("button", { name: "Stop response" })).toBeInTheDocument();

    // Chat A's composer is unlocked after its run stops, while chat B remains locked.
    await user.click(screen.getByRole("button", { name: "Work on chat A" }));
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Follow up in A{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(3));
    expect(desktop.start.mock.calls[2][0].conversationId).toBe(chatAId);
  });

  it("keeps a question and an approval from two concurrent chats coexisting per run", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Plan my week" });

    // Chat A: pending question.
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Ask me something{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const runA = desktop.start.mock.calls[0][0];
    act(() => desktop.emit({
      runId: runA.runId,
      sequence: 1,
      event: {
        event_type: "question",
        metadata: {
          requestId: "question-a",
          questions: [{ id: "q1", header: "Clarify", question: "Which scope?", options: [] }],
        },
      },
    }));
    expect(await screen.findByText("Which scope?")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message Khadim" })).not.toBeInTheDocument();

    // Start chat B without answering chat A. A new chat is not locked by A's run.
    await user.click(screen.getByRole("button", { name: /New chat/ }));
    await user.type(await screen.findByRole("textbox", { name: "Message Khadim" }), "Approve my command{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(2));
    const runB = desktop.start.mock.calls[1][0];
    act(() => desktop.emit({
      runId: runB.runId,
      sequence: 1,
      event: {
        event_type: "approval",
        metadata: { requestId: "approval-b", kind: "command", title: "Run rm -rf?", detail: "rm -rf /tmp/cache" },
      },
    }));
    expect(await screen.findByText("Run rm -rf?")).toBeInTheDocument();
    expect(screen.getByText("rm -rf /tmp/cache")).toBeInTheDocument();

    // Both pending decisions coexist, each scoped to its own run. Switching back
    // to chat A surfaces only its question; chat B's approval stays pending.
    await user.click(screen.getByRole("button", { name: "Ask me something" }));
    await waitFor(() => expect(screen.getByText("Which scope?")).toBeInTheDocument());
    expect(screen.queryByText("Run rm -rf?")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message Khadim" })).not.toBeInTheDocument();

    // Answer chat A's question; its decision clears without affecting chat B.
    await user.type(screen.getByRole("textbox", { name: "Custom answer" }), "Production");
    await user.click(screen.getByRole("button", { name: "Send answers" }));
    await waitFor(() => expect(desktop.api.agent.answerQuestion).toHaveBeenCalledWith(
      runA.runId,
      "question-a",
      { q1: ["Production"] },
    ));
    expect(screen.queryByText("Which scope?")).not.toBeInTheDocument();

    // Switch to chat B and its approval is still pending (not overwritten by A).
    await user.click(screen.getByRole("button", { name: "Approve my command" }));
    await waitFor(() => expect(screen.getByText("Run rm -rf?")).toBeInTheDocument());
    expect(screen.getByText("rm -rf /tmp/cache")).toBeInTheDocument();
    await user.click(screen.getByText("More permission options"));
    await user.click(screen.getByRole("button", { name: /Approve once/ }));
    await waitFor(() => expect(desktop.api.agent.answerApproval).toHaveBeenCalledWith(
      runB.runId,
      "approval-b",
      "accept",
    ));
    expect(screen.queryByText("Run rm -rf?")).not.toBeInTheDocument();
  });

  it("registers every nonterminal recovered run and keeps their pending decisions isolated", async () => {
    const desktop = createDesktopApi();
    const savedAt = "2026-07-13T10:00:00.000Z";
    desktop.chats.set(projectA.id, [
      {
        id: "chat-recover-a",
        projectId: projectA.id,
        engineSessionKey: "electron.v1.recover-a",
        title: "Recover A",
        createdAt: savedAt,
        updatedAt: savedAt,
        messages: [
          { id: "user-recover-a", role: "user", content: "Continue A", createdAt: savedAt, status: "complete" },
          { id: "assistant-recover-a", role: "assistant", content: "", createdAt: savedAt, status: "streaming", runId: "run-recover-a" },
        ],
        runs: [{
          id: "run-recover-a",
          projectId: projectA.id,
          conversationId: "chat-recover-a",
          userMessageId: "user-recover-a",
          assistantMessageId: "assistant-recover-a",
          status: "running",
          createdAt: savedAt,
          agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
          model: { id: "model-1", name: "Claude Sonnet", provider: "anthropic", model: "claude-sonnet-4-5" },
          harness: "assistant",
          enabledTools: ["web", "files"],
        }],
      },
      {
        id: "chat-recover-b",
        projectId: projectA.id,
        engineSessionKey: "electron.v1.recover-b",
        title: "Recover B",
        createdAt: savedAt,
        updatedAt: savedAt,
        messages: [
          { id: "user-recover-b", role: "user", content: "Continue B", createdAt: savedAt, status: "complete" },
          { id: "assistant-recover-b", role: "assistant", content: "", createdAt: savedAt, status: "streaming", runId: "run-recover-b" },
        ],
        runs: [{
          id: "run-recover-b",
          projectId: projectA.id,
          conversationId: "chat-recover-b",
          userMessageId: "user-recover-b",
          assistantMessageId: "assistant-recover-b",
          status: "running",
          createdAt: savedAt,
          agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
          model: { id: "model-1", name: "Claude Sonnet", provider: "anthropic", model: "claude-sonnet-4-5" },
          harness: "assistant",
          enabledTools: ["web", "files"],
        }],
      },
      {
        id: "chat-recover-orphan",
        projectId: projectA.id,
        engineSessionKey: "electron.v1.recover-orphan",
        title: "Recover orphan",
        createdAt: savedAt,
        updatedAt: savedAt,
        messages: [],
        runs: [],
      },
    ]);
    vi.mocked(desktop.api.agent.recover).mockResolvedValue([
      {
        runId: "run-recover-a",
        projectId: projectA.id,
        conversationId: "chat-recover-a",
        assistantMessageId: "assistant-recover-a",
        engineSessionKey: "electron.v1.recover-a",
        events: [
          { sequence: 1, event: { event_type: "text_delta", content: "A streaming" } },
          { sequence: 2, event: { event_type: "question", metadata: { requestId: "question-recover-a", questions: [{ id: "q", header: "Scope", question: "Which scope for A?", options: [] }] } } },
        ],
        terminal: false,
        droppedEventCount: 0,
        nextSequence: 3,
      },
      {
        runId: "run-recover-b",
        projectId: projectA.id,
        conversationId: "chat-recover-b",
        assistantMessageId: "assistant-recover-b",
        engineSessionKey: "electron.v1.recover-b",
        events: [
          { sequence: 1, event: { event_type: "text_delta", content: "B streaming" } },
        ],
        terminal: false,
        droppedEventCount: 0,
        nextSequence: 2,
      },
      {
        runId: "run-recover-orphan",
        projectId: projectA.id,
        conversationId: "chat-recover-orphan",
        assistantMessageId: "assistant-recover-orphan",
        engineSessionKey: "electron.v1.recover-orphan",
        events: [],
        terminal: false,
        droppedEventCount: 0,
        nextSequence: 1,
      },
    ]);
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);

    // Both recovered chats are registered as active (not just the first).
    await user.click(await screen.findByRole("button", { name: "Recover A" }));
    expect(await screen.findByText("A streaming")).toBeInTheDocument();
    // Chat A recovered a pending question, so the composer shows the question
    // panel (the stop control is hidden from the a11y tree while a decision is pending).
    expect(screen.getByText("Which scope for A?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Recover B" }));
    await waitFor(() => expect(screen.getByText("B streaming")).toBeInTheDocument());
    // Chat B has no pending decision, so its active run exposes the stop control.
    expect(await screen.findByRole("button", { name: "Stop response" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message Khadim" })).toBeInTheDocument();
    expect(screen.queryByText("Which scope for A?")).not.toBeInTheDocument();

    // Stopping chat B leaves chat A's run and its pending question intact.
    await user.click(screen.getByRole("button", { name: "Stop response" }));
    await waitFor(() => expect(desktop.api.agent.abort).toHaveBeenCalledWith("run-recover-b"));
    expect(desktop.api.agent.abort).not.toHaveBeenCalledWith("run-recover-a");
    await user.click(screen.getByRole("button", { name: "Recover A" }));
    await waitFor(() => expect(screen.getByText("Which scope for A?")).toBeInTheDocument());
    // Chat A is still active; answering its question clears the decision panel
    // and reveals the stop control again.
    await user.type(screen.getByRole("textbox", { name: "Custom answer" }), "Production");
    await user.click(screen.getByRole("button", { name: "Send answers" }));
    await waitFor(() => expect(screen.queryByText("Which scope for A?")).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "Stop response" })).toBeInTheDocument();

    // A recovery snapshot that cannot be matched to a saved run must not lock
    // its conversation as active.
    await user.click(screen.getByRole("button", { name: "Recover orphan" }));
    expect(await screen.findByRole("textbox", { name: "Message Khadim" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop response" })).not.toBeInTheDocument();
  });

  it("isolates per-chat harness selection so two chats keep different capabilities and a follow-up run uses each chat's harness", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Plan my week" });

    // Start chat A (defaults to global "assistant").
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Work on chat A{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const runA = desktop.start.mock.calls[0][0];
    const chatAId = runA.conversationId;
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatAId)).toMatchObject({ harness: "assistant", runs: [{ harness: "assistant" }] });
    act(() => desktop.emit({ runId: runA.runId, sequence: 1, event: { event_type: "done" } }));
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatAId)?.runs?.[0]?.status).toBe("complete"));

    // Switch chat A to RPA via the composer. This must persist on chat A only.
    await user.click(screen.getByRole("button", { name: "Enable tools" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Computer control/ }));
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatAId)?.harness).toBe("rpa"));
    // Global settings default is untouched.
    expect(desktop.api.settings.save).not.toHaveBeenCalled();

    // Open a new chat. Its composer reflects the global default ("assistant").
    await user.click(screen.getByRole("button", { name: /New chat/ }));
    expect(await screen.findByRole("button", { name: "Plan my week" })).toBeInTheDocument();
    const welcomeComposer = screen.getByRole("textbox", { name: "Message Khadim" });
    await user.type(welcomeComposer, "Work on chat B{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(2));
    const runB = desktop.start.mock.calls[1][0];
    const chatBId = runB.conversationId;
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatBId)).toMatchObject({ harness: "assistant", runs: [{ harness: "assistant" }] });
    act(() => desktop.emit({ runId: runB.runId, sequence: 1, event: { event_type: "done" } }));
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatBId)?.runs?.[0]?.status).toBe("complete"));

    // Switching back to chat A restores its RPA harness in the composer.
    await user.click(screen.getByRole("button", { name: "Work on chat A" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enable tools" })).toHaveAttribute("aria-expanded", "false"));
    await user.click(screen.getByRole("button", { name: "Enable tools" }));
    expect(screen.getByRole("menuitemradio", { name: /Computer control/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: /^Assistant/ })).toHaveAttribute("aria-checked", "false");

    // A follow-up run in chat A uses chat A's persisted RPA harness.
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Continue in A{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(3));
    const runAFollowUp = desktop.start.mock.calls[2][0];
    expect(runAFollowUp).toMatchObject({ conversationId: chatAId });
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatAId)?.runs?.at(-1)).toMatchObject({ harness: "rpa" });
    act(() => desktop.emit({ runId: runAFollowUp.runId, sequence: 1, event: { event_type: "done" } }));

    // Switching to chat B restores its assistant harness, and a follow-up run there uses assistant.
    await user.click(screen.getByRole("button", { name: "Work on chat B" }));
    await user.click(screen.getByRole("button", { name: "Enable tools" }));
    expect(screen.getByRole("menuitemradio", { name: /^Assistant/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: /Computer control/ })).toHaveAttribute("aria-checked", "false");
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Continue in B{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(4));
    const runBFollowUp = desktop.start.mock.calls[3][0];
    expect(runBFollowUp).toMatchObject({ conversationId: chatBId });
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatBId)?.runs?.at(-1)).toMatchObject({ harness: "assistant" });
    act(() => desktop.emit({ runId: runBFollowUp.runId, sequence: 1, event: { event_type: "done" } }));

    // Global settings were never written by per-chat harness selection.
    expect(desktop.api.settings.save).not.toHaveBeenCalled();
  });

  it("falls back to the last run harness for a legacy chat without a durable harness field and preserves it across reload", async () => {
    const desktop = createDesktopApi();
    const savedAt = "2026-07-13T10:00:00.000Z";
    // A legacy chat saved before per-chat harness existed: no `harness` field,
    // but its last run snapshot records RPA.
    desktop.chats.set(projectA.id, [{
      id: "chat-legacy",
      projectId: projectA.id,
      engineSessionKey: "electron.v1.legacy",
      title: "Legacy RPA chat",
      createdAt: savedAt,
      updatedAt: savedAt,
      messages: [
        { id: "user-legacy", role: "user", content: "Drive the UI", createdAt: savedAt, status: "complete" },
        { id: "assistant-legacy", role: "assistant", content: "Done", createdAt: savedAt, status: "complete", runId: "run-legacy" },
      ],
      runs: [{
        id: "run-legacy",
        projectId: projectA.id,
        conversationId: "chat-legacy",
        userMessageId: "user-legacy",
        assistantMessageId: "assistant-legacy",
        status: "complete",
        createdAt: savedAt,
        completedAt: savedAt,
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
        model: { id: "model-1", name: "Claude Sonnet", provider: "anthropic", model: "claude-sonnet-4-5" },
        harness: "rpa",
        enabledTools: ["web", "files"],
      }],
    }]);
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    const firstRender = render(<App />);

    await user.click(await screen.findByRole("button", { name: "Legacy RPA chat" }));
    // The composer derives RPA from the last run snapshot for the legacy chat.
    await user.click(screen.getByRole("button", { name: "Enable tools" }));
    expect(screen.getByRole("menuitemradio", { name: /Computer control/ })).toHaveAttribute("aria-checked", "true");

    // A follow-up run in the legacy chat uses the last-run harness.
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Keep driving{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    expect(desktop.start.mock.calls[0][0]).toMatchObject({ conversationId: "chat-legacy" });
    expect(desktop.chats.get(projectA.id)?.[0]?.runs?.at(-1)).toMatchObject({ harness: "rpa" });
    act(() => desktop.emit({ runId: desktop.start.mock.calls[0][0].runId, sequence: 1, event: { event_type: "done" } }));
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.[0]?.runs?.at(-1)?.status).toBe("complete"));

    // Reloading restores the legacy chat and its last-run-derived harness.
    firstRender.unmount();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Legacy RPA chat" }));
    await user.click(screen.getByRole("button", { name: "Enable tools" }));
    expect(screen.getByRole("menuitemradio", { name: /Computer control/ })).toHaveAttribute("aria-checked", "true");
  });

  it("updates the global default when selecting a harness from the welcome composer with no chat selected", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Plan my week" });

    // No chat is selected; choosing a harness updates global settings as the default.
    await user.click(screen.getByRole("button", { name: "Enable tools" }));
    await user.click(screen.getByRole("menuitemradio", { name: /Computer control/ }));
    await waitFor(() => expect(desktop.api.settings.save).toHaveBeenCalled());
    expect(desktop.api.settings.save).toHaveBeenCalledWith(expect.objectContaining({ harness: "rpa" }));
  });

  it("persists /harness rpa in an existing assistant chat and the command response does not revert it, and welcome /harness rpa creates its command chat with rpa", async () => {
    const desktop = createDesktopApi();
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Plan my week" });

    // Start an assistant chat so there is an existing conversation selected.
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Plan the week{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const chatId = desktop.start.mock.calls[0][0].conversationId;
    act(() => desktop.emit({ runId: desktop.start.mock.calls[0][0].runId, sequence: 1, event: { event_type: "done" } }));
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatId)?.runs?.[0]?.status).toBe("complete"));
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatId)).toMatchObject({ harness: "assistant" });

    // `/harness rpa` in the existing chat persists rpa on that conversation only.
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "/harness rpa{Enter}");
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatId)?.harness).toBe("rpa"));
    // The command response is appended to the same chat and does not revert it.
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatId)?.harness).toBe("rpa");
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatId)?.messages.at(-1)?.content).toContain("Computer control");
    // Per-chat selection must not update global settings.
    expect(desktop.api.settings.save).not.toHaveBeenCalled();

    // Go home (no chat selected) and run `/harness rpa` from the welcome composer.
    await user.click(screen.getByRole("button", { name: /New chat/ }));
    expect(await screen.findByRole("button", { name: "Plan my week" })).toBeInTheDocument();
    const welcomeComposer = screen.getByRole("textbox", { name: "Message Khadim" });
    await user.type(welcomeComposer, "/harness rpa{Enter}");

    // With no chat selected, `/harness rpa` updates the global default and the
    // command response creates a brand-new chat persisted with harness rpa.
    await waitFor(() => expect(desktop.api.settings.save).toHaveBeenCalledWith(expect.objectContaining({ harness: "rpa" })));
    const commandChats = desktop.chats.get(projectA.id)?.filter((c) => c.title === "/harness rpa") ?? [];
    expect(commandChats).toHaveLength(1);
    expect(commandChats[0]).toMatchObject({ harness: "rpa" });
    expect(commandChats[0].messages.at(-1)?.content).toContain("Computer control");
    // The original assistant-turned-rpa chat is untouched by the welcome command.
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === chatId)?.harness).toBe("rpa");
  });

  it("does not mutate a previously selected assistant chat when starting an RPA-configured agent, and the new chat/run uses rpa", async () => {
    const desktop = createDesktopApi();
    vi.mocked(desktop.api.google.get).mockResolvedValue({
      configured: true,
      connected: true,
      credentialStatus: "ready",
      email: "owner@example.com",
      scopes: [
        "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
      ],
    });
    Object.defineProperty(window, "khadim", { configurable: true, value: desktop.api });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Plan my week" });

    // Start an assistant chat and leave it selected.
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Draft the note{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(1));
    const assistantChatId = desktop.start.mock.calls[0][0].conversationId;
    act(() => desktop.emit({ runId: desktop.start.mock.calls[0][0].runId, sequence: 1, event: { event_type: "done" } }));
    await waitFor(() => expect(desktop.chats.get(projectA.id)?.find((c) => c.id === assistantChatId)?.runs?.[0]?.status).toBe("complete"));
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === assistantChatId)).toMatchObject({ harness: "assistant" });

    // Switch to Agents and create an RPA-configured agent, then start its chat.
    await user.click(screen.getByRole("button", { name: /Agents/ }));
    await user.click(screen.getByRole("button", { name: "Use a template" }));
    await user.click(screen.getByRole("button", { name: /Meeting brief/ }));
    await user.click(screen.getByText("Advanced setup"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Environment" }), "rpa");
    await user.click(screen.getByRole("button", { name: "Create agent" }));
    await user.click(screen.getByRole("button", { name: "Start chat with Meeting brief" }));

    // The previously selected assistant chat is not mutated by the agent launch.
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === assistantChatId)).toMatchObject({ harness: "assistant" });

    // The newly launched chat uses the RPA global default configured by the agent.
    expect(await screen.findByRole("button", { name: "Plan my week" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Message Khadim" }), "Brief tomorrow's meeting{Enter}");
    await waitFor(() => expect(desktop.start).toHaveBeenCalledTimes(2));
    const agentRun = desktop.start.mock.calls[1][0];
    expect(agentRun.conversationId).not.toBe(assistantChatId);
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === agentRun.conversationId)).toMatchObject({ harness: "rpa" });
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === agentRun.conversationId)?.runs?.[0]).toMatchObject({ harness: "rpa" });
    // The old assistant chat is still assistant and unchanged.
    expect(desktop.chats.get(projectA.id)?.find((c) => c.id === assistantChatId)).toMatchObject({ harness: "assistant" });
  });
});
