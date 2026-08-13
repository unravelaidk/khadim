import {
  ArrowRight,
  CalendarBlank,
  CaretDown,
  Check,
  ClockCounterClockwise,
  Copy,
  EnvelopeSimple,
  FolderOpen,
  GlobeHemisphereWest,
  HardDrives,
  Monitor,
  PencilSimple,
  Plus,
  Robot,
  Sparkle,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Conversation, GoogleConnection, HarnessMode, ModelConfig, PluginHarnessDescriptor } from "../../../shared/types";
import { googleWorkspaceServiceEnabled, type GoogleWorkspaceServiceId } from "../../../shared/google-workspace";
import { isPluginHarnessId } from "../../../shared/plugins";
import { toolOptions } from "../chat/tool-options";
import { FeatureMaturityBadge } from "../feature-maturity";
import { createId } from "../shared/text";
import { ModelIcon } from "../ui/ModelIcon";
import { PluginLogo } from "../ui/PluginLogo";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import type { AgentDefinition } from "./types";

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  connectors: string[];
  appAccess: GoogleWorkspaceServiceId[];
  color: AgentDefinition["color"];
}

const templates: AgentTemplate[] = [
  {
    id: "customer-follow-up",
    name: "Customer follow-up",
    description: "Prepares informed replies and keeps customer conversations moving.",
    prompt: "You own customer follow-up. Review the available conversation and account context, draft concise and warm replies, verify claims before making them, and always ask before sending or committing to an external action.",
    connectors: ["web", "apps"],
    appAccess: ["gmail", "drive"],
    color: "coral",
  },
  {
    id: "meeting-brief",
    name: "Meeting brief",
    description: "Builds focused agendas and pre-reads from schedules and project context.",
    prompt: "You prepare meeting briefs. Review the relevant calendar event, supporting files, and recent context. Produce a concise agenda, decisions needed, open questions, and preparation tasks. Never invent attendee positions or commitments.",
    connectors: ["files", "apps"],
    appAccess: ["calendar", "drive"],
    color: "blue",
  },
  {
    id: "project-researcher",
    name: "Project researcher",
    description: "Turns external research and local context into decision-ready briefs.",
    prompt: "You are a careful project researcher. Start from the decision the user needs to make, search current primary sources, inspect relevant project files, distinguish evidence from inference, and finish with concise findings, risks, and recommended next steps.",
    connectors: ["web", "files", "apps"],
    appAccess: ["drive"],
    color: "orange",
  },
];

const googleApps: Array<{ id: GoogleWorkspaceServiceId; name: string; description: string; icon: React.JSX.Element }> = [
  { id: "gmail", name: "Gmail", description: "Search messages and read threads", icon: <EnvelopeSimple size={17} /> },
  { id: "drive", name: "Google Drive", description: "Search and read files", icon: <HardDrives size={17} /> },
  { id: "calendar", name: "Google Calendar", description: "Review calendars and events", icon: <CalendarBlank size={17} /> },
];

interface AgentDraft {
  id?: string;
  name: string;
  description: string;
  prompt: string;
  connectors: string[];
  appAccess: GoogleWorkspaceServiceId[];
  modelId: string;
  harness: HarnessMode;
  color: AgentDefinition["color"];
}

export interface GeneratedAgentDraft {
  name: string;
  description: string;
  prompt: string;
  connectors: string[];
  appAccess: GoogleWorkspaceServiceId[];
  color: AgentDefinition["color"];
}

function draftFromAgent(agent: AgentDefinition, defaultModelId: string, defaultHarness: HarnessMode): AgentDraft {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    prompt: agent.prompt,
    connectors: [...agent.connectors],
    appAccess: [...(agent.appAccess ?? ["gmail", "drive", "calendar"])],
    modelId: agent.modelId ?? defaultModelId,
    harness: agent.harness ?? defaultHarness,
    color: agent.color,
  };
}

function blankDraft(defaultModelId: string, defaultHarness: HarnessMode, template?: AgentTemplate): AgentDraft {
  return {
    name: template?.name ?? "",
    description: template?.description ?? "",
    prompt: template?.prompt ?? "",
    connectors: [...(template?.connectors ?? ["web", "files"])],
    appAccess: [...(template?.appAccess ?? [])],
    modelId: defaultModelId,
    harness: defaultHarness,
    color: template?.color ?? "blue",
  };
}

