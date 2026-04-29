import { ThinkingSteps } from "./ThinkingStep";
import type { Message } from "../../types/chat";
import KhadimLogo from "../../assets/Khadim-logo.svg";

interface WorkTimelineRowProps {
  messages: Message[];
  onOpenFile?: (info: { filename: string; content: string }) => void;
}

export function WorkTimelineRow({ messages, onOpenFile }: WorkTimelineRowProps) {
  const message = messages[0];
  const steps = messages.flatMap((entry) => entry.thinkingSteps || []);
  const timestamp = message.timestamp instanceof Date
    ? message.timestamp
    : new Date(message.timestamp);
  const timeLabel = Number.isNaN(timestamp.getTime())
    ? ""
    : timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mb-1.5 flex items-center gap-2 md:mb-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-xs)] md:h-7 md:w-7">
          <div className="h-full w-full [&>svg]:w-full [&>svg]:h-full">
            <KhadimLogo />
          </div>
        </div>

        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] md:text-[11px]">
          Khadim
        </span>
        {timeLabel && (
          <span className="font-mono text-[10px] text-[var(--text-muted)] opacity-70 md:text-[11px]">
            {timeLabel}
          </span>
        )}
      </div>

      <div className="pl-8 md:pl-9">
        <ThinkingSteps steps={steps} onOpenFile={onOpenFile} />
      </div>
    </div>
  );
}
