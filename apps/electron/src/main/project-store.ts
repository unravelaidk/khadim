import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { isHarnessMode } from "../shared/plugins";
import type { Artifact, Conversation, Project } from "../shared/types";
import { safeModelBaseUrl } from "./model-endpoint-policy";
import type { ProjectDataRepository, ProjectAvailability } from "./domain/repositories";

interface StoredProjectIndex {
  version: 1;
  projects: Project[];
}

interface ProjectStoreOptions {
  createId?: () => string;
  now?: () => string;
}

export type { ProjectAvailability } from "./domain/repositories";

type LegacyConversation = Omit<Conversation, "projectId"> & { projectId?: string };
interface LegacyArtifact {
  id: string;
  projectId?: string;
  title?: string;
  kind?: string;
  status?: string;
  html: string;
  baselineHtml: string;
  createdAt: string;
  updatedAt: string;
  sourceRunId?: string;
  sourceMessageId?: string;
  sourceConversationId?: string;
  sourceConversationTitle?: string;
  deletedAt?: string;
}

const projectIndexVersion = 1;

function validatedProjectName(value: string): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 160) throw new Error("Project name must be between 1 and 160 characters.");
  return name;
}

function isProject(value: unknown): value is Project {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const project = value as Record<string, unknown>;
  return isBoundedString(project.id, 240)
    && /^[a-zA-Z0-9._-]+$/.test(project.id)
    && isBoundedString(project.name, 160)
    && isBoundedString(project.rootPath, 4_096)
    && isAbsolute(project.rootPath)
    && ["createdAt", "updatedAt", "lastOpenedAt"].every((key) => isBoundedString(project[key], 80));
}

function isBoundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || Boolean(value.trim()));
}

function isChatMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (!isBoundedString(message.id, 240) || !["user", "assistant"].includes(String(message.role))) return false;
  if (!isBoundedString(message.content, 5 * 1024 * 1024, true) || !isBoundedString(message.createdAt, 80)) return false;
  if (message.status !== undefined && !["streaming", "complete", "error"].includes(String(message.status))) return false;
  if (message.runId !== undefined && !isBoundedString(message.runId, 240)) return false;
  if (message.artifactIds !== undefined && (!Array.isArray(message.artifactIds)
    || message.artifactIds.length > 250
    || !message.artifactIds.every((id) => isBoundedString(id, 240))
    || new Set(message.artifactIds).size !== message.artifactIds.length)) return false;
  if (message.attachments !== undefined && (!Array.isArray(message.attachments)
    || message.attachments.length > 20
    || !message.attachments.every((attachment) => {
      if (typeof attachment !== "object" || attachment === null || Array.isArray(attachment)) return false;
      const candidate = attachment as Record<string, unknown>;
      return isBoundedString(candidate.name, 512) && isBoundedString(candidate.type, 160, true);
    }))) return false;
  if (message.toolCalls !== undefined && (!Array.isArray(message.toolCalls)
    || message.toolCalls.length > 1_000
    || !message.toolCalls.every((toolCall) => {
      if (typeof toolCall !== "object" || toolCall === null || Array.isArray(toolCall)) return false;
      const candidate = toolCall as Record<string, unknown>;
      return isBoundedString(candidate.id, 240)
        && isBoundedString(candidate.tool, 240)
        && isBoundedString(candidate.title, 1_000)
        && ["running", "complete", "error"].includes(String(candidate.status))
        && (candidate.input === undefined || isBoundedString(candidate.input, 5 * 1024 * 1024, true))
        && (candidate.result === undefined || isBoundedString(candidate.result, 5 * 1024 * 1024, true));
    }))) return false;
  if (message.usage !== undefined) {
    if (typeof message.usage !== "object" || message.usage === null || Array.isArray(message.usage)) return false;
    const usage = message.usage as Record<string, unknown>;
    if (!["input", "output", "cacheRead", "cacheWrite"].every((key) => typeof usage[key] === "number" && Number.isFinite(usage[key]) && (usage[key] as number) >= 0)) return false;
  }
  return true;
}

