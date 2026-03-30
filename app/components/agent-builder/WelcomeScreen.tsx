import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import {
  LuX,
  LuFile,
  LuImage,
  LuTable,
  LuSparkles,
  LuGlobe,
  LuPaperclip,
  LuGrid3X3,
  LuSend,
  LuRefreshCcw,
  LuArrowUpRight,
} from "react-icons/lu";
import type { SlideTemplate, SlideTheme } from "../../types/slides";
import KhadimLogo from "../../assets/Khadim-logo.svg";
import { ModelSelector } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content?: string;
}

type Badge = {
  label: string;
  icon: ReactNode;
  prompt?: string;
  isPremade?: boolean;
  templateInfo?: { template: SlideTemplate; theme: SlideTheme };
  slideCount?: number;
};

interface WelcomeScreenProps {
  input: string;
  setInput: (value: string) => void;
  handleSend: () => void;
  activeBadges: Badge[];
  removeBadge: (label: string) => void;
  onUpdateSlideCount?: (label: string, count: number) => void;
  onSuggestionClick: (feature: Badge) => void;
  attachedFiles?: AttachedFile[];
  onFilesAttached?: (files: AttachedFile[]) => void;
  onRemoveFile?: (fileName: string) => void;
  onStartWorkspace?: () => void;
  availableModels: ModelOption[];
  selectedModelId: string | null;
  isModelLoading: boolean;
  isModelUpdating: boolean;
  onSelectModel: (modelId: string) => Promise<void>;
  webBrowsingEnabled: boolean;
  onToggleWebBrowsing: (enabled: boolean) => void;
}

