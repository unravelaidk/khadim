import type { AgentStreamEvent, AppError, QuestionItem, QuestionOption, ThinkingStepData } from "./bindings";

export function getErrorMessage(error: unknown) {
  const raw = error && typeof error === "object" && "message" in error
    ? String((error as AppError).message)
    : "Something went wrong.";

  if (raw.includes("Missing Authentication header") || raw.includes("HTTP 401 Unauthorized")) {
    return "The selected provider is not authenticated. Add or update its API key in Model Settings and try again.";
  }

  if (raw.includes("usage_limit_reached")) {
    return "Your Codex plan has reached its current usage limit. Wait for the reset window or switch to another model/provider.";
  }

  if (raw.includes("HTTP 429 Too Many Requests")) {
    return "The provider is rate limiting requests right now. Please wait a moment and try again.";
  }

  if (raw.includes("No Khadim model is configured")) {
    return "No Khadim model is configured yet. Open Model Settings, save a provider and model, then try again.";
  }

  if (error && typeof error === "object" && "message" in error) {
    return raw;
  }
  return raw;
}

export function formatStreamingError(message: string | null | undefined) {
  return getErrorMessage({ message: message ?? "Streaming error" } as AppError);
}

export function stripInternalReminderBlocks(value: string): string {
  return value.replace(/\s*<system-reminder>[\s\S]*?<\/system-reminder>\s*/gi, "").trimEnd();
}

function normalizeQuestionOption(value: unknown): QuestionOption | null {
  if (typeof value === "string") {
    const label = value.trim();
    return label ? { label, description: "" } : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const label = typeof record.label === "string"
    ? record.label.trim()
    : typeof record.value === "string"
      ? record.value.trim()
      : "";
  if (!label) return null;
  return {
    label,
    description: typeof record.description === "string" ? record.description : "",
  };
}

function normalizeQuestionItem(value: unknown): QuestionItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const question = typeof record.question === "string"
    ? record.question.trim()
    : typeof record.prompt === "string"
      ? record.prompt.trim()
      : typeof record.text === "string"
        ? record.text.trim()
        : "";
  if (!question) return null;
  const header = typeof record.header === "string" && record.header.trim()
    ? record.header.trim()
    : typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : "Question";
  const rawOptions = Array.isArray(record.options)
    ? record.options
    : Array.isArray(record.choices)
      ? record.choices
      : [];
  const options = rawOptions
    .map((option) => normalizeQuestionOption(option))
    .filter((option): option is QuestionOption => option != null);
  return {
    header,
    question,
    options,
    multiple: record.multiple === true,
    custom: typeof record.custom === "boolean" ? record.custom : true,
  };
}

export function normalizeQuestionPayload(value: unknown): QuestionItem[] {
  const items = Array.isArray(value) ? value : value != null ? [value] : [];
  return items
    .map((item) => normalizeQuestionItem(item))
    .filter((item): item is QuestionItem => item != null);
}

export function flattenQuestionAnswers(answers: string[][]): string {
  return answers
    .map((group) => group.map((v) => v.trim()).filter(Boolean).join(", "))
    .filter(Boolean)
    .join("\n");
}

export function finalizeSteps(steps: ThinkingStepData[]): ThinkingStepData[] {
  let changed = false;
  const next = steps.map((step) => {
    if (step.status === "running") {
      changed = true;
      return { ...step, status: "complete" as const };
    }
    return step;
  });
  return changed ? next : steps;
}

export function applyStreamingStepEvent(prev: ThinkingStepData[], evt: AgentStreamEvent) {
  const metadata = evt.metadata ?? {};
  const stepId = typeof metadata.id === "string" ? metadata.id : null;
  if (!stepId) return prev;

  const title = typeof metadata.title === "string" ? metadata.title : "Working";
  const tool = typeof metadata.tool === "string" ? metadata.tool : undefined;
  const filename = typeof metadata.filename === "string" ? metadata.filename : undefined;
  const fileContent = typeof metadata.fileContent === "string" ? metadata.fileContent : undefined;
  const filePath = typeof metadata.filePath === "string" ? metadata.filePath : undefined;
  const nextResult = typeof metadata.result === "string" ? metadata.result : undefined;
  const subagentType = typeof metadata.subagentType === "string" ? metadata.subagentType : undefined;
  const taskDescription = typeof metadata.taskDescription === "string" ? metadata.taskDescription : undefined;
  const taskPrompt = typeof metadata.taskPrompt === "string" ? metadata.taskPrompt : undefined;
  const isError = metadata.is_error === true;
  const index = prev.findIndex((step) => step.id === stepId);
  const current = index >= 0 ? prev[index] : { id: stepId, title, status: "running" as const };
  const next: ThinkingStepData = {
    ...current,
    title,
    tool: tool ?? current.tool,
    filename: filename ?? current.filename,
    fileContent: fileContent ?? current.fileContent,
    filePath: filePath ?? current.filePath,
    subagentType: subagentType ?? current.subagentType,
    taskDescription: taskDescription ?? current.taskDescription,
    taskPrompt: taskPrompt ?? current.taskPrompt,
  };

  if (evt.event_type === "step_start") {
    next.status = "running";
    if (evt.content) next.content = evt.content;
  }
  if (evt.event_type === "step_update") {
    next.status = "running";
    if (evt.content) next.content = evt.content;
  }
  if (evt.event_type === "step_complete") {
    next.status = isError ? "error" : "complete";
    if (evt.content) next.content = evt.content;
    if (nextResult) {
      next.result = nextResult;
    } else if (evt.content) {
      next.result = evt.content;
    }
  }

  if (index >= 0) {
    return prev.map((step, idx) => (idx === index ? next : step));
  }
  return [...prev, next];
}

export function extractStreamPreview(content: string, maxLines = 3): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-maxLines);
}

export function deriveCurrentActivity(steps: ThinkingStepData[]): string | null {
  const running = steps.filter((step) => step.status === "running");
  if (running.length === 0) return null;
  const last = running[running.length - 1];
  if (last.tool === "subtask" && last.subagentType) return `${last.subagentType}...`;
  if (last.tool && last.filename) return `${last.tool}: ${last.filename}`;
  if (last.tool) return `${last.tool}...`;
  return last.title;
}

export function hasFinishedAfter(startedAt: string | null, createdAt: string | null | undefined) {
  if (!startedAt || !createdAt) return false;
  const started = Date.parse(startedAt);
  const created = Date.parse(createdAt);
  if (Number.isNaN(started) || Number.isNaN(created)) return false;
  return created >= started;
}