function isAgentRun(value: unknown, conversation: Record<string, unknown>, messagesById: Map<string, Record<string, unknown>>): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const run = value as Record<string, unknown>;
  if (!["id", "projectId", "conversationId", "userMessageId", "assistantMessageId", "createdAt"].every((key) => isBoundedString(run[key], 240))) return false;
  if (run.artifactId !== undefined && !isBoundedString(run.artifactId, 240)) return false;
  if (run.projectId !== conversation.projectId || run.conversationId !== conversation.id) return false;
  const userMessage = messagesById.get(String(run.userMessageId));
  const assistantMessage = messagesById.get(String(run.assistantMessageId));
  if (userMessage?.role !== "user" || assistantMessage?.role !== "assistant" || assistantMessage.runId !== run.id) return false;
  if (!["running", "complete", "error", "stopped"].includes(String(run.status))) return false;
  if (run.completedAt !== undefined && !isBoundedString(run.completedAt, 80)) return false;
  if (run.lastEventSequence !== undefined && (!Number.isSafeInteger(run.lastEventSequence) || (run.lastEventSequence as number) < 0)) return false;
  if (!isHarnessMode(run.harness)) return false;
  if (!Array.isArray(run.enabledTools) || run.enabledTools.length > 100 || !run.enabledTools.every((tool) => isBoundedString(tool, 120))) return false;
  if (new Set(run.enabledTools).size !== run.enabledTools.length) return false;
  for (const [key, required] of [["agent", ["id", "name", "systemPrompt"]], ["model", ["id", "name", "provider", "model"]]] as const) {
    const nested = run[key];
    if (typeof nested !== "object" || nested === null || Array.isArray(nested)) return false;
    const candidate = nested as Record<string, unknown>;
    if (!required.every((field) => isBoundedString(candidate[field], field === "systemPrompt" ? 250_000 : 1_000, field === "systemPrompt"))) return false;
  }
  const model = run.model as Record<string, unknown>;
  if (model.temperature !== undefined) {
    if (!isBoundedString(model.temperature, 40)) return false;
    const temperature = Number(model.temperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) return false;
  }
  if (model.baseUrl !== undefined) {
    if (!isBoundedString(model.baseUrl, 4_096)) return false;
    try {
      safeModelBaseUrl(model.baseUrl, "invalid");
    } catch {
      return false;
    }
  }
  return true;
}

function isConversation(value: unknown): value is Conversation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const conversation = value as Record<string, unknown>;
  if (!["id", "projectId", "engineSessionKey", "title", "createdAt", "updatedAt"]
    .every((key) => isBoundedString(conversation[key], key === "title" ? 500 : 240))) return false;
  if (!Array.isArray(conversation.messages) || conversation.messages.length > 4_000 || !conversation.messages.every(isChatMessage)) return false;
  const messagesById = new Map(conversation.messages.map((message) => {
    const candidate = message as Record<string, unknown>;
    return [candidate.id as string, candidate] as const;
  }));
  if (messagesById.size !== conversation.messages.length) return false;
  if (conversation.runs !== undefined) {
    if (!Array.isArray(conversation.runs) || conversation.runs.length > 2_000 || !conversation.runs.every((run) => isAgentRun(run, conversation, messagesById))) return false;
    if (new Set(conversation.runs.map((run) => (run as Record<string, unknown>).id)).size !== conversation.runs.length) return false;
  }
  return true;
}

