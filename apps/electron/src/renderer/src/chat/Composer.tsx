import {
  ArrowUp,
  BookOpen,
  Stack as Blocks,
  Robot as Bot,
  Check,
  CaretDown as ChevronDown,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  FolderOpen,
  EnvelopeSimple,
  GlobeHemisphereWest as Globe2,
  Gauge,
  Monitor,
  Plus,
  MagnifyingGlass as Search,
  Square,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type {
  ChatAttachment,
  HarnessMode,
  ModelConfig,
  PluginHarnessDescriptor,
  SkillEntry,
  TokenUsage,
} from "../../../shared/types";
import type { AgentDefinition } from "../agents/types";
import { compactNumber } from "../shared/text";
import { ModelIcon } from "../ui/ModelIcon";
import { PluginLogo } from "../ui/PluginLogo";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { AttachmentBadge } from "./AttachmentBadge";
import { toolOptions } from "./tool-options";

interface ComposerProps {
  prompt: string;
  setPrompt: (value: string) => void;
  onSend: (
    value?: string,
    visibleValue?: string,
    attachments?: ChatAttachment[],
  ) => Promise<boolean>;
  onStop: () => Promise<boolean>;
  running: boolean;
  large?: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  agentId: string;
  agentName: string;
  agents: AgentDefinition[];
  onSelectAgent: (id: string) => void;
  modelName: string;
  provider: string;
  models: ModelConfig[];
  enabledTools: string[];
  onToggleTool: (toolId: string) => void;
  harness: HarnessMode;
  pluginHarnesses?: PluginHarnessDescriptor[];
  onSelectModel: (modelId: string) => void;
  onSelectHarness: (harness: HarnessMode) => void;
  usage?: TokenUsage;
  projectName?: string;
  projectAvailable?: boolean;
}

interface ComposerAttachment {
  name: string;
  content: string;
  type: string;
}

function friendlyModelName(model: string): string {
  return model
    .replace(/^claude-/, "Claude ")
    .replace(/^gpt-/, "GPT ")
    .replace(/^gemini-/, "Gemini ")
    .replace(/(\d)-(\d)/g, "$1.$2")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function Composer({
  prompt,
  setPrompt,
  onSend,
  onStop,
  running,
  large,
  inputRef,
  agentId,
  agentName,
  agents,
  onSelectAgent,
  modelName,
  models,
  enabledTools,
  onToggleTool,
  harness,
  pluginHarnesses = [],
  onSelectModel,
  onSelectHarness,
  usage,
  projectName,
  projectAvailable,
}: ComposerProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [openMenu, setOpenMenu] = useState<
    "capabilities" | "skills" | "agent" | "model" | null
  >(null);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState("");
  const activeModel = models.find((model) => model.isActive);
  const activeAgent = agents.find((agent) => agent.id === agentId);
  const normalizedModelQuery = modelQuery.trim().toLowerCase();
  const visibleModels = models.filter(
    (model) =>
      !normalizedModelQuery ||
      `${model.name} ${model.provider} ${model.model}`
        .toLowerCase()
        .includes(normalizedModelQuery),
  );

  function toggleMenu(menu: typeof openMenu, trigger: HTMLButtonElement): void {
    const opening = openMenu !== menu;
    activeMenuTriggerRef.current = opening ? trigger : null;
    if (menu === "model" && opening) setModelQuery("");
    setOpenMenu(opening ? menu : null);
  }

  function closeMenu(restoreFocus = false): void {
    const trigger = activeMenuTriggerRef.current;
    setOpenMenu(null);
    activeMenuTriggerRef.current = null;
    if (restoreFocus) window.setTimeout(() => trigger?.focus(), 0);
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (
      event.target instanceof HTMLInputElement &&
      (event.key === "Home" || event.key === "End")
    )
      return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])",
      ),
    );
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (current + 1 + items.length) % items.length
            : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  useEffect(() => {
    if (!openMenu) return;
    const trigger = activeMenuTriggerRef.current;
    const wrapper = trigger?.parentElement;
    const menu = wrapper?.querySelector<HTMLElement>("[role='menu']");
    const frame = window.requestAnimationFrame(() =>
      menu?.querySelector<HTMLElement>("input,button:not([disabled])")?.focus(),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        wrapper &&
        event.target instanceof Node &&
        !wrapper.contains(event.target)
      )
        closeMenu();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [openMenu]);

  async function loadSkills(): Promise<void> {
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      setSkills(await window.khadim.skills.discover());
    } catch (cause) {
      setSkillsError(
        cause instanceof Error ? cause.message : "Could not load skills",
      );
    } finally {
      setSkillsLoading(false);
    }
  }

  async function toggleSkill(skillId: string, enabled: boolean): Promise<void> {
    setSkillsError(null);
    setSkills((current) =>
      current.map((skill) =>
        skill.id === skillId ? { ...skill, enabled } : skill,
      ),
    );
    try {
      await window.khadim.skills.toggle(skillId, enabled);
    } catch (cause) {
      setSkills((current) =>
        current.map((skill) =>
          skill.id === skillId ? { ...skill, enabled: !enabled } : skill,
        ),
      );
      setSkillsError(
        cause instanceof Error
          ? cause.message
          : "The skill setting could not be saved.",
      );
    }
  }

  async function submit(): Promise<void> {
    if ((!prompt.trim() && attachments.length === 0) || running) return;
    const context = attachments
      .map((file) => `<file name="${file.name}">\n${file.content}\n</file>`)
      .join("\n\n");
    const message = prompt.trim() || "Review the attached files.";
    const sent = await onSend(
      context ? `${message}\n\n${context}` : message,
      message,
      attachments.map(({ name, type }) => ({ name, type })),
    );
    if (sent) setAttachments([]);
  }

  async function attachFiles(files: FileList | null): Promise<void> {
    if (!files) return;
    const selectedFiles = Array.from(files);
    const oversized = selectedFiles.filter((file) => file.size > 100_000);
    const remainingSlots = Math.max(0, 5 - attachments.length);
    const readable = selectedFiles
      .filter((file) => file.size <= 100_000)
      .slice(0, remainingSlots);
    const omittedForLimit =
      selectedFiles.length - oversized.length - readable.length;
    const notices = [
      oversized.length > 0
        ? `${oversized.length} file${oversized.length === 1 ? " was" : "s were"} over the 100 KB text-file limit.`
        : "",
      omittedForLimit > 0
        ? "Only five attachments can be added to one message."
        : "",
    ].filter(Boolean);
    setAttachmentError(notices.join(" ") || null);
    try {
      const next = await Promise.all(
        readable.map(async (file) => ({
          name: file.name,
          content: await file.text(),
          type: file.type,
        })),
      );
      setAttachments((current) => [...current, ...next].slice(0, 5));
    } catch (cause) {
      setAttachmentError(
        cause instanceof Error
          ? cause.message
          : "One or more files could not be read.",
      );
    }
  }

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  }, [inputRef, prompt]);

  return (
    <div className={`composer-shell ${large ? "composer-shell-large" : ""}`}>
      <div className={`composer ${large ? "composer-large" : ""}`}>
        <input
          ref={fileInputRef}
          className="composer-file-input"
          type="file"
          accept="text/*,.md,.json,.csv,.ts,.tsx,.js,.jsx"
          multiple
          onChange={(event) => void attachFiles(event.target.files)}
        />
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((file) => (
              <AttachmentBadge
                attachment={file}
                removable={() =>
                  setAttachments((current) =>
                    current.filter((item) => item.name !== file.name),
                  )
                }
                key={file.name}
              />
            ))}
          </div>
        )}
        {attachmentError && (
          <p className="composer-attachment-error" role="alert">
            {attachmentError}
          </p>
        )}
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          aria-label="Message Khadim"
          placeholder={
            large
              ? "What would you like to get done?"
              : running
                ? "Keep typing while Khadim works..."
                : "Message Khadim..."
          }
          rows={large ? 3 : 1}
        />
        <div className="composer-actions">
          <div className="composer-tools">
            <button
              className="composer-icon-tool"
              onClick={() => fileInputRef.current?.click()}
              title="Attach text files"
              aria-label="Attach text files"
            >
              <Plus size={17} />
            </button>
            <span className="composer-menu-wrap">
              <button
                onClick={(event) => toggleMenu("agent", event.currentTarget)}
                aria-label={`Choose agent, currently ${agentName}`}
                aria-haspopup="menu"
                aria-expanded={openMenu === "agent"}
              >
                {activeAgent && (
                  <span className={`agent-orb ${activeAgent.color}`} />
                )}
                <span className="tool-label">{agentName}</span>
                <ChevronDown size={13} />
              </button>
              {openMenu === "agent" && (
                <div
                  className="composer-menu agent-menu"
                  role="menu"
                  aria-label="Agent"
                  onKeyDown={handleMenuKeyDown}
                >
                  <span className="composer-menu-heading">Agent</span>
                  {agents.map((agent) => (
                    <button
                      role="menuitemradio"
                      aria-checked={agentId === agent.id}
                      className={agentId === agent.id ? "selected" : ""}
                      key={agent.id}
                      onClick={() => {
                        onSelectAgent(agent.id);
                        closeMenu(true);
                      }}
                    >
                      <span className={`agent-orb ${agent.color}`} />
                      <span>
                        <strong>{agent.name}</strong>
                        <small>
                          {agent.builtIn ? "Built in" : "Your agent"}
                        </small>
                      </span>
                      {agentId === agent.id && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </span>
            <span className="composer-menu-wrap">
              <button
                className="composer-capabilities"
                onClick={(event) =>
                  toggleMenu("capabilities", event.currentTarget)
                }
                aria-label="Enable tools"
                aria-haspopup="menu"
                aria-expanded={
                  openMenu === "capabilities" || openMenu === "skills"
                }
              >
                <Blocks size={16} />
                <span className="tool-label">Tools</span>
                <ChevronDown size={13} />
                {(enabledTools.length > 0 || harness !== "assistant") && (
                  <i className="capability-active-dot" />
                )}
              </button>
              {openMenu === "capabilities" && (
                <div
                  className="composer-menu capability-selector"
                  role="menu"
                  aria-label="Tool permissions"
                  onKeyDown={handleMenuKeyDown}
                >
                  <div className="capability-selector-header">
                    <span>
                      <strong>Tools and runtime</strong>
                      <small>Choose who runs the task and what it can access</small>
                    </span>
                    <b>{enabledTools.length} active</b>
                  </div>
                  <span className="composer-menu-heading">Built-in runners</span>
                  <div className="capability-group">
                    <button
                      role="menuitemradio"
                      aria-checked={harness === "assistant"}
                      className={harness === "assistant" ? "selected" : ""}
                      onClick={() => onSelectHarness("assistant")}
                    >
                      <Bot size={16} />
                      <span>
                        <strong>Assistant</strong>
                        <small>Chat, research, and files</small>
                      </span>
                      {harness === "assistant" && <Check size={14} />}
                    </button>
                    <button
                      role="menuitemradio"
                      aria-checked={harness === "rpa"}
                      className={harness === "rpa" ? "selected" : ""}
                      onClick={() => onSelectHarness("rpa")}
                    >
                      <Monitor size={16} />
                      <span>
                        <strong>Computer control</strong>
                        <small>Screen, mouse, and keyboard</small>
                      </span>
                      {harness === "rpa" && <Check size={14} />}
                    </button>
                  </div>
                  {pluginHarnesses.length > 0 && (
                    <>
                      <span className="composer-menu-heading plugin-runner-heading">
                        Plugin runners <small>{pluginHarnesses.length}</small>
                      </span>
                      <div className="capability-group plugin-runner-group">
                        {pluginHarnesses.map((pluginHarness) => (
                          <button
                            role="menuitemradio"
                            aria-checked={harness === pluginHarness.id}
                            className={`plugin-harness-option ${harness === pluginHarness.id ? "selected" : ""}`}
                            key={pluginHarness.id}
                            onClick={() => onSelectHarness(pluginHarness.id)}
                          >
                            <PluginLogo pluginId={pluginHarness.pluginId} icon={pluginHarness.icon} size={17} />
                            <span>
                              <strong>{pluginHarness.name}</strong>
                              <small>{pluginHarness.description}</small>
                            </span>
                            {harness === pluginHarness.id && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <span className="composer-menu-heading access-heading">Task access</span>
                  <div className="capability-group access-group">
                    {toolOptions.map((tool) => (
                      <button
                        role="menuitemcheckbox"
                        aria-checked={enabledTools.includes(tool.id)}
                        className={enabledTools.includes(tool.id) ? "enabled" : ""}
                        key={tool.id}
                        onClick={() => onToggleTool(tool.id)}
                      >
                        {tool.id === "web" ? <Globe2 size={16} /> : tool.id === "apps" ? <EnvelopeSimple size={16} /> : <FolderOpen size={16} />}
                        <span>
                          <strong>{tool.name}</strong>
                          <small>{tool.description}</small>
                        </span>
                        <ToggleSwitch enabled={enabledTools.includes(tool.id)} />
                      </button>
                    ))}
                  </div>
                  <button
                    className="skills-entry"
                    onClick={() => {
                      setOpenMenu("skills");
                      void loadSkills();
                    }}
                  >
                    <BookOpen size={16} />
                    <span>
                      <strong>Skills</strong>
                      <small>Specialized instructions and workflows</small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
              {openMenu === "skills" && (
                <div
                  className="composer-menu skills-menu capability-selector"
                  role="menu"
                  aria-label="Skills"
                  onKeyDown={handleMenuKeyDown}
                >
                  <div className="capability-selector-header">
                    <button
                      className="capability-back"
                      onClick={() => setOpenMenu("capabilities")}
                      aria-label="Back to capabilities"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span>
                      <strong>Skills</strong>
                      <small>Specialized instructions</small>
                    </span>
                    <b>
                      {skills.filter((skill) => skill.enabled).length}/
                      {skills.length}
                    </b>
                  </div>
                  <div className="skill-selector-list">
                    {skillsLoading && skills.length === 0 ? (
                      <p className="capability-empty">Discovering skills...</p>
                    ) : skillsError ? (
                      <p className="capability-empty error">{skillsError}</p>
                    ) : skills.length === 0 ? (
                      <p className="capability-empty">
                        No skills found in your skill directories.
                      </p>
                    ) : (
                      skills.map((skill) => (
                        <button
                          role="menuitemcheckbox"
                          aria-checked={skill.enabled}
                          className={skill.enabled ? "enabled" : ""}
                          key={`${skill.sourceDir}:${skill.id}`}
                          onClick={() =>
                            void toggleSkill(skill.id, !skill.enabled)
                          }
                        >
                          <BookOpen size={16} />
                          <span>
                            <strong>{skill.name}</strong>
                            <small>
                              {skill.description || skill.sourceDir}
                            </small>
                          </span>
                          <ToggleSwitch enabled={skill.enabled} />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </span>
          </div>
          <div className="composer-submit-tools">
            <span className="composer-menu-wrap model-wrap">
              <button
                className="composer-model"
                onClick={(event) => toggleMenu("model", event.currentTarget)}
                title="Choose model"
                aria-label="Choose model"
                aria-haspopup="menu"
                aria-expanded={openMenu === "model"}
              >
                {activeModel && <ModelIcon model={activeModel} size={22} />}
                <span>
                  {friendlyModelName(modelName).replace(/^Claude /, "")}
                </span>
                <ChevronDown size={13} />
              </button>
              {openMenu === "model" && (
                <div
                  className="composer-menu model-menu"
                  role="menu"
                  aria-label="Model"
                  onKeyDown={handleMenuKeyDown}
                >
                  <div className="model-menu-header">
                    <span>
                      <strong>Models</strong>
                      <small>{models.length} configured</small>
                    </span>
                    {models.length > 5 && (
                      <label>
                        <Search size={13} />
                        <input
                          type="search"
                          value={modelQuery}
                          onChange={(event) =>
                            setModelQuery(event.target.value)
                          }
                          placeholder="Find a model"
                          aria-label="Find a model"
                        />
                      </label>
                    )}
                  </div>
                  <div className="model-menu-list">
                    {visibleModels.map((model) => (
                      <button
                        role="menuitemradio"
                        aria-checked={activeModel?.id === model.id}
                        className={
                          activeModel?.id === model.id ? "selected" : ""
                        }
                        key={model.id}
                        onClick={() => {
                          onSelectModel(model.id);
                          closeMenu(true);
                        }}
                      >
                        <ModelIcon model={model} size={28} />
                        <span>
                          <strong title={model.name}>{model.name}</strong>
                          <small title={`${model.provider} · ${model.model}`}>
                            {model.provider} · {model.model}
                          </small>
                        </span>
                        {activeModel?.id === model.id && <Check size={14} />}
                      </button>
                    ))}
                    {models.length === 0 && (
                      <small className="model-menu-empty">
                        Add a model in Settings.
                      </small>
                    )}
                    {models.length > 0 && visibleModels.length === 0 && (
                      <small className="model-menu-empty">
                        No models match “{modelQuery.trim()}”.
                      </small>
                    )}
                  </div>
                </div>
              )}
            </span>
            {running ? (
              <button
                className="send-button stop"
                onClick={() => void onStop()}
                aria-label="Stop response"
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                className="send-button"
                onClick={() => void submit()}
                disabled={!prompt.trim() && attachments.length === 0}
                aria-label="Send message"
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="composer-context" aria-label="Run context">
        <span className="composer-project">
          <FolderOpen size={12} />
          {projectName || "No project selected"}
        </span>
        <span
          className={`composer-runner ${projectAvailable === false ? "unavailable" : ""}`}
        >
          <i />
          {projectName
            ? projectAvailable === false
              ? "Folder unavailable"
              : "Local · Ready"
            : "Local"}
        </span>
        {usage && <UsageMeter usage={usage} />}
      </div>
    </div>
  );
}

function UsageMeter({ usage }: { usage: TokenUsage }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const total = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  const activeSegments =
    total === 0
      ? 0
      : Math.min(16, Math.max(1, Math.ceil(Math.log10(total + 1) * 4)));
  return (
    <div className="usage-meter-wrap">
      <button
        className="usage-meter-button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        title="Chat token usage"
      >
        <Gauge size={14} />
        <span>{compactNumber(total)}</span>
        <span className="usage-mini-bars" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <i
              className={index < Math.ceil(activeSegments / 2) ? "filled" : ""}
              key={index}
            />
          ))}
        </span>
      </button>
      {open && (
        <div className="usage-popover">
          <div className="usage-heading">
            <span>
              <small>This chat</small>
              <strong>{compactNumber(total)} tokens used</strong>
            </span>
            <Gauge size={18} />
          </div>
          <div className="usage-segments" aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => (
              <i
                className={index < activeSegments ? "filled" : ""}
                key={index}
              />
            ))}
          </div>
          <div className="usage-breakdown">
            <span>
              <i className="input" />
              <small>Input</small>
              <strong>{compactNumber(usage.input)}</strong>
            </span>
            <span>
              <i className="output" />
              <small>Output</small>
              <strong>{compactNumber(usage.output)}</strong>
            </span>
            <span>
              <i className="cache" />
              <small>Cache</small>
              <strong>
                {compactNumber(usage.cacheRead + usage.cacheWrite)}
              </strong>
            </span>
          </div>
          <p>Reported by the active model provider for this conversation.</p>
        </div>
      )}
    </div>
  );
}
