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
  ShieldCheck,
  TreeStructure,
  Square,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  AgentApprovalDecision,
  AgentApprovalRequest,
  AgentQuestionAnswers,
  AgentQuestionRequest,
  AgentRuntimeMode,
  ChatAttachment,
  HarnessMode,
  ModelConfig,
  PluginHarnessDescriptor,
  PluginHarnessCommand,
  PluginHarnessMode,
  SkillEntry,
  TokenUsage,
} from "../../../shared/types";
import type { AgentDefinition } from "../agents/types";
import { chatCommands } from "../../../shared/chat-commands";
import { processedTokenTotal } from "../../../shared/agent-event-reducer";
import { compactNumber } from "../shared/text";
import { ModelIcon } from "../ui/ModelIcon";
import { PluginLogo } from "../ui/PluginLogo";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { AttachmentBadge } from "./AttachmentBadge";
import { ApprovalPanel } from "./ApprovalPanel";
import { QuestionPanel } from "./QuestionPanel";
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
  models: ModelConfig[];
  modes?: PluginHarnessMode[];
  modeId?: string;
  enabledTools: string[];
  onToggleTool: (toolId: string) => void;
  harness: HarnessMode;
  pluginHarnesses?: PluginHarnessDescriptor[];
  harnessCommands?: PluginHarnessCommand[];
  onSelectModel: (modelId: string) => void;
  onSelectMode?: (modeId: string) => void;
  runtimeMode: AgentRuntimeMode;
  onSelectRuntimeMode: (mode: AgentRuntimeMode) => void;
  onSelectHarness: (harness: HarnessMode) => void;
  multiAgent?: boolean;
  onSetMultiAgent?: (enabled: boolean) => void;
  modelsLoading?: boolean;
  modelsError?: string;
  usage?: TokenUsage;
  projectName?: string;
  projectAvailable?: boolean;
  pendingQuestion?: AgentQuestionRequest;
  questionResponding?: boolean;
  onAnswerQuestion?: (answers: AgentQuestionAnswers) => Promise<void>;
  pendingApproval?: AgentApprovalRequest;
  approvalResponding?: boolean;
  onApprovalDecision?: (decision: AgentApprovalDecision) => Promise<void>;
}

interface ComposerAttachment {
  name: string;
  content: string;
  type: string;
}

type ComposerMenuName = "capabilities" | "skills" | "agent" | "model" | "mode" | "runtime";

