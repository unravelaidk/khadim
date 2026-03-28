import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import {
  LuX,
  LuFile,
  LuImage,
  LuTable,
  LuSparkles,
  LuClock3,
  LuCommand,
  LuGamepad,
  LuFileText,
  LuGlobe,
} from "react-icons/lu";
import type { SlideTemplate, SlideTheme } from "../../types/slides";
import KhadimLogo from "../../assets/Khadim-logo.svg";
import { FeatureSelection } from "./FeatureSelection";

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
}: WelcomeScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const starterIdeas = [
    {
      title: "Pitch deck from notes",
      description: "Turn rough points into a polished slide story.",
      prompt:
        "Create a 10-slide investor pitch from these notes. Keep each slide concise, add speaker notes, and suggest one data visual per section.",
      icon: <LuFileText className="h-4 w-4" />,
    },
    {
      title: "Launch plan",
      description: "Generate a practical rollout and checklist.",
      prompt:
        "Draft a product launch plan with timeline, owners, risks, launch channels, and a week-by-week execution checklist.",
      icon: <LuGlobe className="h-4 w-4" />,
    },
    {
      title: "Build a mini game",
      description: "Prototype a browser game with clean mechanics.",
      prompt:
        "Build a simple web game with keyboard controls, scoring, restart flow, and mobile-friendly controls. Keep code modular and explain file structure.",
      icon: <LuGamepad className="h-4 w-4" />,
    },
  ];

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

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col items-center justify-start space-y-4 px-3 pb-12 pt-4 sm:space-y-6 sm:px-4 sm:pt-8 md:px-6 animate-in fade-in duration-700">
      <div className="relative w-full border-2 border-black bg-white px-4 pb-4 pt-[550px] shadow-gb-md sm:px-6 sm:pb-6 sm:pt-[480px] lg:pt-7 lg:px-7 lg:pb-7">
        {!isTemplatePickerOpen && (
          <>
            <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col items-center gap-4 md:flex-row">
                <div className="mb-2 h-20 w-20 shrink-0 sm:mb-2 sm:h-20 sm:w-20 lg:mb-0 lg:h-32 lg:w-32 animate-float [&>svg]:w-full [&>svg]:h-full">
                  <KhadimLogo />
                </div>
                <div className="space-y-1 text-center md:text-left">
                  <p className="text-xs font-medium uppercase tracking-wide text-black/50">{greeting}</p>
                  <h1 className="text-xl font-bold tracking-tight text-black sm:text-2xl md:text-3xl">What do you want to build?</h1>
                  <p className="text-sm text-black/70 md:text-base">Start with a prompt, then refine with quick actions and files.</p>
                </div>
              </div>

            </div>

            <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 border-2 border-black bg-white px-3 py-1.5 text-xs font-medium text-black/70 shadow-gb-sm">
                <LuClock3 className="h-3.5 w-3.5" />
                <span>Fast start</span>
              </div>
              <div className="inline-flex items-center gap-1 border-2 border-black bg-white px-3 py-1.5 text-xs font-medium text-black/50 shadow-gb-sm">
                <LuCommand className="h-3.5 w-3.5" />
                <span>Enter to send</span>
              </div>
              {onStartWorkspace && (
                <button
                  onClick={onStartWorkspace}
                  className="inline-flex items-center border-2 border-black bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-black shadow-gb-sm transition-colors hover:bg-black hover:text-white"
                >
                  Start workspace
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div
        className={`group relative mx-auto flex w-full max-w-[96vw] flex-col overflow-hidden border-2 border-black bg-white shadow-gb-lg transition-all duration-300 sm:max-w-none ${
          isTemplatePickerOpen ? "mt-6 lg:mt-10" : ""
        }`}
      >

        <div className="flex items-center justify-between border-b-2 border-black bg-white px-4 py-3 sm:px-6 md:px-8">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-black/70">
            <LuSparkles className="h-4 w-4 text-black" />
            Ask Khadim
          </div>
          <div className="text-xs text-black/50">Shift + Enter for new line</div>
        </div>

        {activeBadges.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2 pt-4 sm:px-6 sm:pt-6 animate-in fade-in slide-in-from-bottom-2">
            {activeBadges.map((badge) => (
              <div
                key={badge.label}
                className="flex items-center gap-1.5 border-2 border-black bg-white px-2.5 py-1 text-sm font-medium text-black shadow-gb-sm"
              >
                <span className="text-base">{badge.icon}</span>
                <span>{badge.label}</span>
                {badge.templateInfo && onUpdateSlideCount && (
                  <div className="ml-2 flex items-center gap-1 border-2 border-black bg-white px-1.5 py-0.5 text-black">
                    <button
                      type="button"
                      onClick={() => handleSlideCountChange(badge.label, (badge.slideCount || badge.templateInfo?.template.slides.length || 1) - 1)}
                      className="w-5 h-5 flex items-center justify-center text-xs font-semibold text-black hover:bg-black hover:text-white"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-xs font-semibold text-black">
                      {clampSlideCount(badge.slideCount || badge.templateInfo?.template.slides.length || 1)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSlideCountChange(badge.label, (badge.slideCount || badge.templateInfo?.template.slides.length || 1) + 1)}
                      className="w-5 h-5 flex items-center justify-center text-xs font-semibold text-black hover:bg-black hover:text-white"
                    >
                      +
                    </button>
                  </div>
                )}
                <button
                  onClick={() => removeBadge(badge.label)}
                  className="ml-1 p-0.5 text-black/50 transition-colors hover:bg-black hover:text-white"
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
            className={`w-full resize-none bg-transparent px-4 text-base leading-relaxed transition-all placeholder:text-black/40 focus:outline-none sm:px-6 md:px-8 md:text-lg ${
              activeBadges.length > 0
                ? "h-20 md:h-32 pt-4"
                : "h-24 md:h-40 pt-5 md:pt-8"
            }`}
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
                       className="h-20 w-20 border-2 border-black object-cover shadow-gb-sm"
                     />
                    {onRemoveFile && (
                      <button
                        onClick={() => onRemoveFile(file.name)}
                        className="absolute -right-2 -top-2 bg-black px-1 py-1 text-white opacity-0 transition-opacity group-hover:opacity-100 shadow-gb-sm"
                      >
                        <LuX className="w-3 h-3" />
                      </button>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white text-[10px] px-1.5 py-0.5 truncate">
                      {file.name}
                    </div>
                  </div>
                ) : (
                   <div className="flex items-center gap-2 border-2 border-black bg-white px-2.5 py-1.5 text-sm text-black/70 shadow-gb-sm">
                     {getFileIcon(file)}
                     <span className="max-w-[120px] truncate">{file.name}</span>
                     <span className="text-xs text-black/50">{formatFileSize(file.size)}</span>
                     {onRemoveFile && (
                       <button
                         onClick={() => onRemoveFile(file.name)}
                        className="ml-1 p-0.5 text-black/50 transition-colors hover:bg-black hover:text-white"
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

        <div className="flex items-center justify-between border-t-2 border-black bg-white px-3 py-3 sm:px-5 sm:py-3.5">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-black/50 hover:bg-black hover:text-white transition-all border-2 border-transparent hover:border-black"
              title="Attach files (images, Excel, CSV)"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-black/50 hover:bg-black hover:text-white transition-all border-2 border-transparent hover:border-black"
              title="Upload document"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </button>
            {attachedFiles.length > 0 && (
              <span className="text-xs text-black/50 ml-1">
                {attachedFiles.length} file{attachedFiles.length !== 1 ? "s" : ""} attached
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-black/50 md:inline">{input.trim().length} chars</span>
            <button
              onClick={handleSend}
              disabled={!input.trim() && attachedFiles.length === 0}
              className="bg-black px-4 py-2.5 text-white transition-all hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-50 shadow-gb-accent disabled:shadow-none"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {!isTemplatePickerOpen && (
        <div className="w-full border-2 border-black bg-white p-3 shadow-gb-md sm:p-4 md:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-black/70">
            <LuSparkles className="h-4 w-4 text-black" />
            Useful starters
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {starterIdeas.map((idea) => (
              <button
                key={idea.title}
                onClick={() => applyStarterPrompt(idea.prompt)}
                className="group border-2 border-black bg-white p-4 text-left transition-all hover:shadow-gb-accent hover:-translate-y-0.5"
              >
                <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium">
                  <span className="bg-[#e5ff00] p-1.5 group-hover:bg-black transition-colors">
                    <span className="group-hover:text-white transition-colors">{idea.icon}</span>
                  </span>
                  <span className="text-black group-hover:text-black/80">{idea.title}</span>
                </div>
                <p className="text-sm leading-relaxed text-black/60 group-hover:text-black/80">{idea.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="w-full mt-4 sm:mt-6 md:mt-8">
        <FeatureSelection
          onSelect={onSuggestionClick}
          onTemplatePickerChange={setIsTemplatePickerOpen}
        />
      </div>
    </div>
  );
}
