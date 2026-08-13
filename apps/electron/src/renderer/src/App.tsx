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
import type { AgentApprovalDecision, AgentApprovalRequest, AgentEventEnvelope, AgentQuestion, AgentQuestionAnswers, AgentQuestionRequest, AgentRun, AgentRunRecoverySnapshot, AgentRuntimeMode, AppSettings, ArtifactDraft, ArtifactKind, ChatAttachment, ChatMessage, Conversation, GoogleConnection, HarnessMode, ModelConfig, PluginHarnessCommand, PluginHarnessDescriptor, PluginHarnessMode, PluginHarnessModel, Project, ProjectAvailability, SoundMood, TokenUsage, ToolCallActivity } from "../../shared/types";
import { isPluginHarnessId } from "../../shared/plugins";
import { parseStudioArtifactEditPayload } from "../../shared/studio-artifact-edit";
import { applySequencedAgentEvent, conversationUsage, reconcileTerminalAssistant } from "../../shared/agent-event-reducer";
import { commandHelp, parseChatCommand } from "../../shared/chat-commands";
import { artifactHtml, artifactTitle, createArtifact, deleteArtifact, discardArtifactChanges, isSiteContent } from "./artifact-model";
import type { AgentDefinition } from "./agents/types";
import { AgentsView, type GeneratedAgentDraft } from "./agents/AgentsView";
import { AppsView } from "./capabilities/AppsView";
import { AttachmentBadge } from "./chat/AttachmentBadge";
import { Composer } from "./chat/Composer";
import { CoordinationTrace } from "./chat/CoordinationTrace";
import LoadingState from "./chat/LoadingState";
import RecommendationCard from "./chat/RecommendationCard";
import { playInterfaceSound } from "./chat/interface-sounds";
import { extractHtml, extractRecommendation, legacyFileAttachments, messageCopyWithoutArtifactSource, messageCopyWithoutRecommendation, messageCopyWithoutStudioEdit } from "./chat/message-content";
import { ToolChips } from "./chat/ToolChips";
import { toolOptions } from "./chat/tool-options";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { createId, titleFromPrompt } from "./shared/text";
import { FeatureMaturityBadge } from "./feature-maturity";
import { StudioWorkspace, type StudioAgentStatus } from "./studio/StudioWorkspace";
import { applyStudioArtifactEdit, enforceCanvasSelectionBinding, parseStudioArtifactEdit, studioAgentPrompt, type StudioArtifactEdit } from "./studio/studio-agent-edit";
import { AccountDialog, SettingsDialog } from "./settings/SettingsDialogs";
import { applyDocumentTheme } from "./theme/document-theme";
import { AnimatedPhosphorIcon } from "./ui/AnimatedPhosphorIcon";
import { KhadimLogoScene } from "./ui/KhadimLogoScene";
import { Logo } from "./ui/Logo";
import { ModelIcon } from "./ui/ModelIcon";
import { Badge } from "./ui/primitives";

const starterPrompts = [
  { label: "Plan my week", prompt: "Help me plan a realistic week around my priorities. Ask me what you need to know first." },
  { label: "Make a document", prompt: "Create a polished one-page HTML document for an idea I have. Ask me about the audience and purpose." },
  { label: "Research something", prompt: "Help me research a topic and turn the findings into a clear, practical brief." },
  { label: "Automate a task", prompt: "Help me automate a repetitive task on my computer. Start by understanding the exact workflow." },
];

const pluginModelSelectionStorageKey = "khadim.plugin-model-selections.v1";
const pluginModeSelectionStorageKey = "khadim.plugin-mode-selections.v1";
const runtimeModeStorageKey = "khadim.runtime-mode.v1";
const multiAgentStorageKey = "khadim.multi-agent.v1";
const promptHistoryStorageKey = "khadim.prompt-history.v1";

function parseGeneratedAgentDraft(content: string): GeneratedAgentDraft {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = JSON.parse((match?.[1] ?? content).trim()) as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!name || !description || !prompt) throw new Error("The model returned an incomplete draft. Try generating it again.");
  const validConnectors = new Set(["web", "files", "apps"]);
  const connectors = Array.isArray(raw.connectors) ? raw.connectors.filter((value): value is string => typeof value === "string" && validConnectors.has(value)) : [];
  const validApps = new Set(["gmail", "drive", "calendar"]);
  const appAccess = Array.isArray(raw.appAccess) ? raw.appAccess.filter((value): value is "gmail" | "drive" | "calendar" => typeof value === "string" && validApps.has(value)) : [];
  const color = raw.color === "coral" || raw.color === "orange" || raw.color === "pink" ? raw.color : "blue";
  return { name: name.slice(0, 60), description: description.slice(0, 160), prompt, connectors, appAccess: connectors.includes("apps") ? appAccess : [], color };
}

function loadStringSelections(key = pluginModelSelectionStorageKey): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function questionRequestFromEvent(event: AgentEventEnvelope["event"]): AgentQuestionRequest | null {
  if (event.event_type !== "question" || event.metadata?.resolved === true) return null;
  const requestId = event.metadata?.requestId;
  const rawQuestions = event.metadata?.questions;
  if (typeof requestId !== "string" || !requestId.trim() || !Array.isArray(rawQuestions)) return null;
  const questions = rawQuestions.map<AgentQuestion | null>((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.header !== "string" || typeof raw.question !== "string" || !Array.isArray(raw.options)) return null;
    const options = raw.options.flatMap((option) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) return [];
      const record = option as Record<string, unknown>;
      if (typeof record.label !== "string" || !record.label.trim()) return [];
      return [{ label: record.label, ...(typeof record.description === "string" ? { description: record.description } : {}) }];
    });
    if (!raw.id.trim() || !raw.header.trim() || !raw.question.trim()) return null;
    return { id: raw.id, header: raw.header, question: raw.question, options, ...(raw.multiSelect === true ? { multiSelect: true } : {}) };
  }).filter((question): question is AgentQuestion => question !== null);
  return questions.length > 0 ? { requestId, questions } : null;
}

function approvalRequestFromEvent(event: AgentEventEnvelope["event"]): AgentApprovalRequest | null {
  if (event.event_type !== "approval" || event.metadata?.resolved === true) return null;
  const requestId = event.metadata?.requestId;
  const kind = event.metadata?.kind;
  const title = event.metadata?.title;
  if (typeof requestId !== "string" || !requestId.trim()) return null;
  if (kind !== "command" && kind !== "file-read" && kind !== "file-change" && kind !== "tool") return null;
  if (typeof title !== "string" || !title.trim()) return null;
  return { requestId, kind, title, ...(typeof event.metadata?.detail === "string" ? { detail: event.metadata.detail } : {}) };
}

function loadRuntimeMode(): AgentRuntimeMode {
  const saved = localStorage.getItem(runtimeModeStorageKey);
  return saved === "auto-accept-edits" || saved === "full-access" ? saved : "approval-required";
}

function loadPromptHistory(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(promptHistoryStorageKey) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").slice(-100) : [];
  } catch {
    return [];
  }
}

function conversationMarkdown(conversation: Conversation): string {
  const body = conversation.messages.map((message) => `## ${message.role === "user" ? "You" : "Khadim"}\n\n${message.content}`).join("\n\n");
  return `# ${conversation.title}\n\n${body}\n`;
}

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
  /** Trusted Canvas selection captured when an agent run starts from the canvas. */
  canvasSelection?: { pageId: string; elementIds: string[] };
}

interface PendingRunLaunch {
  cancelRequested: boolean;
  startSent: boolean;
  startResult: Promise<void> | null;
  settled: Promise<void>;
  resolveSettled: () => void;
}

interface ActiveRunEntry {
  runId: string;
  projectId: string;
  conversationId: string;
  question?: { request: AgentQuestionRequest };
  approval?: { request: AgentApprovalRequest };
  questionResponding?: boolean;
  approvalResponding?: boolean;
}

