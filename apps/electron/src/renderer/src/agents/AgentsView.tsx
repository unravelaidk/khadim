import {
  ArrowRight,
  CalendarBlank,
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
  Trash,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Conversation, GoogleConnection, HarnessMode, ModelConfig, PluginHarnessDescriptor } from "../../../shared/types";
import { googleWorkspaceServiceEnabled, type GoogleWorkspaceServiceId } from "../../../shared/google-workspace";
import { isPluginHarnessId } from "../../../shared/plugins";
import { toolOptions } from "../chat/tool-options";
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

function AgentEditor({
  draft,
  models,
  pluginHarnesses,
  googleConnection,
  builtIn,
  onCancel,
  onSave,
}: {
  draft: AgentDraft;
  models: ModelConfig[];
  pluginHarnesses: PluginHarnessDescriptor[];
  googleConnection: GoogleConnection | null;
  builtIn: boolean;
  onCancel: () => void;
  onSave: (draft: AgentDraft) => void;
}): React.JSX.Element {
  const [value, setValue] = useState(draft);
  const pluginAvailable = !isPluginHarnessId(value.harness) || pluginHarnesses.some((harness) => harness.id === value.harness);
  const modelAvailable = models.some((model) => model.id === value.modelId);
  const appAccessValid = !value.connectors.includes("apps") || value.appAccess.length > 0;
  const valid = Boolean(value.name.trim() && value.prompt.trim() && modelAvailable && pluginAvailable && appAccessValid);

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

  return (
    <form className="agent-editor agent-profile-editor" onSubmit={(event) => { event.preventDefault(); if (valid) onSave(value); }}>
      <div className="agent-editor-intro">
        <span className={`agent-editor-mark ${value.color}`}><Robot size={20} /></span>
        <span>{value.id ? builtIn ? "Customize a copy" : "Edit agent" : "New agent"}</span>
        <h2>{value.id ? "Refine its operating brief" : "What should this agent own?"}</h2>
        <p>One recognizable responsibility, explicit boundaries, and only the access the job requires.</p>
        <dl>
          <div><dt>Responsibility</dt><dd>Name the outcome it owns.</dd></div>
          <div><dt>Boundaries</dt><dd>Say when it must ask first.</dd></div>
          <div><dt>Access</dt><dd>Keep every permission explainable.</dd></div>
        </dl>
      </div>
      <div className="agent-editor-fields">
        <label><span>Name</span><input autoFocus value={value.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} placeholder="Customer follow-up" required /></label>
        <label><span>Short description</span><input value={value.description} onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))} placeholder="Prepares informed customer replies" /></label>
        <label className="agent-behavior-field"><span>Instructions</span><textarea aria-label="Instructions" value={value.prompt} onChange={(event) => setValue((current) => ({ ...current, prompt: event.target.value }))} placeholder="Describe the role, priorities, approval boundaries, and definition of done." rows={7} required /><small>These instructions are saved into every run snapshot so past work remains explainable.</small></label>

        <fieldset className="agent-runtime-fields">
          <legend>Runtime</legend>
          <p>Choose the model and execution environment this agent should use by default.</p>
          <div>
            <label><span>Model</span><select value={value.modelId} onChange={(event) => setValue((current) => ({ ...current, modelId: event.target.value }))}>{models.length === 0 && <option value="">No models configured</option>}{models.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}</select></label>
            <label><span>Environment</span><select value={value.harness} onChange={(event) => updateHarness(event.target.value as HarnessMode)}><option value="assistant">Assistant</option><option value="rpa">Computer control</option>{pluginHarnesses.map((harness) => <option value={harness.id} key={harness.id}>{harness.name} · plugin</option>)}</select></label>
          </div>
          {!modelAvailable && <small className="agent-field-error">Choose an available model. You can add models in Settings.</small>}
          {!pluginAvailable && <small className="agent-field-error">The saved plugin runtime is unavailable. Choose another environment.</small>}
        </fieldset>

        <fieldset>
          <legend>Capabilities</legend>
          <p>These broad tool groups are the outer boundary for every run.</p>
          <div className="agent-connector-options">
            {toolOptions.map((tool) => <button type="button" className={value.connectors.includes(tool.id) ? "selected" : ""} aria-pressed={value.connectors.includes(tool.id)} onClick={() => toggleConnector(tool.id)} key={tool.id}><ToolIcon id={tool.id} /><span><strong>{tool.name}</strong><small>{tool.description}</small></span><ToggleSwitch enabled={value.connectors.includes(tool.id)} /></button>)}
          </div>
        </fieldset>

        {value.connectors.includes("apps") && <fieldset className="agent-app-access">
          <legend>Google app access</legend>
          <p>Choose the connected services whose native tools this agent may see.</p>
          <div className="agent-app-options">
            {googleApps.map((app) => {
              const connected = Boolean(googleConnection?.connected && googleWorkspaceServiceEnabled(googleConnection.scopes, app.id));
              return <button type="button" className={value.appAccess.includes(app.id) ? "selected" : ""} aria-pressed={value.appAccess.includes(app.id)} onClick={() => toggleApp(app.id)} key={app.id}>{app.icon}<span><strong>{app.name}</strong><small>{connected ? app.description : "Connect or update access in Apps"}</small></span><ToggleSwitch enabled={value.appAccess.includes(app.id)} /></button>;
            })}
          </div>
          {!appAccessValid && <small className="agent-field-error">Select at least one Google service, or turn off Connected apps.</small>}
        </fieldset>}

        <fieldset className="agent-color-field">
          <legend>Identity color</legend>
          <div role="radiogroup" aria-label="Agent color">{(["coral", "blue", "orange", "pink"] as const).map((color) => <button type="button" role="radio" aria-checked={value.color === color} aria-label={color} className={`agent-color-choice ${color} ${value.color === color ? "selected" : ""}`} onClick={() => setValue((current) => ({ ...current, color }))} key={color}>{value.color === color && <Check size={13} />}</button>)}</div>
        </fieldset>
      </div>
      <footer><span>{value.connectors.length} tool groups · {value.appAccess.length} Google services</span><button type="button" onClick={onCancel}>Cancel</button><button className="primary" type="submit" disabled={!valid}>{value.id && !builtIn ? "Save changes" : "Create agent"}</button></footer>
    </form>
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
  const inspected = agents.find((agent) => agent.id === inspectedId) ?? agents[0];
  const currentModel = inspected ? models.find((model) => model.id === inspected.modelId) ?? models.find((model) => model.isActive) ?? models[0] : undefined;
  const currentHarness = inspected?.harness ?? harness;
  const appAccess = inspected?.appAccess ?? (inspected?.connectors.includes("apps") ? ["gmail", "drive", "calendar"] : []);
  const enabledApps = useMemo(() => googleApps.filter((app) => appAccess.includes(app.id)), [appAccess]);
  const activity = useMemo(() => {
    const runs = conversations.flatMap((conversation) => conversation.runs ?? []).filter((run) => run.agent.id === inspected?.id);
    const latest = runs.reduce<string | null>((current, run) => !current || run.createdAt > current ? run.createdAt : current, null);
    return { count: runs.length, latest: activityDate(latest) };
  }, [conversations, inspected?.id]);

  useEffect(() => {
    if (!agents.some((agent) => agent.id === inspectedId)) setInspectedId(selectedId);
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

  if (editor) return <section className="agent-workbench workspace-arrival" aria-label={editor.id ? "Edit agent" : "Create agent"}><AgentEditor draft={editor} models={models} pluginHarnesses={pluginHarnesses} googleConnection={googleConnection} builtIn={Boolean(editor.id && agents.find((agent) => agent.id === editor.id)?.builtIn)} onCancel={() => setEditor(null)} onSave={saveDraft} /></section>;

  return (
    <section className="agent-workbench workspace-arrival" aria-labelledby="agents-title">
      <header className="agent-workbench-header workspace-page-header">
        <div className="surface-heading workspace-page-copy"><span>Workers</span><h1 id="agents-title">Agents</h1><p>Save the operating brief, runtime, and exact access for work you want to repeat.</p><small className="agent-workbench-meta"><i aria-hidden="true" /> {agents.find((agent) => agent.id === selectedId)?.name ?? "Agent"} is current <span aria-hidden="true">/</span> {agents.length} configured</small></div>
        <div className="agent-create-menu"><button ref={templateTriggerRef} className="agent-create-button workspace-primary-action" type="button" aria-haspopup="dialog" aria-expanded={templatesOpen} onClick={() => setTemplatesOpen((open) => !open)}><Plus size={17} /> New agent</button>{templatesOpen && <div ref={templateMenuRef} className="agent-template-menu" role="dialog" aria-label="Agent templates"><header><strong>Start with a job</strong><button type="button" aria-label="Close agent templates" onClick={() => { setTemplatesOpen(false); templateTriggerRef.current?.focus(); }}><X size={14} /></button></header>{templates.map((template) => <button type="button" data-agent-template onClick={() => beginCreate(template)} key={template.id}><span className={`agent-avatar ${template.color}`}>{template.name[0]}</span><span><strong>{template.name}</strong><small>{template.description}</small></span><ArrowRight size={14} /></button>)}<button type="button" data-agent-template className="blank" onClick={() => beginCreate()}><Plus size={16} /><span><strong>Blank agent</strong><small>Define a responsibility from scratch.</small></span></button></div>}</div>
      </header>

      <div className="agent-management-layout">
        <aside className="agent-roster-panel" aria-label="Configured agents"><header><strong>Configured</strong><small>{agents.length}</small></header><div>{agents.map((agent) => <button className={agent.id === inspected?.id ? "active" : ""} onClick={() => { setInspectedId(agent.id); setPendingDelete(false); }} key={agent.id}><span className={`agent-avatar ${agent.color}`}>{agent.name[0]?.toUpperCase()}</span><span><strong>{agent.name}</strong><small>{agent.description}</small></span>{agent.id === selectedId && <i title="Current agent" />}</button>)}</div><button className="agent-roster-new" onClick={() => beginCreate()}><Plus size={15} /> Create agent</button></aside>

        {inspected && <article className="agent-profile">
          <header><div className="agent-profile-identity"><span className={`agent-avatar large ${inspected.color}`}>{inspected.name[0]?.toUpperCase()}</span><span><small>{inspected.builtIn ? "Built in" : "Your agent"}</small><h2>{inspected.name}</h2><p>{inspected.description}</p></span></div><div className="agent-profile-actions">{inspected.builtIn ? <button onClick={() => setEditor(draftFromAgent(inspected, defaultModelId, harness))}><Copy size={15} /> Customize copy</button> : <button onClick={() => setEditor(draftFromAgent(inspected, defaultModelId, harness))}><PencilSimple size={15} /> Edit</button>}<button className="primary" onClick={() => onStart(inspected.id)}><ArrowRight size={15} /> Start chat</button></div></header>

          <div className="agent-profile-summary"><section><span>Model</span><div>{currentModel ? <ModelIcon model={currentModel} size={18} /> : <Robot size={18} />}<strong>{currentModel?.name ?? "No model selected"}</strong></div></section><section><span>Environment</span><div>{currentHarness === "rpa" ? <Monitor size={18} /> : isPluginHarnessId(currentHarness) ? <PluginLogo pluginId={pluginHarnesses.find((item) => item.id === currentHarness)?.pluginId ?? "plugin"} size={18} /> : <Robot size={18} />}<strong>{harnessName(currentHarness, pluginHarnesses)}</strong></div></section><section><span>Activity</span><div><ClockCounterClockwise size={18} /><strong>{activity.count === 0 ? "Not run yet" : `${activity.count} ${activity.count === 1 ? "run" : "runs"}${activity.latest ? ` · ${activity.latest}` : ""}`}</strong></div></section></div>

          <section className="agent-profile-section"><header><span><h3>Instructions</h3><p>The durable operating brief included in each run.</p></span></header><div className="agent-instructions">{inspected.prompt}</div></section>
          <section className="agent-profile-section"><header><span><h3>Access</h3><p>Only these capabilities are exposed when this agent starts.</p></span></header><div className="agent-access-detail"><div>{inspected.connectors.map((id) => { const tool = toolOptions.find((candidate) => candidate.id === id); return <span key={id}><ToolIcon id={id} /><span><strong>{tool?.name ?? id}</strong><small>{tool?.description}</small></span><Check size={13} /></span>; })}{inspected.connectors.length === 0 && <p>No optional tool groups. This agent reasons from the prompt only.</p>}</div>{inspected.connectors.includes("apps") && <div className="agent-google-access"><strong>Google services</strong>{enabledApps.map((app) => <span key={app.id}>{app.icon}<span><strong>{app.name}</strong><small>{googleConnection?.connected && googleWorkspaceServiceEnabled(googleConnection.scopes, app.id) ? "Connected and allowed" : "Allowed · connect in Apps before use"}</small></span></span>)}{enabledApps.length === 0 && <p>No Google services selected.</p>}</div>}</div></section>

          {!inspected.builtIn && <footer className="agent-danger-zone">{pendingDelete ? <><span><strong>Delete {inspected.name}?</strong><small>Existing chats keep their saved run snapshots.</small></span><button onClick={() => setPendingDelete(false)}>Cancel</button><button className="danger" onClick={() => { onDelete(inspected.id); setPendingDelete(false); }}>Delete agent</button></> : <button onClick={() => setPendingDelete(true)}><Trash size={14} /> Delete agent</button>}</footer>}
        </article>}
      </div>
    </section>
  );
}