function harnessName(harness: HarnessMode, plugins: PluginHarnessDescriptor[]): string {
  if (harness === "assistant") return "Assistant";
  if (harness === "rpa") return "Computer control";
  return plugins.find((candidate) => candidate.id === harness)?.name ?? "Unavailable plugin";
}

function activityDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function ToolIcon({ id }: { id: string }): React.JSX.Element {
  if (id === "web") return <GlobeHemisphereWest size={17} />;
  if (id === "apps") return <EnvelopeSimple size={17} />;
  return <FolderOpen size={17} />;
}

function AgentGlyph({ id, name }: { id?: string; name: string }): React.JSX.Element {
  const identity = `${id ?? ""} ${name}`.toLowerCase();
  const common = { viewBox: "0 0 40 40", fill: "none", "aria-hidden": true } as const;

  if (identity.includes("customer") || identity.includes("follow-up")) {
    return <svg {...common} className="agent-glyph agent-glyph-followup"><g className="agent-glyph-body"><path d="M9 11.5h15.5a5 5 0 0 1 5 5v3.75a5 5 0 0 1-5 5H17l-5.5 4v-4.4A5 5 0 0 1 7 20v-3.5a5 5 0 0 1 2-4Z" fill="currentColor" opacity=".16"/><path d="M11.5 12h13a4.5 4.5 0 0 1 4.5 4.5v4a4.5 4.5 0 0 1-4.5 4.5H17l-5.5 4v-4.55A4.5 4.5 0 0 1 7 20v-3.5a4.5 4.5 0 0 1 4.5-4.5Z" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round"/><path d="M13 18.5h8.5M13 22h5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"/></g><path className="agent-glyph-accent" d="m27.5 9 4 1.2-1.2 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  }
  if (identity.includes("meeting") || identity.includes("calendar")) {
    return <svg {...common} className="agent-glyph agent-glyph-meeting"><g className="agent-glyph-body"><rect x="8" y="10" width="24" height="22" rx="6" fill="currentColor" opacity=".14"/><rect x="8" y="10" width="24" height="22" rx="6" stroke="currentColor" strokeWidth="2.25"/><path d="M8 17h24M14 7.5V13M26 7.5V13" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"/></g><path className="agent-glyph-accent" d="m14 24 3.2 3L26 20" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  }
  if (identity.includes("research") || identity.includes("project")) {
    return <svg {...common} className="agent-glyph agent-glyph-research"><g className="agent-glyph-body"><circle cx="18" cy="18" r="10" fill="currentColor" opacity=".14"/><circle cx="18" cy="18" r="9" stroke="currentColor" strokeWidth="2.25"/><path d="m24.8 24.8 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></g><g className="agent-glyph-accent"><path d="m14 21.5 2.2-6.2 6.3-2.3-2.3 6.3-6.2 2.2Z" fill="currentColor"/><circle cx="18.3" cy="17.3" r="1.4" fill="var(--surface)"/></g></svg>;
  }
  if (identity.includes("everyday") || identity.includes("general")) {
    return <svg {...common} className="agent-glyph agent-glyph-everyday"><circle className="agent-glyph-body" cx="20" cy="20" r="12" fill="currentColor" opacity=".12"/><path className="agent-glyph-main" d="M20 7.5c1.2 6.4 4.1 9.3 10.5 10.5-6.4 1.2-9.3 4.1-10.5 10.5-1.2-6.4-4.1-9.3-10.5-10.5C15.9 16.8 18.8 13.9 20 7.5Z" stroke="currentColor" strokeWidth="2.15" strokeLinejoin="round"/><path className="agent-glyph-accent" d="M30.5 25.5c.45 2.3 1.7 3.55 4 4-2.3.45-3.55 1.7-4 4-.45-2.3-1.7-3.55-4-4 2.3-.45 3.55-1.7 4-4Z" fill="currentColor"/></svg>;
  }
  return <svg {...common} className="agent-glyph agent-glyph-network"><circle className="agent-glyph-main" cx="20" cy="20" r="4.5" fill="currentColor"/><g className="agent-glyph-orbit"><circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="2" opacity=".45"/><circle cx="20" cy="8" r="2.5" fill="currentColor"/><circle cx="30.4" cy="26" r="2.5" fill="currentColor"/><circle cx="9.6" cy="26" r="2.5" fill="currentColor"/><path d="M20 12.5v3M27 24l-3-1.75M13 24l3-1.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></g></svg>;
}

function AgentEditor({
  draft,
  models,
  pluginHarnesses,
  googleConnection,
  builtIn,
  onGenerate,
  onCancel,
  onSave,
}: {
  draft: AgentDraft;
  models: ModelConfig[];
  pluginHarnesses: PluginHarnessDescriptor[];
  googleConnection: GoogleConnection | null;
  builtIn: boolean;
  onGenerate?: (intent: string) => Promise<GeneratedAgentDraft>;
  onCancel: () => void;
  onSave: (draft: AgentDraft) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(draft);
  const [intent, setIntent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const pluginAvailable = !isPluginHarnessId(value.harness) || pluginHarnesses.some((harness) => harness.id === value.harness);
  const modelAvailable = models.some((model) => model.id === value.modelId);
  const appAccessValid = !value.connectors.includes("apps") || value.appAccess.length > 0;
  const valid = Boolean(value.name.trim() && value.prompt.trim() && modelAvailable && pluginAvailable && appAccessValid);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  function toggleConnector(id: string): void {
    setValue((current) => {
      const connectors = current.connectors.includes(id) ? current.connectors.filter((candidate) => candidate !== id) : [...current.connectors, id];
      return { ...current, connectors, ...(id === "apps" && !connectors.includes("apps") ? { appAccess: [] } : {}) };
    });
  }

  function toggleApp(id: GoogleWorkspaceServiceId): void {
    setValue((current) => ({ ...current, appAccess: current.appAccess.includes(id) ? current.appAccess.filter((candidate) => candidate !== id) : [...current.appAccess, id] }));
  }

  function updateHarness(harness: HarnessMode): void {
    setValue((current) => ({ ...current, harness }));
  }

  async function generateDraft(): Promise<void> {
    const request = intent.trim();
    if (!request || !onGenerate || generating) return;
    setGenerating(true);
    setGenerationError(null);
    try {
      const next = await onGenerate(request);
      setValue((current) => ({ ...current, ...next }));
      setGenerated(true);
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : "Khadim could not generate this agent. Try again or continue manually.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="agent-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="agent-editor agent-editor-workspace" role="dialog" aria-modal="true" aria-labelledby="agent-editor-title" onSubmit={(event) => { event.preventDefault(); if (valid) onSave(value); }}>
      <header className="agent-editor-header">
        <div className="agent-editor-identity">
          <span className={`agent-avatar ${value.color}`}><AgentGlyph id={value.id} name={value.name} /></span>
          <span><small>{value.id ? builtIn ? "Customize built-in agent" : "Edit agent" : "Create an agent"}</small><h2 id="agent-editor-title">{value.name.trim() || "What should this agent do?"}</h2></span>
        </div>
        <button className="agent-editor-close" type="button" aria-label="Close agent editor" onClick={onCancel}><X size={17} /></button>
      </header>
      <section className="agent-ai-builder">
        <span className="agent-ai-mark"><Sparkle size={18} weight="fill" /></span>
        <div><h3>Describe what you want done</h3><p>Khadim will write the role, guidelines, and choose sensible access. You can change anything before creating it.</p></div>
        <textarea autoFocus aria-label="Describe your agent" value={intent} onChange={(event) => { setIntent(event.target.value); setGenerated(false); }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void generateDraft(); } }} placeholder="For example: Follow up with customers after meetings, draft warm replies, and always ask before sending." rows={3} />
        <button className="agent-generate-button" type="button" disabled={!intent.trim() || generating || !onGenerate} onClick={() => void generateDraft()}><Sparkle size={16} weight="fill" /> {generating ? "Building your agent…" : generated ? "Generate again" : "Generate with AI"}</button>
        {generationError && <p className="agent-generation-error" role="alert">{generationError}</p>}
        {generated && !generationError && <p className="agent-generation-success" role="status"><Check size={13} /> Draft ready. Review it below or create it now.</p>}
      </section>
      <div className="agent-editor-fields">
        <section className="agent-editor-section agent-editor-brief">
          <header><div><h3>Agent details</h3><p>The essentials people will see and the guidance the agent follows.</p></div></header>
          <div className="agent-editor-section-grid">
            <label><span>Name</span><input value={value.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} placeholder="Customer follow-up" required /></label>
            <label><span>Short responsibility</span><input value={value.description} onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))} placeholder="Prepares informed customer replies" /></label>
            <label className="agent-behavior-field"><span>Operating brief</span><textarea aria-label="Instructions" value={value.prompt} onChange={(event) => setValue((current) => ({ ...current, prompt: event.target.value }))} placeholder="Describe the role, priorities, approval boundaries, and definition of done." rows={8} required /><small>Include what it owns, what a finished result looks like, and which external actions require approval.</small></label>
          </div>
        </section>

        <details className="agent-advanced-setup">
          <summary><span><strong>Advanced setup</strong><small>Model, runtime, access, and appearance</small></span><CaretDown size={15} /></summary>
        <section className="agent-editor-section">
          <header><div><h3>Model and runtime</h3><p>The current defaults work for most agents.</p></div></header>
          <fieldset className="agent-runtime-fields">
            <legend className="sr-only">Runtime defaults</legend>
            <div>
              <label><span>Model</span><select value={value.modelId} onChange={(event) => setValue((current) => ({ ...current, modelId: event.target.value }))}>{models.length === 0 && <option value="">No models configured</option>}{models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></label>
              <label><span>Environment</span><select value={value.harness} onChange={(event) => updateHarness(event.target.value as HarnessMode)}><option value="assistant">Assistant</option><option value="rpa">Computer control</option>{pluginHarnesses.map((harness) => <option value={harness.id} key={harness.id}>{harness.name} · plugin</option>)}</select></label>
            </div>
            {!modelAvailable && <small className="agent-field-error">Choose an available model. You can add models in Settings.</small>}
            {!pluginAvailable && <small className="agent-field-error">The saved plugin runtime is unavailable. Choose another environment.</small>}
          </fieldset>
        </section>

        <section className="agent-editor-section">
          <header><div><h3>Access</h3><p>Only enable capabilities this agent needs.</p></div></header>
          <fieldset>
            <legend className="sr-only">Tool groups</legend>
            <div className="agent-connector-options">
              {toolOptions.map((tool) => <button type="button" className={value.connectors.includes(tool.id) ? "selected" : ""} aria-pressed={value.connectors.includes(tool.id)} onClick={() => toggleConnector(tool.id)} key={tool.id}><ToolIcon id={tool.id} /><span><strong>{tool.name}</strong><small>{tool.description}</small></span><ToggleSwitch enabled={value.connectors.includes(tool.id)} /></button>)}
            </div>
          </fieldset>

          {value.connectors.includes("apps") && <fieldset className="agent-app-access">
            <legend>Google services</legend>
            <p>Only selected services are exposed. Account connection remains managed in Apps.</p>
            <div className="agent-app-options">
              {googleApps.map((app) => {
                const connected = Boolean(googleConnection?.connected && googleWorkspaceServiceEnabled(googleConnection.scopes, app.id));
                return <button type="button" className={value.appAccess.includes(app.id) ? "selected" : ""} aria-pressed={value.appAccess.includes(app.id)} onClick={() => toggleApp(app.id)} key={app.id}>{app.icon}<span><strong>{app.name}</strong><small>{connected ? app.description : "Connect or update access in Apps"}</small></span><ToggleSwitch enabled={value.appAccess.includes(app.id)} /></button>;
              })}
            </div>
            {!appAccessValid && <small className="agent-field-error">Select at least one Google service, or turn off Connected apps.</small>}
          </fieldset>}
        </section>

        <details className="agent-editor-advanced">
          <summary>Appearance</summary>
          <fieldset className="agent-color-field">
            <legend>Identity color</legend>
            <div role="radiogroup" aria-label="Agent color">{(["coral", "blue", "orange", "pink"] as const).map((color) => <button type="button" role="radio" aria-checked={value.color === color} aria-label={color} className={`agent-color-choice ${color} ${value.color === color ? "selected" : ""}`} onClick={() => setValue((current) => ({ ...current, color }))} key={color}>{value.color === color && <Check size={13} />}</button>)}</div>
          </fieldset>
        </details>
        </details>
      </div>
      <footer><span>{valid ? "Ready to use in a new chat" : "Add a name, instructions, and an available model."}</span><button type="button" onClick={onCancel}>Cancel</button><button className="primary" type="submit" disabled={!valid}>{value.id && !builtIn ? "Save changes" : "Create agent"}</button></footer>
    </form>
    </div>
  );
}