function artifactEditActivity(runId: string, artifact: ArtifactDraft, edit: StudioArtifactEdit): ToolCallActivity {
  const files = Object.keys(edit.files ?? {});
  const componentIds = edit.componentPatches?.map((patch) => patch.id) ?? [];
  const canvasCommandCount = edit.canvasCommands?.commands.length ?? 0;
  const changes = files.length + componentIds.length + (edit.visual ? 1 : 0) + (edit.html !== undefined ? 1 : 0) + (edit.title ? 1 : 0) + canvasCommandCount;
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
      canvasCommands: edit.canvasCommands ? { pageId: edit.canvasCommands.pageId, selectionIds: edit.canvasCommands.selectionIds, commandCount: canvasCommandCount } : undefined,
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
  connectors: ["web", "files", "apps"],
  appAccess: ["gmail", "drive", "calendar"],
  builtIn: true,
};

const agentStorageKey = "khadim.agents.v1";

function loadAgents(): AgentDefinition[] {
  try {
    const stored = JSON.parse(localStorage.getItem(agentStorageKey) ?? "[]") as AgentDefinition[];
    const validColors = new Set<AgentDefinition["color"]>(["coral", "blue", "orange", "pink"]);
    const validApps = new Set(["gmail", "drive", "calendar"]);
    const customAgents = stored.filter((agent) => agent.id !== defaultAgent.id && agent.type === "agent" && agent.name && agent.prompt).map((agent) => ({
      ...agent,
      description: typeof agent.description === "string" ? agent.description : "Custom agent",
      connectors: Array.isArray(agent.connectors) ? agent.connectors.filter((id): id is string => typeof id === "string" && toolOptions.some((tool) => tool.id === id)) : [],
      appAccess: Array.isArray(agent.appAccess) ? agent.appAccess.filter((id) => validApps.has(id)) : agent.connectors?.includes("apps") ? ["gmail", "drive", "calendar"] : [],
      color: validColors.has(agent.color) ? agent.color : "blue",
    } satisfies AgentDefinition));
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
  // Normalized, harness-agnostic active-run registry. Runs are keyed by runId
  // and indexed by conversation so each chat can host at most one active run
  // while independent chats/projects run concurrently. Pending questions and
  // approvals live alongside their run instead of overwriting a global slot.
  const [activeRuns, setActiveRuns] = useState<Record<string, ActiveRunEntry>>({});
  const [activeRunByConversation, setActiveRunByConversation] = useState<Record<string, string>>({});
  const [runtimeMode, setRuntimeModeState] = useState<AgentRuntimeMode>(loadRuntimeMode);
  const [multiAgent, setMultiAgentState] = useState(() => localStorage.getItem(multiAgentStorageKey) === "true");
  const [promptHistory, setPromptHistory] = useState<string[]>(loadPromptHistory);
  const [isCompact, setIsCompact] = useState(() => window.matchMedia("(max-width: 841px)").matches);
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia("(max-width: 841px)").matches);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsIntent, setSettingsIntent] = useState<{ section: "appearance" | "model" | "workspace"; provider?: string } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [artifactDraftState, setArtifactDraftState] = useState<ArtifactDraftState>({ projectId: null, drafts: [], hydrated: false });
  const [artifactSaveState, setArtifactSaveState] = useState<ArtifactSaveState>("loading");
  const [studioArtifact, setStudioArtifact] = useState<ArtifactDraft | null>(null);
  const [studioChatWidth, setStudioChatWidth] = useState(520);
  // Canvas artifacts open with the main project chat hidden so the canvas has
  // the full Studio width. Visibility is remembered per canvas artifact for
  // the current app session; documents and websites always show the chat.
  const [canvasChatVisible, setCanvasChatVisible] = useState<Record<string, boolean>>({});
  const [studioAgentStatus, setStudioAgentStatus] = useState<(StudioAgentStatus & { artifactId: string }) | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [pluginHarnesses, setPluginHarnesses] = useState<PluginHarnessDescriptor[]>([]);
  const [pluginModels, setPluginModels] = useState<Record<string, PluginHarnessModel[]>>({});
  const [pluginModelSelections, setPluginModelSelections] = useState<Record<string, string>>(() => loadStringSelections());
  const [pluginModes, setPluginModes] = useState<Record<string, PluginHarnessMode[]>>({});
  const [pluginCommands, setPluginCommands] = useState<Record<string, PluginHarnessCommand[]>>({});
  const [pluginModeSelections, setPluginModeSelections] = useState<Record<string, string>>(() => loadStringSelections(pluginModeSelectionStorageKey));
  const [pluginModelsLoading, setPluginModelsLoading] = useState<string | null>(null);
  const [pluginModelErrors, setPluginModelErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<AppMode>("chat");
  const [activeView, setActiveView] = useState<AppView>("welcome");
  const [agents, setAgents] = useState<AgentDefinition[]>(loadAgents);
  const [selectedAgentId, setSelectedAgentId] = useState("everyday");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [enabledTools, setEnabledTools] = useState<string[]>(() => toolOptions.filter((tool) => tool.defaultEnabled).map((tool) => tool.id));
  const [googleConnection, setGoogleConnection] = useState<GoogleConnection | null>(null);
  const [systemPromptOverride, setSystemPromptOverride] = useState<string | null>(null);
  const activeRunsRef = useRef<Record<string, ActiveRunEntry>>({});
  const activeRunByConversationRef = useRef<Record<string, string>>({});
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
  const pendingAgentDraftRunsRef = useRef(new Map<string, { content: string; resolve: (draft: GeneratedAgentDraft) => void; reject: (cause: Error) => void; conversationId: string; projectId: string; timeout: number }>());
  const appliedStudioEditRunsRef = useRef(new Set<string>());
  const pendingConversationSelectionRef = useRef<{ projectId: string; conversationId: string } | null>(null);
  const finalizedRunIdsRef = useRef(new Set<string>());
  const soundMoodRef = useRef<SoundMood>("subtle");
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
  // Effective harness is per-chat for an existing conversation and global for
  // the welcome composer. For an existing chat the durable `conversation.harness`
  // wins; legacy chats without that field fall back to their last run snapshot's
  // harness, then to the global settings default. New chats persist this value
  // so switching chats restores each chat's own capability.
  const effectiveHarness: HarnessMode = selected
    ? selected.harness
      ?? selected.runs?.at(-1)?.harness
      ?? settings?.harness
      ?? "assistant"
    : settings?.harness
      ?? "assistant";

  // The active run for the currently selected chat, if any. The composer's
  // running/stop state and pending decision panels are derived from this entry
  // so concurrent runs in other chats never bleed into the visible chat.
  const selectedActiveRunId = selectedId ? activeRunByConversation[selectedId] ?? null : null;
  const selectedActiveRun = selectedActiveRunId ? activeRuns[selectedActiveRunId] ?? null : null;

  function registerActiveRun(runId: string, projectId: string, conversationId: string): void {
    const entry: ActiveRunEntry = { runId, projectId, conversationId };
    activeRunsRef.current = { ...activeRunsRef.current, [runId]: entry };
    setActiveRuns((current) => ({ ...current, [runId]: entry }));
    activeRunByConversationRef.current = { ...activeRunByConversationRef.current, [conversationId]: runId };
    setActiveRunByConversation((current) => ({ ...current, [conversationId]: runId }));
  }

  function patchActiveRun(runId: string, patch: Partial<ActiveRunEntry>): void {
    const current = activeRunsRef.current[runId];
    if (!current) return;
    const next = { ...current, ...patch };
    activeRunsRef.current = { ...activeRunsRef.current, [runId]: next };
    setActiveRuns((state) => ({ ...state, [runId]: next }));
  }

  function clearActiveRun(runId: string): void {
    const entry = activeRunsRef.current[runId];
    if (!entry) return;
    const { [runId]: _removed, ...rest } = activeRunsRef.current;
    activeRunsRef.current = rest;
    setActiveRuns((current) => {
      const { [runId]: _r, ...next } = current;
      return next;
    });
    // Only clear the conversation index if it still points at this run so a
    // newer run in the same chat is never evicted by an older run finalizing.
    if (activeRunByConversationRef.current[entry.conversationId] === runId) {
      activeRunByConversationRef.current = { ...activeRunByConversationRef.current };
      delete activeRunByConversationRef.current[entry.conversationId];
      setActiveRunByConversation((current) => {
        if (current[entry.conversationId] !== runId) return current;
        const next = { ...current };
        delete next[entry.conversationId];
        return next;
      });
    }
  }

  useEffect(() => {
    soundMoodRef.current = settings?.soundMood ?? (settings?.soundsEnabled === false ? "off" : "subtle");
  }, [settings?.soundMood, settings?.soundsEnabled]);
  const activePluginHarnessId = effectiveHarness && isPluginHarnessId(effectiveHarness) ? effectiveHarness : null;
  const activePluginModels = activePluginHarnessId ? pluginModels[activePluginHarnessId] ?? [] : [];
  const selectedPluginModelId = activePluginHarnessId
    ? pluginModelSelections[activePluginHarnessId] ?? activePluginModels.find((model) => model.isDefault)?.id ?? activePluginModels[0]?.id
    : undefined;
  const activePluginModes = activePluginHarnessId ? pluginModes[activePluginHarnessId] ?? [] : [];
  const activePluginCommands = activePluginHarnessId ? pluginCommands[activePluginHarnessId] ?? [] : [];
  const selectedPluginModeId = activePluginHarnessId
    ? pluginModeSelections[activePluginHarnessId] ?? activePluginModes.find((mode) => mode.isDefault)?.id ?? activePluginModes[0]?.id
    : undefined;
  const chatModels: ModelConfig[] = activePluginHarnessId
    ? activePluginModels.map((model, index) => ({
        ...model,
        isDefault: model.isDefault ?? index === 0,
        isActive: model.id === selectedPluginModelId,
        hasApiKey: true,
      }))
    : settings?.models ?? [];
  const activeChatModel = chatModels.find((model) => model.isActive) ?? chatModels[0];
  const visibleConversations = conversations;
  // Canvas artifacts default to a hidden main chat (full-width canvas);
  // documents and websites always keep the chat beside Studio. The chosen
  // visibility is remembered per canvas artifact for the app session.
  const showStudioChat = !studioArtifact
    || studioArtifact.content.format !== "khadim-canvas"
    || canvasChatVisible[studioArtifact.id] === true;
  const isCanvasArtifact = Boolean(studioArtifact && studioArtifact.content.format === "khadim-canvas");
  function toggleCanvasChat(): void {
    if (!studioArtifact || studioArtifact.content.format !== "khadim-canvas") return;
    const id = studioArtifact.id;
    setCanvasChatVisible((current) => ({ ...current, [id]: current[id] !== true }));
  }
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
    const harnessId = activePluginHarnessId;
    const projectPath = activeProject?.rootPath;
    if (!harnessId || !projectPath || !window.khadim.plugins?.models || !window.khadim.plugins.modes) return;
    let cancelled = false;
    setPluginModelsLoading(harnessId);
    setPluginModelErrors((current) => {
      const next = { ...current };
      delete next[harnessId];
      return next;
    });
    void Promise.all([
      window.khadim.plugins.models(harnessId, projectPath),
      window.khadim.plugins.modes(harnessId, projectPath),
      window.khadim.plugins.commands?.(harnessId, projectPath) ?? Promise.resolve([]),
    ]).then(([models, modes, commands]) => {
      if (cancelled) return;
      setPluginModels((current) => ({ ...current, [harnessId]: models }));
      setPluginModes((current) => ({ ...current, [harnessId]: modes }));
      setPluginCommands((current) => ({ ...current, [harnessId]: commands }));
      setPluginModelSelections((current) => {
        const selected = models.some((model) => model.id === current[harnessId])
          ? current[harnessId]
          : models.find((model) => model.isDefault)?.id ?? models[0]?.id;
        const next = { ...current };
        if (selected) next[harnessId] = selected;
        else delete next[harnessId];
        localStorage.setItem(pluginModelSelectionStorageKey, JSON.stringify(next));
        return next;
      });
      setPluginModeSelections((current) => {
        const selected = modes.some((mode) => mode.id === current[harnessId])
          ? current[harnessId]
          : modes.find((mode) => mode.isDefault)?.id ?? modes[0]?.id;
        const next = { ...current };
        if (selected) next[harnessId] = selected;
        else delete next[harnessId];
        localStorage.setItem(pluginModeSelectionStorageKey, JSON.stringify(next));
        return next;
      });
    }).catch((cause: unknown) => {
      if (cancelled) return;
      const message = cause instanceof Error ? cause.message : "Models could not be loaded from this harness.";
      setPluginModels((current) => ({ ...current, [harnessId]: [] }));
      setPluginModes((current) => ({ ...current, [harnessId]: [] }));
      setPluginCommands((current) => ({ ...current, [harnessId]: [] }));
      setPluginModelErrors((current) => ({ ...current, [harnessId]: message }));
    }).finally(() => {
      if (!cancelled) setPluginModelsLoading((current) => current === harnessId ? null : current);
    });
    return () => { cancelled = true; };
  }, [activePluginHarnessId, activeProject?.rootPath, pluginHarnesses]);

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
    const activeRunIdsAtRecoveryStart = new Set(
      Object.entries(activeRunsRef.current)
        .filter(([, entry]) => entry.projectId === projectId)
        .map(([runId]) => runId),
    );
    const conversationsAtRecoveryStart = new Map(
      [...conversationCacheRef.current.values()]
        .filter((conversation) => conversation.projectId === projectId)
        .map((conversation) => [conversation.id, conversation]),
    );
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
          // Recovered Studio run targets must retain the trusted canvas
          // selection recorded on the immutable run snapshot so the renderer
          // fallback path can keep enforcing the exact selection binding.
          pendingStudioEditRunsRef.current.set(snapshot.runId, {
            projectId: snapshot.projectId,
            artifactId: recoveredRun.artifactId,
            ...(recoveredRun.canvasSelection ? { canvasSelection: recoveredRun.canvasSelection } : {}),
          });
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
      const activeRecoveryRunIds = new Set<string>();
      const changedConversationIds = new Set<string>();
      const terminalSnapshots: AgentRunRecoverySnapshot[] = [];
      let recoveryWarning: string | null = null;

      let recoveredConversations = savedConversations.map((conversation) => {
        let updated = conversation;
        for (const snapshot of snapshotsByConversation.get(conversation.id) ?? []) {
          const run = updated.runs?.find((candidate) => candidate.id === snapshot.runId);
          const assistant = updated.messages.find((message) => message.id === snapshot.assistantMessageId && message.runId === snapshot.runId);
          if (!run || !assistant) {
            clearActiveRun(snapshot.runId);
            recoveryWarning = "A running task could not be matched to its saved chat. Its buffered output was kept for a later recovery.";
            continue;
          }
          if (snapshot.terminal) clearActiveRun(snapshot.runId);
          else {
            activeRecoveryRunIds.add(snapshot.runId);
            registerActiveRun(snapshot.runId, snapshot.projectId, snapshot.conversationId);
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
            // Recovered events maintain pending decision state just like live
            // events so a chat that was reloaded mid-question can still answer it.
            if (sequenced.event.event_type === "question") {
              const requestId = sequenced.event.metadata?.requestId;
              if (sequenced.event.metadata?.resolved === true) {
                if (requestId) patchActiveRun(snapshot.runId, { question: undefined });
              } else {
                const request = questionRequestFromEvent(sequenced.event);
                if (request) patchActiveRun(snapshot.runId, { question: { request } });
              }
            }
            if (sequenced.event.event_type === "approval") {
              const requestId = sequenced.event.metadata?.requestId;
              if (sequenced.event.metadata?.resolved === true) {
                if (requestId) patchActiveRun(snapshot.runId, { approval: undefined });
              } else {
                const request = approvalRequestFromEvent(sequenced.event);
                if (request) patchActiveRun(snapshot.runId, { approval: { request } });
              }
            }
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
      // Recovery is authoritative for the hydrated project. Drop registry
      // entries omitted from its nonterminal snapshots so a missed terminal
      // event or removed recovery record cannot leave a chat permanently locked.
      // Limit cleanup to entries present when recovery began; a run launched
      // while this request was in flight is newer than the returned snapshot.
      for (const [runId, entry] of Object.entries(activeRunsRef.current)) {
        if (entry.projectId === projectId && activeRunIdsAtRecoveryStart.has(runId) && !activeRecoveryRunIds.has(runId)) clearActiveRun(runId);
      }
      const deletedConversationIds = new Set(
        [...conversationsAtRecoveryStart.keys()]
          .filter((conversationId) => !conversationCacheRef.current.has(conversationId)),
      );
      for (const snapshot of projectSnapshots) {
        if (!deletedConversationIds.has(snapshot.conversationId)) continue;
        clearActiveRun(snapshot.runId);
        runTargetsRef.current.delete(snapshot.runId);
        pendingStudioEditRunsRef.current.delete(snapshot.runId);
        pendingLiveEventsRef.current.delete(snapshot.runId);
      }

      const sourceMessageIds = new Set(drafts.flatMap((artifact) => artifact.provenance?.messageId ? [artifact.provenance.messageId] : []));
      const storedArtifactIds = new Set(drafts.map((artifact) => artifact.id));
      const recoveredArtifacts = recoveredConversations.filter((conversation) => !deletedConversationIds.has(conversation.id)).flatMap((conversation) => conversation.messages.flatMap((message): ArtifactDraft[] => {
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
      const currentProjectConversations = [...conversationCacheRef.current.values()]
        .filter((conversation) => (
          conversation.projectId === projectId
          && conversationsAtRecoveryStart.get(conversation.id) !== conversation
        ));
      const currentProjectConversationById = new Map(currentProjectConversations.map((conversation) => [conversation.id, conversation]));
      const displayConversations = recoveredConversations
        .filter((conversation) => !deletedConversationIds.has(conversation.id))
        .map((conversation) => currentProjectConversationById.get(conversation.id) ?? conversation);
      for (const conversation of currentProjectConversations) {
        if (!displayConversations.some((candidate) => candidate.id === conversation.id)) displayConversations.unshift(conversation);
      }
      const nextCache = new Map(conversationCacheRef.current);
      for (const [conversationId, conversation] of nextCache) {
        if (conversation.projectId === projectId) nextCache.delete(conversationId);
      }
      for (const conversation of displayConversations) nextCache.set(conversation.id, conversation);
      conversationCacheRef.current = nextCache;
      artifactCacheRef.current.set(projectId, drafts);
      setConversations(displayConversations);
      setProjectConversations((current) => ({ ...current, [projectId]: displayConversations }));
      const pendingSelection = pendingConversationSelectionRef.current;
      if (pendingSelection?.projectId === projectId) {
        pendingConversationSelectionRef.current = null;
        if (displayConversations.some((conversation) => conversation.id === pendingSelection.conversationId)) {
          setActiveView("welcome");
          setSelectedId(pendingSelection.conversationId);
        } else {
          setError("That chat is no longer available in this project.");
        }
      }
      skipNextArtifactSaveRef.current = true;
      setArtifactDraftState({ projectId, drafts, hydrated: true });
      setArtifactSaveState("saved");

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
        .filter((conversation) => !deletedConversationIds.has(conversation.id) && changedConversationIds.has(conversation.id))
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
      setGoogleConnection(connection);
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
    const draftRun = pendingAgentDraftRunsRef.current.get(runId);
    if (draftRun) {
      if (event.event_type === "text_delta" && event.content) draftRun.content += event.content;
      if (event.event_type === "error") {
        pendingAgentDraftRunsRef.current.delete(runId);
        window.clearTimeout(draftRun.timeout);
        draftRun.reject(new Error(event.content?.trim() || "Khadim could not generate this agent."));
        void window.khadim.conversations.remove(draftRun.projectId, draftRun.conversationId).catch(() => undefined);
        void window.khadim.agent.acknowledge(runId).catch(() => undefined);
      } else if (event.event_type === "done") {
        pendingAgentDraftRunsRef.current.delete(runId);
        window.clearTimeout(draftRun.timeout);
        try {
          draftRun.resolve(parseGeneratedAgentDraft(draftRun.content));
        } catch (cause) {
          draftRun.reject(cause instanceof Error ? cause : new Error("The generated draft could not be read."));
        }
        void window.khadim.conversations.remove(draftRun.projectId, draftRun.conversationId).catch(() => undefined);
        void window.khadim.agent.acknowledge(runId).catch(() => undefined);
      }
      return;
    }
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

    if (event.event_type === "question") {
      const requestId = event.metadata?.requestId;
      if (event.metadata?.resolved === true) {
        if (requestId) {
          const current = activeRunsRef.current[runId];
          if (current?.question?.request.requestId === requestId) patchActiveRun(runId, { question: undefined });
        }
      } else {
        const request = questionRequestFromEvent(event);
        if (request) patchActiveRun(runId, { question: { request } });
      }
    }

    if (event.event_type === "approval") {
      const requestId = event.metadata?.requestId;
      if (event.metadata?.resolved === true) {
        if (requestId) {
          const current = activeRunsRef.current[runId];
          if (current?.approval?.request.requestId === requestId) patchActiveRun(runId, { approval: undefined });
        }
      } else {
        const request = approvalRequestFromEvent(event);
        if (request) patchActiveRun(runId, { approval: { request } });
      }
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

    if ((event.event_type === "question" || event.event_type === "approval") && event.metadata?.resolved !== true) {
      playInterfaceSound("attention", soundMoodRef.current);
    } else if (event.event_type === "done") {
      playInterfaceSound("complete", soundMoodRef.current);
    } else if (event.event_type === "error" && !/\bstopp?ed\b/i.test(event.content ?? "")) {
      playInterfaceSound("error", soundMoodRef.current);
    }

    const streamedAssistant = updated.messages.find((message) => message.id === target.assistantMessageId);
    if (streamedAssistant && studioTarget && !appliedStudioEditRunsRef.current.has(runId)) {
      const toolStudioEdit = event.event_type === "step_complete"
        && event.metadata?.tool === "artifact_edit"
        && event.metadata.artifactId === studioTarget.artifactId
        ? parseStudioArtifactEditPayload(event.metadata.artifactEdit)
        : null;
      const fallbackEdit = toolStudioEdit ?? parseStudioArtifactEdit(streamedAssistant.content);
      // Enforce the trusted Canvas selection binding before applying either the
      // tool-channel edit or the legacy <artifact-edit> text fallback.
      const studioEdit = fallbackEdit ? enforceCanvasSelectionBinding(fallbackEdit, studioTarget.canvasSelection) : null;
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
          message: event.event_type === "done" ? "Changes applied to the artifact." : "Changes applied. Finishing the response…",
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
        setStudioAgentStatus({ artifactId: studioTarget.artifactId, phase: "complete", message: "Changes applied to the artifact." });
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

    // Terminal cleanup removes only this run from the registry so concurrent
    // runs in other chats keep their pending decisions and active state.
    clearActiveRun(runId);

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
    // The send lock is per conversation: an existing chat cannot start a second
    // concurrent run, but a new chat (no selection yet) may start while another
    // chat is still running. This keeps independent chats/projects concurrent.
    if (!content || (selectedId && activeRunByConversationRef.current[selectedId])) return false;
    setPromptHistory((current) => {
      const next = [...current.filter((entry) => entry !== content), content].slice(-100);
      localStorage.setItem(promptHistoryStorageKey, JSON.stringify(next));
      return next;
    });
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
    if (!settings || !activeChatModel) {
      setError(activePluginHarnessId
        ? pluginModelErrors[activePluginHarnessId] ?? "Wait for the selected harness to report its available models."
        : "Configure an active model before starting a chat.");
      return false;
    }
    playInterfaceSound("send", soundMoodRef.current);
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
        id: activeChatModel.id,
        name: activeChatModel.name,
        provider: activeChatModel.provider,
        model: activeChatModel.model,
        baseUrl: activeChatModel.baseUrl,
        temperature: activeChatModel.temperature,
      },
      harness: effectiveHarness,
      runtimeMode,
      ...(selectedPluginModeId ? { interactionMode: selectedPluginModeId } : {}),
      multiAgent,
      enabledTools: [...enabledTools],
      enabledApps: enabledTools.includes("apps") ? [...(selectedAgent.appAccess ?? ["gmail", "drive", "calendar"])] : [],
      ...(studioEditTarget ? { artifactId: studioEditTarget.artifactId } : {}),
      ...(studioEditTarget?.canvasSelection ? { canvasSelection: studioEditTarget.canvasSelection } : {}),
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
      // Persist the effective harness so the chat retains its chosen capability
      // across reloads and chat switches. Legacy chats derive from last run.
      harness: effectiveHarness,
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
    registerActiveRun(requestedRunId, activeProjectId, conversationId);
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
        clearActiveRun(requestedRunId);
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
        ...(studioEditTarget?.canvasSelection ? { canvasSelection: studioEditTarget.canvasSelection } : {}),
        prompt: content,
        systemPrompt: systemPromptOverride ?? selectedAgent.prompt,
        enabledTools,
        enabledApps: enabledTools.includes("apps") ? [...(selectedAgent.appAccess ?? ["gmail", "drive", "calendar"])] : [],
      });
      pendingLaunch.startResult = startResult.then(() => undefined, () => undefined);
      await startResult;
    } catch (cause) {
      runTargetsRef.current.delete(requestedRunId);
      pendingStudioEditRunsRef.current.delete(requestedRunId);
      usageCallRef.current.delete(requestedRunId);
      clearActiveRun(requestedRunId);
      const message = cause instanceof Error ? cause.message : String(cause);
      playInterfaceSound("error", soundMoodRef.current);
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

  async function appendCommandResponse(command: string, response: string, harness = effectiveHarness): Promise<boolean> {
    if (!activeProjectId) return false;
    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: createId(), role: "user", content: command, createdAt: now, status: "complete" };
    const assistantMessage: ChatMessage = { id: createId(), role: "assistant", content: response, createdAt: now, status: "complete" };
    const currentSelected = selectedId ? conversationCacheRef.current.get(selectedId) ?? selected : null;
    const conversation: Conversation = currentSelected ? {
      ...currentSelected,
      updatedAt: now,
      messages: [...currentSelected.messages, userMessage, assistantMessage],
    } : {
      id: createId(),
      projectId: activeProjectId,
      engineSessionKey: `electron.v1.${createId()}`,
      title: command,
      createdAt: now,
      updatedAt: now,
      messages: [userMessage, assistantMessage],
      runs: [],
      harness,
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
        ? { section: "model", provider: argument === "codex" || argument === "openai-codex"
          ? "openai-codex"
          : argument === "copilot" || argument === "github-copilot"
            ? "github-copilot"
            : undefined }
        : null);
      setSettingsOpen(true);
      setPrompt("");
      return true;
    }
    if (name === "model") {
      if (!settings) return false;
      const availableModels = activePluginHarnessId ? activePluginModels : settings.models;
      if (!argument) return appendCommandResponse(raw, availableModels.map((model) => `- **${model.name}** (${model.id})${model.id === activeChatModel?.id ? " · active" : ""}`).join("\n") || "No models configured.");
      const normalized = argument.toLowerCase();
      const model = availableModels.find((candidate) => [candidate.id, candidate.name, candidate.model].some((value) => value.toLowerCase() === normalized));
      if (!model) return appendCommandResponse(raw, "Model not found. Use `/model` to list configured models.");
      if (activePluginHarnessId) selectChatModel(model.id);
      else await updateQuickSettings({ modelId: model.id });
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
      const choices: Array<{ id: HarnessMode; name: string }> = [{ id: "assistant", name: "Assistant" }, { id: "rpa", name: "Computer control" }, ...pluginHarnesses.map((harness) => ({ id: harness.id, name: harness.name }))];
      if (!argument) return appendCommandResponse(raw, `Current capability: **${effectiveHarness}**.\n\n${choices.map((choice) => `- ${choice.name} (\`${choice.id}\`)`).join("\n")}`);
      const normalized = argument.toLowerCase();
      const choice = choices.find((candidate) => candidate.id.toLowerCase() === normalized || candidate.name.toLowerCase() === normalized);
      if (!choice) return appendCommandResponse(raw, "Capability not found. Use `/harness` to list available runners.");
      if (!(await selectChatHarness(choice.id))) return false;
      return appendCommandResponse(raw, `Now using the **${choice.name}** capability.`, choice.id);
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
    if (name === "history") return appendCommandResponse(raw, promptHistory.slice(-20).reverse().map((entry) => `- ${entry.slice(0, 180)}`).join("\n") || "No local prompt history.");
    if (name === "clear-history") {
      localStorage.removeItem(promptHistoryStorageKey);
      setPromptHistory([]);
      return appendCommandResponse(raw, "Cleared local prompt history.");
    }
    if (name === "copy") {
      const content = selected?.messages.filter((message) => message.role === "assistant" && message.content).at(-1)?.content;
      if (!content) return appendCommandResponse(raw, "There is no assistant response to copy.");
      await navigator.clipboard.writeText(content);
      return appendCommandResponse(raw, "Copied the last assistant response.");
    }
    if (name === "export") {
      if (!selected) return appendCommandResponse(raw, "There is no conversation to export.");
      if (!window.khadim.conversations.exportMarkdown) return appendCommandResponse(raw, "Conversation export is not supported by this desktop transport.");
      const path = await window.khadim.conversations.exportMarkdown(selected.title, conversationMarkdown(selected));
      setPrompt("");
      return path ? appendCommandResponse(raw, `Exported the conversation to \`${path}\`.`) : true;
    }
    if (name === "config") {
      const directory = await window.khadim.app?.configDirectory();
      return appendCommandResponse(raw, `Config directory: ${directory ? `\`${directory}\`` : "Unavailable"}\n\nProject: **${activeProject?.name ?? "None"}**\nModel: **${activeChatModel?.name ?? "None"}**\nCapability: **${settings?.harness ?? "assistant"}**\nRuntime: **${runtimeMode}**\nMulti-agent: **${multiAgent ? "on" : "off"}**`);
    }
    if (name === "version") return appendCommandResponse(raw, `Khadim ${await window.khadim.app?.version() ?? "0.1.0"}`);
    if (name === "refresh-models") {
      if (activePluginHarnessId && activeProject?.rootPath && window.khadim.plugins?.refreshCatalog) {
        const catalog = await window.khadim.plugins.refreshCatalog(activePluginHarnessId, activeProject.rootPath);
        setPluginModels((current) => ({ ...current, [activePluginHarnessId]: catalog.models }));
        setPluginModes((current) => ({ ...current, [activePluginHarnessId]: catalog.modes }));
        setPluginCommands((current) => ({ ...current, [activePluginHarnessId]: catalog.commands ?? [] }));
        return appendCommandResponse(raw, `Refreshed **${catalog.models.length}** models, **${catalog.modes.length}** modes, and **${catalog.commands?.length ?? 0}** commands from the selected harness.`);
      }
      const catalog = await window.khadim.models.catalog(true);
      return appendCommandResponse(raw, `Refreshed **${catalog.reduce((total, provider) => total + provider.models.length, 0)}** models across **${catalog.length}** providers.`);
    }
    if (name === "theme") {
      setSettingsIntent({ section: "appearance" });
      setSettingsOpen(true);
      setPrompt("");
      return true;
    }
    if (name === "multi" || name === "multi-agent") {
      const next = argument ? !["off", "false", "0", "disable"].includes(argument.toLowerCase()) : !multiAgent;
      setMultiAgent(next);
      return appendCommandResponse(raw, `Multi-agent mode is now **${next ? "on" : "off"}** for Assistant and Computer control runs.`);
    }
    return appendCommandResponse(raw, `\`/${name}\` is not available in this chat.`);
  }

  async function stopRun(): Promise<boolean> {
    // Stop targets the active run for the selected chat so concurrent runs in
    // other chats are never aborted by an unrelated composer.
    const runId = selectedId ? activeRunByConversationRef.current[selectedId] ?? null : null;
    if (!runId) return true;
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

  async function stopRunForConversation(conversationId: string): Promise<boolean> {
    const runId = activeRunByConversationRef.current[conversationId] ?? null;
    if (!runId) return true;
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

  async function answerPendingQuestion(answers: AgentQuestionAnswers): Promise<void> {
    const runId = selectedActiveRunId;
    const entry = runId ? activeRunsRef.current[runId] : undefined;
    const pending = entry?.question;
    if (!runId || !pending || entry?.questionResponding) return;
    patchActiveRun(runId, { questionResponding: true });
    setError(null);
    try {
      await window.khadim.agent.answerQuestion(runId, pending.request.requestId, answers);
      playInterfaceSound("send", soundMoodRef.current);
      if (activeRunsRef.current[runId]?.question?.request.requestId === pending.request.requestId) {
        patchActiveRun(runId, { question: undefined });
      }
      window.setTimeout(() => promptRef.current?.focus(), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The answer could not be sent.");
    } finally {
      patchActiveRun(runId, { questionResponding: false });
    }
  }

  async function answerPendingApproval(decision: AgentApprovalDecision): Promise<void> {
    const runId = selectedActiveRunId;
    const entry = runId ? activeRunsRef.current[runId] : undefined;
    const pending = entry?.approval;
    if (!runId || !pending || entry?.approvalResponding) return;
    patchActiveRun(runId, { approvalResponding: true });
    setError(null);
    try {
      await window.khadim.agent.answerApproval(runId, pending.request.requestId, decision);
      playInterfaceSound("send", soundMoodRef.current);
      if (activeRunsRef.current[runId]?.approval?.request.requestId === pending.request.requestId) {
        patchActiveRun(runId, { approval: undefined });
      }
      window.setTimeout(() => promptRef.current?.focus(), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The approval response could not be sent.");
    } finally {
      patchActiveRun(runId, { approvalResponding: false });
    }
  }

  function selectRuntimeMode(mode: AgentRuntimeMode): void {
    localStorage.setItem(runtimeModeStorageKey, mode);
    setRuntimeModeState(mode);
  }

  function setMultiAgent(enabled: boolean): void {
    localStorage.setItem(multiAgentStorageKey, String(enabled));
    setMultiAgentState(enabled);
  }

  async function deleteConversation(id: string): Promise<void> {
    if (!activeProjectId) return;
    try {
      const conversation = conversationCacheRef.current.get(id);
      const relatedRunIds = new Set(conversation?.runs?.map((run) => run.id) ?? []);
      for (const [runId, target] of runTargetsRef.current) {
        if (target.conversationId === id) relatedRunIds.add(runId);
      }
      // Aborting the chat's active run is scoped to this conversation only so
      // concurrent runs in other chats are never affected by the deletion.
      const activeRunForChat = activeRunByConversationRef.current[id];
      if (activeRunForChat && relatedRunIds.has(activeRunForChat) && !(await stopRunForConversation(id))) return;
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
        clearActiveRun(runId);
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

  function saveArtifactDraftsNow(drafts: ArtifactDraft[], skipScheduledSave = true): void {
    if (!artifactDraftState.projectId) return;
    if (skipScheduledSave) skipNextArtifactSaveRef.current = true;
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
    setStudioAgentStatus((current) => current?.artifactId === next.id && current.phase === "complete" ? null : current);
    if (flush) saveArtifactDraftsNow(drafts);
  }

  async function askAgentToEditStudio(instruction: string, attachments: ChatAttachment[] = [], visibleInstruction = instruction, canvasSelection?: { pageId: string; elementIds: string[] }): Promise<boolean> {
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
    // Bake the trusted selection into the prompt text so the model can see it,
    // and into the run target so the main process can verify it.
    const promptWithSelection = canvasSelection
      ? `${studioAgentPrompt(artifact, instruction)}\n\nCanvas selection for this edit — pageId: ${canvasSelection.pageId}; elementIds: ${canvasSelection.elementIds.join(", ")}. Your canvasCommands must target exactly this page and these element ids.`
      : studioAgentPrompt(artifact, instruction);
    const started = await sendPrompt(
      promptWithSelection,
      visibleInstruction,
      attachments,
      { projectId, artifactId: artifact.id, ...(canvasSelection ? { canvasSelection } : {}) },
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

  function applyAgentSelection(agent: AgentDefinition): void {
    setSelectedAgentId(agent.id);
    const nextTools = agent.connectors.filter((id) => toolOptions.some((tool) => tool.id === id));
    if (!googleConnection?.connected) {
      const appIndex = nextTools.indexOf("apps");
      if (appIndex >= 0) nextTools.splice(appIndex, 1);
    }
    setEnabledTools(nextTools);
    setSystemPromptOverride(null);
  }

  function selectAgent(agentId: string): void {
    const agent = agents.find((candidate) => candidate.id === agentId);
    if (!agent) return;
    applyAgentSelection(agent);
    if (agent.modelId) void updateQuickSettings({ modelId: agent.modelId });
    if (agent.harness) void selectChatHarness(agent.harness);
  }

  async function startAgentChat(agentId: string): Promise<void> {
    const agent = agents.find((candidate) => candidate.id === agentId);
    if (!agent) return;
    applyAgentSelection(agent);
    if (agent.modelId || agent.harness) {
      if (!(await updateQuickSettings({ modelId: agent.modelId, harness: agent.harness }))) return;
    }
    setActiveMode("chat");
    newChat();
  }

  function createAgent(agent: AgentDefinition): void {
    setAgents((current) => [...current, agent]);
    setSelectedAgentId(agent.id);
    setEnabledTools(agent.connectors.filter((id) => id !== "apps" || googleConnection?.connected));
    setSystemPromptOverride(null);
    if (agent.modelId) void updateQuickSettings({ modelId: agent.modelId });
  }

  async function generateAgentDraft(intent: string): Promise<GeneratedAgentDraft> {
    if (!activeProject || projectAvailability[activeProject.id]?.available === false) throw new Error("Open an available project before generating an agent.");
    if (!activeChatModel) throw new Error("Choose a model before using Generate with AI.");
    const runId = createId();
    const conversationId = createId();
    const userMessageId = createId();
    const assistantMessageId = createId();
    const now = new Date().toISOString();
    const engineSessionKey = `electron.v1.${createId()}`;
    const systemPrompt = "You design practical automation agents for non-technical users. Return only valid JSON with keys name, description, prompt, connectors, appAccess, color. connectors may contain web, files, apps. appAccess may contain gmail, drive, calendar. color must be coral, blue, orange, or pink. Keep the name under 60 characters and description under 160. The prompt must clearly define responsibility, expected outcome, safety boundaries, and when to ask for approval. Choose the least access needed.";
    const prompt = `Create an agent for this outcome:\n\n${intent.trim()}`;
    const conversation: Conversation = {
      id: conversationId,
      projectId: activeProject.id,
      engineSessionKey,
      title: "Generate agent draft",
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: userMessageId, role: "user", content: prompt, createdAt: now, status: "complete" },
        { id: assistantMessageId, role: "assistant", content: "", createdAt: now, status: "streaming", runId },
      ],
      runs: [{
        id: runId,
        projectId: activeProject.id,
        conversationId,
        userMessageId,
        assistantMessageId,
        status: "running",
        createdAt: now,
        agent: { id: "agent-builder", name: "Agent Builder", type: "agent", systemPrompt },
        model: { id: activeChatModel.id, name: activeChatModel.name, provider: activeChatModel.provider, model: activeChatModel.model, baseUrl: activeChatModel.baseUrl, temperature: activeChatModel.temperature },
        harness: effectiveHarness,
        runtimeMode: "approval-required",
        multiAgent: false,
        enabledTools: [],
        enabledApps: [],
      }],
      harness: effectiveHarness,
    };

    await window.khadim.conversations.save(conversation);
    return new Promise<GeneratedAgentDraft>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingAgentDraftRunsRef.current.delete(runId);
        void window.khadim.agent.abort(runId).catch(() => undefined);
        void window.khadim.conversations.remove(activeProject.id, conversationId).catch(() => undefined);
        reject(new Error("Agent generation took too long. Try again."));
      }, 60_000);
      pendingAgentDraftRunsRef.current.set(runId, { content: "", resolve, reject, conversationId, projectId: activeProject.id, timeout });
      void window.khadim.agent.start({ runId, projectId: activeProject.id, conversationId, assistantMessageId, engineSessionKey, prompt, systemPrompt, enabledTools: [], enabledApps: [] }).catch((cause: unknown) => {
        const pending = pendingAgentDraftRunsRef.current.get(runId);
        pendingAgentDraftRunsRef.current.delete(runId);
        if (pending) window.clearTimeout(pending.timeout);
        void window.khadim.conversations.remove(activeProject.id, conversationId).catch(() => undefined);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      });
    });
  }

  function updateAgent(agent: AgentDefinition): void {
    setAgents((current) => current.map((candidate) => candidate.id === agent.id ? agent : candidate));
    if (selectedAgentId === agent.id) {
      setEnabledTools(agent.connectors.filter((id) => id !== "apps" || googleConnection?.connected));
      setSystemPromptOverride(null);
      if (agent.modelId) void updateQuickSettings({ modelId: agent.modelId });
    }
  }

  function deleteAgent(agentId: string): void {
    setAgents((current) => current.filter((candidate) => candidate.id !== agentId));
    if (selectedAgentId === agentId) selectAgent(defaultAgent.id);
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

  async function updateQuickSettings(update: { modelId?: string; harness?: HarnessMode }): Promise<boolean> {
    if (!settings) return false;
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
        soundMood: optimistic.soundMood ?? (optimistic.soundsEnabled === false ? "off" : "subtle"),
      });
      setSettings(next);
      return true;
    } catch (cause) {
      setSettings(previous);
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    }
  }

  function selectChatModel(modelId: string): void {
    const harnessId = activePluginHarnessId;
    if (!harnessId) {
      void updateQuickSettings({ modelId });
      return;
    }
    if (!activePluginModels.some((model) => model.id === modelId)) {
      setError("That model is no longer available from the selected harness.");
      return;
    }
    setPluginModelSelections((current) => {
      const next = { ...current, [harnessId]: modelId };
      localStorage.setItem(pluginModelSelectionStorageKey, JSON.stringify(next));
      return next;
    });
  }

  function selectChatMode(modeId: string): void {
    const harnessId = activePluginHarnessId;
    if (!harnessId || !activePluginModes.some((mode) => mode.id === modeId)) {
      setError("That mode is no longer available from the selected harness.");
      return;
    }
    setPluginModeSelections((current) => {
      const next = { ...current, [harnessId]: modeId };
      localStorage.setItem(pluginModeSelectionStorageKey, JSON.stringify(next));
      return next;
    });
  }

  // Selecting a harness from the composer is scoped: an existing chat persists
  // the choice on that conversation only (never global settings), while the
  // welcome composer updates the global default. The optimistic update rolls
  // back if the per-chat save fails, so global settings stay untouched.
  async function selectChatHarness(harness: HarnessMode): Promise<boolean> {
    if (!selected) {
      return updateQuickSettings({ harness });
    }
    if (selected.harness === harness) return true;
    const previous = selected;
    const optimistic: Conversation = { ...selected, harness, updatedAt: new Date().toISOString() };
    conversationCacheRef.current.set(selected.id, optimistic);
    setConversations((current) => current.map((conversation) => conversation.id === selected.id ? optimistic : conversation));
    try {
      await window.khadim.conversations.save(optimistic);
      return true;
    } catch (cause) {
      conversationCacheRef.current.set(previous.id, previous);
      setConversations((current) => current.map((conversation) => conversation.id === previous.id ? previous : conversation));
      setError(cause instanceof Error ? cause.message : "The chat capability could not be saved.");
      return false;
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
    { id: "agents", group: "Navigate", label: "Agents", detail: "Alpha · Configure reusable roles", keywords: "personas assistants alpha", icon: <Bot size={17} />, action: () => chooseMode("agent") },
    { id: "studio", group: "Navigate", label: "Studio", detail: "Beta · Create and review artifacts", keywords: "documents artifacts design code beta", icon: <FileCode2 size={17} />, action: () => chooseMode("studio") },
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
          <KhadimLogoScene />
          <Composer
            prompt={prompt}
            setPrompt={setPrompt}
            onSend={sendMainChatPrompt}
            onStop={stopRun}
            running={Boolean(selectedActiveRunId)}
            inputRef={promptRef}
            large
            agentId={selectedAgentId}
            agentName={selectedAgent.name}
            agents={agents}
            onSelectAgent={selectAgent}
            modelName={activeChatModel?.name || (activePluginHarnessId && pluginModelsLoading === activePluginHarnessId ? "Loading models" : "Choose model")}
            models={chatModels}
            modes={activePluginModes}
            modeId={selectedPluginModeId}
            enabledTools={enabledTools}
            onToggleTool={(toolId) => setEnabledTools((current) => current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId])}
            harness={effectiveHarness}
            pluginHarnesses={pluginHarnesses}
            harnessCommands={activePluginCommands}
            onSelectModel={selectChatModel}
            onSelectMode={selectChatMode}
            runtimeMode={runtimeMode}
            onSelectRuntimeMode={selectRuntimeMode}
            onSelectHarness={(harness) => void selectChatHarness(harness)}
            multiAgent={multiAgent}
            onSetMultiAgent={setMultiAgent}
            modelsLoading={Boolean(activePluginHarnessId && pluginModelsLoading === activePluginHarnessId)}
            modelsError={activePluginHarnessId ? pluginModelErrors[activePluginHarnessId] : undefined}
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
          {selectedActiveRunId ? "Khadim is working." : latestMessage?.status === "error" ? "The run did not finish." : latestMessage?.role === "assistant" && latestMessage.status === "complete" ? "Response complete." : ""}
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
            const messageContent = message.role === "assistant" ? messageCopyWithoutStudioEdit(message.content) : message.content;
            const recommendation = message.role === "assistant" ? extractRecommendation(messageContent) : null;
            const recommendationCopy = message.role === "assistant" ? messageCopyWithoutRecommendation(messageContent) : messageContent;
            const visibleContent = legacyFiles?.content ?? (extractedHtml ? messageCopyWithoutArtifactSource(recommendationCopy) : recommendationCopy);
            const visibleAttachments = message.attachments?.length ? message.attachments : legacyFiles?.attachments;
            const hasToolActivity = message.role === "assistant" && Boolean(message.toolCalls?.length);
            return (
              <article className={`message ${message.role} is-${message.status}`} key={message.id}>
                <div className="message-avatar">{message.role === "assistant" ? <Logo /> : <UserRound size={17} />}</div>
                <div className="message-body">
                  <div className="message-name">{message.role === "assistant" ? "Khadim" : "You"}</div>
                  {message.role === "assistant" && message.coordination && <CoordinationTrace activity={message.coordination} runTitle={selected.title} run={messageRun} />}
                  {message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0 && <ToolChips activities={message.toolCalls} />}
                  {visibleContent ? <MarkdownRenderer content={visibleContent} streaming={message.status === "streaming"} /> : message.status === "streaming" && !hasToolActivity ? <LoadingState /> : null}
                  {visibleAttachments && visibleAttachments.length > 0 && <div className="message-attachments">{visibleAttachments.map((attachment, index) => <AttachmentBadge attachment={attachment} key={`${message.id}-${attachment.name}-${index}`} />)}</div>}
                  {recommendation && <RecommendationCard recommendation={recommendation} onUse={(option) => {
                    const optionText = option.body.replaceAll("`", "");
                    setPrompt((current) => {
                      if (!current.trim()) return optionText;
                      if (current.includes(optionText)) return current;
                      return `${current.trimEnd()}\n\n${optionText}`;
                    });
                    window.setTimeout(() => promptRef.current?.focus(), 0);
                  }} />}
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
          <Composer prompt={prompt} setPrompt={setPrompt} onSend={sendMainChatPrompt} onStop={stopRun} running={Boolean(selectedActiveRunId)} inputRef={promptRef} agentId={selectedAgentId} agentName={selectedAgent.name} agents={agents} onSelectAgent={selectAgent} modelName={activeChatModel?.name || (activePluginHarnessId && pluginModelsLoading === activePluginHarnessId ? "Loading models" : "Choose model")} models={chatModels} modes={activePluginModes} modeId={selectedPluginModeId} enabledTools={enabledTools} onToggleTool={(toolId) => setEnabledTools((current) => current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId])} harness={effectiveHarness} pluginHarnesses={pluginHarnesses} harnessCommands={activePluginCommands} onSelectModel={selectChatModel} onSelectMode={selectChatMode} runtimeMode={runtimeMode} onSelectRuntimeMode={selectRuntimeMode} onSelectHarness={(harness) => void selectChatHarness(harness)} multiAgent={multiAgent} onSetMultiAgent={setMultiAgent} modelsLoading={Boolean(activePluginHarnessId && pluginModelsLoading === activePluginHarnessId)} modelsError={activePluginHarnessId ? pluginModelErrors[activePluginHarnessId] : undefined} usage={conversationUsage(selected)} projectName={activeProject?.name} projectAvailable={activeProject ? projectAvailability[activeProject.id]?.available !== false : undefined} pendingQuestion={selectedActiveRun?.question?.request} questionResponding={selectedActiveRun?.questionResponding} onAnswerQuestion={answerPendingQuestion} pendingApproval={selectedActiveRun?.approval?.request} approvalResponding={selectedActiveRun?.approvalResponding} onApprovalDecision={answerPendingApproval} />
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
          <button aria-pressed={agentModeActive} className={agentModeActive ? "active" : ""} onClick={() => chooseMode("agent")} title="Agents · Alpha"><Bot size={16} /><span>Agents</span><FeatureMaturityBadge feature="agents" compact /></button>
          <button aria-pressed={studioModeActive} className={studioModeActive ? "active" : ""} onClick={() => chooseMode("studio")} title="Studio · Beta"><FileText size={16} /><span>Studio</span><FeatureMaturityBadge feature="studio" compact /></button>
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
            <AnimatedPhosphorIcon icon={PanelLeftClose} kind="collapse" size={18} />
          </button>
        </div>
        <nav className="primary-nav" aria-label="Primary">
          <button onClick={newChat}><AnimatedPhosphorIcon icon={Plus} kind="add" size={18} /> New chat <kbd>{newChatShortcut}</kbd></button>
          <button aria-current={activeView === "artifacts" ? "page" : undefined} className={activeView === "artifacts" ? "active" : ""} onClick={() => chooseView("artifacts")}><AnimatedPhosphorIcon icon={Blocks} kind="artifacts" size={17} /> Artifacts</button>
          <button aria-current={activeView === "apps" ? "page" : undefined} className={activeView === "apps" ? "active" : ""} onClick={() => chooseView("apps")}><AnimatedPhosphorIcon icon={AppWindow} kind="apps" size={17} /> Apps <Badge className="new-badge">New</Badge></button>
        </nav>
        <div className="project-tree-heading">
          <span>Projects</span>
          <button type="button" onClick={() => void addProject()} aria-label="Add project" title="Add project"><AnimatedPhosphorIcon icon={Plus} kind="add" size={15} /></button>
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
                  <button className="project-disclosure" type="button" aria-expanded={expanded} aria-controls={`project-chats-${project.id}`} aria-label={`${expanded ? "Collapse" : "Expand"} ${project.name}`} onClick={() => void toggleProject(project.id)}><AnimatedPhosphorIcon icon={ChevronRight} kind="disclosure" size={13} /></button>
                  <button className="project-tree-select" type="button" disabled={unavailable} aria-current={active && activeView === "project" ? "page" : undefined} onClick={() => void openProject(project.id)}>
                    <AnimatedPhosphorIcon icon={FolderOpen} kind="project" size={16} />
                    <span><strong>{project.name}</strong><small>{active ? unavailable ? "Folder unavailable" : "Current project" : unavailable ? "Folder unavailable" : "Local project"}</small></span>
                  </button>
                  {unavailable && <button className="project-locate" type="button" onClick={() => void relocateProject(project.id)} aria-label={`Locate ${project.name}`} title="Locate folder"><AnimatedPhosphorIcon icon={Search} kind="search" size={14} /></button>}
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
                            <AnimatedPhosphorIcon icon={Trash2} kind="delete" size={14} />
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
          <button onClick={() => { setSettingsIntent(null); setSettingsOpen(true); }}><AnimatedPhosphorIcon icon={Settings} kind="settings" size={17} /> Settings</button>
        </div>
      </aside>

      <section className="workspace" inert={sidebarOpen && isCompact ? true : undefined}>
        {studioArtifact ? (
          <div
            className={`studio-dual-workspace${showStudioChat ? "" : " studio-dual-workspace--chat-hidden"}`}
            ref={studioWorkspaceRef}
            style={{ "--studio-chat-width": `${studioChatWidth}px` } as CSSProperties}
          >
            {/* The main chat pane stays mounted even when a Canvas collapses it
                so Composer attachments, partial QuestionPanel answers, open
                menus, and other component-local state survive Hide/Show. When
                collapsed the pane is visually absent: it carries the HTML
                `hidden` attribute (forced via !important below), is `inert`,
                and is skipped by the accessibility tree. The resize separator
                remains conditionally unmounted because it has no local state. */}
            <section
              className={`studio-main-chat-pane${showStudioChat ? "" : " studio-main-chat-pane--hidden"}`}
              aria-label={`Main chat beside ${studioArtifact.title}`}
              hidden={!showStudioChat || undefined}
              inert={!showStudioChat || undefined}
              aria-hidden={!showStudioChat || undefined}
            >
              {renderWorkspaceTopbar()}
              {renderMainChatSurface()}
            </section>
            {showStudioChat && (
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
            )}
            <div className="studio-editor-pane">
              <StudioWorkspace
                artifact={studioArtifact}
                saveState={artifactSaveState}
                agentName={selectedAgent.name}
                modelName={activeChatModel?.name ?? "No active model"}
                agentAvailable={Boolean(activeChatModel)}
                agentBusy={Boolean(selectedActiveRunId)}
                agentStatus={studioAgentStatus?.artifactId === studioArtifact.id ? studioAgentStatus : null}
                onChange={updateStudioArtifact}
                onRetrySave={() => saveArtifactDraftsNow(artifactDraftState.drafts, false)}
                onClose={() => closeStudio()}
                onExportPdf={() => void exportStudioPdf()}
                onAskAgent={askAgentToEditStudio}
                onAskCanvasAgent={(instruction, selection) => askAgentToEditStudio(instruction, [], instruction, selection)}
                studioChatVisible={showStudioChat}
                canToggleStudioChat={isCanvasArtifact}
                onToggleStudioChat={toggleCanvasChat}
              />
            </div>
          </div>
        ) : <>
        {renderWorkspaceTopbar()}

        {activeMode === "agent" ? (
          <AgentsView
            agents={agents}
            selectedId={selectedAgentId}
            models={settings?.models ?? []}
            conversations={conversations}
            harness={settings?.harness ?? "assistant"}
            pluginHarnesses={pluginHarnesses}
            googleConnection={googleConnection}
            onCreate={createAgent}
            onGenerate={generateAgentDraft}
            onUpdate={updateAgent}
            onDelete={deleteAgent}
            onStart={(id) => void startAgentChat(id)}
          />
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