function isArtifact(value: unknown): value is Artifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const artifact = value as Record<string, unknown>;
  if (!isBoundedString(artifact.id, 240)
    || !isBoundedString(artifact.projectId, 240)
    || !isBoundedString(artifact.title, 1_000)
    || !isBoundedString(artifact.createdAt, 80)
    || !isBoundedString(artifact.updatedAt, 80)
    || artifact.schemaVersion !== 2
    || !["document", "site", "canvas"].includes(String(artifact.kind))
    || !["draft", "ready", "published"].includes(String(artifact.lifecycle))
    || (artifact.deletedAt !== undefined && !isBoundedString(artifact.deletedAt, 80))) return false;
  const content = artifact.content;
  if (typeof content !== "object" || content === null || Array.isArray(content)) return false;
  const data = content as Record<string, unknown>;
  if (artifact.kind === "site") {
    if (data.format === "html") {
      if (typeof data.html !== "string" || typeof data.baselineHtml !== "string") return false;
      if (data.html.length > 10 * 1024 * 1024 || data.baselineHtml.length > 10 * 1024 * 1024) return false;
      if (artifact.deletedAt !== undefined && (data.html !== "" || data.baselineHtml !== "")) return false;
    } else if (data.format === "web-project") {
      if (!["static", "react", "react-router", "vue", "svelte"].includes(String(data.framework))
        || !isBoundedString(data.entryFile, 500)
        || typeof data.previewHtml !== "string"
        || typeof data.baselinePreviewHtml !== "string"
        || !isArtifactFileMap(data.files)
        || !isArtifactFileMap(data.baselineFiles)
        || !isVisualDocument(data.visual)) return false;
      if (data.previewHtml.length > 10 * 1024 * 1024 || data.baselinePreviewHtml.length > 10 * 1024 * 1024) return false;
      if (artifact.deletedAt !== undefined && (Object.keys(data.files).length > 0 || Object.keys(data.baselineFiles).length > 0 || data.previewHtml !== "" || data.baselinePreviewHtml !== "")) return false;
    } else return false;
  } else if (artifact.kind === "document") {
    if (data.format === "tiptap") {
      if (typeof data.document !== "object" || data.document === null || Array.isArray(data.document)) return false;
    } else if (data.format === "document-html") {
      if (typeof data.html !== "string" || typeof data.baselineHtml !== "string") return false;
      if (data.html.length > 10 * 1024 * 1024 || data.baselineHtml.length > 10 * 1024 * 1024) return false;
      if (artifact.deletedAt !== undefined && (data.html !== "" || data.baselineHtml !== "")) return false;
    } else return false;
    const page = data.page;
    if (typeof page !== "object" || page === null || Array.isArray(page)) return false;
    const settings = page as Record<string, unknown>;
    if (!["A4", "Letter"].includes(String(settings.size))
      || !["portrait", "landscape"].includes(String(settings.orientation))
      || typeof settings.margin !== "number"
      || !Number.isFinite(settings.margin)
      || settings.margin < 0
      || settings.margin > 80) return false;
  } else if (data.format !== "excalidraw" || !Array.isArray(data.elements) || typeof data.appState !== "object" || data.appState === null || typeof data.files !== "object" || data.files === null) {
    return false;
  }
  if (artifact.provenance !== undefined) {
    if (typeof artifact.provenance !== "object" || artifact.provenance === null || Array.isArray(artifact.provenance)) return false;
    const provenance = artifact.provenance as Record<string, unknown>;
    if (!["user", "agent", "import"].includes(String(provenance.origin))) return false;
    if (!["runId", "messageId", "conversationId"].every((key) => provenance[key] === undefined || isBoundedString(provenance[key], 240))) return false;
    if (provenance.conversationTitle !== undefined && !isBoundedString(provenance.conversationTitle, 500)) return false;
  }
  return true;
}

function isArtifactFileMap(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 1_000) return false;
  let total = 0;
  for (const [path, source] of entries) {
    if (!path.startsWith("/") || path.length > 500 || path.includes("\0") || typeof source !== "string") return false;
    total += source.length;
    if (total > 20 * 1024 * 1024) return false;
  }
  return true;
}

function isVisualDocument(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const visual = value as Record<string, unknown>;
  if (visual.editor !== "puck" || typeof visual.data !== "object" || visual.data === null || Array.isArray(visual.data)) return false;
  const document = visual.data as Record<string, unknown>;
  if (!Array.isArray(document.content) || document.content.length > 5_000 || typeof document.root !== "object" || document.root === null || Array.isArray(document.root)) return false;
  try {
    return JSON.stringify(document).length <= 10 * 1024 * 1024;
  } catch {
    return false;
  }
}

function isLegacyConversation(value: unknown): value is LegacyConversation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return isConversation({ ...(value as Record<string, unknown>), projectId: "legacy", engineSessionKey: "legacy" });
}

function isLegacyArtifact(value: unknown): value is LegacyArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const artifact = value as Record<string, unknown>;
  return ["id", "html", "baselineHtml", "createdAt", "updatedAt"].every((key) => typeof artifact[key] === "string");
}

function titleFromHtml(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return title?.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || "Untitled artifact";
}

