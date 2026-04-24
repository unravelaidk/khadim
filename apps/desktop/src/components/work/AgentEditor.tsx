import React, { useState, useCallback, useMemo } from "react";
import type { ManagedAgent, Environment, MemoryStore } from "../../lib/types";
import { GlassSelect } from "../GlassSelect";
import { useDockerAvailableQuery, useAgentMemoryStoresQuery, useMemoryStoresQuery } from "../../lib/queries";

/* ─── Tool option ──────────────────────────────────────────────────── */

const TOOL_DOMAINS = [
  { id: "browser",     label: "Browser",      desc: "Web automation, scraping, form filling" },
  { id: "email",       label: "Email",        desc: "Send and read email via IMAP/SMTP" },
  { id: "spreadsheet", label: "Spreadsheet",  desc: "Read and write Excel, CSV files" },
  { id: "http",        label: "HTTP / API",   desc: "Make REST API requests" },
  { id: "files",       label: "Files",        desc: "Read, write, and manage local files" },
  { id: "shell",       label: "Shell",        desc: "Run commands and scripts" },
  { id: "screen",      label: "Screen",       desc: "Screenshots, OCR, mouse/keyboard" },
  { id: "coding",      label: "Coding",       desc: "LSP, git, syntax analysis" },
] as const;

const TRIGGER_OPTIONS = [
  { id: "manual",   label: "Manual only",   desc: "Run from the dashboard or API" },
  { id: "schedule", label: "On a schedule",  desc: "Cron expression (e.g. every morning)" },
  { id: "event",    label: "On event",       desc: "Webhook, email arrival, file change" },
] as const;

const APPROVAL_OPTIONS = [
  { id: "ask",   label: "Ask before sensitive actions", desc: "Agent pauses and waits for approval" },
  { id: "auto",  label: "Auto-approve known actions",   desc: "Only ask for new or risky actions" },
  { id: "never", label: "Fully autonomous",             desc: "Agent never pauses for approval" },
] as const;

const RUNNER_OPTIONS = [
  { id: "local",  label: "Local",  desc: "Runs on this machine using the selected harness" },
  { id: "docker", label: "Docker", desc: "Isolated container execution" },
] as const;

const HARNESS_OPTIONS = [
  { id: "khadim", label: "Khadim", desc: "Built-in agent runtime with tools and streaming", available: true },
  { id: "opencode", label: "OpenCode", desc: "OpenCode sidecar agent harness", available: false },
  { id: "claude_code", label: "Claude Code", desc: "Claude Code bridge with approval flow", available: false },
] as const;

/* ─── Agent Editor ─────────────────────────────────────────────────── */

type EditorTab = "brief" | "sources" | "policy" | "runtime";

const TABS: { id: EditorTab; label: string; icon: string; hint: string }[] = [
  { id: "brief",   label: "Brief",   icon: "ri-quill-pen-line",  hint: "Who the agent is and what it does" },
  { id: "sources", label: "Sources", icon: "ri-links-line",      hint: "What the agent can reach" },
  { id: "policy",  label: "Policy",  icon: "ri-shield-check-line",hint: "When it runs and what needs approval" },
  { id: "runtime", label: "Runtime", icon: "ri-cpu-line",        hint: "Where the code executes" },
];

interface AgentEditorProps {
  /** null = creating new, object = editing existing */
  agent: ManagedAgent | null;
  availableModels: { id: string; label: string }[];
  availableEnvironments?: Environment[];
  onSave: (data: AgentEditorData) => void;
  onCancel: () => void;
  onTest?: (data: AgentEditorData) => void;
}

export interface AgentEditorData {
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  triggerType: "manual" | "schedule" | "event";
  triggerConfig: string;
  approvalMode: "auto" | "ask" | "never";
  runnerType: "local" | "docker";
  harness: "khadim" | "opencode" | "claude_code";
  modelId: string;
  environmentId: string;
  maxTurns: number;
  maxTokens: number;
  variables?: Record<string, string>;
  /** Memory store to link to this agent. "auto" = create one automatically, "" = none, or a store ID */
  memoryStoreId: string;
}

