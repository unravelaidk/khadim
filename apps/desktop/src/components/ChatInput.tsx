import type { OpenCodeModelOption, SkillEntry } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModelSelector } from "./ModelSelector";

/* ─── Attachment type ──────────────────────────────────────────────── */
export interface ChatAttachment {
  name: string;
  path: string;
  preview: string;
  content: string;
  size: number;
}

/* ─── Temperature presets ──────────────────────────────────────────── */
type TempPreset = "precise" | "balanced" | "creative";

const TEMP_PRESETS: Array<{ id: TempPreset; label: string; value: number; desc: string }> = [
  { id: "precise", label: "Precise", value: 0, desc: "Deterministic, best for code" },
  { id: "balanced", label: "Balanced", value: 0.4, desc: "Default for general tasks" },
  { id: "creative", label: "Creative", value: 0.8, desc: "More variety, brainstorming" },
];

/* ─── Props ────────────────────────────────────────────────────────── */
interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  isProcessing: boolean;
  availableModels?: OpenCodeModelOption[];
  selectedModelKey?: string | null;
  onSelectModel?: (key: string) => void;
  modelDisabled?: boolean;
  systemPrompt?: string;
  onSystemPromptChange?: (v: string) => void;
  temperature?: TempPreset;
  onTemperatureChange?: (preset: TempPreset) => void;
  attachments?: ChatAttachment[];
  onAttachmentsChange?: (files: ChatAttachment[]) => void;
}

