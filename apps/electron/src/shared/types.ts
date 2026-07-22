import type { CustomTheme, ThemeMode } from "./themes";
import type { PluginConfigUpdate, PluginEntry, PluginHarnessCatalog, PluginHarnessCommand, PluginHarnessDescriptor, PluginHarnessId, PluginHarnessMode, PluginHarnessModel } from "./plugins";
import type { GoogleWorkspaceServiceId } from "./google-workspace";
export type { CustomTheme, ThemeMode, ThemePalette } from "./themes";
export type { PluginEntry, PluginHarnessCommand, PluginHarnessDescriptor, PluginHarnessMode, PluginHarnessModel } from "./plugins";
export type HarnessMode = "assistant" | "rpa" | PluginHarnessId;
export type AgentRuntimeMode = "approval-required" | "auto-accept-edits" | "full-access";

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl?: string;
  temperature?: string;
  isDefault: boolean;
  isActive: boolean;
  hasApiKey: boolean;
}

export interface ModelCatalogProvider {
  id: string;
  name: string;
  baseUrl?: string;
  apiKeyRequired?: boolean;
  available?: boolean;
  models: Array<{ id: string; name: string }>;
}

export interface CodexAuthSession {
  authUrl: string;
}

export interface CodexAuthStatus {
  status: "idle" | "pending" | "connected" | "failed";
  authUrl?: string;
  error?: string;
}

export type SearchProviderId = "duckduckgo" | "parallel" | "exa" | "tavily" | "perplexity" | "brave";
export type SearchCredentialStatus = "not-required" | "missing" | "ready" | "locked";

export interface SearchSettings {
  activeProvider: SearchProviderId;
  providers: Array<{
    id: SearchProviderId;
    name: string;
    description: string;
    configured: boolean;
    credentialStatus: SearchCredentialStatus;
    requiresApiKey: boolean;
  }>;
}

export interface SearchSettingsUpdate {
  activeProvider: SearchProviderId;
  provider?: SearchProviderId;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface GoogleConnection {
  configured: boolean;
  connected: boolean;
  credentialStatus: "missing" | "ready" | "locked";
  email?: string;
  scopes: string[];
}

export interface GoogleConnectRequest {
  clientId?: string;
  clientSecret?: string;
}

export interface DiscordSettings {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  guildId: string;
  projectId: string;
  harness: HarnessMode;
  allowAllGuildUsers: boolean;
  allowedUserIds: string[];
  allowedRoleIds: string[];
  allowedChannelIds: string[];
  ignoredChannelIds: string[];
  freeResponseChannelIds: string[];
  noThreadChannelIds: string[];
  requireMention: boolean;
  threadRequireMention: boolean;
  autoThread: boolean;
  botName?: string;
  inviteUrl?: string;
  lastError?: string;
}

export interface DiscordSettingsUpdate {
  enabled: boolean;
  guildId: string;
  projectId: string;
  harness: HarnessMode;
  allowAllGuildUsers: boolean;
  allowedUserIds: string[];
  allowedRoleIds: string[];
  allowedChannelIds: string[];
  ignoredChannelIds: string[];
  freeResponseChannelIds: string[];
  noThreadChannelIds: string[];
  requireMention: boolean;
  threadRequireMention: boolean;
  autoThread: boolean;
  botToken?: string;
  clearToken?: boolean;
}

export interface AppSettings {
  provider: string;
  model: string;
  models: ModelConfig[];
  activeProjectId: string;
  workspace: string;
  harness: HarnessMode;
  theme: ThemeMode;
  customThemes?: CustomTheme[];
  hasApiKey: boolean;
}

export interface SettingsUpdate extends Omit<AppSettings, "hasApiKey" | "models"> {
  apiKey?: string;
  clearApiKey?: boolean;
  models: Array<Omit<ModelConfig, "hasApiKey"> & { apiKey?: string; clearApiKey?: boolean }>;
}

export interface AgentRunRequest {
  runId: string;
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  engineSessionKey: string;
  /** Existing Studio artifact selected for this run's scoped artifact tools. */
  artifactId?: string;
  prompt: string;
  systemPrompt?: string;
  enabledTools?: string[];
  /** Native connected-app allowlist saved into the immutable run snapshot. */
  enabledApps?: GoogleWorkspaceServiceId[];
}

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  dir: string;
  sourceDir: string;
  enabled: boolean;
  author?: string;
  version?: string;
}