/* ── Section icon — remixicon inline icon for form labels ──────────── */
function SectionIcon({ icon }: { icon: string }) {
  return (
    <i className={`${icon} text-base leading-none text-[var(--text-muted)]`} />
  );
}

/* ── Tab bar — centered pill nav with inline hints ─────────────────── */
function EditorTabBar({
  active,
  onChange,
}: {
  active: EditorTab;
  onChange: (t: EditorTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Agent editor sections"
      className="depth-inset inline-flex items-center gap-0.5 rounded-full p-[3px]"
    >
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            title={t.hint}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[11px] font-medium transition-all ${
              isActive
                ? "depth-card-sm text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <i className={`${t.icon} text-[13px] leading-none`} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Policy card — a plain-English choice card with radio semantics ─ */
function PolicyCard<T extends string>({
  value,
  selected,
  onSelect,
  title,
  desc,
  example,
}: {
  value: T;
  selected: T;
  onSelect: (v: T) => void;
  title: string;
  desc: string;
  example?: string;
}) {
  const isSelected = value === selected;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`group w-full rounded-[var(--radius-sm)] px-4 py-3 text-left transition-all ${
        isSelected
          ? "depth-card-sm"
          : "border border-[var(--glass-border)] hover:border-[var(--glass-border-strong)] hover:bg-[var(--glass-bg)]/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          isSelected ? "border-[var(--text-primary)]" : "border-[var(--glass-border-strong)]"
        }`}>
          {isSelected && <span className="h-2 w-2 rounded-full bg-[var(--text-primary)]" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            {desc}
          </p>
          {example && (
            <p className="mt-1.5 font-mono text-[10px] text-[var(--text-muted)]">
              {example}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export function AgentEditor({
  agent,
  availableModels,
  availableEnvironments = [],
  onSave,
  onCancel,
  onTest,
}: AgentEditorProps) {
  const [name, setName] = useState(agent?.name ?? "");
  const [description, setDescription] = useState(agent?.description ?? "");
  const [instructions, setInstructions] = useState(agent?.instructions ?? "");
  const [tools, setTools] = useState<Set<string>>(new Set(agent?.tools ?? ["shell", "files"]));
  const [triggerType, setTriggerType] = useState<"manual" | "schedule" | "event">(agent?.triggerType ?? "manual");
  const [triggerConfig, setTriggerConfig] = useState(agent?.triggerConfig ?? "");
  const [approvalMode, setApprovalMode] = useState<"auto" | "ask" | "never">(agent?.approvalMode ?? "ask");
  const [runnerType, setRunnerType] = useState<"local" | "docker">(agent?.runnerType === "cloud" ? "local" : (agent?.runnerType ?? "local") as any);
  const [harness, setHarness] = useState<"khadim" | "opencode" | "claude_code">(agent?.harness === "docker" ? "khadim" : (agent?.harness ?? "khadim") as any);
  const dockerQ = useDockerAvailableQuery();
  const dockerAvailable = dockerQ.data ?? false;
  const [modelId, setModelId] = useState(agent?.modelId ?? availableModels[0]?.id ?? "");
  const [environmentId, setEnvironmentId] = useState(agent?.environmentId ?? "");
  const [maxTurns, setMaxTurns] = useState(agent?.maxTurns ?? 25);
  const [maxTokens, setMaxTokens] = useState(agent?.maxTokens ?? 100000);

  // Memory store: query existing stores linked to this agent + all available stores
  const agentMemStoresQ = useAgentMemoryStoresQuery(agent?.id ?? null, Boolean(agent?.id));
  const allMemStoresQ = useMemoryStoresQuery();
  const agentLinkedStores = agentMemStoresQ.data ?? [];
  const allStores = allMemStoresQ.data ?? [];
  const currentLinkedStoreId = agentLinkedStores.length > 0 ? agentLinkedStores[0].id : null;
  const [memoryStoreId, setMemoryStoreId] = useState<string>(
    currentLinkedStoreId ?? (agent ? "" : "auto"),
  );
  // Update when the query loads
  React.useEffect(() => {
    if (currentLinkedStoreId && memoryStoreId === "" && agent) {
      setMemoryStoreId(currentLinkedStoreId);
    }
  }, [currentLinkedStoreId, memoryStoreId, agent]);

  const [variables, setVariables] = useState<[string, string][]>(
    agent?.variables ? Object.entries(agent.variables) : [],
  );

  const [tab, setTab] = useState<EditorTab>("brief");

  const toggleTool = useCallback((id: string) => {
    setTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addVariable = useCallback(() => {
    setVariables((prev) => [...prev, ["", ""]]);
  }, []);

  const removeVariable = useCallback((index: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateVariable = useCallback((index: number, field: 0 | 1, value: string) => {
    setVariables((prev) => prev.map((pair, i) => {
      if (i !== index) return pair;
      const next: [string, string] = [...pair];
      next[field] = value;
      return next;
    }));
  }, []);

  const canSave = name.trim().length > 0 && instructions.trim().length > 0;

  const buildData = (): AgentEditorData => {
    const vars: Record<string, string> = {};
    for (const [k, v] of variables) {
      const key = k.trim();
      if (key) vars[key] = v;
    }
    return {
      name: name.trim(),
      description: description.trim(),
      instructions: instructions.trim(),
      tools: Array.from(tools),
      triggerType,
      triggerConfig,
      approvalMode,
      runnerType,
      harness,
      modelId,
      environmentId,
      maxTurns,
      maxTokens,
      variables: Object.keys(vars).length > 0 ? vars : undefined,
      memoryStoreId,
    };
  };

  // Build model options for GlassSelect
  const modelOptions = availableModels.map((m) => ({
    value: m.id,
    label: m.label,
    detail: m.id,
  }));

  // Build environment options for GlassSelect
  const envOptions = [
    { value: "", label: "None", detail: "No environment" },
    ...availableEnvironments.map((e) => ({
      value: e.id,
      label: e.name,
      detail: e.description || `${e.runnerType} runner`,
    })),
  ];

  // Build memory store options for GlassSelect
  const memoryStoreOptions = useMemo(() => {
    const opts = [
      { value: "auto", label: "Auto-create", detail: "A private memory store will be created for this agent" },
      { value: "", label: "None", detail: "No persistent memory" },
    ];
    for (const store of allStores) {
      const isLinked = agentLinkedStores.some((s) => s.id === store.id);
      opts.push({
        value: store.id,
        label: store.name + (isLinked ? " (current)" : ""),
        detail: store.description || store.scopeType,
      });
    }
    return opts;
  }, [allStores, agentLinkedStores]);

  /* ── Tab bodies — each tab gets its own JSX block ───────────────── */

  const briefTab = (
    <>
      <div>
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-user-line" />
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Invoice Processor"
          className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
        />
      </div>

      <div className="mt-4">
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-align-left" />
          Description
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this agent do? (optional)"
          className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-9 w-full rounded-[var(--radius-sm)] px-3 text-[13px]"
        />
      </div>

      <div className="mt-8">
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-file-text-line" />
          Instructions
        </label>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          Tell the agent what to do. Be specific. Use {"{{variables}}"} for dynamic values.
        </p>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={"You are an invoice processing agent.\n\nWhen triggered:\n1. Check email for new invoices\n2. Download PDF attachments\n3. Extract amounts using OCR\n4. Append to the spreadsheet at {{output_path}}"}
          rows={10}
          className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-2 w-full resize-y rounded-[var(--radius-sm)] px-3 py-2 font-mono text-[12px] leading-[1.7]"
        />
      </div>

      <div className="mt-8">
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-sparkling-2-line" />
          Model
        </label>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          Which LLM powers this agent.
        </p>
        <div className="mt-2">
          {modelOptions.length > 0 ? (
            <GlassSelect
              options={modelOptions}
              value={modelId}
              onChange={setModelId}
              placeholder="Select model..."
            />
          ) : (
            <div className="depth-inset flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[12px] text-[var(--text-muted)]">
              <i className="ri-error-warning-line text-base leading-none" />
              No models configured — add one in Settings → Providers
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
            <SectionIcon icon="ri-code-s-slash-line" />
            Variables
          </label>
          <button
            onClick={addVariable}
            className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            + Add
          </button>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          Define {"{{variable}}"} placeholders used in the instructions above.
        </p>
        {variables.length === 0 ? (
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            No variables defined. Use them for dynamic values like file paths, URLs, or recipients.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {variables.map(([key, value], i) => (
              <div key={`var-${key}-${i}`} className="flex items-center gap-2">
                <input
                  value={key}
                  onChange={(e) => updateVariable(i, 0, e.target.value)}
                  placeholder="variable_name"
                  className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-8 w-36 shrink-0 rounded-[var(--radius-sm)] px-2 font-mono text-[11px]"
                />
                <input
                  value={value}
                  onChange={(e) => updateVariable(i, 1, e.target.value)}
                  placeholder="default value"
                  className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] h-8 flex-1 rounded-[var(--radius-sm)] px-2 text-[12px]"
                />
                <button
                  onClick={() => removeVariable(i)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--color-danger-text)]"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const sourcesTab = (
    <>
      <div>
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-server-line" />
          Environment
        </label>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          Working directory, credentials, and variables the agent can access.
        </p>
        {availableEnvironments.length > 0 ? (
          <>
            <div className="mt-2">
              <GlassSelect
                options={envOptions}
                value={environmentId}
                onChange={setEnvironmentId}
                placeholder="Select environment..."
              />
            </div>
            {environmentId && (() => {
              const selected = availableEnvironments.find((e) => e.id === environmentId);
              if (!selected) return null;
              return (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <i className="ri-server-line text-[11px] leading-none" />
                    {selected.runnerType}
                  </span>
                  {selected.workingDir && (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <i className="ri-folder-line text-[11px] leading-none" />
                      {selected.workingDir}
                    </span>
                  )}
                  {selected.credentialIds.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <i className="ri-key-line text-[11px] leading-none" />
                      {selected.credentialIds.length} credential{selected.credentialIds.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              );
            })()}
          </>
        ) : (
          <div className="mt-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--glass-border-strong)] bg-[var(--glass-bg)] px-3 py-2.5 text-[11px] text-[var(--text-muted)]">
            No environments yet. Create one in <span className="text-[var(--text-secondary)]">Settings → Environments</span> to set a working directory and attach credentials.
          </div>
        )}
      </div>

      <div className="mt-8">
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-brain-line" />
          Memory
        </label>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          Persistent memory the agent can read and write across runs.
        </p>
        <div className="mt-2">
          <GlassSelect
            options={memoryStoreOptions}
            value={memoryStoreId}
            onChange={setMemoryStoreId}
            placeholder="Select memory store..."
          />
        </div>
        {memoryStoreId === "auto" && (
          <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
            A private memory store will be created when the agent first runs.
          </p>
        )}
        {memoryStoreId && memoryStoreId !== "auto" && (() => {
          const selected = allStores.find((s) => s.id === memoryStoreId);
          if (!selected) return null;
          return (
            <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
              {selected.entryCount} entries · {selected.scopeType} scope
            </p>
          );
        })()}
      </div>

      <div className="mt-8">
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-tools-line" />
          Tools
          <span className="ml-auto font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
            {tools.size} of {TOOL_DOMAINS.length}
          </span>
        </label>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          What can this agent access?
        </p>
        <div className="mt-3 flex flex-col gap-1">
          {TOOL_DOMAINS.map((tool) => {
            const checked = tools.has(tool.id);
            return (
              <button
                key={tool.id}
                onClick={() => toggleTool(tool.id)}
                className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors ${
                  checked ? "bg-[var(--surface-elevated)]" : "hover:bg-[var(--glass-bg)]"
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${
                  checked
                    ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-bg)]"
                    : "border-[var(--glass-border-strong)] text-transparent"
                }`}>
                  ✓
                </span>
                <span className="flex-1">
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">{tool.label}</span>
                  <span className="ml-2 text-[11px] text-[var(--text-muted)]">{tool.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  /* Plain-English copy for Policy cards — no JSON, no cron-speak. */
  const TRIGGER_COPY: Record<(typeof TRIGGER_OPTIONS)[number]["id"], { title: string; desc: string; example: string }> = {
    manual: {
      title: "Only when I click run",
      desc: "The agent sits idle until you start it from the dashboard or the API.",
      example: "Good for experiments and ad-hoc jobs.",
    },
    schedule: {
      title: "On a recurring schedule",
      desc: "The agent wakes itself up at a cadence you set with a cron expression.",
      example: "Example: 0 9 * * * runs every morning at 9 AM.",
    },
    event: {
      title: "When something happens",
      desc: "A queue item, webhook, email, or file change kicks off the agent.",
      example: "Good for inbox-style automations and reactive workflows.",
    },
  };

  const APPROVAL_COPY: Record<(typeof APPROVAL_OPTIONS)[number]["id"], { title: string; desc: string; example: string }> = {
    ask: {
      title: "Ask me first",
      desc: "The agent pauses before anything risky — deletions, sends, writes outside the work dir.",
      example: "Safest default. You'll get a prompt inside the run view.",
    },
    auto: {
      title: "Auto-approve what I've seen before",
      desc: "Routine actions go through. Anything new or flagged as risky still waits for you.",
      example: "Good when you've tuned the agent and want less friction.",
    },
    never: {
      title: "Let it run on its own",
      desc: "No pauses. The agent acts on every decision until it finishes or hits a guardrail.",
      example: "Use with tight max-turns / max-tokens limits.",
    },
  };

  const policyTab = (
    <>
      <div>
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-flashlight-line" />
          When does it run?
        </label>
        <div className="mt-2 flex flex-col gap-2">
          {TRIGGER_OPTIONS.map((opt) => (
            <PolicyCard
              key={opt.id}
              value={opt.id}
              selected={triggerType}
              onSelect={setTriggerType}
              title={TRIGGER_COPY[opt.id].title}
              desc={TRIGGER_COPY[opt.id].desc}
              example={TRIGGER_COPY[opt.id].example}
            />
          ))}
        </div>

        {triggerType === "schedule" && (
          <div className="mt-3">
            <label className="block text-[11px] text-[var(--text-muted)]">Cron expression</label>
            <input
              value={triggerConfig}
              onChange={(e) => setTriggerConfig(e.target.value)}
              placeholder="0 9 * * *"
              className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-8 w-full rounded-[var(--radius-sm)] px-3 font-mono text-[12px]"
            />
          </div>
        )}

        {triggerType === "event" && (
          <div className="mt-3">
            <label className="block text-[11px] text-[var(--text-muted)]">Event source</label>
            <input
              value={triggerConfig}
              onChange={(e) => setTriggerConfig(e.target.value)}
              placeholder="Webhook URL, email filter, or file path…"
              className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-8 w-full rounded-[var(--radius-sm)] px-3 text-[12px]"
            />
          </div>
        )}
      </div>

      <div className="mt-10">
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-shield-check-line" />
          What needs my approval?
        </label>
        <div className="mt-2 flex flex-col gap-2">
          {APPROVAL_OPTIONS.map((opt) => (
            <PolicyCard
              key={opt.id}
              value={opt.id}
              selected={approvalMode}
              onSelect={setApprovalMode}
              title={APPROVAL_COPY[opt.id].title}
              desc={APPROVAL_COPY[opt.id].desc}
              example={APPROVAL_COPY[opt.id].example}
            />
          ))}
        </div>
      </div>

      <div className="mt-10">
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-equalizer-line" />
          Guardrails
        </label>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          Hard caps that stop a run even if the agent doesn't realise it should stop.
        </p>
        <div className="mt-3 flex gap-4">
          <div className="flex-1">
            <label className="block text-[11px] text-[var(--text-muted)]">Max turns</label>
            <input
              type="number"
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              min={1}
              max={200}
              className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-8 w-full rounded-[var(--radius-sm)] px-3 font-mono text-[12px]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Stops after this many tool calls.
            </p>
          </div>
          <div className="flex-1">
            <label className="block text-[11px] text-[var(--text-muted)]">Max tokens</label>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              min={1000}
              step={1000}
              className="depth-inset text-[var(--text-primary)] placeholder:text-[var(--text-muted)] mt-1 h-8 w-full rounded-[var(--radius-sm)] px-3 font-mono text-[12px]"
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Stops once total in + out exceeds this.
            </p>
          </div>
        </div>
      </div>
    </>
  );

  const runtimeTab = (
    <>
      <div>
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-server-line" />
          Runner
        </label>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          Where the agent actually executes. Docker is only selectable when the daemon is running.
        </p>
        <div className="mt-2 flex gap-2">
          {RUNNER_OPTIONS.map((opt) => {
            const isDocker = opt.id === "docker";
            const disabled = isDocker && !dockerAvailable;
            return (
              <button
                key={opt.id}
                onClick={() => !disabled && setRunnerType(opt.id)}
                disabled={disabled}
                className={`flex-1 rounded-[var(--radius-sm)] px-3 py-3 text-center transition-colors ${
                  disabled ? "cursor-not-allowed opacity-40" : ""
                } ${
                  runnerType === opt.id
                    ? "depth-card-sm text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <p className="text-[13px] font-medium">{opt.label}</p>
                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  {isDocker && !dockerAvailable ? "Docker not running" : opt.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8">
        <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)]">
          <SectionIcon icon="ri-cpu-line" />
          Harness
        </label>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          Which agent engine interprets the instructions. When you pick Docker as the runner,
          the harness runs inside the container.
        </p>
        <div className="mt-2 flex flex-col gap-1">
          {HARNESS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => opt.available && setHarness(opt.id)}
              disabled={!opt.available}
              className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors ${
                !opt.available ? "cursor-not-allowed opacity-50" : ""
              } ${
                harness === opt.id ? "bg-[var(--surface-elevated)]" : "hover:bg-[var(--glass-bg)]"
              }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                harness === opt.id ? "border-[var(--text-primary)]" : "border-[var(--glass-border-strong)]"
              }`}>
                {harness === opt.id && <span className="h-2 w-2 rounded-full bg-[var(--text-primary)]" />}
              </span>
              <span>
                <span className="text-[13px] font-medium text-[var(--text-primary)]">{opt.label}</span>
                <span className="ml-2 text-[11px] text-[var(--text-muted)]">{opt.desc}</span>
                {!opt.available && (
                  <span className="ml-2 text-[11px] text-[var(--text-muted)]">Coming soon</span>
                )}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          Managed agents currently execute through the Khadim harness. OpenCode and Claude Code remain
          available in workspace chat flows.
        </p>
      </div>
    </>
  );

  const tabBody =
    tab === "brief"   ? briefTab   :
    tab === "sources" ? sourcesTab :
    tab === "policy"  ? policyTab  :
                        runtimeTab;

  const activeTabMeta = TABS.find((t) => t.id === tab)!;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--glass-border)] px-8 py-4">
        <button
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg)] hover:text-[var(--text-primary)]"
          aria-label="Back"
        >
          <i className="ri-arrow-left-s-line text-base leading-none" />
        </button>
        <h1 className="min-w-0 truncate font-display text-[18px] font-medium tracking-tight text-[var(--text-primary)]">
          {agent ? (name.trim() || "Edit agent") : "New agent"}
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <EditorTabBar active={tab} onChange={setTab} />
          {onTest && (
            <button
              onClick={() => onTest(buildData())}
              disabled={!canSave}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--glass-bg)] px-4 text-[11px] font-medium text-[var(--text-secondary)] transition-colors enabled:hover:bg-[var(--glass-bg-strong)] disabled:opacity-40"
            >
              Test run
            </button>
          )}
          <button
            onClick={() => onSave(buildData())}
            disabled={!canSave}
            className="btn-ink inline-flex h-8 items-center rounded-full px-5 text-[11px] font-medium disabled:opacity-40"
          >
            {agent ? "Save" : "Create"}
          </button>
        </div>
      </div>

      {/* Tab subtitle — keeps context for the active tab */}
      <div className="flex shrink-0 items-baseline gap-3 border-b border-[var(--glass-border)] px-8 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {activeTabMeta.label}
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">{activeTabMeta.hint}</span>
      </div>

      {/* Body — single scroll column, tab-specific content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-xl px-8 py-6">
          {tabBody}
          <div className="h-12" />
        </div>
      </div>
    </div>
  );
}