function normalizeArtifact(value: unknown, projectId: string): Artifact | null {
  if (isArtifact(value)) return value.projectId === projectId ? value : null;
  if (!isLegacyArtifact(value)) return null;
  const hasAgentSource = Boolean(value.sourceRunId || value.sourceMessageId || value.sourceConversationId || value.status === "generated");
  return {
    id: value.id,
    projectId,
    title: value.title?.trim() || titleFromHtml(value.html),
    schemaVersion: 2,
    kind: "site",
    lifecycle: value.status === "generated" ? "ready" : "draft",
    content: { format: "html", html: value.html, baselineHtml: value.baselineHtml },
    provenance: {
      origin: hasAgentSource ? "agent" : "user",
      runId: value.sourceRunId,
      messageId: value.sourceMessageId,
      conversationId: value.sourceConversationId,
      conversationTitle: value.sourceConversationTitle,
    },
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    deletedAt: value.deletedAt,
  };
}

export class ProjectStore implements ProjectDataRepository {
  readonly #dataDirectory: string;
  readonly #createId: () => string;
  readonly #now: () => string;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDirectory: string, options: ProjectStoreOptions = {}) {
    this.#dataDirectory = resolve(dataDirectory);
    this.#createId = options.createId ?? randomUUID;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async listProjects(): Promise<Project[]> {
    await this.#writeQueue;
    const index = await this.#readIndex();
    return [...index.projects].sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt));
  }

  async addProject(rootPathValue: string, nameValue?: string): Promise<Project> {
    const rootPath = await this.#validatedRootPath(rootPathValue);
    const name = nameValue?.trim() || basename(rootPath);
    if (!name || name.length > 160) throw new Error("Project name must be between 1 and 160 characters.");

    return this.#mutate(async (index) => {
      const existing = index.projects.find((project) => project.rootPath === rootPath);
      if (existing) return existing;
      const now = this.#now();
      const project: Project = {
        id: `project-${this.#createId()}`,
        name,
        rootPath,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      };
      index.projects.push(project);
      return project;
    });
  }

  async migrateLegacyWorkspace(rootPathValue: string): Promise<Project> {
    const project = await this.addProject(rootPathValue);
    const legacyConversations = await this.#readLegacyJson(join(this.#dataDirectory, "conversations.json"));
    if (Array.isArray(legacyConversations)) {
      for (const legacy of legacyConversations.filter(isLegacyConversation)) {
        const digest = createHash("sha256").update(`${project.id}\0${legacy.id}`).digest("hex").slice(0, 40);
        await this.saveConversation({ ...legacy, projectId: project.id, engineSessionKey: `electron.v1.${digest}` });
      }
    }

    const artifactStore = await this.#readLegacyJson(join(this.#dataDirectory, "artifact-drafts.json"));
    if (typeof artifactStore === "object" && artifactStore !== null && !Array.isArray(artifactStore)) {
      const workspaces = (artifactStore as { workspaces?: unknown }).workspaces;
      if (Array.isArray(workspaces)) {
        const imported: Artifact[] = [];
        for (const entry of workspaces) {
          if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
          const candidate = entry as { workspace?: unknown; drafts?: unknown };
          if (typeof candidate.workspace !== "string" || !Array.isArray(candidate.drafts)) continue;
          const candidatePath = await realpath(resolve(candidate.workspace)).catch(() => resolve(candidate.workspace as string));
          if (candidatePath !== project.rootPath) continue;
          imported.push(...candidate.drafts
            .filter(isLegacyArtifact)
            .map((artifact) => normalizeArtifact({ ...artifact, projectId: project.id }, project.id))
            .filter((artifact): artifact is Artifact => artifact !== null));
        }
        if (imported.length > 0) {
          const current = await this.listArtifacts(project.id);
          const importedIds = new Set(imported.map((artifact) => artifact.id));
          await this.saveArtifacts(project.id, [...current.filter((artifact) => !importedIds.has(artifact.id)), ...imported]);
        }
      }
    }
    return project;
  }

  async openProject(projectId: string): Promise<Project> {
    return this.#mutate((index) => {
      const project = index.projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new Error("The project no longer exists.");
      project.lastOpenedAt = this.#now();
      return { ...project };
    });
  }

  async getProject(projectId: string): Promise<Project> {
    await this.#writeQueue;
    return { ...await this.#requireProject(projectId) };
  }

  async renameProject(projectId: string, nameValue: string): Promise<Project> {
    const name = validatedProjectName(nameValue);
    return this.#mutate((index) => {
      const project = index.projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new Error("The project no longer exists.");
      project.name = name;
      project.updatedAt = this.#now();
      return { ...project };
    });
  }

  async relocateProject(projectId: string, rootPathValue: string, nameValue?: string): Promise<Project> {
    const rootPath = await this.#validatedRootPath(rootPathValue);
    const name = nameValue === undefined ? undefined : validatedProjectName(nameValue);
    return this.#mutate((index) => {
      const project = index.projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new Error("The project no longer exists.");
      const existingOwner = index.projects.find((candidate) => candidate.id !== projectId && candidate.rootPath === rootPath);
      if (existingOwner) throw new Error("This local folder already belongs to another project.");
      project.rootPath = rootPath;
      if (name !== undefined) project.name = name;
      project.updatedAt = this.#now();
      return { ...project };
    });
  }

  async removeProject(projectId: string): Promise<Project> {
    return this.#mutate((index) => {
      const projectIndex = index.projects.findIndex((candidate) => candidate.id === projectId);
      if (projectIndex === -1) throw new Error("The project no longer exists.");
      const [removedProject] = index.projects.splice(projectIndex, 1);
      return { ...removedProject };
    });
  }

  async checkProjectAvailability(projectId: string): Promise<ProjectAvailability> {
    await this.#writeQueue;
    const project = { ...await this.#requireProject(projectId) };
    let information;
    try {
      information = await stat(project.rootPath);
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return { project, available: false, reason: "missing" };
      }
      throw cause;
    }
    return information.isDirectory()
      ? { project, available: true }
      : { project, available: false, reason: "not-directory" };
  }

  async flush(): Promise<void> {
    await this.#writeQueue;
  }

  async listConversations(projectId: string): Promise<Conversation[]> {
    await this.#writeQueue;
    const project = await this.#requireProject(projectId);
    const conversations = await this.#readCollection(this.#conversationsPath(project), isConversation, "chat history");
    return conversations
      .filter((conversation) => conversation.projectId === project.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    if (!isConversation(conversation)) throw new Error("The chat is invalid.");
    await this.#enqueue(async () => {
      const index = await this.#readIndex();
      const project = index.projects.find((candidate) => candidate.id === conversation.projectId);
      if (!project) throw new Error("The chat's project no longer exists.");
      const conversations = await this.#readCollection(this.#conversationsPath(project), isConversation, "chat history");
      const next = [conversation, ...conversations.filter((item) => item.id !== conversation.id)]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      await this.#writeJson(this.#conversationsPath(project), next);
      if (conversation.updatedAt > project.updatedAt) project.updatedAt = conversation.updatedAt;
      await this.#writeIndex(index);
    });
  }

  async removeConversation(projectId: string, conversationId: string): Promise<void> {
    await this.#enqueue(async () => {
      const index = await this.#readIndex();
      const project = index.projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new Error("The chat's project no longer exists.");
      const conversations = await this.#readCollection(this.#conversationsPath(project), isConversation, "chat history");
      const rawArtifacts = await this.#readRawCollection(this.#artifactsPath(project), "artifact library");
      let artifactReferencesChanged = false;
      const artifacts = rawArtifacts.map((value) => {
        const artifact = normalizeArtifact(value, project.id);
        if (!artifact) throw new Error("The local artifact library is invalid.");
        if (artifact.provenance?.conversationId !== conversationId) return artifact;
        artifactReferencesChanged = true;
        const provenance = { ...artifact.provenance };
        delete provenance.runId;
        delete provenance.conversationId;
        delete provenance.messageId;
        return { ...artifact, provenance };
      });
      if (artifactReferencesChanged) await this.#writeJson(this.#artifactsPath(project), artifacts);
      await this.#writeJson(this.#conversationsPath(project), conversations.filter((item) => item.id !== conversationId));
      project.updatedAt = this.#now();
      await this.#writeIndex(index);
    });
  }

  async listArtifacts(projectId: string): Promise<Artifact[]> {
    await this.#writeQueue;
    const project = await this.#requireProject(projectId);
    const rawArtifacts = await this.#readRawCollection(this.#artifactsPath(project), "artifact library");
    const artifacts = rawArtifacts.map((artifact) => normalizeArtifact(artifact, project.id));
    if (artifacts.some((artifact) => artifact === null)) throw new Error("The local artifact library is invalid.");
    return artifacts
      .filter((artifact): artifact is Artifact => artifact !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async saveArtifacts(projectId: string, artifacts: Artifact[]): Promise<void> {
    const activeArtifactCount = artifacts.filter((artifact) => !artifact.deletedAt).length;
    if (artifacts.length > 5_000 || activeArtifactCount > 250 || !artifacts.every(isArtifact) || artifacts.some((artifact) => artifact.projectId !== projectId)) {
      throw new Error("The artifact library is invalid.");
    }
    if (new Set(artifacts.map((artifact) => artifact.id)).size !== artifacts.length) {
      throw new Error("Artifact IDs must be unique within a project.");
    }
    await this.#enqueue(async () => {
      const index = await this.#readIndex();
      const project = index.projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new Error("The artifact's project no longer exists.");
      const next = [...artifacts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      await this.#writeJson(this.#artifactsPath(project), next);
      const newestUpdate = next[0]?.updatedAt ?? this.#now();
      if (newestUpdate > project.updatedAt) project.updatedAt = newestUpdate;
      await this.#writeIndex(index);
    });
  }

  async #validatedRootPath(value: string): Promise<string> {
    if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
      throw new Error("Choose a valid local project folder.");
    }
    const candidate = resolve(value.trim());
    const information = await stat(candidate).catch(() => null);
    if (!information?.isDirectory()) throw new Error("Choose an existing local project folder.");
    return realpath(candidate);
  }

  #indexPath(): string {
    return join(this.#dataDirectory, "projects.json");
  }

  #conversationsPath(project: Project): string {
    return join(this.#dataDirectory, "projects", project.id, "conversations.json");
  }

  #artifactsPath(project: Project): string {
    return join(this.#dataDirectory, "projects", project.id, "artifacts.json");
  }

  async #requireProject(projectId: string): Promise<Project> {
    const index = await this.#readIndex();
    const project = index.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new Error("The project no longer exists.");
    return project;
  }

  async #readCollection<T>(path: string, validate: (value: unknown) => value is T, label: string): Promise<T[]> {
    const parsed = await this.#readRawCollection(path, label);
    if (!parsed.every(validate)) throw new Error(`The local ${label} is invalid.`);
    return parsed;
  }

  async #readRawCollection(path: string, label: string): Promise<unknown[]> {
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw cause;
    }
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`The local ${label} is invalid.`);
    return parsed;
  }

  async #readLegacyJson(path: string): Promise<unknown> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as unknown;
    } catch {
      return null;
    }
  }

  async #readIndex(): Promise<StoredProjectIndex> {
    let content: string;
    try {
      content = await readFile(this.#indexPath(), "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: projectIndexVersion, projects: [] };
      }
      throw cause;
    }
    const parsed = JSON.parse(content) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("The local project index is invalid.");
    }
    const candidate = parsed as Partial<StoredProjectIndex>;
    if (candidate.version !== projectIndexVersion || !Array.isArray(candidate.projects) || !candidate.projects.every(isProject)) {
      throw new Error("The local project index uses an unsupported format.");
    }
    if (new Set(candidate.projects.map((project) => project.id)).size !== candidate.projects.length
      || new Set(candidate.projects.map((project) => project.rootPath)).size !== candidate.projects.length) {
      throw new Error("The local project index contains duplicate project identities.");
    }
    return { version: projectIndexVersion, projects: candidate.projects };
  }

  async #writeIndex(index: StoredProjectIndex): Promise<void> {
    await this.#writeJson(this.#indexPath(), index);
  }

  async #writeJson(path: string, value: unknown): Promise<void> {
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
      await rename(temporaryPath, path);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  #mutate<T>(operation: (index: StoredProjectIndex) => Promise<T> | T): Promise<T> {
    let result: T;
    const mutation = this.#enqueue(async () => {
      const index = await this.#readIndex();
      result = await operation(index);
      await this.#writeIndex(index);
    });
    return mutation.then(() => result!);
  }

  #enqueue(operation: () => Promise<void>): Promise<void> {
    const mutation = this.#writeQueue.then(operation, operation);
    this.#writeQueue = mutation.catch(() => undefined);
    return mutation;
  }
}