export interface AgentStreamEvent {
  workspace_id?: string | null;
  session_id?: string | null;
  event_type: string;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AgentQuestionOption {
  label: string;
  description?: string;
}

export interface AgentQuestion {
  id: string;
  header: string;
  question: string;
  options: AgentQuestionOption[];
  multiSelect?: boolean;
}

export interface AgentQuestionRequest {
  requestId: string;
  questions: AgentQuestion[];
}

export type AgentQuestionAnswers = Record<string, string[]>;

export type AgentApprovalKind = "command" | "file-read" | "file-change" | "tool";
export type AgentApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export interface AgentApprovalRequest {
  requestId: string;
  kind: AgentApprovalKind;
  title: string;
  detail?: string;
}

export interface AgentRunIdentity {
  runId: string;
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  engineSessionKey: string;
}

export interface AgentRunRecoverySnapshot extends AgentRunIdentity {
  events: SequencedAgentStreamEvent[];
  terminal: boolean;
  droppedEventCount: number;
  nextSequence: number;
}

export interface SequencedAgentStreamEvent {
  sequence: number;
  event: AgentStreamEvent;
}

export interface AgentEventEnvelope {
  runId: string;
  sequence: number;
  event: AgentStreamEvent;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status?: "streaming" | "complete" | "error";
  runId?: string;
  artifactIds?: string[];
  attachments?: ChatAttachment[];
  toolCalls?: ToolCallActivity[];
  usage?: TokenUsage;
}

export interface ChatAttachment {
  name: string;
  type: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ToolCallActivity {
  id: string;
  tool: string;
  title: string;
  input?: string;
  result?: string;
  metadata?: Record<string, unknown>;
  status: "running" | "complete" | "error";
}

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export type ProjectAvailability = {
  project: Project;
  available: true;
} | {
  project: Project;
  available: false;
  reason: "missing" | "not-directory";
};

export interface AgentRun {
  id: string;
  projectId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  status: "running" | "complete" | "error" | "stopped";
  createdAt: string;
  /** Immutable binding used to recover and validate Studio edit runs. */
  artifactId?: string;
  completedAt?: string;
  /** Last main-process event sequence durably applied by the renderer. */
  lastEventSequence?: number;
  agent: {
    id: string;
    name: string;
    /** Optional on chats saved before agent types were introduced. */
    type?: "agent";
    systemPrompt: string;
  };
  model: {
    id: string;
    name: string;
    provider: string;
    model: string;
    baseUrl?: string;
    temperature?: string;
  };
  harness: HarnessMode;
  runtimeMode?: AgentRuntimeMode;
  interactionMode?: string;
  multiAgent?: boolean;
  enabledTools: string[];
  /** Optional on chats saved before per-app permissions were introduced. */
  enabledApps?: GoogleWorkspaceServiceId[];
}

export interface Conversation {
  id: string;
  projectId: string;
  engineSessionKey: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  /** Immutable execution snapshots for each assistant turn. Optional on migrated chats. */
  runs?: AgentRun[];
}

export type ArtifactKind = "document" | "site" | "canvas";
export type ArtifactLifecycle = "draft" | "ready" | "published";

export interface SiteArtifactContent {
  format: "html";
  html: string;
  baselineHtml: string;
}

export type WebProjectFramework = "static" | "react" | "react-router" | "vue" | "svelte";

/** Serializable subset of Puck's data model. The library remains an adapter,
 * while the artifact owns its durable component tree. */
export interface VisualDocumentData {
  root: { props: Record<string, unknown> };
  content: Array<{ type: string; props: Record<string, unknown> }>;
  zones?: Record<string, Array<{ type: string; props: Record<string, unknown> }>>;
}

export interface WebProjectArtifactContent {
  format: "web-project";
  framework: WebProjectFramework;
  entryFile: string;
  files: Record<string, string>;
  baselineFiles: Record<string, string>;
  /** Printable fallback generated from the last successful visual/runtime render. */
  previewHtml: string;
  baselinePreviewHtml: string;
  visual?: {
    editor: "puck";
    data: VisualDocumentData;
  };
}

export interface DocumentArtifactContent {
  format: "tiptap";
  document: Record<string, unknown>;
  page: {
    size: "A4" | "Letter";
    orientation: "portrait" | "landscape";
    margin: number;
  };
}

export interface HtmlDocumentArtifactContent {
  format: "document-html";
  html: string;
  baselineHtml: string;
  page: {
    size: "A4" | "Letter";
    orientation: "portrait" | "landscape";
    margin: number;
  };
}

export type CanvasPrimitiveType = "rectangle" | "ellipse" | "line" | "path" | "arrow" | "text" | "image" | "frame" | "boolean";
export type CanvasBooleanOperation = "union" | "difference" | "intersection" | "exclusion" | "flatten";

export interface CanvasPoint {
  /** Unit-space coordinate relative to the element bounds. */
  x: number;
  /** Unit-space coordinate relative to the element bounds. */
  y: number;
  /** Unit-space incoming Bézier control point. */
  handleIn?: CanvasControlPoint;
  /** Unit-space outgoing Bézier control point. */
  handleOut?: CanvasControlPoint;
  /** Smooth nodes keep their handles collinear; corner nodes may be edited independently. */
  nodeType?: "corner" | "smooth";
}

export interface CanvasControlPoint {
  x: number;
  y: number;
}

export interface CanvasGradientStop {
  offset: number;
  color: string;
  opacity?: number;
}

export interface CanvasLinearGradient {
  type: "linear";
  angle: number;
  stops: CanvasGradientStop[];
}

export interface CanvasSvgViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasPaintStyle {
  id: string;
  name: string;
  color: string;
  gradient?: CanvasLinearGradient;
}

export interface CanvasTextStyle {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
}

export interface CanvasEffectStyle {
  id: string;
  name: string;
  shadow: CanvasShadow;
}

export type CanvasHorizontalConstraint = "left" | "right" | "left-right" | "center" | "scale";
export type CanvasVerticalConstraint = "top" | "bottom" | "top-bottom" | "center" | "scale";

export interface CanvasShadow {
  color: string;
  x: number;
  y: number;
  blur: number;
  opacity: number;
}

export interface CanvasAutoLayout {
  direction: "row" | "column";
  align: "start" | "center" | "end";
  justify: "start" | "center" | "end" | "space-between";
  gap: number;
  crossGap?: number;
  padding: number;
  sizing: "fixed" | "hug";
  wrap?: boolean;
}

export interface CanvasLayoutGrid {
  id: string;
  type: "square" | "columns" | "rows";
  visible: boolean;
  color: string;
  opacity: number;
  size?: number;
  count?: number;
  gutter?: number;
  margin?: number;
}

export type CanvasPrototypeTrigger = "click" | "hover" | "after-delay";
export type CanvasPrototypeAction = "navigate" | "back" | "open-url" | "open-overlay" | "toggle-overlay" | "close-overlay";

export interface CanvasPrototypeTransition {
  type: "instant" | "dissolve" | "slide";
  duration: number;
  easing: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
  direction?: "left" | "right" | "up" | "down";
}

export interface CanvasPrototypeOverlay {
  position: "center" | "top-left" | "top-center" | "top-right" | "center-left" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right";
  background: "none" | "dim";
  closeOnOutsideClick: boolean;
}

/** A serializable prototype link owned by a canvas layer. */
export interface CanvasPrototypeInteraction {
  id: string;
  trigger: CanvasPrototypeTrigger;
  action: CanvasPrototypeAction;
  delay?: number;
  destinationPageId?: string;
  url?: string;
  transition?: CanvasPrototypeTransition;
  overlay?: CanvasPrototypeOverlay;
}

export interface CanvasPrimitiveElement {
  id: string;
  type: CanvasPrimitiveType;
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  color: string;
  fillGradient?: CanvasLinearGradient;
  fillStyleId?: string;
  opacity?: number;
  rotation?: number;
  hidden?: boolean;
  locked?: boolean;
  groupId?: string;
  parentId?: string;
  /** Non-destructive clipping reference to another closed primitive on the page. */
  maskId?: string;
  radius?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeDash?: number;
  shadow?: CanvasShadow;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  textStyleId?: string;
  effectStyleId?: string;
  tokenBindings?: {
    fill?: string;
    stroke?: string;
    radius?: string;
    opacity?: string;
    gap?: string;
    padding?: string;
  };
  src?: string;
  alt?: string;
  lineFlip?: boolean;
  points?: CanvasPoint[];
  /** Sanitized SVG path geometry kept as editable vector data rather than an image. */
  svgPathData?: string;
  /** Source coordinate system used to scale imported SVG path data with the layer bounds. */
  svgViewBox?: CanvasSvgViewBox;
  /** Sanitized SVG transform functions inherited by the imported shape. */
  svgTransform?: string;
  pathClosed?: boolean;
  fillRule?: "nonzero" | "evenodd";
  pathSmoothing?: number;
  startCap?: "none" | "arrow" | "round";
  endCap?: "none" | "arrow" | "round";
  startBindingId?: string;
  endBindingId?: string;
  clipContent?: boolean;
  layout?: CanvasAutoLayout;
  layoutGrids?: CanvasLayoutGrid[];
  layoutPosition?: "static" | "absolute";
  constraintH?: CanvasHorizontalConstraint;
  constraintV?: CanvasVerticalConstraint;
  interactions?: CanvasPrototypeInteraction[];
  /** Operation used by a non-destructive boolean group. Its direct children remain editable. */
  booleanOperation?: Exclude<CanvasBooleanOperation, "flatten">;
}

export interface CanvasComponentElement {
  id: string;
  type: "component";
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  color: string;
  opacity?: number;
  rotation?: number;
  hidden?: boolean;
  locked?: boolean;
  groupId?: string;
  parentId?: string;
  layoutPosition?: "static" | "absolute";
  constraintH?: CanvasHorizontalConstraint;
  constraintV?: CanvasVerticalConstraint;
  interactions?: CanvasPrototypeInteraction[];
  componentId: string;
  componentRole: "main" | "instance";
  overrides?: Record<string, Partial<CanvasPrimitiveElement>>;
}

export type CanvasElement = CanvasPrimitiveElement | CanvasComponentElement;

export interface CanvasComponentDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  nodes: CanvasPrimitiveElement[];
  builtIn?: boolean;
  variantSetId?: string;
  variantSetName?: string;
  variantProperties?: Record<string, string>;
}

export interface CanvasDesignToken {
  id: string;
  name: string;
  type: "color" | "number";
  values: Record<string, string | number>;
  description?: string;
}

export interface CanvasTokenCollection {
  id: string;
  name: string;
  modes: string[];
  activeMode: string;
  tokens: CanvasDesignToken[];
}

export interface CanvasAppState {
  viewBackgroundColor: string;
  snapToGrid: boolean;
  viewport?: { x: number; y: number; zoom: number };
  rulersVisible?: boolean;
  guidesVisible?: boolean;
  guidesLocked?: boolean;
  guides?: CanvasRulerGuide[];
}

export interface CanvasRulerGuide {
  id: string;
  axis: "x" | "y";
  position: number;
  color?: string;
  locked?: boolean;
}

export interface CanvasPage {
  id: string;
  name: string;
  frame: { width: number; height: number };
  elements: CanvasElement[];
  appState: CanvasAppState;
}

export interface CanvasAssetFile {
  name: string;
  mimeType: string;
  data: string;
}

export interface CanvasArtifactContent {
  /** Khadim's native, versioned scene format. Legacy `excalidraw` canvases are migrated on load. */
  format: "khadim-canvas";
  sceneVersion: 1;
  frame: { width: number; height: number };
  elements: CanvasElement[];
  components: CanvasComponentDefinition[];
  styles?: CanvasPaintStyle[];
  textStyles?: CanvasTextStyle[];
  effectStyles?: CanvasEffectStyle[];
  tokenCollections?: CanvasTokenCollection[];
  /** Page snapshots. Top-level frame/elements/appState mirror the active page for backwards-compatible agent edits. */
  pages?: CanvasPage[];
  activePageId?: string;
  prototypeStartPageId?: string;
  appState: CanvasAppState;
  files: Record<string, CanvasAssetFile>;
}

export type ArtifactContent = SiteArtifactContent | WebProjectArtifactContent | DocumentArtifactContent | HtmlDocumentArtifactContent | CanvasArtifactContent;

export interface ArtifactProvenance {
  origin: "user" | "agent" | "import";
  runId?: string;
  messageId?: string;
  conversationId?: string;
  conversationTitle?: string;
}

export interface Artifact {
  id: string;
  projectId: string;
  title: string;
  schemaVersion: 2;
  kind: ArtifactKind;
  lifecycle: ArtifactLifecycle;
  content: ArtifactContent;
  provenance?: ArtifactProvenance;
  createdAt: string;
  updatedAt: string;
  /**
   * Durable deletion marker. Tombstones retain only source identity so replayed
   * chat output cannot silently recreate an artifact the user removed.
   */
  deletedAt?: string;
}

/** @deprecated Use Artifact. Kept as a source-compatible name for migrated renderer code. */
export type ArtifactDraft = Artifact;

export interface ArtifactPdfExportResult {
  canceled: boolean;
  filePath?: string;
}

export interface ArtifactPreviewRequest {
  projectId: string;
  artifactId: string;
  framework: WebProjectFramework;
  entryFile: string;
  files: Record<string, string>;
}

export interface ArtifactPreviewSession {
  url: string;
}

/** Runtime-neutral interface implemented by Electron, Deno Desktop, and web transports. */
export interface KhadimClient {
  platform?: string;
  windowControls?: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  agent: {
    start: (request: AgentRunRequest) => Promise<{ runId: string }>;
    abort: (runId: string) => Promise<void>;
    answerQuestion: (runId: string, requestId: string, answers: AgentQuestionAnswers) => Promise<void>;
    answerApproval: (runId: string, requestId: string, decision: AgentApprovalDecision) => Promise<void>;
    recover: () => Promise<AgentRunRecoverySnapshot[]>;
    acknowledge: (runId: string) => Promise<void>;
    onEvent: (listener: (envelope: AgentEventEnvelope) => void) => () => void;
  };
  projects: {
    list: () => Promise<Project[]>;
    add: (rootPath: string) => Promise<Project>;
    open: (projectId: string) => Promise<Project>;
    checkAvailability: (projectId: string) => Promise<ProjectAvailability>;
    rename: (projectId: string, name: string) => Promise<Project>;
    relocate: (projectId: string, rootPath: string) => Promise<Project>;
    remove: (projectId: string) => Promise<{ removedProjectId: string; activeProject: Project }>;
    chooseDirectory: () => Promise<string | null>;
  };
  conversations: {
    list: (projectId: string) => Promise<Conversation[]>;
    save: (conversation: Conversation) => Promise<void>;
    remove: (projectId: string, id: string) => Promise<void>;
    exportMarkdown?: (suggestedName: string, markdown: string) => Promise<string | null>;
  };
  app?: {
    version: () => Promise<string>;
    configDirectory: () => Promise<string>;
  };
  artifacts: {
    list: (projectId: string) => Promise<Artifact[]>;
    save: (projectId: string, artifacts: Artifact[]) => Promise<void>;
    exportPdf: (projectId: string, artifactId: string) => Promise<ArtifactPdfExportResult>;
    preview?: (request: ArtifactPreviewRequest) => Promise<ArtifactPreviewSession>;
    stopPreview?: (projectId: string, artifactId: string) => Promise<void>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    save: (settings: SettingsUpdate) => Promise<AppSettings>;
    chooseWorkspace: () => Promise<string | null>;
  };
  models: {
    catalog: (refresh?: boolean) => Promise<ModelCatalogProvider[]>;
    syncCodex: (activate?: boolean) => Promise<AppSettings>;
  };
  auth: {
    codexConnected: () => Promise<boolean>;
    startCodexLogin: () => Promise<CodexAuthSession>;
    codexLoginStatus: () => Promise<CodexAuthStatus>;
  };
  search: {
    get: () => Promise<SearchSettings>;
    save: (update: SearchSettingsUpdate) => Promise<SearchSettings>;
  };
  google: {
    get: () => Promise<GoogleConnection>;
    connect: (request?: GoogleConnectRequest) => Promise<GoogleConnection>;
    disconnect: () => Promise<GoogleConnection>;
  };
  discord: {
    get: () => Promise<DiscordSettings>;
    save: (update: DiscordSettingsUpdate) => Promise<DiscordSettings>;
    disconnect: () => Promise<DiscordSettings>;
    onStatus: (listener: (settings: DiscordSettings) => void) => () => void;
  };
  skills: {
    discover: () => Promise<SkillEntry[]>;
    toggle: (skillId: string, enabled: boolean) => Promise<void>;
  };
  plugins?: {
    list: () => Promise<PluginEntry[]>;
    harnesses: () => Promise<PluginHarnessDescriptor[]>;
    models: (harnessId: PluginHarnessId, projectPath: string) => Promise<PluginHarnessModel[]>;
    modes: (harnessId: PluginHarnessId, projectPath: string) => Promise<PluginHarnessMode[]>;
    commands?: (harnessId: PluginHarnessId, projectPath: string) => Promise<PluginHarnessCommand[]>;
    refreshCatalog?: (harnessId: PluginHarnessId, projectPath: string) => Promise<PluginHarnessCatalog>;
    chooseAndInstall: () => Promise<PluginEntry | null>;
    setEnabled: (pluginId: string, enabled: boolean) => Promise<PluginEntry>;
    configure: (pluginId: string, update: PluginConfigUpdate) => Promise<PluginEntry>;
    uninstall: (pluginId: string) => Promise<void>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
}

/** @deprecated Use KhadimClient. Kept while the Electron adapter is phased out. */
export type KhadimDesktopApi = KhadimClient;
