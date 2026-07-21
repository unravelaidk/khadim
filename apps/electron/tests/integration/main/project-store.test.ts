import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectStore } from "../../../src/main/project-store";
import type { ArtifactDraft, Conversation } from "../../../src/shared/types";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "khadim-project-store-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ProjectStore", () => {
  it("keeps a local project available after the store is reopened", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "customer-onboarding");
    await mkdir(projectDirectory);

    const firstSession = new ProjectStore(dataDirectory);
    const created = await firstSession.addProject(projectDirectory);

    const reopenedSession = new ProjectStore(dataDirectory);
    const projects = await reopenedSession.listProjects();

    expect(projects).toEqual([
      expect.objectContaining({
        id: created.id,
        name: "customer-onboarding",
        rootPath: projectDirectory,
      }),
    ]);
  });

  it("reports a missing project folder without changing the project index", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "missing-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory, { now: () => "2026-07-13T10:00:00.000Z" });
    const project = await store.addProject(projectDirectory);
    await rm(projectDirectory, { recursive: true });

    await expect(store.checkProjectAvailability(project.id)).resolves.toEqual({
      project,
      available: false,
      reason: "missing",
    });
    await expect(store.listProjects()).resolves.toEqual([project]);
  });

  it("reports an existing project folder as available", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "available-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);

    await expect(store.checkProjectAvailability(project.id)).resolves.toEqual({
      project,
      available: true,
    });
  });

  it("reports a project path replaced by a file without changing the project index", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "not-a-folder");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory, { now: () => "2026-07-13T10:00:00.000Z" });
    const project = await store.addProject(projectDirectory);
    await rm(projectDirectory, { recursive: true });
    await writeFile(projectDirectory, "not a directory", "utf8");

    await expect(store.checkProjectAvailability(project.id)).resolves.toEqual({
      project,
      available: false,
      reason: "not-directory",
    });
    await expect(store.listProjects()).resolves.toEqual([project]);
  });

  it("keeps chat history isolated to its owning project after restart", async () => {
    const dataDirectory = await temporaryDirectory();
    const firstFolder = join(dataDirectory, "first-project");
    const secondFolder = join(dataDirectory, "second-project");
    await Promise.all([mkdir(firstFolder), mkdir(secondFolder)]);

    const firstSession = new ProjectStore(dataDirectory);
    const firstProject = await firstSession.addProject(firstFolder);
    const secondProject = await firstSession.addProject(secondFolder);
    const firstConversation: Conversation = {
      id: "chat-first",
      projectId: firstProject.id,
      engineSessionKey: "electron.v1.chat-first",
      title: "First project chat",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      messages: [],
    };
    const secondConversation: Conversation = {
      id: "chat-second",
      projectId: secondProject.id,
      engineSessionKey: "electron.v1.chat-second",
      title: "Second project chat",
      createdAt: "2026-07-13T11:00:00.000Z",
      updatedAt: "2026-07-13T11:00:00.000Z",
      messages: [],
    };

    await firstSession.saveConversation(firstConversation);
    await firstSession.saveConversation(secondConversation);

    const reopenedSession = new ProjectStore(dataDirectory);
    await expect(reopenedSession.listConversations(firstProject.id)).resolves.toEqual([firstConversation]);
    await expect(reopenedSession.listConversations(secondProject.id)).resolves.toEqual([secondConversation]);
  });

  it("keeps artifacts isolated to their owning project after restart", async () => {
    const dataDirectory = await temporaryDirectory();
    const firstFolder = join(dataDirectory, "first-project");
    const secondFolder = join(dataDirectory, "second-project");
    await Promise.all([mkdir(firstFolder), mkdir(secondFolder)]);

    const firstSession = new ProjectStore(dataDirectory);
    const firstProject = await firstSession.addProject(firstFolder);
    const secondProject = await firstSession.addProject(secondFolder);
    const artifact: ArtifactDraft = {
      id: "artifact-first",
      projectId: firstProject.id,
      title: "First project",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "draft",
      content: {
        format: "html",
        html: "<h1>First project</h1>",
        baselineHtml: "<h1>First project</h1>",
      },
      provenance: { origin: "user" },
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
    };

    await firstSession.saveArtifacts(firstProject.id, [artifact]);

    const reopenedSession = new ProjectStore(dataDirectory);
    await expect(reopenedSession.listArtifacts(firstProject.id)).resolves.toEqual([artifact]);
    await expect(reopenedSession.listArtifacts(secondProject.id)).resolves.toEqual([]);
  });

  it("persists file-backed React artifacts and their visual document", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "react-studio-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifact: ArtifactDraft = {
      id: "react-site",
      projectId: project.id,
      title: "React launch page",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "draft",
      content: {
        format: "web-project",
        framework: "react",
        entryFile: "/src/App.jsx",
        files: { "/src/App.jsx": "export default function App() { return <h1>Launch</h1>; }" },
        baselineFiles: { "/src/App.jsx": "export default function App() { return <h1>Launch</h1>; }" },
        previewHtml: "<h1>Launch</h1>",
        baselinePreviewHtml: "<h1>Launch</h1>",
        visual: { editor: "puck", data: { root: { props: {} }, content: [{ type: "Heading", props: { id: "heading", text: "Launch" } }] } },
      },
      provenance: { origin: "user" },
      createdAt: "2026-07-17T10:00:00.000Z",
      updatedAt: "2026-07-17T10:00:00.000Z",
    };

    await store.saveArtifacts(project.id, [artifact]);

    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([artifact]);
  });

  it("persists the default React Router v7 artifact project", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "react-router-studio-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifact: ArtifactDraft = {
      id: "react-router-site",
      projectId: project.id,
      title: "Router launch page",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "draft",
      content: {
        format: "web-project",
        framework: "react-router",
        entryFile: "/src/router.jsx",
        files: {
          "/package.json": JSON.stringify({ dependencies: { "react-router": "^7.14.1" } }),
          "/src/router.jsx": "export const router = {};",
        },
        baselineFiles: {
          "/package.json": JSON.stringify({ dependencies: { "react-router": "^7.14.1" } }),
          "/src/router.jsx": "export const router = {};",
        },
        previewHtml: "<h1>Router launch</h1>",
        baselinePreviewHtml: "<h1>Router launch</h1>",
        visual: { editor: "puck", data: { root: { props: {} }, content: [] } },
      },
      provenance: { origin: "user" },
      createdAt: "2026-07-18T10:00:00.000Z",
      updatedAt: "2026-07-18T10:00:00.000Z",
    };

    await store.saveArtifacts(project.id, [artifact]);

    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([artifact]);
  });

  it("persists HTML documents with bounded page settings", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "document-studio-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifact: ArtifactDraft = {
      id: "html-document",
      projectId: project.id,
      title: "Field report",
      schemaVersion: 2,
      kind: "document",
      lifecycle: "draft",
      content: {
        format: "document-html",
        html: "<!doctype html><html><body><h1>Field report</h1></body></html>",
        baselineHtml: "<!doctype html><html><body><h1>Field report</h1></body></html>",
        page: { size: "A4", orientation: "portrait", margin: 24 },
      },
      provenance: { origin: "user" },
      createdAt: "2026-07-17T10:00:00.000Z",
      updatedAt: "2026-07-17T10:00:00.000Z",
    };

    await store.saveArtifacts(project.id, [artifact]);
    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([artifact]);
    if (artifact.content.format !== "document-html") throw new Error("Expected HTML document");
    const invalidArtifact: ArtifactDraft = { ...artifact, content: { ...artifact.content, page: { ...artifact.content.page, margin: 120 } } };
    await expect(store.saveArtifacts(project.id, [invalidArtifact])).rejects.toThrow("artifact library is invalid");
  });

  it("upgrades a legacy HTML artifact into a versioned site without losing its source", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "legacy-site-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const artifactDirectory = join(dataDirectory, "projects", project.id);
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(join(artifactDirectory, "artifacts.json"), JSON.stringify([{
      id: "legacy-site",
      projectId: project.id,
      title: "Customer portal",
      kind: "html",
      status: "generated",
      html: "<html><head><title>Customer portal</title></head><body><h1>Welcome</h1></body></html>",
      baselineHtml: "<html><head><title>Customer portal</title></head><body><h1>Welcome</h1></body></html>",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      sourceRunId: "run-site",
      sourceMessageId: "message-site",
      sourceConversationId: "chat-site",
      sourceConversationTitle: "Build a customer portal",
    }]), "utf8");

    await expect(store.listArtifacts(project.id)).resolves.toEqual([{
      id: "legacy-site",
      projectId: project.id,
      title: "Customer portal",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "ready",
      content: {
        format: "html",
        html: "<html><head><title>Customer portal</title></head><body><h1>Welcome</h1></body></html>",
        baselineHtml: "<html><head><title>Customer portal</title></head><body><h1>Welcome</h1></body></html>",
      },
      provenance: {
        origin: "agent",
        runId: "run-site",
        messageId: "message-site",
        conversationId: "chat-site",
        conversationTitle: "Build a customer portal",
      },
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
    }]);
  });

  it("persists a source-backed artifact tombstone across restarts", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "deleted-artifact-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const tombstone: ArtifactDraft = {
      id: "artifact-deleted",
      projectId: project.id,
      title: "Deleted report",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "ready",
      content: { format: "html", html: "", baselineHtml: "" },
      provenance: {
        origin: "agent",
        runId: "run-report",
        messageId: "assistant-report",
        conversationId: "chat-report",
        conversationTitle: "Create a report",
      },
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T11:00:00.000Z",
      deletedAt: "2026-07-13T11:00:00.000Z",
    };

    await store.saveArtifacts(project.id, [tombstone]);

    await expect(new ProjectStore(dataDirectory).listArtifacts(project.id)).resolves.toEqual([tombstone]);
  });

  it("keeps artifacts while clearing stale source references when a chat is removed", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "source-reference-project");
    await mkdir(projectDirectory);

    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const removedConversation: Conversation = {
      id: "chat-removed",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-removed",
      title: "Original research chat",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      messages: [],
    };
    const retainedConversation: Conversation = {
      ...removedConversation,
      id: "chat-retained",
      engineSessionKey: "electron.v1.chat-retained",
      title: "Retained research chat",
    };
    const removedSourceArtifact: ArtifactDraft = {
      id: "artifact-from-removed-chat",
      projectId: project.id,
      title: "Research summary",
      schemaVersion: 2,
      kind: "site",
      lifecycle: "ready",
      content: { format: "html", html: "<h1>Research summary</h1>", baselineHtml: "<h1>Research summary</h1>" },
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T11:00:00.000Z",
      provenance: {
        origin: "agent",
        runId: "run-removed",
        conversationId: removedConversation.id,
        messageId: "message-removed",
        conversationTitle: removedConversation.title,
      },
    };
    const retainedSourceArtifact: ArtifactDraft = {
      ...removedSourceArtifact,
      id: "artifact-from-retained-chat",
      updatedAt: "2026-07-13T12:00:00.000Z",
      provenance: {
        origin: "agent",
        runId: "run-retained",
        conversationId: retainedConversation.id,
        messageId: "message-retained",
        conversationTitle: retainedConversation.title,
      },
    };

    await store.saveConversation(removedConversation);
    await store.saveConversation(retainedConversation);
    await store.saveArtifacts(project.id, [removedSourceArtifact, retainedSourceArtifact]);

    await store.removeConversation(project.id, removedConversation.id);

    const reopenedStore = new ProjectStore(dataDirectory);
    await expect(reopenedStore.listArtifacts(project.id)).resolves.toEqual([
      retainedSourceArtifact,
      {
        ...removedSourceArtifact,
        provenance: {
          origin: "agent",
          conversationTitle: removedConversation.title,
        },
      },
    ]);
  });

  it("migrates legacy chats and artifact drafts into their original workspace project", async () => {
    const dataDirectory = await temporaryDirectory();
    const workspaceDirectory = join(dataDirectory, "legacy-workspace");
    await mkdir(workspaceDirectory);
    await writeFile(join(dataDirectory, "conversations.json"), JSON.stringify([{
      id: "legacy-chat",
      title: "Legacy chat",
      createdAt: "2026-07-12T10:00:00.000Z",
      updatedAt: "2026-07-12T10:00:00.000Z",
      messages: [],
    }]), "utf8");
    await writeFile(join(dataDirectory, "artifact-drafts.json"), JSON.stringify({
      version: 1,
      workspaces: [{
        workspace: workspaceDirectory,
        drafts: [{
          id: "legacy-artifact",
          html: "<h1>Legacy artifact</h1>",
          baselineHtml: "<h1>Legacy artifact</h1>",
          createdAt: "2026-07-12T10:00:00.000Z",
          updatedAt: "2026-07-12T10:00:00.000Z",
          sourceConversationId: "legacy-chat",
          sourceConversationTitle: "Legacy chat",
        }],
      }],
    }), "utf8");

    const store = new ProjectStore(dataDirectory);
    const project = await store.migrateLegacyWorkspace(workspaceDirectory);

    await expect(store.listConversations(project.id)).resolves.toEqual([
      expect.objectContaining({ id: "legacy-chat", projectId: project.id }),
    ]);
    await expect(store.listArtifacts(project.id)).resolves.toEqual([
      expect.objectContaining({
        id: "legacy-artifact",
        projectId: project.id,
        provenance: expect.objectContaining({ conversationId: "legacy-chat" }),
      }),
    ]);
  });

  it("records the project most recently opened by the user", async () => {
    const dataDirectory = await temporaryDirectory();
    const firstFolder = join(dataDirectory, "first-project");
    const secondFolder = join(dataDirectory, "second-project");
    await Promise.all([mkdir(firstFolder), mkdir(secondFolder)]);
    let now = "2026-07-13T10:00:00.000Z";
    const store = new ProjectStore(dataDirectory, { now: () => now });
    const firstProject = await store.addProject(firstFolder);
    now = "2026-07-13T11:00:00.000Z";
    await store.addProject(secondFolder);
    now = "2026-07-13T12:00:00.000Z";

    const opened = await store.openProject(firstProject.id);

    expect(opened.lastOpenedAt).toBe(now);
    await expect(store.listProjects()).resolves.toEqual([
      expect.objectContaining({ id: firstProject.id, lastOpenedAt: now }),
      expect.not.objectContaining({ id: firstProject.id }),
    ]);
  });

  it("renames a project with a trimmed name and records the update", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "original-name");
    await mkdir(projectDirectory);
    let now = "2026-07-13T10:00:00.000Z";
    const store = new ProjectStore(dataDirectory, { now: () => now });
    const project = await store.addProject(projectDirectory);
    now = "2026-07-13T11:00:00.000Z";

    const renamed = await store.renameProject(project.id, "  Customer operations  ");

    expect(renamed).toEqual({
      ...project,
      name: "Customer operations",
      updatedAt: now,
    });
    await expect(new ProjectStore(dataDirectory).getProject(project.id)).resolves.toEqual(renamed);
  });

  it.each([
    ["blank", "   "],
    ["longer than 160 characters", "x".repeat(161)],
  ])("rejects a %s project name", async (_label, invalidName) => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "original-name");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);

    await expect(store.renameProject(project.id, invalidName)).rejects.toThrow(
      "Project name must be between 1 and 160 characters.",
    );
    await expect(store.getProject(project.id)).resolves.toEqual(project);
  });

  it("relocates a project while preserving its identity, name, and local data", async () => {
    const dataDirectory = await temporaryDirectory();
    const originalDirectory = join(dataDirectory, "original-folder");
    const relocatedDirectory = join(dataDirectory, "relocated-folder");
    await Promise.all([mkdir(originalDirectory), mkdir(relocatedDirectory)]);
    let now = "2026-07-13T10:00:00.000Z";
    const store = new ProjectStore(dataDirectory, { now: () => now });
    const project = await store.addProject(originalDirectory, "Customer operations");
    const conversation: Conversation = {
      id: "chat-before-relocation",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-before-relocation",
      title: "Relocation-safe chat",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await store.saveConversation(conversation);
    now = "2026-07-13T11:00:00.000Z";

    const relocated = await store.relocateProject(project.id, join(relocatedDirectory, "."));

    expect(relocated).toEqual({
      ...project,
      rootPath: relocatedDirectory,
      updatedAt: now,
    });
    await expect(new ProjectStore(dataDirectory).getProject(project.id)).resolves.toEqual(relocated);
    await expect(store.listConversations(project.id)).resolves.toEqual([conversation]);
  });

  it("rejects relocating a project into a folder owned by another project", async () => {
    const dataDirectory = await temporaryDirectory();
    const firstDirectory = join(dataDirectory, "first-folder");
    const secondDirectory = join(dataDirectory, "second-folder");
    await Promise.all([mkdir(firstDirectory), mkdir(secondDirectory)]);
    const store = new ProjectStore(dataDirectory);
    const firstProject = await store.addProject(firstDirectory);
    await store.addProject(secondDirectory);

    await expect(store.relocateProject(firstProject.id, join(secondDirectory, "."))).rejects.toThrow(
      "This local folder already belongs to another project.",
    );
    await expect(store.getProject(firstProject.id)).resolves.toEqual(firstProject);
  });

  it("rejects relocating a project to a path that is not an existing directory", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "original-folder");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);

    await expect(store.relocateProject(project.id, join(dataDirectory, "missing-folder"))).rejects.toThrow(
      "Choose an existing local project folder.",
    );
    await expect(store.getProject(project.id)).resolves.toEqual(project);
  });

  it("updates a project's name only when relocation explicitly includes one", async () => {
    const dataDirectory = await temporaryDirectory();
    const originalDirectory = join(dataDirectory, "original-folder");
    const relocatedDirectory = join(dataDirectory, "relocated-folder");
    await Promise.all([mkdir(originalDirectory), mkdir(relocatedDirectory)]);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(originalDirectory, "Original name");

    const relocated = await store.relocateProject(project.id, relocatedDirectory, "  Relocated name  ");

    expect(relocated.name).toBe("Relocated name");
  });

  it("removes a project from the index without deleting its local store data", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "removable-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const conversation: Conversation = {
      id: "retained-chat",
      projectId: project.id,
      engineSessionKey: "electron.v1.retained-chat",
      title: "Retained after index removal",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      messages: [],
    };
    await store.saveConversation(conversation);
    const indexedProject = await store.getProject(project.id);

    await expect(store.removeProject(project.id)).resolves.toEqual(indexedProject);

    await expect(store.listProjects()).resolves.toEqual([]);
    await expect(store.getProject(project.id)).rejects.toThrow("The project no longer exists.");
    await expect(readFile(join(dataDirectory, "projects", project.id, "conversations.json"), "utf8"))
      .resolves.toContain(conversation.id);
  });

  it("rejects malformed nested chat records instead of persisting corrupt history", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "validated-project");
    await mkdir(projectDirectory);

    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const malformed = {
      id: "chat-invalid",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-invalid",
      title: "Invalid chat",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      messages: [
        { id: "duplicate", role: "user", content: "Hello", createdAt: "2026-07-13T10:00:00.000Z", status: "complete" },
        { id: "duplicate", role: "assistant", content: "Hi", createdAt: "2026-07-13T10:00:01.000Z", status: "complete" },
      ],
    } as Conversation;

    await expect(store.saveConversation(malformed)).rejects.toThrow("chat is invalid");
    await expect(store.listConversations(project.id)).resolves.toEqual([]);
  });

  it("rejects run snapshots whose message links or model policy are corrupt", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "run-validation-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const base = {
      id: "chat-run-validation",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-run-validation",
      title: "Validate a run",
      createdAt: "2026-07-13T10:00:00.000Z",
      updatedAt: "2026-07-13T10:00:00.000Z",
      messages: [
        { id: "user-one", role: "user", content: "Hello", createdAt: "2026-07-13T10:00:00.000Z", status: "complete" },
        { id: "assistant-one", role: "assistant", content: "", createdAt: "2026-07-13T10:00:01.000Z", status: "streaming", runId: "wrong-run" },
      ],
      runs: [{
        id: "run-one",
        projectId: project.id,
        conversationId: "chat-run-validation",
        userMessageId: "user-one",
        assistantMessageId: "assistant-one",
        status: "running",
        createdAt: "2026-07-13T10:00:01.000Z",
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
        model: { id: "model-one", name: "Model", provider: "openai", model: "gpt-5", temperature: "0.2" },
        harness: "assistant",
        enabledTools: ["web", "files"],
      }],
    } as Conversation;

    await expect(store.saveConversation(base)).rejects.toThrow("chat is invalid");
    const badEndpoint = structuredClone(base);
    badEndpoint.messages[1].runId = "run-one";
    badEndpoint.runs![0].model.baseUrl = "file:///tmp/model";
    await expect(store.saveConversation(badEndpoint)).rejects.toThrow("chat is invalid");
    await expect(store.listConversations(project.id)).resolves.toEqual([]);

    const selectedArtifactRun = structuredClone(base);
    selectedArtifactRun.messages[1].runId = "run-one";
    selectedArtifactRun.runs![0].artifactId = "artifact-selected";
    await expect(store.saveConversation(selectedArtifactRun)).resolves.toBeUndefined();
    await expect(store.listConversations(project.id)).resolves.toEqual([selectedArtifactRun]);
  });

  it("persists valid plugin harness run snapshots", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "plugin-harness-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    const conversation: Conversation = {
      id: "chat-plugin-harness",
      projectId: project.id,
      engineSessionKey: "electron.v1.chat-plugin-harness",
      title: "Run through OpenCode",
      createdAt: "2026-07-21T00:00:00.000Z",
      updatedAt: "2026-07-21T00:00:01.000Z",
      messages: [
        { id: "user-plugin", role: "user", content: "Hello", createdAt: "2026-07-21T00:00:00.000Z", status: "complete" },
        { id: "assistant-plugin", role: "assistant", content: "", createdAt: "2026-07-21T00:00:01.000Z", status: "streaming", runId: "run-plugin" },
      ],
      runs: [{
        id: "run-plugin",
        projectId: project.id,
        conversationId: "chat-plugin-harness",
        userMessageId: "user-plugin",
        assistantMessageId: "assistant-plugin",
        status: "running",
        createdAt: "2026-07-21T00:00:01.000Z",
        agent: { id: "everyday", name: "Everyday", systemPrompt: "Help." },
        model: { id: "model-one", name: "Model", provider: "openai", model: "gpt-5" },
        harness: "plugin:khadim.opencode/opencode",
        enabledTools: ["web", "files"],
      }],
    };

    await expect(store.saveConversation(conversation)).resolves.toBeUndefined();
    await expect(store.listConversations(project.id)).resolves.toEqual([conversation]);
  });

  it("rejects duplicate project identities in a corrupted index", async () => {
    const dataDirectory = await temporaryDirectory();
    const projectDirectory = join(dataDirectory, "duplicate-project");
    await mkdir(projectDirectory);
    const store = new ProjectStore(dataDirectory);
    const project = await store.addProject(projectDirectory);
    await writeFile(join(dataDirectory, "projects.json"), JSON.stringify({ version: 1, projects: [project, project] }), "utf8");

    await expect(new ProjectStore(dataDirectory).listProjects()).rejects.toThrow("duplicate project identities");
  });
});
