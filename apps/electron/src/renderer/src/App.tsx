import {
  ArrowUp,
  AppWindow,
  Stack as Blocks,
  Robot as Bot,
  Check,
  CheckCircle as CircleCheck,
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  Code as Code2,
  FileCode as FileCode2,
  FileText,
  NotePencil as FilePenLine,
  Kanban as FolderKanban,
  FolderOpen,
  EnvelopeSimple,
  GlobeHemisphereWest as Globe2,
  List as Menu,
  Minus,
  ChatCircleDots as MessageSquarePlus,
  SidebarSimple as PanelLeftClose,
  SidebarSimple as PanelLeftOpen,
  Plus,
  MagnifyingGlass as Search,
  Gear as Settings,
  ChatCircleDots,
  Square,
  Trash as Trash2,
  UserCircle as UserRound,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/source-serif-4";
import type { AgentEventEnvelope, AgentRun, AgentRunRecoverySnapshot, AppSettings, ArtifactDraft, ArtifactKind, ChatAttachment, ChatMessage, Conversation, GoogleConnection, HarnessMode, PluginHarnessDescriptor, Project, ProjectAvailability, TokenUsage, ToolCallActivity } from "../../shared/types";
import { parseStudioArtifactEditPayload } from "../../shared/studio-artifact-edit";
import { applySequencedAgentEvent, conversationUsage, reconcileTerminalAssistant } from "../../shared/agent-event-reducer";
import { commandHelp, parseChatCommand } from "../../shared/chat-commands";
import { artifactHtml, artifactTitle, createArtifact, deleteArtifact, discardArtifactChanges, isSiteContent } from "./artifact-model";
import type { AgentDefinition } from "./agents/types";
import { AppsView } from "./capabilities/AppsView";
import { AttachmentBadge } from "./chat/AttachmentBadge";
import { Composer } from "./chat/Composer";
import { extractHtml, legacyFileAttachments, messageCopyWithoutArtifactSource, messageCopyWithoutStudioEdit } from "./chat/message-content";
import { ToolActivityGroup } from "./chat/ToolActivityGroup";
import { toolOptions } from "./chat/tool-options";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { createId, titleFromPrompt } from "./shared/text";
import { StudioWorkspace, type StudioAgentStatus } from "./studio/StudioWorkspace";
import { applyStudioArtifactEdit, parseStudioArtifactEdit, studioAgentPrompt, type StudioArtifactEdit } from "./studio/studio-agent-edit";
import { AccountDialog, SettingsDialog } from "./settings/SettingsDialogs";
import { applyDocumentTheme } from "./theme/document-theme";
import { Logo } from "./ui/Logo";
import { ModelIcon } from "./ui/ModelIcon";
import { Badge } from "./ui/primitives";
import { ToggleSwitch } from "./ui/ToggleSwitch";

const starterPrompts = [
  { label: "Plan my week", prompt: "Help me plan a realistic week around my priorities. Ask me what you need to know first." },
  { label: "Make a document", prompt: "Create a polished one-page HTML document for an idea I have. Ask me about the audience and purpose." },
  { label: "Research something", prompt: "Help me research a topic and turn the findings into a clear, practical brief." },
  { label: "Automate a task", prompt: "Help me automate a repetitive task on my computer. Start by understanding the exact workflow." },
];

type AppMode = "chat" | "agent" | "studio";
type AppView = "welcome" | "project" | "artifacts" | "apps";

type CommandGroup = "Actions" | "Navigate" | "Chats" | "Projects" | "Artifacts";

interface CommandPaletteItem {
  id: string;
  group: CommandGroup;
  label: string;
  detail: string;
  keywords: string;
  icon: React.JSX.Element;
  action: () => void;
}

interface GeneratedArtifact {
  id: string;
  title: string;
  html: string;
  createdAt: string;
  runId?: string;
  conversationId?: string;
  conversationTitle: string;
}

interface ArtifactDraftState {
  projectId: string | null;
  drafts: ArtifactDraft[];
  hydrated: boolean;
}

interface RunTarget {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
}

interface StudioEditTarget {
  projectId: string;
  artifactId: string;
}

interface PendingRunLaunch {
  cancelRequested: boolean;
  startSent: boolean;
  startResult: Promise<void> | null;
  settled: Promise<void>;
  resolveSettled: () => void;
}

function artifactEditActivity(runId: string, artifact: ArtifactDraft, edit: StudioArtifactEdit): ToolCallActivity {
  const files = Object.keys(edit.files ?? {});
  const componentIds = edit.componentPatches?.map((patch) => patch.id) ?? [];
  const changes = files.length + componentIds.length + (edit.visual ? 1 : 0) + (edit.html !== undefined ? 1 : 0) + (edit.title ? 1 : 0);
  return {
    id: `artifact-edit-${runId}`,
    tool: "artifact_edit",
    title: `Updated ${artifact.title}`,
    result: JSON.stringify({
      artifactId: artifact.id,
      files,
      componentIds,
      visualDocument: Boolean(edit.visual),
      previewHtml: edit.html !== undefined,
      title: edit.title,
    }),
    metadata: {
      artifactId: artifact.id,
      artifactTitle: artifact.title,
      path: files[0],
      changeCount: Math.max(changes, 1),
    },
    status: "complete",
  };
}

type ArtifactSaveState = "loading" | "saved" | "dirty" | "saving" | "error";

interface LegacyStoredArtifactDraft {
  id: string;
  title?: string;
  html: string;
  baselineHtml: string;
  createdAt: string;
  updatedAt: string;
  sourceRunId?: string;
  sourceMessageId?: string;
  sourceConversationId?: string;
  sourceConversationTitle?: string;
}

interface StoredArtifactDrafts {
  version: 1;
  drafts: LegacyStoredArtifactDraft[];
}

const artifactDraftStoragePrefix = "khadim.artifact-drafts.v1";

function artifactDraftStorageKey(workspace: string): string {
  return `${artifactDraftStoragePrefix}:${encodeURIComponent(workspace.trim())}`;
}

function loadLegacyArtifactDrafts(workspace: string): LegacyStoredArtifactDraft[] {
  try {
    const raw = localStorage.getItem(artifactDraftStorageKey(workspace));
    if (!raw) return [];
    const stored = JSON.parse(raw) as StoredArtifactDrafts;
    return stored.version === 1 && Array.isArray(stored.drafts) ? stored.drafts : [];
  } catch {
    return [];
  }
}

const defaultAgent: AgentDefinition = {
  id: "everyday",
  name: "Everyday",
  type: "agent",
  color: "coral",
  description: "A practical generalist for writing, planning, research, and everyday work.",
  prompt: "You are an approachable personal AI assistant. Be practical, clear, and proactive.",
  connectors: ["web", "files"],
  builtIn: true,
};

const agentStorageKey = "khadim.agents.v1";

function loadAgents(): AgentDefinition[] {
  try {
    const stored = JSON.parse(localStorage.getItem(agentStorageKey) ?? "[]") as AgentDefinition[];
    const customAgents = stored.filter((agent) => agent.id !== defaultAgent.id && agent.type === "agent" && agent.name && agent.prompt);
    return [defaultAgent, ...customAgents];
  } catch {
    return [defaultAgent];
  }
}

function CommandPalette({ items, inputRef, shortcut, compact }: {
  items: CommandPaletteItem[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  shortcut: string;
  compact: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const matchingItems = items.filter((item) => !normalizedQuery || `${item.label} ${item.detail} ${item.keywords}`.toLowerCase().includes(normalizedQuery));
  const visibleItems = (normalizedQuery ? matchingItems : matchingItems.slice(0, 16)).slice(0, 20);
  const groups = Array.from(new Set(visibleItems.map((item) => item.group)));

  useEffect(() => setActiveIndex(0), [query]);
  useEffect(() => {
    if (activeIndex < visibleItems.length) return;
    setActiveIndex(Math.max(0, visibleItems.length - 1));
  }, [activeIndex, visibleItems.length]);
  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);

  function selectItem(item: CommandPaletteItem): void {
    item.action();
    setQuery("");
    setOpen(false);
    if (compact) inputRef.current?.blur();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      if (visibleItems.length === 0) return;
      setActiveIndex((current) => event.key === "ArrowDown"
        ? (current + 1) % visibleItems.length
        : (current - 1 + visibleItems.length) % visibleItems.length);
      return;
    }
    if (event.key === "Enter" && open && visibleItems[activeIndex]) {
      event.preventDefault();
      selectItem(visibleItems[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
      if (compact) inputRef.current?.blur();
    }
  }

  return (
    <div className="command-center" ref={rootRef}>
      <label className="command-search">
        <Search size={16} />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={compact ? "Search" : "Search or run a command"}
          aria-label="Search or run a command"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? "command-palette-results" : undefined}
          aria-activedescendant={open && visibleItems[activeIndex] ? `command-${visibleItems[activeIndex].id}` : undefined}
        />
        <kbd>{shortcut}</kbd>
      </label>
      {open && (
        <div className="command-palette" id="command-palette-results" role="listbox" aria-label="Commands">
          {groups.map((group) => (
            <section key={group} role="group" aria-label={group}>
              <span className="command-group-label">{group}</span>
              {visibleItems.map((item, index) => item.group === group && (
                <button
                  id={`command-${item.id}`}
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "active" : ""}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectItem(item)}
                >
                  {item.icon}
                  <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                </button>
              ))}
            </section>
          ))}
          {visibleItems.length === 0 && <p className="command-empty" role="status">No commands or saved work match “{query.trim()}”.</p>}
          <footer><span><kbd>↑↓</kbd> Move</span><span><kbd>↵</kbd> Open</span><span><kbd>Esc</kbd> Close</span></footer>
        </div>
      )}
    </div>
  );
}