export function WelcomeScreen({
  input,
  setInput,
  handleSend,
  activeBadges,
  removeBadge,
  onUpdateSlideCount,
  onSuggestionClick,
  attachedFiles = [],
  onFilesAttached,
  onRemoveFile,
  onStartWorkspace,
  availableModels,
  selectedModelId,
  isModelLoading,
  isModelUpdating,
  onSelectModel,
  webBrowsingEnabled,
  onToggleWebBrowsing,
}: WelcomeScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeExampleSet, setActiveExampleSet] = useState(0);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const examplePromptSets = [
    [
      {
        title: "Understand climate change",
        description:
          "Help me understand how climate change works, what causes it, and what actions individuals can realistically take.",
        prompt:
          "Help me understand climate change from basics to practical action. Explain causes, effects, and what individuals can realistically do.",
      },
      {
        title: "Create a data science study plan",
        description:
          "Create a step-by-step learning path from beginner to job-ready, with milestones and project ideas.",
        prompt:
          "Create a detailed 12-week data science study plan for a beginner, including weekly goals, resources, practice projects, and checkpoints.",
      },
      {
        title: "Fun science experiments at home",
        description:
          "Suggest safe, educational experiments using common household items for kids aged 8-12.",
        prompt:
          "Share fun and educational science experiments for kids aged 8-12 that can be done at home with common household items.",
      },
      {
        title: "Latest trends in AI and tech",
        description:
          "Give me a concise brief on the biggest trends right now and why they matter.",
        prompt:
          "Give me a concise overview of the biggest AI and technology trends this year, why they matter, and what to watch next.",
      },
      {
        title: "Photography tips for beginners",
        description:
          "Explain composition rules and camera techniques to take better photos with a phone.",
        prompt:
          "Teach me beginner-friendly photography composition and phone camera techniques to take visually appealing shots.",
      },
      {
        title: "Write a heartfelt thank-you note",
        description:
          "Draft a genuine thank-you note to a mentor with specific, memorable details.",
        prompt:
          "Help me write a heartfelt and specific thank-you note to a mentor who had a major impact on my career.",
      },
    ],
    [
      {
        title: "Pitch deck from notes",
        description: "Turn rough points into a polished slide story with speaker notes.",
        prompt:
          "Create a 10-slide investor pitch from these notes. Keep each slide concise, add speaker notes, and suggest one data visual per section.",
      },
      {
        title: "Launch plan",
        description: "Generate a practical rollout plan, risks, owners, and checklist.",
        prompt:
          "Draft a product launch plan with timeline, owners, risks, launch channels, and a week-by-week execution checklist.",
      },
      {
        title: "Build a mini game",
        description: "Prototype a browser game with clean mechanics and restart flow.",
        prompt:
          "Build a simple web game with keyboard controls, scoring, restart flow, and mobile-friendly controls. Keep code modular and explain file structure.",
      },
      {
        title: "Team retrospective template",
        description: "Create a retro format with prompts, outcomes, and next actions.",
        prompt:
          "Create a team retrospective template with sections for wins, blockers, learnings, and concrete action items with owners and due dates.",
      },
      {
        title: "Research brief",
        description: "Summarize a topic into insights, trade-offs, and recommendations.",
        prompt:
          "Prepare a concise research brief with key findings, trade-offs, unanswered questions, and recommendations.",
      },
      {
        title: "Weekly meal prep plan",
        description: "Plan healthy, budget-friendly meals with prep steps and shopping list.",
        prompt:
          "Create a healthy, budget-friendly 7-day meal prep plan with grocery list, prep timeline, and quick weekday options.",
      },
    ],
  ];

  const slidesBadge: Badge = {
    label: "Create slides",
    icon: <LuGrid3X3 className="h-4 w-4" />,
    prompt: "Create a concise 8-slide presentation with storyline, key visuals, and speaker notes.",
  };

  const currentExamples = examplePromptSets[activeExampleSet] ?? examplePromptSets[0];

  const readFileContent = (file: File): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.onload = () => resolve(reader.result as string);

      if (file.type.startsWith("image/") || file.name.endsWith(".xlsx") || file.name.endsWith(".csv")) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !onFilesAttached) return;

    try {
      const newFiles = await Promise.all(
        Array.from(files).map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          content: await readFileContent(file),
        }))
      );

      const dedupedFiles = [...attachedFiles];
      for (const file of newFiles) {
        const existingIndex = dedupedFiles.findIndex((item) => item.name === file.name);
        if (existingIndex >= 0) {
          dedupedFiles[existingIndex] = file;
        } else {
          dedupedFiles.push(file);
        }
      }

      onFilesAttached(dedupedFiles);
    } catch (error) {
      console.error("Failed to attach files:", error);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const getFileIcon = (file: AttachedFile) => {
    if (file.type.startsWith("image/")) return <LuImage className="w-4 h-4" />;
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".csv")) return <LuTable className="w-4 h-4" />;
    return <LuFile className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const clampSlideCount = (count: number) => Math.min(20, Math.max(1, count));

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleSlideCountChange = (label: string, count: number) => {
    if (!onUpdateSlideCount) return;
    if (Number.isNaN(count)) {
      onUpdateSlideCount(label, 1);
      return;
    }
    onUpdateSlideCount(label, clampSlideCount(count));
  };

  const applyStarterPrompt = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const handleQuickActionSelect = (badge: Badge) => {
    onSuggestionClick(badge);
    textareaRef.current?.focus();
  };

  const isQuickActionActive = (label: string) =>
    activeBadges.some((badge) => badge.label.toLowerCase().startsWith(label.toLowerCase()));

  const handleSwitchExamples = () => {
    setActiveExampleSet((prev) => (prev + 1) % examplePromptSets.length);
  };

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col items-center justify-start space-y-4 px-3 pb-12 pt-14 sm:space-y-6 sm:px-4 sm:pt-8 md:px-6 animate-in fade-in duration-700">
      <div className="relative w-full rounded-3xl glass-card-static px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col items-center gap-4 md:flex-row">
            <div className="mb-2 h-20 w-20 shrink-0 sm:mb-2 sm:h-20 sm:w-20 lg:mb-0 lg:h-32 lg:w-32 animate-float [&>svg]:w-full [&>svg]:h-full">
              <KhadimLogo />
            </div>
            <div className="space-y-1 text-center md:text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{greeting}</p>
              <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl md:text-3xl">What do you want to build?</h1>
              <p className="text-sm text-[var(--text-secondary)] md:text-base">Start with a prompt, then refine with quick actions and files.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="group relative mx-auto flex w-full max-w-[96vw] flex-col rounded-3xl glass-panel-strong transition-all duration-300 sm:max-w-none">

        <div className="flex items-center justify-between rounded-t-3xl border-b border-[var(--glass-border)] px-4 py-3 sm:px-6 md:px-8">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
            <LuSparkles className="h-4 w-4 text-[var(--text-primary)]" />
            Ask Khadim
          </div>
          <div className="flex items-center gap-3">
            <div className="group/web relative">
              <button
                type="button"
                onClick={() => onToggleWebBrowsing(!webBrowsingEnabled)}
                className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-all ${
                  webBrowsingEnabled
                    ? "btn-accent"
                    : "btn-glass"
                }`}
              >
                <LuGlobe className="h-4 w-4" />
                <span className="hidden sm:inline">Web</span>
              </button>
              <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-xl glass-panel px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] opacity-0 transition-opacity group-hover/web:opacity-100">
                {webBrowsingEnabled ? "Web browsing is on — click to disable" : "Web browsing is off — click to enable"}
              </span>
            </div>
            <ModelSelector
              models={availableModels}
              selectedModelId={selectedModelId}
              onSelectModel={onSelectModel}
              isLoading={isModelLoading}
              isUpdating={isModelUpdating}
              className="w-64"
              direction="down"
            />
            <div className="hidden text-xs text-[var(--text-muted)] md:block">Shift + Enter for new line</div>
          </div>
        </div>

        {activeBadges.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-4 sm:px-6 sm:pt-6 animate-in fade-in slide-in-from-bottom-2">
            {activeBadges.map((badge) => (
              <div
                key={badge.label}
                className="flex items-center gap-1.5 rounded-full glass-panel px-2.5 py-1 text-sm font-medium text-[var(--text-primary)]"
              >
                <span className="text-base">{badge.icon}</span>
                <span>{badge.label}</span>
                {badge.templateInfo && onUpdateSlideCount && (
                  <div className="ml-2 flex items-center gap-1 rounded-full glass-panel px-1.5 py-0.5">
                    <button
                      type="button"
                      onClick={() => handleSlideCountChange(badge.label, (badge.slideCount || badge.templateInfo?.template.slides.length || 1) - 1)}
                      className="w-5 h-5 flex items-center justify-center text-xs font-semibold rounded-full hover:bg-[var(--glass-bg-strong)] transition-colors"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-xs font-semibold">
                      {clampSlideCount(badge.slideCount || badge.templateInfo?.template.slides.length || 1)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSlideCountChange(badge.label, (badge.slideCount || badge.templateInfo?.template.slides.length || 1) + 1)}
                      className="w-5 h-5 flex items-center justify-center text-xs font-semibold rounded-full hover:bg-[var(--glass-bg-strong)] transition-colors"
                    >
                      +
                    </button>
                  </div>
                )}
                <button
                  onClick={() => removeBadge(badge.label)}
                  className="ml-1 p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] rounded-full"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

          <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={
            activeBadges.length > 0
              ? "Describe what you want..."
              : "Awaiting instructions..."
          }
            className={`w-full resize-y bg-transparent px-4 text-base leading-relaxed transition-all placeholder:text-[var(--text-muted)] focus:outline-none sm:px-6 md:px-8 md:text-lg text-[var(--text-primary)] ${
              activeBadges.length > 0
                ? "min-h-20 md:min-h-32 pt-4"
                : "min-h-24 md:min-h-40 pt-5 md:pt-8"
            }`}
            style={{ maxHeight: "50vh" }}
        />

        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-4 pb-3 sm:px-6 animate-in fade-in">
            {attachedFiles.map((file) => (
              <div
                key={file.name}
                className="relative group"
              >
                {file.type.startsWith("image/") && file.content ? (
                  <div className="relative">
                    <img 
                      src={file.content} 
                      alt={file.name}
                       className="h-20 w-20 rounded-2xl border border-[var(--glass-border)] object-cover shadow-[var(--shadow-glass-sm)]"
                     />
                    {onRemoveFile && (
                      <button
                        onClick={() => onRemoveFile(file.name)}
                        className="absolute -right-2 -top-2 bg-[#10150a] text-[var(--text-inverse)] px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100 rounded-full shadow-[var(--shadow-glass-sm)]"
                      >
                        <LuX className="w-3 h-3" />
                      </button>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 truncate rounded-b-2xl">
                      {file.name}
                    </div>
                  </div>
                ) : (
                   <div className="flex items-center gap-2 rounded-full glass-panel px-2.5 py-1.5 text-sm text-[var(--text-secondary)]">
                     {getFileIcon(file)}
                     <span className="max-w-[120px] truncate">{file.name}</span>
                     <span className="text-xs text-[var(--text-muted)]">{formatFileSize(file.size)}</span>
                     {onRemoveFile && (
                       <button
                         onClick={() => onRemoveFile(file.name)}
                        className="ml-1 p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] rounded-full"
                       >
                         <LuX className="w-3.5 h-3.5" />
                       </button>
                     )}
                   </div>
                )}
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.json"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="rounded-b-3xl border-t border-[var(--glass-border)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl glass-panel px-3 py-2 sm:px-4">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full btn-glass transition-colors"
                title="Attach files"
              >
                <LuPaperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleQuickActionSelect(slidesBadge)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition-all ${
                  isQuickActionActive(slidesBadge.label)
                    ? "btn-accent"
                    : "btn-glass"
                }`}
                title={slidesBadge.label}
              >
                {slidesBadge.icon}
              </button>
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() && attachedFiles.length === 0}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full btn-accent transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
              aria-label="Send prompt"
            >
              <LuSend className="h-5 w-5" />
            </button>
          </div>

          {attachedFiles.length > 0 && (
            <p className="mt-2 px-1 text-xs text-[var(--text-muted)]">
              {attachedFiles.length} file{attachedFiles.length !== 1 ? "s" : ""} attached
            </p>
          )}

          {onStartWorkspace && (
            <button
              type="button"
              onClick={onStartWorkspace}
              className="mt-3 inline-flex items-center rounded-full btn-glass px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] transition-colors"
            >
              Start workspace
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 w-full sm:mt-6 md:mt-8">
        <div className="w-full rounded-3xl glass-card-static px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-lg font-medium text-[var(--text-primary)]">
              <LuSparkles className="h-4 w-4 text-[var(--text-primary)]" />
              <span>Try these examples</span>
            </div>
            <button
              type="button"
              onClick={handleSwitchExamples}
              className="inline-flex items-center gap-2 rounded-full btn-glass px-3 py-1.5 text-sm font-medium transition-colors"
            >
              <LuRefreshCcw className="h-4 w-4" />
              Switch
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {currentExamples.map((idea) => (
              <button
                key={idea.title}
                type="button"
                onClick={() => applyStarterPrompt(idea.prompt)}
                className="group rounded-2xl glass-card p-4 text-left"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold leading-tight text-[var(--text-primary)]">{idea.title}</h3>
                  <LuArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]" />
                </div>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{idea.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