export function AgentsView({
  agents,
  selectedId,
  models,
  conversations,
  harness,
  pluginHarnesses,
  googleConnection,
  onCreate,
  onGenerate,
  onUpdate,
  onDelete,
  onStart,
}: {
  agents: AgentDefinition[];
  selectedId: string;
  models: ModelConfig[];
  conversations: Conversation[];
  harness: HarnessMode;
  pluginHarnesses: PluginHarnessDescriptor[];
  googleConnection: GoogleConnection | null;
  onCreate: (agent: AgentDefinition) => void;
  onGenerate?: (intent: string) => Promise<GeneratedAgentDraft>;
  onUpdate: (agent: AgentDefinition) => void;
  onDelete: (id: string) => void;
  onStart: (id: string) => void;
}): React.JSX.Element {
  const defaultModelId = models.find((model) => model.isActive)?.id ?? models[0]?.id ?? "";
  const [inspectedId, setInspectedId] = useState(selectedId);
  const [editor, setEditor] = useState<AgentDraft | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const templateTriggerRef = useRef<HTMLButtonElement>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  const inspected = agents.find((agent) => agent.id === inspectedId);

  function modelFor(agent: AgentDefinition): ModelConfig | undefined {
    if (agent.modelId) return models.find((model) => model.id === agent.modelId);
    return models.find((model) => model.isActive) ?? models[0];
  }

  function runsFor(agentId: string) {
    return conversations.flatMap((conversation) => (conversation.runs ?? [])
      .filter((run) => run.agent.id === agentId)
      .map((run) => ({ run, conversation })))
      .sort((left, right) => right.run.createdAt.localeCompare(left.run.createdAt));
  }

  useEffect(() => {
    if (!agents.some((agent) => agent.id === inspectedId)) setInspectedId(agents.find((agent) => agent.id === selectedId)?.id ?? agents[0]?.id ?? "");
  }, [agents, inspectedId, selectedId]);

  useEffect(() => {
    if (!templatesOpen) return;
    window.requestAnimationFrame(() => templateMenuRef.current?.querySelector<HTMLButtonElement>("[data-agent-template]")?.focus());
    function closeOnOutsidePointer(event: PointerEvent): void {
      const target = event.target as Node;
      if (templateMenuRef.current?.contains(target) || templateTriggerRef.current?.contains(target)) return;
      setTemplatesOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      setTemplatesOpen(false);
      window.requestAnimationFrame(() => templateTriggerRef.current?.focus());
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [templatesOpen]);

  function beginCreate(template?: AgentTemplate): void {
    setTemplatesOpen(false);
    setPendingDelete(false);
    setEditor(blankDraft(defaultModelId, harness, template));
  }

  function saveDraft(draft: AgentDraft): void {
    const base: AgentDefinition = {
      id: draft.id && !agents.find((agent) => agent.id === draft.id)?.builtIn ? draft.id : createId(),
      name: draft.name.trim(),
      type: "agent",
      description: draft.description.trim() || `Owns ${draft.name.trim().toLowerCase()} work.`,
      prompt: draft.prompt.trim(),
      connectors: [...draft.connectors],
      appAccess: draft.connectors.includes("apps") ? [...draft.appAccess] : [],
      modelId: draft.modelId,
      harness: draft.harness,
      color: draft.color,
    };
    if (draft.id && !agents.find((agent) => agent.id === draft.id)?.builtIn) onUpdate(base);
    else onCreate(base);
    setInspectedId(base.id);
    setEditor(null);
  }

  return (
    <section className="agent-workbench workspace-arrival" aria-labelledby="agents-title">
      <header className="agent-workbench-header workspace-page-header">
        <div className="surface-heading workspace-page-copy"><div className="agent-title-row"><h1 id="agents-title">Agents</h1><FeatureMaturityBadge feature="agents" /></div><p>Reusable operating briefs with fixed runtime and access defaults for supervised work.</p></div>
        <div className="agent-create-menu"><button ref={templateTriggerRef} className="agent-create-button workspace-primary-action" type="button" aria-haspopup="dialog" onClick={() => beginCreate()}><Plus size={17} /> New agent</button><button className="agent-template-shortcut" type="button" aria-haspopup="dialog" aria-expanded={templatesOpen} onClick={() => setTemplatesOpen((open) => !open)}>Use a template</button>{templatesOpen && <div className="agent-modal-backdrop agent-template-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setTemplatesOpen(false); templateTriggerRef.current?.focus(); } }}><div ref={templateMenuRef} className="agent-template-menu" role="dialog" aria-modal="true" aria-label="Agent templates"><header><span><strong>Choose a starting point</strong><small>Start with a familiar job, then make it yours.</small></span><button type="button" aria-label="Close agent templates" onClick={() => { setTemplatesOpen(false); templateTriggerRef.current?.focus(); }}><X size={15} /></button></header><div className="agent-template-grid">{templates.map((template) => <button type="button" data-agent-template onClick={() => beginCreate(template)} key={template.id}><span className={`agent-avatar ${template.color}`}><AgentGlyph id={template.id} name={template.name} /></span><span><strong>{template.name}</strong><small>{template.description}</small></span><ArrowRight size={14} /></button>)}</div></div></div>}</div>
      </header>

      <section className="agent-library" aria-label="Configured agents">
        <header className="agent-library-heading"><span><h2>Your agents</h2><p>Choose an agent to see its setup, or start working right away.</p></span><small>{agents.length} {agents.length === 1 ? "agent" : "agents"}</small></header>
        <div className="agent-library-list">
          {agents.map((agent) => {
            const expanded = inspected?.id === agent.id;
            const model = modelFor(agent);
            const agentHarness = agent.harness ?? harness;
            const appAccess = agent.appAccess ?? (agent.connectors.includes("apps") ? ["gmail", "drive", "calendar"] : []);
            const enabledApps = googleApps.filter((app) => appAccess.includes(app.id));
            const appAccessReady = !agent.connectors.includes("apps") || (enabledApps.length > 0 && enabledApps.every((app) => Boolean(googleConnection?.connected && googleWorkspaceServiceEnabled(googleConnection.scopes, app.id))));
            const history = runsFor(agent.id);
            const latest = history[0]?.run;
            const accessNames = agent.connectors.map((id) => toolOptions.find((tool) => tool.id === id)?.name ?? id);
            return (
              <article className={`agent-library-entry ${expanded ? "is-expanded" : ""}`} key={agent.id}>
                <div className="agent-library-row">
                  <button className="agent-library-primary" type="button" aria-expanded={expanded} aria-controls={`agent-details-${agent.id}`} onClick={() => { setInspectedId(expanded ? "" : agent.id); setPendingDelete(false); }}>
                    <span className={`agent-avatar ${agent.color}`}><AgentGlyph id={agent.id} name={agent.name} /></span>
                    <span className="agent-library-copy"><span><strong>{agent.name}</strong>{agent.id === selectedId && <small className="agent-current-label">Current</small>}</span><small>{agent.description}</small></span>
                  </button>
                  <div className="agent-card-meta"><span className={!model && Boolean(agent.modelId) ? "needs-setup" : ""}>{model ? <ModelIcon model={model} size={16} /> : <WarningCircle size={16} />}{model?.name ?? "Model unavailable"}</span><span>{agentHarness === "rpa" ? <Monitor size={16} /> : isPluginHarnessId(agentHarness) ? <PluginLogo pluginId={pluginHarnesses.find((item) => item.id === agentHarness)?.pluginId ?? "plugin"} size={16} /> : <Robot size={16} />}{harnessName(agentHarness, pluginHarnesses)}</span></div>
                  <div className="agent-card-status"><span className={appAccessReady ? "is-ready" : "needs-setup"}>{appAccessReady ? <Check size={13} /> : <WarningCircle size={13} />}{appAccessReady ? accessNames.length ? accessNames.join(", ") : "Prompt only" : "Setup required"}</span><span><ClockCounterClockwise size={13} />{latest ? `${latest.status === "error" ? "Failed" : latest.status === "stopped" ? "Stopped" : latest.status === "running" ? "Running" : "Completed"} · ${activityDate(latest.createdAt)}` : "Not run yet"}</span></div>
                  <div className="agent-library-actions"><button type="button" aria-label={`Start chat with ${agent.name}`} onClick={() => onStart(agent.id)}><ArrowRight size={15} /> Start chat</button></div>
                </div>
              </article>
            );
          })}
        </div>
        {inspected && (() => {
          const agent = inspected;
          const agentHarness = agent.harness ?? harness;
          const appAccess = agent.appAccess ?? (agent.connectors.includes("apps") ? ["gmail", "drive", "calendar"] : []);
          const enabledApps = googleApps.filter((app) => appAccess.includes(app.id));
          const appAccessReady = !agent.connectors.includes("apps") || (enabledApps.length > 0 && enabledApps.every((app) => Boolean(googleConnection?.connected && googleWorkspaceServiceEnabled(googleConnection.scopes, app.id))));
          const history = runsFor(agent.id);
          return <section className="agent-selected-detail" id={`agent-details-${agent.id}`} aria-label={`${agent.name} details`}>
            <header><div className="agent-profile-identity"><span className={`agent-avatar large ${agent.color}`}><AgentGlyph id={agent.id} name={agent.name} /></span><span><small>{agent.builtIn ? "Built-in agent" : "Custom agent"}</small><h2>{agent.name}</h2><p>{agent.description}</p></span></div><div className="agent-detail-actions">{agent.builtIn ? <button onClick={() => setEditor(draftFromAgent(agent, defaultModelId, harness))}><Copy size={15} /> Customize copy</button> : <button onClick={() => setEditor(draftFromAgent(agent, defaultModelId, harness))}><PencilSimple size={15} /> Edit agent</button>}<button className="primary" onClick={() => onStart(agent.id)}><ArrowRight size={15} /> Start chat</button></div></header>
            <div className="agent-detail-grid"><section><h3>Guidelines</h3><div className="agent-instructions">{agent.prompt}</div></section><section><h3>Access</h3><div className="agent-access-rows">{agent.connectors.map((id) => { const tool = toolOptions.find((candidate) => candidate.id === id); const ready = id !== "apps" || appAccessReady; return <span key={id}><ToolIcon id={id} /><span><strong>{tool?.name ?? id}</strong><small>{tool?.description}</small></span><span className={`agent-access-state ${ready ? "is-ready" : "needs-setup"}`}>{ready ? "Ready" : "Setup required"}</span></span>; })}{agent.connectors.length === 0 && <p>Prompt only. No optional access.</p>}</div></section><section className="agent-recent-work"><h3>Recent work</h3>{history.length === 0 ? <p>This agent has not started a chat yet.</p> : <div>{history.slice(0, 3).map(({ run, conversation }) => <span key={run.id}><i className={`is-${run.status}`} aria-hidden="true" /><span><strong>{conversation.title}</strong><small>{activityDate(run.createdAt)} · {run.model.name}</small></span><b>{run.status === "error" ? "Failed" : run.status === "stopped" ? "Stopped" : run.status === "running" ? "Running" : "Complete"}</b></span>)}</div>}</section></div>
            {!agent.builtIn && <footer>{pendingDelete ? <div className="agent-delete-confirm"><span><strong>Delete {agent.name}?</strong><small>Existing chats keep their saved run snapshots.</small></span><button onClick={() => setPendingDelete(false)}>Cancel</button><button className="danger" onClick={() => { onDelete(agent.id); setPendingDelete(false); }}>Delete agent</button></div> : <button className="agent-delete-button" onClick={() => setPendingDelete(true)}><Trash size={14} /> Delete agent</button>}</footer>}
          </section>;
        })()}
      </section>
      {editor && <AgentEditor draft={editor} models={models} pluginHarnesses={pluginHarnesses} googleConnection={googleConnection} builtIn={Boolean(editor.id && agents.find((agent) => agent.id === editor.id)?.builtIn)} onGenerate={onGenerate} onCancel={() => setEditor(null)} onSave={saveDraft} />}
    </section>
  );
}