/* ─── Popover wrapper ──────────────────────────────────────────────── */
function Popover({
  open,
  onClose,
  anchor,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchor: "left" | "right";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={`absolute bottom-full mb-2 z-[100] min-w-[200px] rounded-2xl border border-[var(--glass-border-strong)] bg-[var(--surface-elevated)] shadow-[var(--shadow-glass-lg)] animate-in fade-in zoom-in duration-150 ${
        anchor === "left" ? "left-0" : "right-0"
      }`}
    >
      {children}
    </div>
  );
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isProcessing,
  availableModels = [],
  selectedModelKey = null,
  onSelectModel,
  modelDisabled = false,
  systemPrompt = "",
  onSystemPromptChange,
  temperature = "balanced",
  onTemperatureChange,
  attachments = [],
  onAttachmentsChange,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 168) + "px";
    }
  }, [value]);

  useEffect(() => {
    const el = instructionsRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, [systemPrompt]);

  useEffect(() => {
    if (showInstructions) {
      requestAnimationFrame(() => instructionsRef.current?.focus());
    }
  }, [showInstructions]);

  const pickFiles = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ multiple: true, title: "Attach files" });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      const newAttachments: ChatAttachment[] = [];
      for (const filePath of paths) {
        try {
          const pathStr = filePath as string;
          const name = pathStr.split(/[/\\]/).pop() ?? "file";
          const dir = pathStr.substring(0, pathStr.length - name.length);
          const preview = await commands.fileReadPreview(dir || "/", name, 100_000);
          if (!preview.is_binary) {
            newAttachments.push({
              name,
              path: pathStr,
              preview: preview.content.slice(0, 200),
              content: preview.content,
              size: preview.size_bytes,
            });
          }
        } catch { /* skip */ }
      }
      if (newAttachments.length > 0 && onAttachmentsChange) {
        onAttachmentsChange([...attachments, ...newAttachments]);
      }
    } catch { /* cancelled */ }
  }, [attachments, onAttachmentsChange]);

  const pickFolder = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "Attach folder" });
      if (!selected || typeof selected !== "string") return;
      // Attach folder as a path reference
      if (onAttachmentsChange) {
        const name = selected.split(/[/\\]/).filter(Boolean).pop() ?? "folder";
        onAttachmentsChange([
          ...attachments,
          { name: name + "/", path: selected, preview: "(folder)", content: `[Folder: ${selected}]`, size: 0 },
        ]);
      }
    } catch { /* cancelled */ }
  }, [attachments, onAttachmentsChange]);

  const removeAttachment = useCallback(
    (index: number) => {
      if (onAttachmentsChange) {
        onAttachmentsChange(attachments.filter((_, i) => i !== index));
      }
    },
    [attachments, onAttachmentsChange],
  );

  // Load skills when the popover opens
  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const discovered = await commands.skillDiscover();
      setSkills(discovered);
    } catch { /* empty */ }
    finally { setSkillsLoading(false); }
  }, []);

  const handleToggleSkill = useCallback(async (skillId: string, enabled: boolean) => {
    // Optimistic update
    setSkills((prev) => prev.map((s) => s.id === skillId ? { ...s, enabled } : s));
    try {
      await commands.skillToggle(skillId, enabled);
    } catch {
      // Revert on failure
      setSkills((prev) => prev.map((s) => s.id === skillId ? { ...s, enabled: !enabled } : s));
    }
  }, []);

  const hasAnyToolCallback = Boolean(onTemperatureChange || onSystemPromptChange);
  const hasToolState = systemPrompt.trim().length > 0 || temperature !== "balanced";
  const activePreset = TEMP_PRESETS.find((p) => p.id === temperature) ?? TEMP_PRESETS[1];

  return (
    <div className="shrink-0 z-40 px-4 md:px-6 pt-2 pb-5">
      <div className="mx-auto max-w-3xl">
        {/* ── Model selector row ─────────────────────────────────── */}
        {availableModels.length > 0 && onSelectModel && (
          <div className="mb-2 px-1">
            <ModelSelector
              models={availableModels}
              selectedModelKey={selectedModelKey}
              onSelectModel={onSelectModel}
              disabled={modelDisabled}
              direction="up"
              className="w-56 max-w-full"
            />
          </div>
        )}

        {/* ── System instructions (expanded above input) ─────────── */}
        {showInstructions && onSystemPromptChange && (
          <div className="mb-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                Instructions
              </span>
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="h-5 w-5 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <textarea
              ref={instructionsRef}
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="Custom instructions for this conversation…"
              rows={2}
              className="w-full resize-none rounded-2xl border border-[var(--glass-border)] bg-[var(--surface-card)] px-4 py-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-accent-muted)] focus:shadow-[0_0_0_4px_var(--color-accent-subtle)] transition-all leading-relaxed"
              style={{ minHeight: "56px", maxHeight: "120px" }}
            />
          </div>
        )}

        {/* ── Attachment pills ───────────────────────────────────── */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {attachments.map((file, i) => (
              <span
                key={`${file.path}-${i}`}
                className="group inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-card)] border border-[var(--glass-border)] pl-2.5 pr-1.5 py-1 text-[11px] text-[var(--text-secondary)] max-w-[220px]"
                title={file.path}
              >
                <svg className="w-3 h-3 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="truncate font-medium">{file.name}</span>
                {file.size > 0 && (
                  <span className="text-[9px] text-[var(--text-muted)] shrink-0">
                    {file.size > 1000 ? `${(file.size / 1000).toFixed(0)}k` : `${file.size}`}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="shrink-0 w-4 h-4 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg-strong)] transition-colors opacity-0 group-hover:opacity-100"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── Main input container ───────────────────────────────── */}
        <div className="group relative rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--surface-card)] transition-[border-color,box-shadow] duration-[var(--duration-base)] focus-within:border-[var(--color-accent-muted)] focus-within:shadow-[0_0_0_4px_var(--color-accent-subtle)]">
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (value.trim()) onSend();
              }
            }}
            placeholder={isProcessing ? "Keep typing…" : "Message Khadim"}
            rows={1}
            className="block w-full resize-none bg-transparent px-5 py-4 pr-14 font-sans text-[15px] leading-[1.55] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none md:px-6 md:py-[18px] md:pr-16 md:text-[16px]"
            style={{ minHeight: "56px", maxHeight: "168px" }}
          />

          {/* ── Bottom bar: icon buttons left, send right ────────── */}
          <div className="flex items-center justify-between px-3 pb-2">
            {/* Left: tool icon buttons */}
            <div className="flex items-center gap-0.5">
              {/* Attach */}
              {onAttachmentsChange && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setAttachOpen((p) => !p); setToolsOpen(false); }}
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-150 ${
                      attachOpen
                        ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)]"
                    }`}
                    title="Attach"
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                    </svg>
                  </button>
                  <Popover open={attachOpen} onClose={() => setAttachOpen(false)} anchor="left">
                    <div className="py-1.5">
                      <PopoverItem
                        icon={<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />}
                        label="Upload File"
                        onClick={() => { setAttachOpen(false); void pickFiles(); }}
                      />
                      <PopoverItem
                        icon={<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />}
                        label="Upload Folder"
                        onClick={() => { setAttachOpen(false); void pickFolder(); }}
                      />
                    </div>
                  </Popover>
                </div>
              )}

              {/* Tools */}
              {hasAnyToolCallback && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setToolsOpen((p) => !p); setAttachOpen(false); }}
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-150 ${
                      toolsOpen
                        ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]"
                        : hasToolState
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)]"
                    }`}
                    title="Chat tools"
                  >
                    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {hasToolState && !toolsOpen && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                    )}
                  </button>
                  <Popover open={toolsOpen} onClose={() => setToolsOpen(false)} anchor="left">
                    <div className="py-1.5 min-w-[240px]">
                      {/* Temperature */}
                      {onTemperatureChange && (
                        <div className="px-3 py-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Temperature</span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums">{activePreset.value.toFixed(1)}</span>
                          </div>
                          <div className="flex rounded-xl bg-[var(--glass-bg)] p-0.5 gap-0.5">
                            {TEMP_PRESETS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => onTemperatureChange(preset.id)}
                                className={`flex-1 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-semibold transition-all duration-150 ${
                                  temperature === preset.id
                                    ? "bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)]"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                }`}
                                title={preset.desc}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {onTemperatureChange && onSystemPromptChange && (
                        <div className="h-px bg-[var(--glass-border)] mx-3" />
                      )}

                      {/* Instructions toggle */}
                      {onSystemPromptChange && (
                        <PopoverItem
                          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />}
                          label="Instructions"
                          trailing={systemPrompt.trim() ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                          ) : undefined}
                          onClick={() => { setToolsOpen(false); setShowInstructions((p) => !p); }}
                        />
                      )}
                    </div>
                  </Popover>
                </div>
              )}

              {/* Skills */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setSkillsOpen((p) => {
                      if (!p) void loadSkills();
                      return !p;
                    });
                    setAttachOpen(false);
                    setToolsOpen(false);
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-150 ${
                    skillsOpen
                      ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)]"
                  }`}
                  title="Skills"
                >
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </button>
                <Popover open={skillsOpen} onClose={() => setSkillsOpen(false)} anchor="left">
                  <div className="min-w-[280px] max-w-[320px]">
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--glass-border)]">
                      <span className="text-[12px] font-semibold text-[var(--text-primary)]">Skills</span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {skills.filter((s) => s.enabled).length}/{skills.length} active
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto overscroll-contain scrollbar-thin py-1">
                      {skillsLoading && skills.length === 0 ? (
                        <div className="px-3 py-4 text-center">
                          <span className="text-[11px] text-[var(--text-muted)]">Loading skills…</span>
                        </div>
                      ) : skills.length === 0 ? (
                        <div className="px-3 py-4 text-center">
                          <span className="text-[11px] text-[var(--text-muted)]">No skills found</span>
                        </div>
                      ) : (
                        skills.map((skill) => (
                          <SkillRow
                            key={skill.id}
                            skill={skill}
                            onToggle={() => void handleToggleSkill(skill.id, !skill.enabled)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </Popover>
              </div>
            </div>
            <div>
              {isProcessing ? (
                <button
                  onClick={onStop}
                  aria-label="Stop generation"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-danger-border)] bg-[var(--color-danger-muted)] text-[var(--color-danger-text)] transition-all duration-[var(--duration-fast)] hover:bg-[var(--color-danger-bg-strong)] active:scale-95"
                  title="Stop generation"
                >
                  <svg className="h-[14px] w-[14px]" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={!value.trim()}
                  aria-label="Send message"
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-[var(--duration-fast)] ${
                    value.trim()
                      ? "btn-accent"
                      : "bg-[var(--glass-bg)] text-[var(--text-muted)] cursor-not-allowed"
                  }`}
                >
                  <svg className="h-[16px] w-[16px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer hints ───────────────────────────────────────── */}
        <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
          {isProcessing ? "Stop to cancel · Enter queues next turn" : "Enter to send · Shift+Enter new line"}
        </p>
      </div>
    </div>
  );
}

/* ─── Popover menu item ────────────────────────────────────────────── */
function PopoverItem({
  icon,
  label,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors"
    >
      <svg className="w-[18px] h-[18px] shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
        {icon}
      </svg>
      <span className="flex-1 font-medium">{label}</span>
      {trailing}
    </button>
  );
}

/* ─── Skill toggle row ─────────────────────────────────────────────── */
function SkillRow({ skill, onToggle }: { skill: SkillEntry; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--glass-bg)] transition-colors group"
    >
      {/* Toggle */}
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ${
          skill.enabled ? "bg-[var(--color-accent)]" : "bg-[var(--glass-bg-strong)] border border-[var(--glass-border)]"
        }`}
      >
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            skill.enabled ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className={`text-[12px] font-medium truncate ${
          skill.enabled ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}>
          {skill.name}
        </p>
        {skill.description && (
          <p className="text-[10px] text-[var(--text-muted)] truncate leading-snug mt-0.5">
            {skill.description}
          </p>
        )}
      </div>
    </button>
  );
}