function App(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectAvailability, setProjectAvailability] = useState<Record<string, ProjectAvailability>>({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projectConversations, setProjectConversations] = useState<Record<string, Conversation[]>>({});
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set());
  const [loadingProjectIds, setLoadingProjectIds] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(() => window.matchMedia("(max-width: 841px)").matches);
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia("(max-width: 841px)").matches);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsIntent, setSettingsIntent] = useState<{ section: "appearance" | "model" | "workspace"; provider?: string } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [artifactDraftState, setArtifactDraftState] = useState<ArtifactDraftState>({ projectId: null, drafts: [], hydrated: false });
  const [artifactSaveState, setArtifactSaveState] = useState<ArtifactSaveState>("loading");
  const [studioArtifact, setStudioArtifact] = useState<ArtifactDraft | null>(null);
  const [studioChatWidth, setStudioChatWidth] = useState(520);
  const [studioAgentStatus, setStudioAgentStatus] = useState<(StudioAgentStatus & { artifactId: string }) | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pluginHarnesses, setPluginHarnesses] = useState<PluginHarnessDescriptor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<AppMode>("chat");
  const [activeView, setActiveView] = useState<AppView>("welcome");
  const [agents, setAgents] = useState<AgentDefinition[]>(loadAgents);
  const [selectedAgentId, setSelectedAgentId] = useState("everyday");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [enabledTools, setEnabledTools] = useState<string[]>(() => toolOptions.filter((tool) => tool.defaultEnabled).map((tool) => tool.id));
  const [googleConnected, setGoogleConnected] = useState(false);
  const [systemPromptOverride, setSystemPromptOverride] = useState<string | null>(null);
  const runIdRef = useRef<string | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);
  const conversationCacheRef = useRef(new Map<string, Conversation>());
  const artifactCacheRef = useRef(new Map<string, ArtifactDraft[]>());
  const runTargetsRef = useRef(new Map<string, RunTarget>());
  const usageCallRef = useRef(new Map<string, TokenUsage>());
  const pendingLiveEventsRef = useRef(new Map<string, AgentEventEnvelope[]>());
  const conversationSaveTimersRef = useRef(new Map<string, number>());
  const terminalSavePromisesRef = useRef(new Map<string, Promise<void>>());
  const pendingRunLaunchesRef = useRef(new Map<string, PendingRunLaunch>());
  const pendingStudioEditRunsRef = useRef(new Map<string, StudioEditTarget>());
  const appliedStudioEditRunsRef = useRef(new Set<string>());
  const pendingConversationSelectionRef = useRef<{ projectId: string; conversationId: string } | null>(null);
  const finalizedRunIdsRef = useRef(new Set<string>());
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const studioWorkspaceRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const keepChatRef = useRef<HTMLButtonElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const followLatestMessageRef = useRef(true);
  const artifactSaveRequestRef = useRef(0);
  const skipNextArtifactSaveRef = useRef(false);

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? defaultAgent;
  const selectedModel = settings?.models.find((model) => model.isActive);
  const visibleConversations = conversations;
  const isMac = window.khadim.platform === "darwin";
  const platformClass = isMac
    ? "platform-darwin"
    : window.khadim.platform === "linux"
      ? "platform-linux"
      : "platform-other";
  const commandShortcut = isMac ? "⌘ K" : "Ctrl K";
  const newChatShortcut = isMac ? "⌘ N" : "Ctrl N";

  useEffect(() => {
    localStorage.setItem(agentStorageKey, JSON.stringify(agents.filter((agent) => !agent.builtIn)));
  }, [agents]);

  useEffect(() => {
    if (!activeProjectId) return;
    setExpandedProjectIds((current) => current.has(activeProjectId) ? current : new Set([...current, activeProjectId]));
  }, [activeProjectId]);

  useEffect(() => {
    if (!activeProjectId || conversations.some((conversation) => conversation.projectId !== activeProjectId)) return;
    setProjectConversations((current) => ({ ...current, [activeProjectId]: conversations }));
  }, [activeProjectId, conversations]);

  useEffect(() => {
    Promise.all([window.khadim.projects.list(), window.khadim.settings.get()])
      .then(([savedProjects, savedSettings]) => {
        setProjects(savedProjects);
        setSettings(savedSettings);
        setActiveProjectId(savedSettings.activeProjectId || savedProjects[0]?.id || null);
        void refreshProjectAvailability(savedProjects);
        void window.khadim.auth.codexConnected().then((connected) => {
          if (!connected) return;
          void window.khadim.models.syncCodex(false).then(setSettings).catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : String(cause));
            void window.khadim.settings.get().then(setSettings);
          });
        });
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  useEffect(() => {
    const refresh = () => void window.khadim.plugins?.harnesses().then(setPluginHarnesses).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Plugin harnesses could not be loaded.");
    });
    refresh();
    window.addEventListener("khadim:plugins-changed", refresh);
    return () => window.removeEventListener("khadim:plugins-changed", refresh);
  }, []);

  useEffect(() => {
    const compactWindow = window.matchMedia("(max-width: 841px)");
    const closeOnCompact = (event: MediaQueryListEvent) => {
      setIsCompact(event.matches);
      if (event.matches) setSidebarOpen(false);
    };
    compactWindow.addEventListener("change", closeOnCompact);
    return () => compactWindow.removeEventListener("change", closeOnCompact);
  }, []);

  useEffect(() => {
    const projectId = activeProjectId;
    const workspace = activeProject?.rootPath;
    if (!projectId || !workspace) return;
    let cancelled = false;
    artifactSaveRequestRef.current += 1;
    setSelectedId(null);
    setConversations([]);
    setArtifactDraftState({ projectId, drafts: [], hydrated: false });
    setArtifactSaveState("loading");
    setStudioArtifact(null);
    const recoveryPromise = window.khadim.agent.recover().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Active runs could not be recovered.");
      return [] as AgentRunRecoverySnapshot[];
    });
    void Promise.all([
      window.khadim.conversations.list(projectId),
      window.khadim.artifacts.list(projectId),
      recoveryPromise,
    ]).then(async ([savedConversations, savedDrafts, recoverySnapshots]) => {
      let drafts = savedDrafts;
      const legacyDrafts = savedDrafts.length === 0 ? loadLegacyArtifactDrafts(workspace) : [];
      if (legacyDrafts.length > 0) {
        drafts = legacyDrafts.map((draft) => ({
          id: draft.id,
          projectId,
          title: artifactTitle(draft.html, "Untitled artifact"),
          schemaVersion: 2 as const,
          kind: "site" as const,
          lifecycle: "draft" as const,
          content: { format: "html" as const, html: draft.html, baselineHtml: draft.baselineHtml },
          provenance: {
            origin: draft.sourceMessageId ? "agent" as const : "import" as const,
            runId: draft.sourceRunId,
            messageId: draft.sourceMessageId,
            conversationId: draft.sourceConversationId,
            conversationTitle: draft.sourceConversationTitle,
          },
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
        }));
        await window.khadim.artifacts.save(projectId, drafts);
        localStorage.removeItem(artifactDraftStorageKey(workspace));
      }
      if (cancelled) return;

      for (const snapshot of recoverySnapshots) {
        runTargetsRef.current.set(snapshot.runId, {
          projectId: snapshot.projectId,
          conversationId: snapshot.conversationId,
          assistantMessageId: snapshot.assistantMessageId,
        });
        const recoveredRun = savedConversations
          .find((conversation) => conversation.id === snapshot.conversationId)
          ?.runs?.find((run) => run.id === snapshot.runId);
        if (recoveredRun?.artifactId) {
          pendingStudioEditRunsRef.current.set(snapshot.runId, { projectId: snapshot.projectId, artifactId: recoveredRun.artifactId });
        }
      }

      const recoveredAt = new Date().toISOString();
      const projectSnapshots = recoverySnapshots.filter((snapshot) => snapshot.projectId === projectId);
      const snapshotsByConversation = new Map<string, AgentRunRecoverySnapshot[]>();
      for (const snapshot of projectSnapshots) {
        const current = snapshotsByConversation.get(snapshot.conversationId) ?? [];
        current.push(snapshot);
        snapshotsByConversation.set(snapshot.conversationId, current);
      }
      const recoverableRunIds = new Set<string>();
      const changedConversationIds = new Set<string>();
      const terminalSnapshots: AgentRunRecoverySnapshot[] = [];
      let recoveryWarning: string | null = null;

      let recoveredConversations = savedConversations.map((conversation) => {
        let updated = conversation;
        for (const snapshot of snapshotsByConversation.get(conversation.id) ?? []) {
          const run = updated.runs?.find((candidate) => candidate.id === snapshot.runId);
          const assistant = updated.messages.find((message) => message.id === snapshot.assistantMessageId && message.runId === snapshot.runId);
          if (!run || !assistant) {
            recoveryWarning = "A running task could not be matched to its saved chat. Its buffered output was kept for a later recovery.";
            continue;
          }
          recoverableRunIds.add(snapshot.runId);
          const orderedEvents = [...snapshot.events].sort((left, right) => left.sequence - right.sequence);
          const firstSequence = orderedEvents[0]?.sequence;
          if (snapshot.droppedEventCount > 0 && firstSequence && (run.lastEventSequence ?? 0) + 1 < firstSequence) {
            recoveryWarning = "Some early output from a running task could not be recovered, but the remaining output is shown.";
          }
          for (const sequenced of orderedEvents) {
            updated = applySequencedAgentEvent(
              updated,
              snapshot.runId,
              snapshot.assistantMessageId,
              sequenced.sequence,
              sequenced.event,
              usageCallRef.current,
            );
          }
          if (run.artifactId) {
            const editedSelectedArtifact = updated.messages
              .find((message) => message.id === snapshot.assistantMessageId)
              ?.toolCalls?.some((activity) => activity.tool === "artifact_edit" && activity.status === "complete" && activity.metadata?.artifactId === run.artifactId);
            if (editedSelectedArtifact) {
              updated = {
                ...updated,
                messages: updated.messages.map((message) => message.id === snapshot.assistantMessageId
                  ? { ...message, artifactIds: [...new Set([...(message.artifactIds ?? []), run.artifactId!])] }
                  : message),
              };
            }
          }
          if (snapshot.terminal) {
            updated = reconcileTerminalAssistant(
              updated,
              snapshot.runId,
              snapshot.assistantMessageId,
              recoveredAt,
            );
          }
          if (updated !== conversation) changedConversationIds.add(conversation.id);
          if (snapshot.terminal) terminalSnapshots.push(snapshot);
        }
        return updated;
      });

      const interruptedConversationIds = new Set<string>();
      recoveredConversations = recoveredConversations.map((conversation) => {
        const interruptedMessages = conversation.messages.filter((message) => message.status === "streaming" && (!message.runId || !recoverableRunIds.has(message.runId)));
        const interruptedRunIds = new Set(interruptedMessages.flatMap((message) => message.runId ? [message.runId] : []));
        if (interruptedMessages.length === 0) return conversation;
        interruptedConversationIds.add(conversation.id);
        changedConversationIds.add(conversation.id);
        return {
          ...conversation,
          updatedAt: recoveredAt,
          messages: conversation.messages.map((message) => interruptedMessages.some((candidate) => candidate.id === message.id)
            ? { ...message, status: "error" as const, content: message.content || "This run was interrupted when Khadim closed." }
            : message),
          runs: conversation.runs?.map((run) => interruptedRunIds.has(run.id) && run.status === "running"
            ? { ...run, status: "error" as const, completedAt: recoveredAt }
          : run),
        };
      });

      const sourceMessageIds = new Set(drafts.flatMap((artifact) => artifact.provenance?.messageId ? [artifact.provenance.messageId] : []));
      const storedArtifactIds = new Set(drafts.map((artifact) => artifact.id));
      const recoveredArtifacts = recoveredConversations.flatMap((conversation) => conversation.messages.flatMap((message): ArtifactDraft[] => {
        if (message.role !== "assistant" || message.status === "error" || sourceMessageIds.has(message.id) || storedArtifactIds.has(`artifact-${message.id}`)) return [];
        const html = extractHtml(message.content);
        if (!html) return [];
        return [{
          id: `artifact-${message.id}`,
          projectId,
          title: artifactTitle(html, conversation.title),
          schemaVersion: 2,
          kind: "site",
          lifecycle: "ready",
          content: { format: "html", html, baselineHtml: html },
          provenance: {
            origin: "agent",
            runId: message.runId,
            messageId: message.id,
            conversationId: conversation.id,
            conversationTitle: conversation.title,
          },
          createdAt: message.createdAt,
          updatedAt: message.createdAt,
        }];
      }));
      if (recoveredArtifacts.length > 0) {
        drafts = [...recoveredArtifacts, ...drafts];
        await window.khadim.artifacts.save(projectId, drafts);
      }
      const nextCache = new Map(conversationCacheRef.current);
      for (const [conversationId, conversation] of nextCache) {
        if (conversation.projectId === projectId) nextCache.delete(conversationId);
      }
      for (const conversation of recoveredConversations) nextCache.set(conversation.id, conversation);
      conversationCacheRef.current = nextCache;
      artifactCacheRef.current.set(projectId, drafts);
      setConversations(recoveredConversations);
      setProjectConversations((current) => ({ ...current, [projectId]: recoveredConversations }));
      const pendingSelection = pendingConversationSelectionRef.current;
      if (pendingSelection?.projectId === projectId) {
        pendingConversationSelectionRef.current = null;
        if (recoveredConversations.some((conversation) => conversation.id === pendingSelection.conversationId)) {
          setActiveView("welcome");
          setSelectedId(pendingSelection.conversationId);
        } else {
          setError("That chat is no longer available in this project.");
        }
      }
      skipNextArtifactSaveRef.current = true;
      setArtifactDraftState({ projectId, drafts, hydrated: true });
      setArtifactSaveState("saved");

      const activeSnapshot = recoverySnapshots.find((snapshot) => !snapshot.terminal);
      if (activeSnapshot) {
        runIdRef.current = activeSnapshot.runId;
        setActiveRunId(activeSnapshot.runId);
      }

      const pendingRunIds = new Set(projectSnapshots.map((snapshot) => snapshot.runId));
      for (const runId of pendingRunIds) {
        const pending = pendingLiveEventsRef.current.get(runId);
        if (!pending) continue;
        pendingLiveEventsRef.current.delete(runId);
        for (const envelope of [...pending].sort((left, right) => left.sequence - right.sequence)) {
          processAgentEnvelope(envelope);
        }
      }

      const conversationsToSave = recoveredConversations
        .filter((conversation) => changedConversationIds.has(conversation.id))
        .map((conversation) => conversationCacheRef.current.get(conversation.id) ?? conversation);
      const saveResults = await Promise.allSettled(conversationsToSave.map((conversation) => window.khadim.conversations.save(conversation)));
      if (saveResults.some((result) => result.status === "rejected")) {
        setError("Recovered chat output is visible, but it could not be saved yet.");
      }

      for (const snapshot of terminalSnapshots) {
        const conversation = conversationCacheRef.current.get(snapshot.conversationId);
        const persisted = !changedConversationIds.has(snapshot.conversationId)
          || saveResults[conversationsToSave.findIndex((candidate) => candidate.id === snapshot.conversationId)]?.status === "fulfilled";
        if (!conversation || !persisted) continue;
        void window.khadim.agent.acknowledge(snapshot.runId).then(() => {
          rememberFinalizedRun(snapshot.runId);
          runTargetsRef.current.delete(snapshot.runId);
          usageCallRef.current.delete(snapshot.runId);
        }).catch(() => setError("The finished run was saved, but its recovery record could not be cleared."));
      }
      if (recoveryWarning) setError(recoveryWarning);
    }).catch((cause: unknown) => {
      if (cancelled) return;
      skipNextArtifactSaveRef.current = true;
      setArtifactDraftState({ projectId, drafts: [], hydrated: true });
      setArtifactSaveState("error");
      setError(cause instanceof Error ? cause.message : "This project could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [activeProjectId, activeProject?.rootPath]);

  useEffect(() => {
    if (!artifactDraftState.projectId || !artifactDraftState.hydrated) return;
    if (skipNextArtifactSaveRef.current) {
      skipNextArtifactSaveRef.current = false;
      return;
    }
    const requestId = ++artifactSaveRequestRef.current;
    const timeout = window.setTimeout(() => {
      setArtifactSaveState("saving");
      void window.khadim.artifacts.save(artifactDraftState.projectId!, artifactDraftState.drafts)
        .then(() => {
          if (artifactSaveRequestRef.current === requestId) setArtifactSaveState("saved");
        })
        .catch((cause: unknown) => {
          if (artifactSaveRequestRef.current !== requestId) return;
          setArtifactSaveState("error");
          setError(cause instanceof Error ? cause.message : "Artifact changes could not be saved.");
        });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [artifactDraftState]);

  useEffect(() => {
    if (!settings) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      applyDocumentTheme(settings.theme, settings.customThemes, media.matches);
    };
    applyTheme();
    if (settings.theme !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (studioArtifact || settingsOpen || accountOpen) return;
      if (event.key === "Escape" && pendingDeleteId) {
        event.preventDefault();
        setPendingDeleteId(null);
        return;
      }
      if (event.key === "Escape" && isCompact && sidebarOpen) {
        event.preventDefault();
        setSidebarOpen(false);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [studioArtifact, settingsOpen, accountOpen, pendingDeleteId, isCompact, sidebarOpen]);

  useEffect(() => {
    if (!pendingDeleteId) return;
    const timeout = window.setTimeout(() => keepChatRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [pendingDeleteId]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  useEffect(() => {
    let active = true;
    const applyConnection = (connection: GoogleConnection) => {
      if (!active) return;
      setGoogleConnected(connection.connected);
      setEnabledTools((current) => connection.connected
        ? current.includes("apps") ? current : [...current, "apps"]
        : current.filter((id) => id !== "apps"));
    };
    const onConnectionChanged = (event: Event) => {
      applyConnection((event as CustomEvent<GoogleConnection>).detail);
    };
    void window.khadim.google.get().then(applyConnection).catch(() => undefined);
    window.addEventListener("khadim:google-connection-changed", onConnectionChanged);
    return () => {
      active = false;
      window.removeEventListener("khadim:google-connection-changed", onConnectionChanged);
    };
  }, []);

  useEffect(() => {
    const lastRun = selected?.runs?.at(-1);
    const lastAgentId = lastRun?.agent.id;
    if (lastAgentId && agents.some((agent) => agent.id === lastAgentId)) {
      setSelectedAgentId(lastAgentId);
    }
    if (lastRun) {
      const knownTools = lastRun.enabledTools.filter((id) => toolOptions.some((tool) => tool.id === id));
      setEnabledTools(knownTools);
    }
  }, [agents, selectedId, selected?.runs]);

  useEffect(() => {
    runIdRef.current = activeRunId;
  }, [activeRunId]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !selected) return;
    followLatestMessageRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId]);

  const latestMessage = selected?.messages.at(-1);
  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !followLatestMessageRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [latestMessage?.content, latestMessage?.toolCalls?.length, selected?.messages.length]);

  function clearScheduledConversationSave(conversationId: string): void {
    const timeout = conversationSaveTimersRef.current.get(conversationId);
    if (timeout === undefined) return;
    window.clearTimeout(timeout);
    conversationSaveTimersRef.current.delete(conversationId);
  }

  function scheduleConversationSave(conversationId: string): void {
    if (conversationSaveTimersRef.current.has(conversationId)) return;
    const timeout = window.setTimeout(() => {
      conversationSaveTimersRef.current.delete(conversationId);
      const latest = conversationCacheRef.current.get(conversationId);
      if (!latest) return;
      void window.khadim.conversations.save(latest).catch(() => {
        setError("The latest chat output is visible, but it could not be saved yet.");
      });
    }, 300);
    conversationSaveTimersRef.current.set(conversationId, timeout);
  }

  function queueLiveEnvelope(envelope: AgentEventEnvelope): void {
    const current = pendingLiveEventsRef.current.get(envelope.runId) ?? [];
    if (current.some((candidate) => candidate.sequence === envelope.sequence)) return;
    pendingLiveEventsRef.current.set(envelope.runId, [...current.slice(-499), envelope]);
  }

  function rememberFinalizedRun(runId: string): void {
    const finalized = finalizedRunIdsRef.current;
    finalized.delete(runId);
    finalized.add(runId);
    while (finalized.size > 256) {
      const oldest = finalized.values().next().value as string | undefined;
      if (!oldest) break;
      finalized.delete(oldest);
    }
  }

  function processAgentEnvelope(envelope: AgentEventEnvelope): void {
    const { runId, event } = envelope;
    const target = runTargetsRef.current.get(runId);
    if (!target) {
      if (finalizedRunIdsRef.current.has(runId)) return;
      queueLiveEnvelope(envelope);
      return;
    }
    const studioTarget = pendingStudioEditRunsRef.current.get(runId);
    const cached = conversationCacheRef.current.get(target.conversationId);
    if (!cached) {
      queueLiveEnvelope(envelope);
      return;
    }

    let updated = applySequencedAgentEvent(
      cached,
      runId,
      target.assistantMessageId,
      envelope.sequence,
      event,
      usageCallRef.current,
    );
    if (updated === cached) return;

    const streamedAssistant = updated.messages.find((message) => message.id === target.assistantMessageId);
    if (streamedAssistant && studioTarget && !appliedStudioEditRunsRef.current.has(runId)) {
      const toolStudioEdit = event.event_type === "step_complete"
        && event.metadata?.tool === "artifact_edit"
        && event.metadata.artifactId === studioTarget.artifactId
        ? parseStudioArtifactEditPayload(event.metadata.artifactEdit)
        : null;
      const studioEdit = toolStudioEdit ?? parseStudioArtifactEdit(streamedAssistant.content);
      const currentArtifacts = artifactCacheRef.current.get(studioTarget.projectId) ?? [];
      const sourceArtifact = currentArtifacts.find((artifact) => artifact.id === studioTarget.artifactId);
      if (studioEdit && sourceArtifact) {
        const editedArtifact = applyStudioArtifactEdit(sourceArtifact, studioEdit, new Date().toISOString());
        const nextArtifacts = currentArtifacts.map((artifact) => artifact.id === editedArtifact.id ? editedArtifact : artifact);
        artifactCacheRef.current.set(studioTarget.projectId, nextArtifacts);
        appliedStudioEditRunsRef.current.add(runId);
        if (activeProjectIdRef.current === studioTarget.projectId) {
          setArtifactDraftState((current) => current.projectId === studioTarget.projectId ? { ...current, drafts: nextArtifacts } : current);
          setStudioArtifact((current) => current?.id === editedArtifact.id ? editedArtifact : current);
        }
        void window.khadim.artifacts.save(studioTarget.projectId, nextArtifacts).catch(() => {
          setError("The agent edit was applied, but it could not be saved yet.");
        });
        setStudioAgentStatus({
          artifactId: editedArtifact.id,
          phase: event.event_type === "done" ? "complete" : "running",
          message: event.event_type === "done" ? "Change applied to the selected component." : "Change applied. Finishing the response…",
        });
        updated = {
          ...updated,
          messages: updated.messages.map((message) => message.id === streamedAssistant.id
            ? {
                ...message,
                content: toolStudioEdit ? message.content : message.content.replace(/<artifact-edit>[\s\S]*?<\/artifact-edit>/i, "").trimEnd(),
                artifactIds: [...new Set([...(message.artifactIds ?? []), editedArtifact.id])],
                toolCalls: toolStudioEdit ? message.toolCalls : [...(message.toolCalls ?? []), artifactEditActivity(runId, editedArtifact, studioEdit)],
              }
            : message),
        };
      }
    }

    if (event.event_type === "done") {
      const assistant = updated.messages.find((message) => message.id === target.assistantMessageId);
      if (assistant && studioTarget && appliedStudioEditRunsRef.current.has(runId)) {
        const readable = assistant.content.replace(/<artifact-edit>[\s\S]*?<\/artifact-edit>/i, "").trim() || "Updated the Studio artifact.";
        updated = {
          ...updated,
          messages: updated.messages.map((message) => message.id === assistant.id ? { ...message, content: readable } : message),
        };
        setStudioAgentStatus({ artifactId: studioTarget.artifactId, phase: "complete", message: "Change applied to the selected component." });
      } else if (assistant && studioTarget) {
        const currentArtifacts = artifactCacheRef.current.get(studioTarget.projectId) ?? [];
        const sourceArtifact = currentArtifacts.find((artifact) => artifact.id === studioTarget.artifactId);
        const message = sourceArtifact
          ? "The agent finished without returning a valid Studio edit."
          : "The artifact changed location before the agent edit could be applied.";
        setError(message);
        setStudioAgentStatus({ artifactId: studioTarget.artifactId, phase: "error", message: sourceArtifact ? "The agent finished without a valid component edit. Try describing the change again." : "The artifact moved before the edit could be applied." });
      } else {
        const html = assistant ? extractHtml(assistant.content) : null;
        if (assistant && html) {
        const currentArtifacts = artifactCacheRef.current.get(target.projectId) ?? [];
        let artifact = currentArtifacts.find((item) => item.provenance?.messageId === assistant.id || item.id === `artifact-${assistant.id}`);
        if (!artifact) {
          artifact = {
            id: `artifact-${assistant.id}`,
            projectId: target.projectId,
            title: artifactTitle(html, updated.title),
            schemaVersion: 2,
            kind: "site",
            lifecycle: "ready",
            content: { format: "html", html, baselineHtml: html },
            provenance: {
              origin: "agent",
              runId,
              messageId: assistant.id,
              conversationId: updated.id,
              conversationTitle: updated.title,
            },
            createdAt: assistant.createdAt,
            updatedAt: assistant.createdAt,
          };
          const nextArtifacts = [artifact, ...currentArtifacts];
          artifactCacheRef.current.set(target.projectId, nextArtifacts);
          if (activeProjectIdRef.current === target.projectId) {
            setArtifactDraftState((current) => current.projectId === target.projectId ? { ...current, drafts: nextArtifacts } : current);
          }
          void window.khadim.artifacts.save(target.projectId, nextArtifacts).catch(() => {
            setError("The generated artifact is visible, but it could not be saved yet.");
          });
        }
        if (!assistant.artifactIds?.includes(artifact.id)) {
          updated = {
            ...updated,
            messages: updated.messages.map((message) => message.id === assistant.id
              ? { ...message, artifactIds: [...(message.artifactIds ?? []), artifact!.id] }
              : message),
          };
        }
        }
      }
    }

    if (event.event_type === "error" && studioTarget) {
      setStudioAgentStatus({ artifactId: studioTarget.artifactId, phase: "error", message: event.content?.trim() || "The agent couldn’t complete this edit." });
    }

    conversationCacheRef.current.set(updated.id, updated);
    if (activeProjectIdRef.current === target.projectId) {
      setConversations((current) => current.map((conversation) => conversation.id === updated.id ? updated : conversation));
    }

    const terminal = event.event_type === "done" || event.event_type === "error";
    if (!terminal) {
      scheduleConversationSave(updated.id);
      return;
    }

    clearScheduledConversationSave(updated.id);
    pendingStudioEditRunsRef.current.delete(runId);
    appliedStudioEditRunsRef.current.delete(runId);
    const finalization = window.khadim.conversations.save(updated).then(() => window.khadim.agent.acknowledge(runId)).then(() => {
      rememberFinalizedRun(runId);
      runTargetsRef.current.delete(runId);
      usageCallRef.current.delete(runId);
    }).catch((cause: unknown) => {
      setError("The finished run is visible, but its recovery state could not be saved.");
      throw cause;
    });
    terminalSavePromisesRef.current.set(runId, finalization);
    void finalization.catch(() => undefined).finally(() => {
      if (terminalSavePromisesRef.current.get(runId) === finalization) terminalSavePromisesRef.current.delete(runId);
    });
    if (runIdRef.current === runId) runIdRef.current = null;
    setActiveRunId((current) => current === runId ? null : current);
  }

  useEffect(() => {
    const unsubscribe = window.khadim.agent.onEvent(processAgentEnvelope);
    return () => {
      unsubscribe();
      for (const timeout of conversationSaveTimersRef.current.values()) window.clearTimeout(timeout);
      conversationSaveTimersRef.current.clear();
    };
  }, []);

  function newChat(): void {
    setActiveMode("chat");
    setActiveView("welcome");
    if (selectedId) setPrompt("");
    setSelectedId(null);
    setPendingDeleteId(null);
    setError(null);
    if (window.matchMedia("(max-width: 841px)").matches) setSidebarOpen(false);
    window.setTimeout(() => promptRef.current?.focus(), 0);
  }

  function goHome(): void {
    setActiveMode("chat");
    setActiveView(activeProjectId ? "project" : "welcome");
    setSelectedId(null);
    setPendingDeleteId(null);
    setError(null);
    if (window.matchMedia("(max-width: 841px)").matches) setSidebarOpen(false);
  }

  async function sendPrompt(value = prompt, visibleValue = value, attachments: ChatAttachment[] = [], studioEditTarget?: StudioEditTarget): Promise<boolean> {
    const content = value.trim();
    if (!content || runIdRef.current) return false;
    const command = parseChatCommand(content);
    if (command) return executeDesktopCommand(content, command.name, command.argument);
    if (!activeProjectId) {
      setError("Open a project before starting a chat.");
      return false;
    }
    if (projectAvailability[activeProjectId]?.available === false) {
      setError("Locate this project's folder before starting a chat.");
      return false;
    }
    if (!settings || !selectedModel) {
      setError("Configure an active model before starting a chat.");
      return false;
    }
    const visibleContent = visibleValue.trim() || "Review the attached files.";
    setError(null);
    const now = new Date().toISOString();
    const conversationId = selectedId ?? createId();
    const requestedRunId = createId();
    const userMessage: ChatMessage = { id: createId(), role: "user", content: visibleContent, createdAt: now, status: "complete", attachments };
    const assistantMessage: ChatMessage = { id: createId(), role: "assistant", content: "", createdAt: now, status: "streaming", runId: requestedRunId };
    const runSnapshot: AgentRun = {
      id: requestedRunId,
      projectId: activeProjectId,
      conversationId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      status: "running",
      createdAt: now,
      agent: { id: selectedAgent.id, name: selectedAgent.name, type: selectedAgent.type, systemPrompt: systemPromptOverride ?? selectedAgent.prompt },
      model: {
        id: selectedModel.id,
        name: selectedModel.name,
        provider: selectedModel.provider,
        model: selectedModel.model,
        baseUrl: selectedModel.baseUrl,
        temperature: selectedModel.temperature,
      },
      harness: settings.harness,
      enabledTools: [...enabledTools],
      ...(studioEditTarget ? { artifactId: studioEditTarget.artifactId } : {}),
    };
    const nextConversation: Conversation = selected ? {
      ...selected,
      messages: [...selected.messages, userMessage, assistantMessage],
      runs: [...(selected.runs ?? []), runSnapshot],
      updatedAt: now,
    } : {
      id: conversationId,
      projectId: activeProjectId,
      engineSessionKey: `electron.v1.${createId()}`,
      title: titleFromPrompt(visibleContent),
      createdAt: now,
      updatedAt: now,
      messages: [userMessage, assistantMessage],
      runs: [runSnapshot],
    };

    if (!selected) {
      setConversations((current) => [nextConversation, ...current]);
      setSelectedId(conversationId);
    } else {
      setConversations((current) => current.map((conversation) => conversation.id === conversationId
        ? nextConversation
        : conversation));
    }
    conversationCacheRef.current.set(conversationId, nextConversation);
    setPrompt("");
    runTargetsRef.current.set(requestedRunId, { projectId: activeProjectId, conversationId, assistantMessageId: assistantMessage.id });
    if (studioEditTarget) pendingStudioEditRunsRef.current.set(requestedRunId, studioEditTarget);
    runIdRef.current = requestedRunId;
    setActiveRunId(requestedRunId);
    let resolveLaunchSettled!: () => void;
    const pendingLaunch: PendingRunLaunch = {
      cancelRequested: false,
      startSent: false,
      startResult: null,
      settled: new Promise<void>((resolve) => { resolveLaunchSettled = resolve; }),
      resolveSettled: () => resolveLaunchSettled(),
    };
    pendingRunLaunchesRef.current.set(requestedRunId, pendingLaunch);

    try {
      await window.khadim.conversations.save(nextConversation);
      if (pendingLaunch.cancelRequested) {
        const completedAt = new Date().toISOString();
        const stopped: Conversation = {
          ...nextConversation,
          updatedAt: completedAt,
          messages: nextConversation.messages.map((item) => item.id === assistantMessage.id
            ? { ...item, content: "Run stopped.", status: "error" as const }
            : item),
          runs: nextConversation.runs?.map((run) => run.id === requestedRunId
            ? { ...run, status: "stopped" as const, completedAt }
            : run),
        };
        await window.khadim.conversations.save(stopped);
        conversationCacheRef.current.set(conversationId, stopped);
        if (activeProjectIdRef.current === activeProjectId) {
          setConversations((current) => current.map((conversation) => conversation.id === conversationId ? stopped : conversation));
        }
        rememberFinalizedRun(requestedRunId);
        runTargetsRef.current.delete(requestedRunId);
        pendingStudioEditRunsRef.current.delete(requestedRunId);
        usageCallRef.current.delete(requestedRunId);
        pendingLiveEventsRef.current.delete(requestedRunId);
        runIdRef.current = null;
        setActiveRunId((current) => current === requestedRunId ? null : current);
        return false;
      }
      pendingLaunch.startSent = true;
      const startResult = window.khadim.agent.start({
        runId: requestedRunId,
        projectId: activeProjectId,
        conversationId,
        assistantMessageId: assistantMessage.id,
        engineSessionKey: nextConversation.engineSessionKey,
        ...(studioEditTarget ? { artifactId: studioEditTarget.artifactId } : {}),
        prompt: content,
        systemPrompt: systemPromptOverride ?? selectedAgent.prompt,
        enabledTools,
      });
      pendingLaunch.startResult = startResult.then(() => undefined, () => undefined);
      await startResult;
    } catch (cause) {
      runIdRef.current = null;
      runTargetsRef.current.delete(requestedRunId);
      pendingStudioEditRunsRef.current.delete(requestedRunId);
      usageCallRef.current.delete(requestedRunId);
      setActiveRunId(null);
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      const failed: Conversation = {
        ...nextConversation,
        messages: nextConversation.messages.map((item) => item.id === assistantMessage.id
          ? { ...item, content: message, status: "error" as const }
          : item),
        runs: nextConversation.runs?.map((run) => run.id === requestedRunId
          ? { ...run, status: "error" as const, completedAt: new Date().toISOString() }
          : run),
      };
      conversationCacheRef.current.set(conversationId, failed);
      if (activeProjectIdRef.current === activeProjectId) {
        setConversations((current) => current.map((conversation) => conversation.id === conversationId ? failed : conversation));
      }
      await window.khadim.conversations.save(failed).catch(() => undefined);
      return false;
    } finally {
      if (pendingRunLaunchesRef.current.get(requestedRunId) === pendingLaunch) {
        pendingRunLaunchesRef.current.delete(requestedRunId);
      }
      pendingLaunch.resolveSettled();
    }
    return true;
  }

  async function appendCommandResponse(command: string, response: string): Promise<boolean> {
    if (!activeProjectId) return false;
    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: createId(), role: "user", content: command, createdAt: now, status: "complete" };
    const assistantMessage: ChatMessage = { id: createId(), role: "assistant", content: response, createdAt: now, status: "complete" };
    const conversation: Conversation = selected ? {
      ...selected,
      updatedAt: now,
      messages: [...selected.messages, userMessage, assistantMessage],
    } : {
      id: createId(),
      projectId: activeProjectId,
      engineSessionKey: `electron.v1.${createId()}`,
      title: command,
      createdAt: now,
      updatedAt: now,
      messages: [userMessage, assistantMessage],
      runs: [],
    };
    await window.khadim.conversations.save(conversation);
    conversationCacheRef.current.set(conversation.id, conversation);
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    setSelectedId(conversation.id);
    setActiveView("welcome");
    setPrompt("");
    return true;
  }

  async function executeDesktopCommand(raw: string, name: string, argument: string): Promise<boolean> {
    if (name === "new" || name === "reset") {
      newChat();
      return true;
    }
    if (name === "help") return appendCommandResponse(raw, commandHelp());
    if (name === "settings" || name === "login") {
      setSettingsIntent(name === "login"
        ? { section: "model", provider: argument === "codex" || argument === "openai-codex" ? "openai-codex" : undefined }
        : null);
      setSettingsOpen(true);
      setPrompt("");
      return true;
    }
    if (name === "model") {
      if (!settings) return false;
      if (!argument) return appendCommandResponse(raw, settings.models.map((model) => `- **${model.name}** (${model.id})${model.isActive ? " · active" : ""}`).join("\n") || "No models configured.");
      const normalized = argument.toLowerCase();
      const model = settings.models.find((candidate) => [candidate.id, candidate.name, candidate.model].some((value) => value.toLowerCase() === normalized));
      if (!model) return appendCommandResponse(raw, "Model not found. Use `/model` to list configured models.");
      await updateQuickSettings({ modelId: model.id });
      return appendCommandResponse(raw, `Now using **${model.name}** (${model.provider}/${model.model}).`);
    }
    if (name === "provider" || name === "providers") {
      if (!settings) return false;
      const providers = [...new Set(settings.models.map((model) => model.provider))];
      if (!argument || name === "providers") return appendCommandResponse(raw, providers.map((provider) => `- ${provider}`).join("\n") || "No providers configured.");
      const model = settings.models.find((candidate) => candidate.provider.toLowerCase() === argument.toLowerCase());
      if (!model) return appendCommandResponse(raw, "That provider has no configured model.");
      await updateQuickSettings({ modelId: model.id });
      return appendCommandResponse(raw, `Now using **${model.name}** from ${model.provider}.`);
    }
    if (name === "harness") {
      if (!argument) return appendCommandResponse(raw, `Current capability: **${settings?.harness ?? "assistant"}**.`);
      if (argument !== "assistant" && argument !== "rpa") return appendCommandResponse(raw, "Capability must be `assistant` or `rpa`.");
      await updateQuickSettings({ harness: argument });
      return appendCommandResponse(raw, `Now using the **${argument}** capability.`);
    }
    if (name === "system") {
      if (!argument) return appendCommandResponse(raw, systemPromptOverride ?? selectedAgent.prompt);
      setSystemPromptOverride(argument);
      return appendCommandResponse(raw, "Updated the system prompt for future runs in this app session.");
    }
    if (name === "sessions") return appendCommandResponse(raw, conversations.slice(0, 30).map((conversation) => `- ${conversation.title} (${conversation.messages.length} messages)`).join("\n") || "No saved chats.");
    if (name === "session") {
      if (!argument) return appendCommandResponse(raw, selected ? `Current chat: **${selected.title}**` : "No chat is selected.");
      const target = conversations.find((conversation) => conversation.id === argument || conversation.title.toLowerCase() === argument.toLowerCase());
      if (!target) return appendCommandResponse(raw, "Chat not found. Use `/sessions` to list chats.");
      setSelectedId(target.id);
      setPrompt("");
      return true;
    }
    if (name === "save") {
      if (!selected || !argument) return appendCommandResponse(raw, "Usage: `/save <name>` in an existing chat.");
      const renamed = { ...selected, title: argument.slice(0, 120), updatedAt: new Date().toISOString() };
      await window.khadim.conversations.save(renamed);
      conversationCacheRef.current.set(renamed.id, renamed);
      setConversations((current) => current.map((item) => item.id === renamed.id ? renamed : item));
      setPrompt("");
      return true;
    }
    if (name === "delete") {
      const target = conversations.find((conversation) => conversation.id === argument || conversation.title.toLowerCase() === argument.toLowerCase());
      if (!target) return appendCommandResponse(raw, "Chat not found. Usage: `/delete <name>`.");
      await deleteConversation(target.id);
      setPrompt("");
      return true;
    }
    if (name === "rename") {
      const [oldName, ...newParts] = argument.split(/\s+/);
      const target = conversations.find((conversation) => conversation.id === oldName || conversation.title.toLowerCase() === oldName?.toLowerCase());
      if (!target || newParts.length === 0) return appendCommandResponse(raw, "Usage: `/rename <old> <new>`. Use chat IDs when a name contains spaces.");
      const renamed = { ...target, title: newParts.join(" ").slice(0, 120), updatedAt: new Date().toISOString() };
      await window.khadim.conversations.save(renamed);
      conversationCacheRef.current.set(renamed.id, renamed);
      setConversations((current) => current.map((item) => item.id === renamed.id ? renamed : item));
      setPrompt("");
      return true;
    }
    if (name === "tokens") {
      const usage = conversationUsage(selected);
      return appendCommandResponse(raw, `Input: **${usage.input}** · Output: **${usage.output}** · Cache read: **${usage.cacheRead}** · Cache write: **${usage.cacheWrite}**`);
    }
    if (name === "history") return appendCommandResponse(raw, selected?.messages.filter((message) => message.role === "user").slice(-20).map((message) => `- ${message.content.slice(0, 180)}`).join("\n") || "No prompt history in this chat.");
    if (name === "copy") {
      const content = selected?.messages.filter((message) => message.role === "assistant" && message.content).at(-1)?.content;
      if (!content) return appendCommandResponse(raw, "There is no assistant response to copy.");
      await navigator.clipboard.writeText(content);
      return appendCommandResponse(raw, "Copied the last assistant response.");
    }
    if (name === "config") return appendCommandResponse(raw, `Project: **${activeProject?.name ?? "None"}**\nModel: **${selectedModel?.name ?? "None"}**\nCapability: **${settings?.harness ?? "assistant"}**`);
    if (name === "version") return appendCommandResponse(raw, "Khadim 0.1.0");
    if (name === "refresh-models") {
      const catalog = await window.khadim.models.catalog();
      return appendCommandResponse(raw, `Refreshed **${catalog.reduce((total, provider) => total + provider.models.length, 0)}** models across **${catalog.length}** providers.`);
    }
    if (name === "theme") {
      setSettingsIntent({ section: "appearance" });
      setSettingsOpen(true);
      setPrompt("");
      return true;
    }
    if (name === "multi" || name === "multi-agent") return appendCommandResponse(raw, "Multi-agent mode is not available yet.");
    return appendCommandResponse(raw, `\`/${name}\` is not available in this chat.`);
  }

  async function stopRun(): Promise<boolean> {
    if (!activeRunId) return true;
    const runId = activeRunId;
    try {
      let abortRequested = false;
      const pendingLaunch = pendingRunLaunchesRef.current.get(runId);
      if (pendingLaunch) {
        pendingLaunch.cancelRequested = true;
        if (!pendingLaunch.startSent) {
          await pendingLaunch.settled;
          if (!runTargetsRef.current.has(runId)) return true;
        } else if (pendingLaunch.startResult) {
          abortRequested = true;
          await Promise.all([
            window.khadim.agent.abort(runId),
            pendingLaunch.startResult.catch(() => undefined),
          ]);
          if (!runTargetsRef.current.has(runId)) return true;
        }
      }
      if (!abortRequested) await window.khadim.agent.abort(runId);
      const snapshot = (await window.khadim.agent.recover()).find((candidate) => candidate.runId === runId);
      if (snapshot) {
        for (const item of [...snapshot.events].sort((left, right) => left.sequence - right.sequence)) {
          processAgentEnvelope({ runId, sequence: item.sequence, event: item.event });
        }
      }
      const finalization = terminalSavePromisesRef.current.get(runId);
      if (finalization) await finalization;
      if (runTargetsRef.current.has(runId)) {
        setError("The process stopped, but its final run state could not be recovered yet.");
        return false;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The run could not be stopped.");
      return false;
    }
    return true;
  }

  async function deleteConversation(id: string): Promise<void> {
    if (!activeProjectId) return;
    try {
      const conversation = conversationCacheRef.current.get(id);
      const relatedRunIds = new Set(conversation?.runs?.map((run) => run.id) ?? []);
      for (const [runId, target] of runTargetsRef.current) {
        if (target.conversationId === id) relatedRunIds.add(runId);
      }
      if (activeRunId && relatedRunIds.has(activeRunId) && !(await stopRun())) return;
      for (const runId of relatedRunIds) {
        const finalization = terminalSavePromisesRef.current.get(runId);
        if (finalization) await finalization.catch(() => undefined);
      }
      const cached = conversationCacheRef.current.get(id);
      const hasRunningTarget = Array.from(runTargetsRef.current.entries()).some(([runId, target]) => (
        target.conversationId === id
        && (cached?.runs?.find((run) => run.id === runId)?.status ?? "running") === "running"
      ));
      if (hasRunningTarget) {
        setError("Wait for this chat's finished run to be saved before deleting it.");
        return;
      }
      clearScheduledConversationSave(id);
      await window.khadim.conversations.remove(activeProjectId, id);
      for (const runId of relatedRunIds) {
        rememberFinalizedRun(runId);
        runTargetsRef.current.delete(runId);
        usageCallRef.current.delete(runId);
        pendingLiveEventsRef.current.delete(runId);
      }
      conversationCacheRef.current.delete(id);
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      const detachedArtifacts = artifactDraftState.drafts.map((artifact) => {
        if (artifact.provenance?.conversationId !== id) return artifact;
        const provenance = { ...artifact.provenance };
        delete provenance.runId;
        delete provenance.messageId;
        delete provenance.conversationId;
        return { ...artifact, provenance };
      });
      if (detachedArtifacts.some((artifact, index) => artifact !== artifactDraftState.drafts[index])) {
        artifactCacheRef.current.set(activeProjectId, detachedArtifacts);
        skipNextArtifactSaveRef.current = true;
        setArtifactDraftState((current) => current.projectId === activeProjectId ? { ...current, drafts: detachedArtifacts } : current);
      }
      if (selectedId === id) setSelectedId(null);
      setPendingDeleteId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The chat could not be deleted.");
    }
  }

  function saveArtifactDraftsNow(drafts: ArtifactDraft[]): void {
    if (!artifactDraftState.projectId) return;
    skipNextArtifactSaveRef.current = true;
    const requestId = ++artifactSaveRequestRef.current;
    setArtifactSaveState("saving");
    void window.khadim.artifacts.save(artifactDraftState.projectId, drafts)
      .then(() => {
        if (artifactSaveRequestRef.current === requestId) setArtifactSaveState("saved");
      })
      .catch((cause: unknown) => {
        if (artifactSaveRequestRef.current !== requestId) return;
        setArtifactSaveState("error");
        setError(cause instanceof Error ? cause.message : "Artifact changes could not be saved.");
      });
  }

  function updateArtifactDrafts(updater: (drafts: ArtifactDraft[]) => ArtifactDraft[]): void {
    const drafts = updater(artifactDraftState.drafts);
    if (artifactDraftState.projectId) artifactCacheRef.current.set(artifactDraftState.projectId, drafts);
    setArtifactDraftState((current) => ({ ...current, drafts }));
    saveArtifactDraftsNow(drafts);
  }

  function startNewArtifact(kind: ArtifactKind = "site"): void {
    if (!artifactDraftState.hydrated || !artifactDraftState.projectId) {
      setError("Artifact drafts are still loading. Try again in a moment.");
      return;
    }
    const now = new Date().toISOString();
    const draft = createArtifact(kind, artifactDraftState.projectId, `draft-${createId()}`, now);
    updateArtifactDrafts((current) => [draft, ...current]);
    setStudioArtifact(draft);
  }

  function openGeneratedArtifact(artifact: GeneratedArtifact): void {
    if (!artifactDraftState.hydrated) {
      setError("Artifact drafts are still loading. Try again in a moment.");
      return;
    }
    const existingDraft = artifactDraftState.drafts.find((draft) => draft.id === artifact.id || draft.id === `artifact-${artifact.id}` || draft.provenance?.messageId === artifact.id);
    if (existingDraft?.deletedAt) {
      setError("This artifact was deleted from the library.");
      return;
    }
    if (existingDraft) {
      openArtifactDraft(existingDraft);
      return;
    }
    const now = new Date().toISOString();
    const generated: ArtifactDraft = {
      id: artifact.id,
      projectId: artifactDraftState.projectId!,
      title: artifact.title,
      schemaVersion: 2,
      kind: "site",
      lifecycle: "ready",
      content: { format: "html", html: artifact.html, baselineHtml: artifact.html },
      provenance: {
        origin: "agent",
        runId: artifact.runId,
        messageId: artifact.id,
        conversationId: artifact.conversationId,
        conversationTitle: artifact.conversationTitle,
      },
      createdAt: artifact.createdAt,
      updatedAt: now,
    };
    updateArtifactDrafts((current) => [generated, ...current]);
    setStudioArtifact(generated);
  }

  function openArtifactDraft(draft: ArtifactDraft): void {
    setStudioArtifact(draft);
    const conversationId = draft.provenance?.conversationId;
    if (conversationId && conversations.some((conversation) => conversation.id === conversationId)) {
      setSelectedId(conversationId);
      setActiveView("welcome");
    }
  }

  function updateStudioArtifact(next: ArtifactDraft, flush = false): void {
    if (!studioArtifact || !artifactDraftState.hydrated) return;
    const drafts = artifactDraftState.drafts.map((artifact) => artifact.id === next.id ? next : artifact);
    artifactCacheRef.current.set(artifactDraftState.projectId!, drafts);
    setArtifactDraftState((current) => ({ ...current, drafts }));
    setArtifactSaveState(flush ? "saving" : "dirty");
    setStudioArtifact(next);
    if (flush) saveArtifactDraftsNow(drafts);
  }

  async function askAgentToEditStudio(instruction: string, attachments: ChatAttachment[] = [], visibleInstruction = instruction): Promise<boolean> {
    if (!studioArtifact || !artifactDraftState.projectId) return false;
    const artifact = studioArtifact;
    const projectId = artifactDraftState.projectId;
    setStudioAgentStatus({ artifactId: artifact.id, phase: "starting" });
    const drafts = artifactDraftState.drafts.map((candidate) => candidate.id === artifact.id ? artifact : candidate);
    try {
      setArtifactSaveState("saving");
      await window.khadim.artifacts.save(projectId, drafts);
      artifactCacheRef.current.set(projectId, drafts);
      setArtifactSaveState("saved");
    } catch (cause) {
      setArtifactSaveState("error");
      const message = cause instanceof Error ? cause.message : "Save the artifact before asking the agent to edit it.";
      setError(message);
      setStudioAgentStatus({ artifactId: artifact.id, phase: "error", message });
      return false;
    }
    const started = await sendPrompt(
      studioAgentPrompt(artifact, instruction),
      visibleInstruction,
      attachments,
      { projectId, artifactId: artifact.id },
    );
    if (!started) {
      setStudioAgentStatus({ artifactId: artifact.id, phase: "error", message: "The agent couldn’t start. Check the active model or finish the current run, then try again." });
      return false;
    }
    setStudioAgentStatus((current) => current?.artifactId === artifact.id && current.phase === "starting"
      ? { artifactId: artifact.id, phase: "running" }
      : current);
    return true;
  }

  async function sendMainChatPrompt(value = prompt, visibleValue = value, attachments: ChatAttachment[] = []): Promise<boolean> {
    if (!studioArtifact) return sendPrompt(value, visibleValue, attachments);
    return askAgentToEditStudio(value, attachments, visibleValue);
  }

  function beginStudioPaneResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    const workspace = studioWorkspaceRef.current;
    if (!workspace || workspace.clientWidth <= 760) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = workspace.getBoundingClientRect();
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (moveEvent: PointerEvent): void => {
      const maximum = Math.max(420, Math.min(720, bounds.width - 480));
      setStudioChatWidth(Math.round(Math.min(maximum, Math.max(360, moveEvent.clientX - bounds.left))));
    };
    const finish = (): void => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  async function exportStudioPdf(): Promise<void> {
    if (!studioArtifact || !artifactDraftState.projectId) return;
    const drafts = artifactDraftState.drafts.map((artifact) => artifact.id === studioArtifact.id ? studioArtifact : artifact);
    try {
      setArtifactSaveState("saving");
      await window.khadim.artifacts.save(artifactDraftState.projectId, drafts);
      setArtifactSaveState("saved");
      await window.khadim.artifacts.exportPdf(artifactDraftState.projectId, studioArtifact.id);
    } catch (cause) {
      setArtifactSaveState("error");
      setError(cause instanceof Error ? cause.message : "The PDF could not be exported.");
    }
  }

  function discardArtifactDraft(id: string): void {
    updateArtifactDrafts((current) => discardArtifactChanges(current, id, new Date().toISOString()));
    if (studioArtifact?.id === id) setStudioArtifact(null);
  }

  function deleteArtifactFromLibrary(id: string): void {
    updateArtifactDrafts((current) => deleteArtifact(current, id, new Date().toISOString()));
    if (studioArtifact?.id === id) setStudioArtifact(null);
  }

  function closeStudio(focusDraftId: string | null = studioArtifact?.id ?? null): void {
    if (studioArtifact && artifactSaveState === "dirty") updateStudioArtifact(studioArtifact, true);
    setStudioArtifact(null);
    if (activeMode === "studio" && activeView !== "artifacts") setActiveMode("chat");
    if (focusDraftId) {
      window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-artifact-draft-id="${CSS.escape(focusDraftId)}"]`)?.focus(), 0);
    }
  }

  function chooseMode(mode: AppMode): void {
    if (mode === "studio") {
      setActiveMode("studio");
      setActiveView("artifacts");
      setSelectedId(null);
      return;
    }
    setActiveMode(mode);
    if (mode === "chat") setActiveView("welcome");
  }

  function selectAgent(agentId: string): void {
    const agent = agents.find((candidate) => candidate.id === agentId);
    if (!agent) return;
    setSelectedAgentId(agent.id);
    const nextTools = agent.connectors.filter((id) => toolOptions.some((tool) => tool.id === id));
    if (googleConnected && agent.builtIn && !nextTools.includes("apps")) nextTools.push("apps");
    setEnabledTools(nextTools);
    setSystemPromptOverride(null);
  }

  function createAgent(agent: AgentDefinition): void {
    setAgents((current) => [...current, agent]);
    setSelectedAgentId(agent.id);
    setEnabledTools(agent.connectors);
    setSystemPromptOverride(null);
  }

  function chooseView(view: AppView): void {
    setActiveMode(view === "artifacts" ? "studio" : "chat");
    setActiveView(view);
    if (view === "welcome" || view === "project") setSelectedId(null);
    if (view === "project") void refreshProjectAvailability(projects);
    if (window.matchMedia("(max-width: 841px)").matches) setSidebarOpen(false);
  }

  async function openProject(projectId: string): Promise<void> {
    if (projectId === activeProjectId) {
      setActiveMode("chat");
      setActiveView("project");
      setSelectedId(null);
      setExpandedProjectIds((current) => new Set([...current, projectId]));
      if (window.matchMedia("(max-width: 841px)").matches) setSidebarOpen(false);
      return;
    }
    try {
      const project = await window.khadim.projects.open(projectId);
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      setProjectAvailability((current) => ({ ...current, [project.id]: { project, available: true } }));
      setSettings((current) => current ? { ...current, activeProjectId: project.id, workspace: project.rootPath } : current);
      activeProjectIdRef.current = project.id;
      setActiveProjectId(project.id);
      setExpandedProjectIds((current) => new Set([...current, project.id]));
      setActiveMode("chat");
      setActiveView("project");
      setSelectedId(null);
      if (window.matchMedia("(max-width: 841px)").matches) setSidebarOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be opened.");
    }
  }

  async function toggleProject(projectId: string): Promise<void> {
    if (expandedProjectIds.has(projectId)) {
      setExpandedProjectIds((current) => {
        const next = new Set(current);
        next.delete(projectId);
        return next;
      });
      return;
    }
    setExpandedProjectIds((current) => new Set([...current, projectId]));
    if (projectConversations[projectId] || projectId === activeProjectId || loadingProjectIds.has(projectId)) return;
    setLoadingProjectIds((current) => new Set([...current, projectId]));
    try {
      const savedConversations = await window.khadim.conversations.list(projectId);
      setProjectConversations((current) => ({ ...current, [projectId]: savedConversations }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This project's chats could not be loaded.");
    } finally {
      setLoadingProjectIds((current) => {
        const next = new Set(current);
        next.delete(projectId);
        return next;
      });
    }
  }

  async function openProjectConversation(projectId: string, conversationId: string): Promise<void> {
    setActiveMode("chat");
    setActiveView("welcome");
    setPendingDeleteId(null);
    if (projectId === activeProjectId) {
      setSelectedId(conversationId);
    } else {
      pendingConversationSelectionRef.current = { projectId, conversationId };
      await openProject(projectId);
    }
    if (window.matchMedia("(max-width: 841px)").matches) setSidebarOpen(false);
  }

  async function addProject(): Promise<void> {
    try {
      const rootPath = await window.khadim.projects.chooseDirectory();
      if (!rootPath) return;
      const project = await window.khadim.projects.add(rootPath);
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      setProjectAvailability((current) => ({ ...current, [project.id]: { project, available: true } }));
      setSettings((current) => current ? { ...current, activeProjectId: project.id, workspace: project.rootPath } : current);
      activeProjectIdRef.current = project.id;
      setActiveProjectId(project.id);
      setExpandedProjectIds((current) => new Set([...current, project.id]));
      setActiveMode("chat");
      setActiveView("project");
      setSelectedId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be added.");
    }
  }

  async function refreshProjectAvailability(items: Project[]): Promise<void> {
    const entries = await Promise.all(items.map(async (project) => {
      try {
        return await window.khadim.projects.checkAvailability(project.id);
      } catch {
        return { project, available: false as const, reason: "missing" as const };
      }
    }));
    setProjectAvailability(Object.fromEntries(entries.map((entry) => [entry.project.id, entry])));
  }

  async function renameProject(projectId: string, name: string): Promise<boolean> {
    try {
      const project = await window.khadim.projects.rename(projectId, name);
      setProjects((current) => current.map((item) => item.id === project.id ? project : item));
      setProjectAvailability((current) => ({
        ...current,
        [project.id]: current[project.id]?.available === false
          ? { ...current[project.id], project }
          : { project, available: true },
      }));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be renamed.");
      return false;
    }
  }

  async function relocateProject(projectId: string): Promise<void> {
    try {
      const rootPath = await window.khadim.projects.chooseDirectory();
      if (!rootPath) return;
      const project = await window.khadim.projects.relocate(projectId, rootPath);
      setProjects((current) => current.map((item) => item.id === project.id ? project : item));
      setProjectAvailability((current) => ({ ...current, [project.id]: { project, available: true } }));
      if (project.id === activeProjectId) {
        setSettings((current) => current ? { ...current, workspace: project.rootPath } : current);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project folder could not be relocated.");
    }
  }

  async function removeProject(projectId: string): Promise<boolean> {
    try {
      const result = await window.khadim.projects.remove(projectId);
      const savedProjects = await window.khadim.projects.list();
      setProjects(savedProjects);
      await refreshProjectAvailability(savedProjects);
      setSettings((current) => current ? {
        ...current,
        activeProjectId: result.activeProject.id,
        workspace: result.activeProject.rootPath,
      } : current);
      activeProjectIdRef.current = result.activeProject.id;
      setActiveProjectId(result.activeProject.id);
      setExpandedProjectIds((current) => {
        const next = new Set(current);
        next.delete(projectId);
        next.add(result.activeProject.id);
        return next;
      });
      setProjectConversations((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
      setActiveMode("chat");
      setActiveView("project");
      setSelectedId(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be removed.");
      return false;
    }
  }

  async function updateQuickSettings(update: { modelId?: string; harness?: HarnessMode }): Promise<void> {
    if (!settings) return;
    const previous = settings;
    const optimisticModels = settings.models.map((model) => ({
      ...model,
      isActive: update.modelId ? model.id === update.modelId : model.isActive,
    }));
    const optimisticActiveModel = optimisticModels.find((model) => model.isActive) ?? optimisticModels[0];
    const optimistic: AppSettings = {
      ...settings,
      provider: optimisticActiveModel.provider,
      model: optimisticActiveModel.model,
      models: optimisticModels,
      harness: update.harness ?? settings.harness,
    };
    setSettings(optimistic);
    try {
      const models = optimistic.models.map(({ hasApiKey: _hasApiKey, ...model }) => ({
        ...model,
      }));
      const activeModel = models.find((model) => model.isActive) ?? models[0];
      const next = await window.khadim.settings.save({
        provider: activeModel.provider,
        model: activeModel.model,
        models,
        activeProjectId: settings.activeProjectId,
        workspace: settings.workspace,
        harness: optimistic.harness,
        theme: optimistic.theme,
        customThemes: optimistic.customThemes,
      });
      setSettings(next);
    } catch (cause) {
      setSettings(previous);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function applySavedSettings(next: AppSettings): Promise<void> {
    if (next.activeProjectId === activeProjectId) {
      setSettings(next);
      return;
    }

    const savedProjects = await window.khadim.projects.list();
    const nextProject = savedProjects.find((project) => project.id === next.activeProjectId);
    if (!nextProject) throw new Error("The saved project could not be loaded.");
    setProjects(savedProjects);
    await refreshProjectAvailability(savedProjects);
    setSettings(next);
    activeProjectIdRef.current = nextProject.id;
    setActiveProjectId(nextProject.id);
    setActiveMode("chat");
    setActiveView("welcome");
    setSelectedId(null);
  }

  const commandItems: CommandPaletteItem[] = [
    { id: "new-chat", group: "Actions", label: "New chat", detail: newChatShortcut, keywords: "start conversation", icon: <Plus size={17} />, action: newChat },
    { id: "new-artifact", group: "Actions", label: "New artifact", detail: "Create in Studio", keywords: "document page html create", icon: <FileCode2 size={17} />, action: () => { setActiveMode("studio"); setActiveView("artifacts"); startNewArtifact(); } },
    { id: "settings", group: "Actions", label: "Open settings", detail: "Models, appearance, and project", keywords: "preferences configuration", icon: <Settings size={17} />, action: () => { setSettingsIntent(null); setSettingsOpen(true); } },
    { id: "agents", group: "Navigate", label: "Agents", detail: "Configure who handles the work", keywords: "personas assistants", icon: <Bot size={17} />, action: () => chooseMode("agent") },
    { id: "studio", group: "Navigate", label: "Studio", detail: "Create and review artifacts", keywords: "documents artifacts design code", icon: <FileCode2 size={17} />, action: () => chooseMode("studio") },
    { id: "project-home", group: "Navigate", label: "Project overview", detail: activeProject?.name ?? "Choose a local project", keywords: "projects folders workspace", icon: <FolderKanban size={17} />, action: () => chooseView("project") },
    { id: "apps", group: "Navigate", label: "Apps", detail: "Connect services and skills", keywords: "integrations connectors", icon: <AppWindow size={17} />, action: () => chooseView("apps") },
    ...conversations.map((conversation): CommandPaletteItem => ({
      id: `chat-${conversation.id}`,
      group: "Chats",
      label: conversation.title,
      detail: `${conversation.messages.length} message${conversation.messages.length === 1 ? "" : "s"}`,
      keywords: "chat conversation recent",
      icon: <ChatCircleDots size={17} />,
      action: () => { setActiveMode("chat"); setActiveView("welcome"); setSelectedId(conversation.id); if (isCompact) setSidebarOpen(false); },
    })),
    ...projects.map((project): CommandPaletteItem => ({
      id: `project-${project.id}`,
      group: "Projects",
      label: project.name,
      detail: project.id === activeProjectId ? "Current project" : project.rootPath,
      keywords: `project folder ${project.rootPath}`,
      icon: <FolderOpen size={17} />,
      action: () => { void openProject(project.id); },
    })),
    ...artifactDraftState.drafts.filter((artifact) => !artifact.deletedAt).map((artifact): CommandPaletteItem => ({
      id: `artifact-${artifact.id}`,
      group: "Artifacts",
      label: artifact.title,
      detail: artifact.lifecycle === "draft" ? "Draft artifact" : `${artifact.kind} artifact`,
      keywords: "studio document html artifact",
      icon: <Blocks size={17} />,
      action: () => { setActiveMode("studio"); setActiveView("artifacts"); openArtifactDraft(artifact); },
    })),
  ];

  function renderWorkspaceTopbar(): React.JSX.Element {
    return (
      <header className="topbar">
        {!sidebarOpen && (
          <button className="icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            <PanelLeftOpen className="desktop-only" size={19} />
            <Menu className="mobile-only" size={19} />
          </button>
        )}
        <button className="model-pill" onClick={() => { setSettingsIntent({ section: "model" }); setSettingsOpen(true); }}>
          <span className={`agent-orb ${selectedAgent.color}`} />
          {selectedAgent.name}
          <span className="model-divider" />
          {selectedModel && <ModelIcon model={selectedModel} size={22} />}
          {settings?.model || "Choose a model"}
          <ChevronDown size={14} />
        </button>
        {!studioArtifact && activeView !== "artifacts" && <button className="studio-button" disabled={!artifactDraftState.hydrated} onClick={() => { setActiveMode("studio"); startNewArtifact(); }}><FileCode2 size={16} /> New artifact</button>}
      </header>
    );
  }

  function renderMainChatSurface(): React.JSX.Element {
    if (!selected) {
      return (
        <section className="welcome workspace-arrival">
          <div className="welcome-copy">
            <span className="welcome-mark"><Logo /></span>
            <span className="welcome-status"><i /> Local-first workspace</span>
            <h1>Where should we begin?</h1>
            <p>Start with an outcome. Khadim can research, create, or work across your computer while your project stays local.</p>
          </div>
          <Composer
            prompt={prompt}
            setPrompt={setPrompt}
            onSend={sendMainChatPrompt}
            onStop={stopRun}
            running={Boolean(activeRunId)}
            inputRef={promptRef}
            large
            agentId={selectedAgentId}
            agentName={selectedAgent.name}
            agents={agents}
            onSelectAgent={selectAgent}
            modelName={settings?.model || "Choose model"}
            provider={settings?.provider || "anthropic"}
            models={settings?.models ?? []}
            enabledTools={enabledTools}
            onToggleTool={(toolId) => setEnabledTools((current) => current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId])}
            harness={settings?.harness || "assistant"}
            pluginHarnesses={pluginHarnesses}
            onSelectModel={(modelId) => void updateQuickSettings({ modelId })}
            onSelectHarness={(harness) => void updateQuickSettings({ harness })}
            projectName={activeProject?.name}
            projectAvailable={activeProject ? projectAvailability[activeProject.id]?.available !== false : undefined}
          />
          <div className="starter-grid">
            {starterPrompts.map((starter, index) => (
              <button key={starter.label} type="button" aria-label={starter.label} onClick={() => void sendMainChatPrompt(starter.prompt)}>
                <span className="starter-icon">{index === 0 ? <Plus size={18} /> : index === 1 ? <FileText size={18} /> : index === 2 ? <Globe2 size={18} /> : <Code2 size={18} />}</span>
                <span className="starter-copy"><strong>{starter.label}</strong><small>{index === 0 ? "Tasks and plans" : index === 1 ? "Pages and documents" : index === 2 ? "Answers from the web" : "Actions on this computer"}</small></span>
                <ArrowUp className="starter-arrow" size={15} />
              </button>
            ))}
          </div>
        </section>
      );
    }

    return (
      <section className="chat-view workspace-arrival">
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {activeRunId ? "Khadim is working." : latestMessage?.status === "error" ? "The run did not finish." : latestMessage?.role === "assistant" && latestMessage.status === "complete" ? "Response complete." : ""}
        </div>
        <div
          className="message-list"
          ref={messageListRef}
          role="log"
          aria-label="Chat messages"
          aria-live="off"
          onScroll={(event) => {
            const list = event.currentTarget;
            followLatestMessageRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
          }}
        >
          {selected.messages.map((message) => {
            const messageRun = message.runId ? selected.runs?.find((run) => run.id === message.runId) : undefined;
            const extractedHtml = message.role === "assistant" ? extractHtml(message.content) : null;
            const storedArtifact = extractedHtml
              ? artifactDraftState.drafts.find((artifact) => artifact.provenance?.messageId === message.id || artifact.id === `artifact-${message.id}`)
              : undefined;
            const artifactWasDeleted = Boolean(storedArtifact?.deletedAt);
            const legacyFiles = message.role === "user" && !message.attachments?.length ? legacyFileAttachments(message.content) : null;
            const messageContent = studioArtifact ? messageCopyWithoutStudioEdit(message.content) : message.content;
            const visibleContent = legacyFiles?.content ?? (extractedHtml ? messageCopyWithoutArtifactSource(message.content) : messageContent);
            const visibleAttachments = message.attachments?.length ? message.attachments : legacyFiles?.attachments;
            return (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-avatar">{message.role === "assistant" ? <Logo /> : <UserRound size={17} />}</div>
                <div className="message-body">
                  <div className="message-name">{message.role === "assistant" ? "Khadim" : "You"}</div>
                  {visibleContent ? <MarkdownRenderer content={visibleContent} streaming={message.status === "streaming"} /> : message.status === "streaming" ? <div className="thinking-status" aria-hidden="true"><span className="activity-spinner" /><span>Working</span></div> : null}
                  {visibleAttachments && visibleAttachments.length > 0 && <div className="message-attachments">{visibleAttachments.map((attachment, index) => <AttachmentBadge attachment={attachment} key={`${message.id}-${attachment.name}-${index}`} />)}</div>}
                  {message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0 && <ToolActivityGroup activities={message.toolCalls} />}
                  {extractedHtml && artifactWasDeleted ? (
                    <div className="message-artifact-card deleted" role="status">
                      <FileCode2 size={21} />
                      <span><strong>{artifactTitle(extractedHtml, "Created page")}</strong><small>Removed from Artifacts</small></span>
                    </div>
                  ) : extractedHtml && (
                    <button className="message-artifact-card" aria-label={`Open artifact ${artifactTitle(extractedHtml, selected.title)}`} disabled={!artifactDraftState.hydrated} onClick={() => openGeneratedArtifact({ id: message.id, title: artifactTitle(extractedHtml, selected.title), html: extractedHtml, createdAt: message.createdAt, runId: message.runId, conversationId: selected.id, conversationTitle: selected.title })}>
                      <FileCode2 size={21} />
                      <span><strong>{artifactTitle(extractedHtml, "Created page")}</strong><small>Open artifact</small></span>
                      <ArrowUp size={16} />
                    </button>
                  )}
                  {message.status === "error" && (
                    <div className="message-error-recovery">
                      <span className="error-label">{messageRun?.status === "stopped" ? "Run stopped" : "Run failed"}</span>
                      {messageRun?.status !== "stopped" && <button type="button" onClick={() => {
                        const original = selected.messages.find((candidate) => candidate.id === messageRun?.userMessageId);
                        if (!original) return;
                        setPrompt(original.content);
                        window.setTimeout(() => promptRef.current?.focus(), 0);
                      }}>Edit and retry</button>}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <div className="composer-dock">
          <Composer prompt={prompt} setPrompt={setPrompt} onSend={sendMainChatPrompt} onStop={stopRun} running={Boolean(activeRunId)} inputRef={promptRef} agentId={selectedAgentId} agentName={selectedAgent.name} agents={agents} onSelectAgent={selectAgent} modelName={settings?.model || "Choose model"} provider={settings?.provider || "anthropic"} models={settings?.models ?? []} enabledTools={enabledTools} onToggleTool={(toolId) => setEnabledTools((current) => current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId])} harness={settings?.harness || "assistant"} pluginHarnesses={pluginHarnesses} onSelectModel={(modelId) => void updateQuickSettings({ modelId })} onSelectHarness={(harness) => void updateQuickSettings({ harness })} usage={conversationUsage(selected)} projectName={activeProject?.name} projectAvailable={activeProject ? projectAvailability[activeProject.id]?.available !== false : undefined} />
        </div>
      </section>
    );
  }

  const chatModeActive = activeMode === "chat" && activeView === "welcome";
  const agentModeActive = activeMode === "agent" && !studioArtifact;
  const studioModeActive = activeMode === "studio";

  return (
    <main className={`app-shell ${platformClass}`}>
      <header className="app-header">
        <button className="header-logo" onClick={goHome} aria-label="Khadim home" title="Project overview"><Logo /></button>
        <nav className="mode-nav" aria-label="Work modes">
          <button aria-pressed={chatModeActive} className={chatModeActive ? "active" : ""} onClick={() => chooseMode("chat")} title="Chat"><ChatCircleDots size={16} /><span>Chat</span></button>
          <button aria-pressed={agentModeActive} className={agentModeActive ? "active" : ""} onClick={() => chooseMode("agent")} title="Agents"><Bot size={16} /><span>Agents</span></button>
          <button aria-pressed={studioModeActive} className={studioModeActive ? "active" : ""} onClick={() => chooseMode("studio")} title="Studio"><FileText size={16} /><span>Studio</span></button>
        </nav>
        <CommandPalette items={commandItems} inputRef={searchRef} shortcut={commandShortcut} compact={isCompact} />
        <div className="header-actions">
          <button className="account-trigger" onClick={() => setAccountOpen(true)} aria-haspopup="dialog" aria-expanded={accountOpen}>
            <span className="account-avatar">K</span><span>Account</span><ChevronDown size={13} />
          </button>
          <button className="icon-button header-settings" onClick={() => { setSettingsIntent(null); setSettingsOpen(true); }} aria-label="Settings"><Settings size={18} /></button>
          {window.khadim.windowControls && (
            <div className="window-controls" aria-label="Window controls">
              <button type="button" onClick={() => void window.khadim.windowControls?.minimize()} aria-label="Minimize window"><Minus size={15} weight="bold" /></button>
              <button type="button" onClick={() => void window.khadim.windowControls?.toggleMaximize()} aria-label="Maximize window"><Square size={13} /></button>
              <button className="window-close" type="button" onClick={() => void window.khadim.windowControls?.close()} aria-label="Close window"><X size={15} /></button>
            </div>
          )}
        </div>
      </header>

      {isCompact && (
        <button
          className={`sidebar-scrim ${sidebarOpen ? "visible" : ""}`}
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
          aria-hidden={!sidebarOpen}
          tabIndex={sidebarOpen ? 0 : -1}
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <div className="sidebar-header">
          <span>Workspace</span>
          <button className="icon-button desktop-only" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
            <PanelLeftClose size={18} />
          </button>
        </div>
        <nav className="primary-nav" aria-label="Primary">
          <button onClick={newChat}><Plus size={18} /> New chat <kbd>{newChatShortcut}</kbd></button>
          <button aria-current={activeView === "artifacts" ? "page" : undefined} className={activeView === "artifacts" ? "active" : ""} onClick={() => chooseView("artifacts")}><Blocks size={17} /> Artifacts</button>
          <button aria-current={activeView === "apps" ? "page" : undefined} className={activeView === "apps" ? "active" : ""} onClick={() => chooseView("apps")}><AppWindow size={17} /> Apps <Badge className="new-badge">New</Badge></button>
        </nav>
        <div className="project-tree-heading">
          <span>Projects</span>
          <button type="button" onClick={() => void addProject()} aria-label="Add project" title="Add project"><Plus size={15} /></button>
        </div>
        <nav className="project-tree" aria-label="Projects">
          {projects.map((project) => {
            const active = project.id === activeProjectId;
            const expanded = expandedProjectIds.has(project.id);
            const unavailable = projectAvailability[project.id]?.available === false;
            const projectChats = projectConversations[project.id] ?? (active ? visibleConversations : []);
            const loading = loadingProjectIds.has(project.id);
            return (
              <section className={`project-tree-item ${active ? "current-context" : ""} ${unavailable ? "unavailable" : ""}`} key={project.id}>
                <div className="project-tree-row">
                  <button className="project-disclosure" type="button" aria-expanded={expanded} aria-controls={`project-chats-${project.id}`} aria-label={`${expanded ? "Collapse" : "Expand"} ${project.name}`} onClick={() => void toggleProject(project.id)}><ChevronRight size={13} /></button>
                  <button className="project-tree-select" type="button" disabled={unavailable} aria-current={active && activeView === "project" ? "page" : undefined} onClick={() => void openProject(project.id)}>
                    <FolderOpen size={16} />
                    <span><strong>{project.name}</strong><small>{active ? unavailable ? "Folder unavailable" : "Current project" : unavailable ? "Folder unavailable" : "Local project"}</small></span>
                  </button>
                  {unavailable && <button className="project-locate" type="button" onClick={() => void relocateProject(project.id)} aria-label={`Locate ${project.name}`} title="Locate folder"><Search size={14} /></button>}
                </div>
                {expanded && (
                  <div className="project-tree-children" id={`project-chats-${project.id}`}>
                    {loading && <p role="status">Loading chats…</p>}
                    {!loading && projectChats.map((conversation) => (
                      <div className={`history-item ${active && activeView === "welcome" && selectedId === conversation.id ? "active" : ""} ${active && pendingDeleteId === conversation.id ? "pending-delete" : ""}`} key={conversation.id}>
                        <button aria-current={active && activeView === "welcome" && selectedId === conversation.id ? "page" : undefined} onClick={() => void openProjectConversation(project.id, conversation.id)}>{conversation.title}</button>
                        {active && (pendingDeleteId === conversation.id ? (
                          <span className="chat-delete-confirm" role="group" aria-label={`Delete ${conversation.title}?`}>
                            <button ref={keepChatRef} type="button" onClick={() => setPendingDeleteId(null)}>Keep</button>
                            <button className="danger" type="button" onClick={() => void deleteConversation(conversation.id)} aria-label={`Confirm delete ${conversation.title}`}>Delete</button>
                          </span>
                        ) : (
                          <button className="delete-chat" onClick={() => setPendingDeleteId(conversation.id)} aria-label={`Delete ${conversation.title}`}>
                            <Trash2 size={14} />
                          </button>
                        ))}
                      </div>
                    ))}
                    {!loading && projectChats.length === 0 && <p>No chats yet</p>}
                  </div>
                )}
              </section>
            );
          })}
          {projects.length === 0 && <p className="project-tree-empty">Add a local folder to begin.</p>}
        </nav>
        <div className="sidebar-footer">
          <div className={`local-status ${activeProjectId && projectAvailability[activeProjectId]?.available === false ? "unavailable" : ""}`}><span /><div><strong>{activeProjectId && projectAvailability[activeProjectId]?.available === false ? "Folder unavailable" : "Local project"}</strong><small>{settings?.provider || "Configure provider"}</small></div></div>
          <button onClick={() => { setSettingsIntent(null); setSettingsOpen(true); }}><Settings size={17} /> Settings</button>
        </div>
      </aside>

      <section className="workspace" inert={sidebarOpen && isCompact ? true : undefined}>
        {studioArtifact ? (
          <div
            className="studio-dual-workspace"
            ref={studioWorkspaceRef}
            style={{ "--studio-chat-width": `${studioChatWidth}px` } as CSSProperties}
          >
            <section className="studio-main-chat-pane" aria-label={`Main chat beside ${studioArtifact.title}`}>
              {renderWorkspaceTopbar()}
              {renderMainChatSurface()}
            </section>
            <div
              className="studio-pane-separator"
              role="separator"
              aria-label="Resize Studio conversation pane"
              aria-orientation="vertical"
              aria-valuemin={360}
              aria-valuemax={720}
              aria-valuenow={studioChatWidth}
              tabIndex={0}
              onPointerDown={beginStudioPaneResize}
              onDoubleClick={() => setStudioChatWidth(520)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  setStudioChatWidth((current) => Math.min(720, Math.max(360, current + (event.key === "ArrowLeft" ? -16 : 16))));
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setStudioChatWidth(360);
                } else if (event.key === "End") {
                  event.preventDefault();
                  setStudioChatWidth(720);
                }
              }}
            />
            <div className="studio-editor-pane">
              <StudioWorkspace
                artifact={studioArtifact}
                saveState={artifactSaveState}
                agentName={selectedAgent.name}
                modelName={selectedModel?.name ?? "No active model"}
                agentBusy={Boolean(activeRunId)}
                agentStatus={studioAgentStatus?.artifactId === studioArtifact.id ? studioAgentStatus : null}
                onChange={updateStudioArtifact}
                onClose={() => closeStudio()}
                onExportPdf={() => void exportStudioPdf()}
                onAskAgent={askAgentToEditStudio}
              />
            </div>
          </div>
        ) : <>
        {renderWorkspaceTopbar()}

        {activeMode === "agent" ? (
          <AgentsView agents={agents} selectedId={selectedAgentId} onCreate={createAgent} onSelect={(id) => { selectAgent(id); setActiveMode("chat"); newChat(); }} />
        ) : activeView === "project" ? (
          <ProjectHome
            project={activeProject}
            availability={activeProject ? projectAvailability[activeProject.id] : undefined}
            conversations={conversations}
            onOpenChat={(id) => { setActiveView("welcome"); setSelectedId(id); }}
            onNewChat={newChat}
            onAddProject={() => void addProject()}
            onRenameProject={renameProject}
            onRelocateProject={relocateProject}
            onRemoveProject={removeProject}
          />
        ) : activeView === "artifacts" ? (
          <ArtifactsView
            ready={artifactDraftState.hydrated}
            drafts={artifactDraftState.drafts}
            sourceConversationIds={new Set(conversations.map((conversation) => conversation.id))}
            onNew={startNewArtifact}
            onOpenDraft={(artifact) => { setActiveMode("studio"); openArtifactDraft(artifact); }}
            onOpenGenerated={(artifact) => { setActiveMode("studio"); openGeneratedArtifact(artifact); }}
            onDiscardDraft={discardArtifactDraft}
            onDeleteArtifact={deleteArtifactFromLibrary}
            onOpenConversation={(id) => { setActiveView("welcome"); setSelectedId(id); }}
          />
        ) : activeView === "apps" ? (
          <AppsView projects={projects} activeProjectId={activeProjectId} />
        ) : renderMainChatSurface()}
        {error && <button className="error-toast" role="alert" onClick={() => setError(null)}>{error}<X size={15} /></button>}
        </>}
      </section>

      {settingsOpen && settings && (
        <SettingsDialog
          settings={settings}
          initialSection={settingsIntent?.section}
          initialProvider={settingsIntent?.provider}
          onClose={() => setSettingsOpen(false)}
          onSave={applySavedSettings}
        />
      )}
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
    </main>
  );
}

function AgentsView({ agents, selectedId, onCreate, onSelect }: {
  agents: AgentDefinition[];
  selectedId: string;
  onCreate: (agent: AgentDefinition) => void;
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [behavior, setBehavior] = useState("");
  const [connectors, setConnectors] = useState<string[]>(["web", "files"]);

  function toggleConnector(id: string): void {
    setConnectors((current) => current.includes(id) ? current.filter((connector) => connector !== id) : [...current, id]);
  }

  function submitAgent(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedBehavior = behavior.trim();
    if (!trimmedName || !trimmedBehavior) return;
    onCreate({
      id: createId(),
      name: trimmedName,
      type: "agent",
      description: description.trim() || `A custom agent for ${trimmedName.toLowerCase()}.`,
      prompt: trimmedBehavior,
      connectors,
      color: "blue",
    });
    setCreating(false);
    setName("");
    setDescription("");
    setBehavior("");
    setConnectors(["web", "files"]);
  }

  const currentAgent = agents.find((agent) => agent.id === selectedId) ?? defaultAgent;

  return (
    <section className="agent-workbench workspace-arrival" aria-labelledby="agents-title">
      <header className="agent-workbench-header workspace-page-header">
        <div className="surface-heading workspace-page-copy">
          <span>Workspace</span>
          <h1 id="agents-title">Agents</h1>
          <p>Set a clear responsibility, instructions, and only the access each agent needs.</p>
          <small className="agent-workbench-meta">
            <i aria-hidden="true" /> {currentAgent.name} is ready
            <span aria-hidden="true">/</span> {agents.length} configured
          </small>
        </div>
        <button className="agent-create-button workspace-primary-action" type="button" onClick={() => setCreating(true)}>
          <Plus size={17} /> New agent
        </button>
      </header>

      {creating ? (
        <form className="agent-editor" onSubmit={submitAgent}>
          <div className="agent-editor-intro">
            <span className="agent-editor-mark"><Bot size={20} /></span>
            <span>New agent</span>
            <h2>What should this agent own?</h2>
            <p>Give it one recognizable responsibility. You can always add more agents for other jobs.</p>
            <dl>
              <div><dt>Identity</dt><dd>Name the job, not the technology.</dd></div>
              <div><dt>Instructions</dt><dd>Set priorities and approval boundaries.</dd></div>
              <div><dt>Access</dt><dd>Grant only what the job requires.</dd></div>
            </dl>
          </div>
          <div className="agent-editor-fields">
            <label><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer follow-up" required /></label>
            <label><span>Short description</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Prepares thoughtful replies and keeps leads moving" /></label>
            <label className="agent-behavior-field"><span>Instructions</span><textarea aria-label="Behavior" value={behavior} onChange={(event) => setBehavior(event.target.value)} placeholder="You help me follow up with customers. Write concise, warm replies, check facts before making claims, and ask before sending anything." required rows={6} /><small>Describe its role, priorities, boundaries, and when it should ask for approval.</small></label>
            <fieldset>
              <legend>Access</legend>
              <p>Choose what this agent may use while it works.</p>
              <div className="agent-connector-options">
                {toolOptions.map((tool) => (
                  <button type="button" className={connectors.includes(tool.id) ? "selected" : ""} aria-pressed={connectors.includes(tool.id)} onClick={() => toggleConnector(tool.id)} key={tool.id}>
                    {tool.id === "web" ? <Globe2 size={18} /> : tool.id === "apps" ? <EnvelopeSimple size={18} /> : <FolderOpen size={18} />}
                    <span><strong>{tool.name}</strong><small>{tool.description}</small></span>
                    <ToggleSwitch enabled={connectors.includes(tool.id)} />
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <footer><button type="button" onClick={() => setCreating(false)}>Cancel</button><button className="primary" type="submit" disabled={!name.trim() || !behavior.trim()}>Create agent</button></footer>
        </form>
      ) : (
        <section className="agent-roster-section" aria-labelledby="configured-agents-title">
          <header><span><small>Ready to work</small><h2 id="configured-agents-title">Configured agents</h2></span><small>{agents.length} total</small></header>
          <div className="agent-roster">
            {agents.map((agent) => (
              <article className={selectedId === agent.id ? "is-active" : ""} key={agent.id}>
                <div className="agent-identity">
                  <span className={`agent-avatar ${agent.color}`} aria-hidden="true">{agent.name.slice(0, 1).toUpperCase()}</span>
                  <span><small>{agent.builtIn ? "Built in" : "Your agent"}</small><h2>{agent.name}</h2></span>
                </div>
                <div className="agent-role-copy">
                  <p>{agent.description}</p>
                  {selectedId === agent.id && <span className="agent-current"><Check size={12} /> Current agent</span>}
                </div>
                <div className="agent-config-summary">
                  <strong>Access</strong>
                  <span className="agent-access-list">
                    {agent.connectors.length ? agent.connectors.map((id) => {
                      const tool = toolOptions.find((option) => option.id === id);
                      return <span key={id}>{id === "web" ? <Globe2 size={13} /> : id === "apps" ? <EnvelopeSimple size={13} /> : <FolderOpen size={13} />}{tool?.name ?? id}</span>;
                    }) : <small>No access</small>}
                  </span>
                  <small className="agent-instruction-preview" title={agent.prompt}>{agent.prompt}</small>
                </div>
                <button className="agent-start-button" type="button" onClick={() => onSelect(agent.id)} aria-label={selectedId === agent.id ? `Start a new chat with ${agent.name}` : `Chat with ${agent.name}`}><MessageSquarePlus size={16} /><span>{selectedId === agent.id ? "New chat" : "Choose"}</span></button>
              </article>
            ))}
            <button className="agent-roster-add" type="button" onClick={() => setCreating(true)}><Plus size={18} /><span><strong>Add another agent</strong><small>Give a different job its own instructions and access.</small></span></button>
          </div>
        </section>
      )}
    </section>
  );
}

function ProjectHome({ project, availability, conversations, onOpenChat, onNewChat, onAddProject, onRenameProject, onRelocateProject, onRemoveProject }: {
  project: Project | null;
  availability?: ProjectAvailability;
  conversations: Conversation[];
  onOpenChat: (id: string) => void;
  onNewChat: () => void;
  onAddProject: () => void;
  onRenameProject: (id: string, name: string) => Promise<boolean>;
  onRelocateProject: (id: string) => Promise<void>;
  onRemoveProject: (id: string) => Promise<boolean>;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState(project?.name ?? "");
  const [pendingRemove, setPendingRemove] = useState(false);
  const unavailable = availability?.available === false;

  useEffect(() => {
    setEditing(false);
    setEditingName(project?.name ?? "");
    setPendingRemove(false);
  }, [project?.id, project?.name]);

  if (!project) {
    return (
      <section className="surface-view projects-view project-home-empty workspace-arrival" aria-labelledby="project-title">
        <div className="surface-heading workspace-page-copy"><span>Local-first work</span><h1 id="project-title">Add your first project</h1><p>Choose a folder to keep its chats, artifacts, and agent work together on this device.</p></div>
        <button className="project-add workspace-primary-action" type="button" onClick={onAddProject}><Plus size={17} /> Add project</button>
      </section>
    );
  }

  return (
    <section className="surface-view projects-view project-home workspace-arrival" aria-labelledby="project-title">
      <header className="projects-heading workspace-page-header">
        <div className="surface-heading workspace-page-copy"><span>Project</span><h1 id="project-title">{project.name}</h1><p title={project.rootPath}>{project.rootPath}</p></div>
        <button className="project-add workspace-primary-action" type="button" onClick={onNewChat} disabled={unavailable}><MessageSquarePlus size={17} /> New chat</button>
      </header>
      <div className={`project-meta ${unavailable ? "unavailable" : ""}`}>{unavailable ? <X size={20} /> : <CircleCheck size={20} />}<div><strong>{unavailable ? "Project folder unavailable" : "Ready for local work"}</strong><small>{unavailable ? "Locate the folder before starting another run." : `${conversations.length} ${conversations.length === 1 ? "chat" : "chats"} saved in this project`}</small></div>{unavailable && <button type="button" onClick={() => void onRelocateProject(project.id)}>Locate folder</button>}</div>

      <section className="project-home-section" aria-labelledby="recent-project-chats">
        <div className="section-title"><span id="recent-project-chats">Recent chats</span><strong>{conversations.length}</strong></div>
      <div className="project-conversations">
        {conversations.slice(0, 8).map((conversation) => (
          <button key={conversation.id} onClick={() => onOpenChat(conversation.id)}><MessageSquarePlus size={16} /><span><strong>{conversation.title}</strong><small>{conversation.messages.length} messages</small></span><ArrowUp size={15} /></button>
        ))}
          {conversations.length === 0 && <div className="project-conversations-empty"><p>No chats in this project yet.</p><button type="button" onClick={onNewChat} disabled={unavailable}>Start a chat</button></div>}
      </div>
      </section>

      <section className="project-home-section" aria-labelledby="project-settings-title">
        <div className="section-title"><span id="project-settings-title">Project settings</span><strong>Local folder</strong></div>
        {editing ? (
          <form className="project-rename project-home-rename" onSubmit={(event) => {
            event.preventDefault();
            void onRenameProject(project.id, editingName).then((renamed) => { if (renamed) setEditing(false); });
          }}>
            <label><span>Project name</span><input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} /></label>
            <button type="button" onClick={() => { setEditing(false); setEditingName(project.name); }}>Cancel</button>
            <button className="primary" type="submit" disabled={!editingName.trim()}>Save</button>
          </form>
        ) : (
          <div className="project-home-actions" aria-label={`${project.name} actions`}>
            <button type="button" onClick={() => { setPendingRemove(false); setEditing(true); }} aria-label={`Rename ${project.name}`}><FilePenLine size={15} /><span><strong>Rename project</strong><small>Change the name shown in Khadim</small></span><ChevronRight size={14} /></button>
            <button type="button" onClick={() => void onRelocateProject(project.id)} aria-label={`${unavailable ? "Locate" : "Change folder for"} ${project.name}`}><FolderOpen size={15} /><span><strong>{unavailable ? "Locate folder" : "Change folder"}</strong><small>{project.rootPath}</small></span><ChevronRight size={14} /></button>
            {pendingRemove ? (
              <div className="project-home-remove" role="group" aria-label={`Remove ${project.name} from Khadim?`}><span><strong>Remove this project?</strong><small>The folder and its files will not be deleted.</small></span><button type="button" onClick={() => setPendingRemove(false)}>Keep</button><button className="danger" type="button" onClick={() => void onRemoveProject(project.id).then((removed) => { if (removed) setPendingRemove(false); })}>Remove</button></div>
            ) : (
              <button className="danger" type="button" onClick={() => { setEditing(false); setPendingRemove(true); }} aria-label={`Remove ${project.name}`}><Trash2 size={15} /><span><strong>Remove project</strong><small>Keep the local folder and remove it from Khadim</small></span><ChevronRight size={14} /></button>
            )}
          </div>
        )}
      </section>
    </section>
  );
}

function formatArtifactDate(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `Today, ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date)}`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" }).format(date);
}

function ArtifactPreview({ html, title, variant }: { html: string; title: string; variant: "featured" | "recent" | "draft" }): React.JSX.Element {
  const previewRef = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || document.visibilityState === "hidden" || typeof IntersectionObserver === "undefined") {
      setReady(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setReady(true);
      observer.disconnect();
    }, { rootMargin: "240px" });
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);

  return (
    <span className={`artifact-canvas ${variant}`} ref={previewRef} aria-hidden="true">
      {ready
        ? <iframe title={`${title} preview`} srcDoc={html} sandbox="" tabIndex={-1} loading="lazy" aria-hidden="true" />
        : <span className="artifact-preview-placeholder"><FileText size={22} /></span>}
    </span>
  );
}

function ArtifactDraftPreview({ artifact, html }: { artifact: ArtifactDraft; html: string }): React.JSX.Element {
  if (artifact.kind === "site") return <ArtifactPreview html={html} title={artifact.title} variant="draft" />;
  return (
    <span className={`artifact-kind-preview ${artifact.kind}`} aria-hidden="true">
      {artifact.kind === "document" ? <FileText size={23} /> : <FilePenLine size={23} />}
      <small>{artifact.kind === "document" ? "DOC" : "CANVAS"}</small>
    </span>
  );
}

function ArtifactLibraryActions({
  artifact,
  sourceAvailable,
  onOpenConversation,
  onDelete,
}: {
  artifact: GeneratedArtifact;
  sourceAvailable: boolean;
  onOpenConversation: (id: string) => void;
  onDelete: (id: string) => void;
}): React.JSX.Element {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const keepButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingDelete) keepButtonRef.current?.focus();
  }, [confirmingDelete]);

  return (
    <div className="artifact-library-actions">
      {sourceAvailable && artifact.conversationId && (
        <button
          type="button"
          className="artifact-source-link"
          aria-label={`Open source chat ${artifact.conversationTitle}`}
          onClick={() => onOpenConversation(artifact.conversationId!)}
        >
          <MessageSquarePlus size={14} />
          <span>From “{artifact.conversationTitle}”</span>
        </button>
      )}
      {confirmingDelete ? (
        <div className="artifact-delete-confirm" role="group" aria-label={`Delete ${artifact.title}?`} aria-live="polite">
          <span>Delete this artifact?</span>
          <button ref={keepButtonRef} type="button" onClick={() => {
            setConfirmingDelete(false);
            window.setTimeout(() => deleteButtonRef.current?.focus(), 0);
          }}>Keep</button>
          <button type="button" className="danger" aria-label={`Confirm delete ${artifact.title}`} onClick={() => {
            onDelete(artifact.id);
            window.setTimeout(() => document.querySelector<HTMLButtonElement>(".artifact-new")?.focus(), 0);
          }}>Delete</button>
        </div>
      ) : (
        <button
          ref={deleteButtonRef}
          className="artifact-delete"
          type="button"
          aria-label={`Delete ${artifact.title}`}
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2 size={14} />
          <span>Delete</span>
        </button>
      )}
    </div>
  );
}

function ArtifactsView({
  ready,
  drafts,
  sourceConversationIds,
  onNew,
  onOpenDraft,
  onOpenGenerated,
  onDiscardDraft,
  onDeleteArtifact,
  onOpenConversation,
}: {
  ready: boolean;
  drafts: ArtifactDraft[];
  sourceConversationIds: ReadonlySet<string>;
  onNew: (kind?: ArtifactKind) => void;
  onOpenDraft: (draft: ArtifactDraft) => void;
  onOpenGenerated: (artifact: GeneratedArtifact) => void;
  onDiscardDraft: (id: string) => void;
  onDeleteArtifact: (id: string) => void;
  onOpenConversation: (id: string) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDiscardId, setPendingDiscardId] = useState<string | null>(null);
  const viewRef = useRef<HTMLElement>(null);
  const keepDraftRef = useRef<HTMLButtonElement>(null);
  const draftShelfHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (viewRef.current) viewRef.current.scrollTop = 0;
  }, []);

  useEffect(() => {
    if (!pendingDiscardId) return;
    const timeout = window.setTimeout(() => keepDraftRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [pendingDiscardId]);

  const activeArtifacts = drafts.filter((artifact) => !artifact.deletedAt);
  const generated = useMemo(() => drafts.flatMap((artifact): GeneratedArtifact[] => {
    const html = artifactHtml(artifact);
    if (artifact.lifecycle === "draft" || artifact.deletedAt || html === null) return [];
    return [{
      id: artifact.id,
      title: artifact.title,
      html,
      createdAt: artifact.createdAt,
      runId: artifact.provenance?.runId,
      conversationId: artifact.provenance?.conversationId,
      conversationTitle: artifact.provenance?.conversationTitle ?? "Deleted source chat",
    }];
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [drafts]);

  const availableGenerated = generated;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleDrafts = activeArtifacts.filter((artifact) => artifact.lifecycle === "draft")
    .filter((draft) => !normalizedQuery || `${draft.title} ${draft.provenance?.conversationTitle ?? ""}`.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const visibleGenerated = availableGenerated.filter((artifact) => !normalizedQuery || `${artifact.title} ${artifact.conversationTitle}`.toLowerCase().includes(normalizedQuery));
  const featured = visibleGenerated[0] ?? null;
  const recent = visibleGenerated.slice(1, 4);
  const archive = visibleGenerated.slice(4);
  const totalItems = activeArtifacts.length;
  const visibleItems = visibleDrafts.length + visibleGenerated.length;
  const hasAnyItems = totalItems > 0;
  const hasVisibleItems = visibleItems > 0;

  return (
    <section className="surface-view artifacts-view workspace-arrival" ref={viewRef} aria-labelledby="artifacts-title">
      <header className="artifact-page-header workspace-page-header">
        <div className="artifact-heading-copy workspace-page-copy">
          <span>{ready ? `Local project · ${totalItems} ${totalItems === 1 ? "item" : "items"}` : "Loading local project"}</span>
          <h1 id="artifacts-title">Artifacts</h1>
          <p>Pick up a draft or revisit pages Khadim created with you.</p>
        </div>
        <div className="artifact-create-control">
          <button className="artifact-new workspace-primary-action" type="button" disabled={!ready} aria-expanded={createOpen} onClick={() => setCreateOpen((current) => !current)}><Plus size={17} /> Create artifact</button>
          {createOpen && <div className="artifact-create-menu" role="menu" aria-label="Artifact type">
            <button type="button" role="menuitem" onClick={() => onNew("document")}><FileText size={18} /><span><strong>Document</strong><small>Paginated writing and reports</small></span></button>
            <button type="button" role="menuitem" onClick={() => onNew("site")}><Globe2 size={18} /><span><strong>Website</strong><small>Responsive HTML and pages</small></span></button>
            <button type="button" role="menuitem" onClick={() => onNew("canvas")}><FilePenLine size={18} /><span><strong>Canvas</strong><small>Freeform diagrams and ideas</small></span></button>
          </div>}
        </div>
      </header>

      {hasAnyItems && (
        <div className="artifact-toolbar">
          <div className="artifact-search">
            <label className="sr-only" htmlFor="artifact-search-input">Search artifacts</label>
            <Search size={16} />
            <input id="artifact-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search artifacts and source chats" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear artifact search"><X size={14} /></button>}
          </div>
          <span className="artifact-result-count" aria-live="polite">{normalizedQuery ? `${visibleItems} found` : "Stored on this device"}</span>
        </div>
      )}

      {!ready ? (
        <section className="artifact-loading" aria-live="polite"><span /><p>Loading your artifacts…</p></section>
      ) : !hasAnyItems ? (
        <section className="artifact-empty">
          <div className="artifact-empty-paper" aria-hidden="true"><span /><span /><span /><i /></div>
          <div>
            <span>Your project is ready</span>
            <h2>Make something you can keep working on.</h2>
            <p>Create a page here, or ask Khadim for a document in chat. Drafts stay on this device.</p>
            <div className="artifact-empty-actions">
              <button type="button" onClick={() => onNew("document")}><FileText size={17} /> Document</button>
              <button type="button" onClick={() => onNew("site")}><Globe2 size={17} /> Website</button>
              <button type="button" onClick={() => onNew("canvas")}><FilePenLine size={17} /> Canvas</button>
            </div>
          </div>
        </section>
      ) : !hasVisibleItems ? (
        <section className="artifact-no-results">
          <Search size={21} />
          <h2>No matching artifacts</h2>
          <p>Try a title or the name of the chat it came from.</p>
          <button type="button" onClick={() => setQuery("")}>Clear search</button>
        </section>
      ) : (
        <div className="artifact-workbench">
          {visibleDrafts.length > 0 && (
            <section className="artifact-draft-shelf" aria-labelledby="artifact-drafts-title">
              <header>
                <span>In progress</span>
                <h2 id="artifact-drafts-title" ref={draftShelfHeadingRef} tabIndex={-1}>Working drafts</h2>
                <p>Changes are kept locally as you work.</p>
              </header>
              <div className="artifact-draft-list">
                {visibleDrafts.map((draft, index) => {
                  const html = artifactHtml(draft) ?? "";
                  const title = draft.title;
                  const edited = draft.updatedAt !== draft.createdAt || (isSiteContent(draft.content) && draft.content.html !== draft.content.baselineHtml);
                  return (
                    <article className="artifact-draft-row" key={draft.id}>
                      <div className="artifact-draft-open">
                        <ArtifactDraftPreview artifact={draft} html={html} />
                        <span className="artifact-draft-copy">
                          <span>{edited ? "Edited draft" : "New draft"} · {formatArtifactDate(draft.updatedAt)}</span>
                          <strong>{title}</strong>
                          <small>{draft.provenance?.conversationTitle ? `From ${draft.provenance.conversationTitle}` : "Started in Studio"}</small>
                        </span>
                        <span className="artifact-continue">Continue <ArrowUp size={14} /></span>
                        <button className="artifact-open-overlay" data-artifact-draft-id={draft.id} type="button" onClick={() => onOpenDraft(draft)} aria-label={`Continue editing ${title}`} />
                      </div>
                      {pendingDiscardId === draft.id ? (
                        <div className="artifact-discard-confirm" role="group" aria-label={`Discard ${title}?`} aria-live="polite">
                          <span>Discard this draft?</span>
                          <button ref={keepDraftRef} type="button" onClick={() => {
                            setPendingDiscardId(null);
                            window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-artifact-discard-id="${CSS.escape(draft.id)}"]`)?.focus(), 0);
                          }}>Keep</button>
                          <button type="button" className="danger" onClick={() => {
                            const nextDraftId = visibleDrafts[index + 1]?.id ?? visibleDrafts[index - 1]?.id;
                            onDiscardDraft(draft.id);
                            setPendingDiscardId(null);
                            window.setTimeout(() => {
                              if (nextDraftId) document.querySelector<HTMLButtonElement>(`[data-artifact-draft-id="${CSS.escape(nextDraftId)}"]`)?.focus();
                              else viewRef.current?.querySelector<HTMLButtonElement>(".artifact-new")?.focus();
                            }, 0);
                          }}>Discard</button>
                        </div>
                      ) : (
                        <button className="artifact-discard" data-artifact-discard-id={draft.id} type="button" onClick={() => setPendingDiscardId(draft.id)} aria-label={`Discard ${title}`}><Trash2 size={16} /></button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {featured && (
            <section className="artifact-created" aria-labelledby="created-artifacts-title">
              <header className="artifact-section-heading">
                <div><span>Created with Khadim</span><h2 id="created-artifacts-title">Ready to revisit</h2></div>
                <span>{visibleGenerated.length} {visibleGenerated.length === 1 ? "artifact" : "artifacts"}</span>
              </header>
              <div className="artifact-created-layout">
                <article className="artifact-featured" key={featured.id}>
                  <div className="artifact-featured-main">
                    <ArtifactPreview html={featured.html} title={featured.title} variant="featured" />
                    <div className="artifact-featured-copy">
                      <span><small>Most recent</small><time dateTime={featured.createdAt}>{formatArtifactDate(featured.createdAt)}</time></span>
                      <strong>{featured.title}</strong>
                      <span className="artifact-open-label">Open artifact <ArrowUp size={15} /></span>
                    </div>
                    <button type="button" className="artifact-open-overlay" onClick={() => onOpenGenerated(featured)} aria-label={`Open ${featured.title}`} />
                  </div>
                  <ArtifactLibraryActions
                    artifact={featured}
                    sourceAvailable={Boolean(featured.conversationId && sourceConversationIds.has(featured.conversationId))}
                    onOpenConversation={onOpenConversation}
                    onDelete={onDeleteArtifact}
                  />
                </article>

                {recent.length > 0 && (
                  <div className="artifact-recent-list" aria-label="Recent artifacts">
                    {recent.map((artifact) => (
                      <article className="artifact-recent-row" key={artifact.id}>
                        <div className="artifact-recent-main">
                          <ArtifactPreview html={artifact.html} title={artifact.title} variant="recent" />
                          <span>
                            <small><time dateTime={artifact.createdAt}>{formatArtifactDate(artifact.createdAt)}</time></small>
                            <strong>{artifact.title}</strong>
                          </span>
                          <ArrowUp size={15} />
                          <button className="artifact-open-overlay" type="button" onClick={() => onOpenGenerated(artifact)} aria-label={`Open ${artifact.title}`} />
                        </div>
                        <ArtifactLibraryActions
                          artifact={artifact}
                          sourceAvailable={Boolean(artifact.conversationId && sourceConversationIds.has(artifact.conversationId))}
                          onOpenConversation={onOpenConversation}
                          onDelete={onDeleteArtifact}
                        />
                      </article>
                    ))}
                  </div>
                )}
              </div>

              {archive.length > 0 && (
                <div className="artifact-archive">
                  <div className="artifact-archive-heading"><h3>Earlier work</h3><span>{archive.length}</span></div>
                  {archive.map((artifact) => (
                    <article key={artifact.id}>
                      <button type="button" onClick={() => onOpenGenerated(artifact)}>
                        <span className="artifact-archive-mark"><FileText size={17} /></span>
                        <span><strong>{artifact.title}</strong><small>Saved artifact</small></span>
                        <time dateTime={artifact.createdAt}>{formatArtifactDate(artifact.createdAt)}</time>
                        <ArrowUp size={15} />
                      </button>
                      <ArtifactLibraryActions
                        artifact={artifact}
                        sourceAvailable={Boolean(artifact.conversationId && sourceConversationIds.has(artifact.conversationId))}
                        onOpenConversation={onOpenConversation}
                        onDelete={onDeleteArtifact}
                      />
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}

export default App;