function composerMenuPlacement(menu: ComposerMenuName, trigger: HTMLButtonElement): CSSProperties {
  const triggerRect = trigger.getBoundingClientRect();
  const wrapperRect = trigger.parentElement?.getBoundingClientRect() ?? triggerRect;
  const headerBottom = document.querySelector<HTMLElement>(".app-header")?.getBoundingClientRect().bottom ?? 0;
  const viewportPadding = 12;
  const triggerGap = 8;
  const desiredWidth = menu === "capabilities" || menu === "skills" ? 336 : menu === "model" ? 320 : 280;
  const desiredHeight = menu === "capabilities" || menu === "skills" ? 560 : 420;
  const width = Math.min(desiredWidth, window.innerWidth - viewportPadding * 2);
  const availableAbove = Math.max(0, triggerRect.top - headerBottom - viewportPadding - triggerGap);
  const availableBelow = Math.max(0, window.innerHeight - triggerRect.bottom - viewportPadding - triggerGap);
  const placeAbove = availableAbove >= Math.min(desiredHeight, 260) || availableAbove >= availableBelow;
  const availableHeight = placeAbove ? availableAbove : availableBelow;
  const preferredLeft = menu === "model" || menu === "mode" || menu === "runtime" ? triggerRect.right - width : triggerRect.left;
  const left = Math.min(
    Math.max(viewportPadding, preferredLeft),
    Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
  );
  const horizontalOrigin = menu === "model" || menu === "mode" || menu === "runtime" ? "right" : "left";

  return {
    position: "absolute",
    left: left - wrapperRect.left,
    right: "auto",
    top: placeAbove ? "auto" : triggerRect.bottom + triggerGap - wrapperRect.top,
    bottom: placeAbove ? wrapperRect.bottom - triggerRect.top + triggerGap : "auto",
    maxHeight: Math.min(desiredHeight, availableHeight),
    transformOrigin: `${placeAbove ? "bottom" : "top"} ${horizontalOrigin}`,
  };
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
  modes = [],
  modeId,
  enabledTools,
  onToggleTool,
  harness,
  pluginHarnesses = [],
  harnessCommands = [],
  onSelectModel,
  onSelectMode,
  runtimeMode,
  onSelectRuntimeMode,
  onSelectHarness,
  multiAgent = false,
  onSetMultiAgent,
  modelsLoading = false,
  modelsError,
  usage,
  projectName,
  projectAvailable,
  pendingQuestion,
  questionResponding = false,
  onAnswerQuestion,
  pendingApproval,
  approvalResponding = false,
  onApprovalDecision,
}: ComposerProps): React.JSX.Element {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [openMenu, setOpenMenu] = useState<ComposerMenuName | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState("");
  const [commandIndex, setCommandIndex] = useState(0);
  const activeModel = models.find((model) => model.isActive);
  const activeMode = modes.find((mode) => mode.id === modeId) ?? modes.find((mode) => mode.isDefault) ?? modes[0];
  const activePluginHarness = pluginHarnesses.find((pluginHarness) => pluginHarness.id === harness);
  const decisionPending = Boolean(
    (pendingQuestion && onAnswerQuestion) || (pendingApproval && onApprovalDecision),
  );
  const runtimeOptions: Array<{ id: AgentRuntimeMode; name: string; description: string }> = [
    { id: "approval-required", name: "Ask first", description: "Confirm commands and file changes" },
    { id: "auto-accept-edits", name: "Auto-edit", description: "Allow edits; ask for other risky actions" },
    { id: "full-access", name: "Full access", description: "Run without approval prompts" },
  ];
  const activeRuntime = runtimeOptions.find((mode) => mode.id === runtimeMode) ?? runtimeOptions[0];
  const modelSelectorLabel = activePluginHarness ? `Choose model for ${activePluginHarness.name}` : "Choose model";
  const activeAgent = agents.find((agent) => agent.id === agentId);
  const normalizedModelQuery = modelQuery.trim().toLowerCase();
  const visibleModels = models.filter(
    (model) =>
      !normalizedModelQuery ||
      `${model.name} ${model.provider} ${model.model}`
        .toLowerCase()
        .includes(normalizedModelQuery),
  );
  const availableCommands = [
    ...chatCommands.map((command) => ({ name: command.name, usage: command.usage, description: command.description, native: false })),
    ...harnessCommands.flatMap((command) => [command.name, ...(command.aliases ?? [])]
      .filter((name) => !chatCommands.some((builtIn) => builtIn.name === name.toLowerCase()))
      .map((name) => ({
        name,
        usage: `/${name}${command.argumentHint ? ` ${command.argumentHint}` : ""}`,
        description: command.description || "Harness command",
        native: true,
      }))),
  ];
  const commandQuery = prompt.match(/^\/([^\s\n]*)$/)?.[1]?.toLowerCase();
  const visibleCommands = commandQuery === undefined
    ? []
    : availableCommands.filter((command) => `${command.name} ${command.description}`.toLowerCase().includes(commandQuery));
  const activeCommandIndex = Math.min(commandIndex, Math.max(0, visibleCommands.length - 1));

  function chooseCommand(index: number): void {
    const command = visibleCommands[index];
    if (!command) return;
    setPrompt(`/${command.name}${command.usage !== `/${command.name}` ? " " : ""}`);
    setCommandIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function toggleMenu(menu: typeof openMenu, trigger: HTMLButtonElement): void {
    const opening = openMenu !== menu;
    activeMenuTriggerRef.current = opening ? trigger : null;
    setMenuStyle(opening && menu ? composerMenuPlacement(menu, trigger) : {});
    if (menu === "model" && opening) setModelQuery("");
    setOpenMenu(opening ? menu : null);
  }

  function closeMenu(restoreFocus = false): void {
    const trigger = activeMenuTriggerRef.current;
    setOpenMenu(null);
    setMenuStyle({});
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
    const updatePlacement = () => {
      if (activeMenuTriggerRef.current) {
        setMenuStyle(composerMenuPlacement(openMenu, activeMenuTriggerRef.current));
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
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
      <div className={`composer ${large ? "composer-large" : ""}${decisionPending ? " composer-decision" : ""}`}>
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
        {pendingQuestion && onAnswerQuestion && (
          <QuestionPanel request={pendingQuestion} responding={questionResponding} onAnswer={onAnswerQuestion} />
        )}
        {pendingApproval && onApprovalDecision && (
          <ApprovalPanel request={pendingApproval} responding={approvalResponding} onDecision={onApprovalDecision} />
        )}
        {!decisionPending && visibleCommands.length > 0 && (
          <div className="slash-command-menu" role="listbox" aria-label="Chat commands">
            {visibleCommands.map((command, index) => (
              <button
                type="button"
                role="option"
                aria-selected={activeCommandIndex === index}
                className={activeCommandIndex === index ? "selected" : ""}
                key={command.name}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setCommandIndex(index)}
                onClick={() => chooseCommand(index)}
              >
                <strong>{command.usage}</strong>
                <small>{command.description}</small>
              </button>
            ))}
          </div>
        )}
        <textarea
          aria-hidden={decisionPending}
          inert={decisionPending}
          disabled={decisionPending}
          ref={inputRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (visibleCommands.length > 0 && event.key === "ArrowDown") {
              event.preventDefault();
              setCommandIndex((current) => (current + 1) % visibleCommands.length);
              return;
            }
            if (visibleCommands.length > 0 && event.key === "ArrowUp") {
              event.preventDefault();
              setCommandIndex((current) => (current - 1 + visibleCommands.length) % visibleCommands.length);
              return;
            }
            if (visibleCommands.length > 0 && event.key === "Enter" && prompt.toLowerCase() === `/${visibleCommands[activeCommandIndex]?.name.toLowerCase()}`) {
              event.preventDefault();
              void submit();
              return;
            }
            if (visibleCommands.length > 0 && (event.key === "Tab" || event.key === "Enter")) {
              event.preventDefault();
              chooseCommand(activeCommandIndex);
              return;
            }
            if (visibleCommands.length > 0 && event.key === "Escape") {
              event.preventDefault();
              setPrompt(prompt.slice(1));
              return;
            }
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
        <div className="composer-actions" aria-hidden={decisionPending} inert={decisionPending}>
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
                  style={menuStyle}
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
                  style={menuStyle}
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
                  style={menuStyle}
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
            {activePluginHarness && (
              <span className="composer-menu-wrap mode-wrap">
                <button
                  className="composer-mode"
                  onClick={(event) => toggleMenu("runtime", event.currentTarget)}
                  title={`Runtime access: ${activeRuntime.name}`}
                  aria-label={`Choose runtime access, currently ${activeRuntime.name}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "runtime"}
                >
                  <ShieldCheck size={16} />
                  <span>{activeRuntime.name}</span>
                  <ChevronDown size={13} />
                </button>
                {openMenu === "runtime" && (
                  <div className="composer-menu mode-menu" role="menu" aria-label="Runtime access" style={menuStyle} onKeyDown={handleMenuKeyDown}>
                    <span className="composer-menu-heading">Runtime access</span>
                    {runtimeOptions.map((mode) => (
                      <button role="menuitemradio" aria-checked={runtimeMode === mode.id} className={runtimeMode === mode.id ? "selected" : ""} key={mode.id} onClick={() => { onSelectRuntimeMode(mode.id); closeMenu(true); }}>
                        <ShieldCheck size={17} />
                        <span><strong>{mode.name}</strong><small>{mode.description}</small></span>
                        {runtimeMode === mode.id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            )}
            {activePluginHarness && activeMode && onSelectMode && (
              <span className="composer-menu-wrap mode-wrap">
                <button
                  className="composer-mode"
                  onClick={(event) => toggleMenu("mode", event.currentTarget)}
                  title={`${activePluginHarness.name} mode: ${activeMode.name}`}
                  aria-label={`Choose mode for ${activePluginHarness.name}, currently ${activeMode.name}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenu === "mode"}
                >
                  <Gauge size={16} />
                  <span>{activeMode.name}</span>
                  <ChevronDown size={13} />
                </button>
                {openMenu === "mode" && (
                  <div
                    className="composer-menu mode-menu"
                    role="menu"
                    aria-label={`${activePluginHarness.name} mode`}
                    style={menuStyle}
                    onKeyDown={handleMenuKeyDown}
                  >
                    <span className="composer-menu-heading">{activePluginHarness.name} mode</span>
                    {modes.map((mode) => (
                      <button
                        role="menuitemradio"
                        aria-checked={activeMode.id === mode.id}
                        className={activeMode.id === mode.id ? "selected" : ""}
                        key={mode.id}
                        onClick={() => {
                          onSelectMode(mode.id);
                          closeMenu(true);
                        }}
                      >
                        <Gauge size={17} />
                        <span>
                          <strong>{mode.name}</strong>
                          {mode.description && <small>{mode.description}</small>}
                        </span>
                        {activeMode.id === mode.id && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            )}
            {!activePluginHarness && onSetMultiAgent && (
              <button
                type="button"
                className={`composer-team${multiAgent ? " active" : ""}`}
                onClick={() => onSetMultiAgent(!multiAgent)}
                title={multiAgent
                  ? "Team mode on: Khadim may run focused read-only helpers"
                  : "Team mode off: use one primary agent"}
                aria-label={multiAgent ? "Disable Team mode" : "Enable Team mode"}
                aria-pressed={multiAgent}
              >
                <TreeStructure size={16} />
                <span>Team</span>
                {multiAgent && <i className="team-active-dot" aria-hidden="true" />}
              </button>
            )}
            <span className="composer-menu-wrap model-wrap">
              <button
                className="composer-model"
                onClick={(event) => toggleMenu("model", event.currentTarget)}
                title={modelSelectorLabel}
                aria-label={modelSelectorLabel}
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
                  style={menuStyle}
                  onKeyDown={handleMenuKeyDown}
                >
                  <div className="model-menu-header">
                    <span>
                      <strong>{activePluginHarness ? `${activePluginHarness.name} model` : "Models"}</strong>
                      <small>{modelsLoading
                        ? "Loading from harness…"
                        : activePluginHarness
                          ? `${models.length} available from ${activePluginHarness.name}`
                          : `${models.length} configured for chat`}</small>
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
                        {modelsLoading
                          ? "Loading available models…"
                          : modelsError
                            ? modelsError
                            : activePluginHarness
                              ? `${activePluginHarness.name} did not report any available models.`
                              : "Add a model in Settings."}
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

function UsageMeter({ usage }: { usage: TokenUsage }): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const categorizedTotal = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  const total = processedTokenTotal(usage);
  const hasContext = usage.contextUsed !== undefined && usage.contextUsed >= 0;
  const hasContextLimit = hasContext && usage.contextSize !== undefined && usage.contextSize > 0;
  const contextPercentage = hasContextLimit
    ? Math.min(100, Math.max(0, (usage.contextUsed! / usage.contextSize!) * 100))
    : null;
  if (total === 0 && !hasContext) return null;

  const contextLabel = hasContextLimit
    ? `${compactNumber(usage.contextUsed!)} of ${compactNumber(usage.contextSize!)}`
    : `${compactNumber(usage.contextUsed ?? 0)} tokens`;
  const buttonLabel = contextPercentage === null
    ? compactNumber(total || usage.contextUsed || 0)
    : `${Math.round(contextPercentage)}%`;
  const circumference = 2 * Math.PI * 9;
  return (
    <div className="usage-meter-wrap">
      <button
        className="usage-meter-button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        title={hasContext ? "Context window usage" : "Processed token usage"}
      >
        {contextPercentage === null ? <Gauge size={14} /> : (
          <span className="usage-context-ring" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <circle
                className={contextPercentage > 90 ? "warning" : "value"}
                cx="12"
                cy="12"
                r="9"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - contextPercentage / 100)}
              />
            </svg>
          </span>
        )}
        <span>{buttonLabel}</span>
      </button>
      {open && (
        <div className="usage-popover">
          <div className="usage-heading">
            <span>
              <small>{hasContext ? "Context window" : "This chat"}</small>
              <strong>{hasContext ? contextLabel : `${compactNumber(total)} tokens processed`}</strong>
            </span>
            <Gauge size={18} />
          </div>
          {contextPercentage !== null && (
            <div
              className={`usage-progress ${contextPercentage > 90 ? "warning" : ""}`}
              role="progressbar"
              aria-label="Context window usage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(contextPercentage)}
            >
              <i style={{ transform: `scaleX(${contextPercentage / 100})` }} />
            </div>
          )}
          {hasContext && total > 0 && (
            <div className="usage-total-row">
              <span>Total processed</span>
              <strong>{compactNumber(total)}</strong>
            </div>
          )}
          {categorizedTotal > 0 && (
            <>
              <div className="usage-distribution" aria-hidden="true">
                {usage.input > 0 && <i className="input" style={{ flexGrow: usage.input }} />}
                {usage.output > 0 && <i className="output" style={{ flexGrow: usage.output }} />}
                {usage.cacheRead > 0 && <i className="cache-read" style={{ flexGrow: usage.cacheRead }} />}
                {usage.cacheWrite > 0 && <i className="cache-write" style={{ flexGrow: usage.cacheWrite }} />}
              </div>
              <div className="usage-breakdown">
                <span><i className="input" /><small>Fresh input</small><strong>{compactNumber(usage.input)}</strong></span>
                <span><i className="output" /><small>Output</small><strong>{compactNumber(usage.output)}</strong></span>
                <span><i className="cache-read" /><small>Cache read</small><strong>{compactNumber(usage.cacheRead)}</strong></span>
                <span><i className="cache-write" /><small>Cache write</small><strong>{compactNumber(usage.cacheWrite)}</strong></span>
              </div>
            </>
          )}
          <p>{hasContext
            ? "Context is the latest prompt size. Processed tokens are cumulative and count cached input once."
            : "Cumulative model work for this chat. Cached input is separated from fresh input."}</p>
        </div>
      )}
    </div>
  );
}
