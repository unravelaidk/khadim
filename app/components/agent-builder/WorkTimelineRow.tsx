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
    <div className="animate-in fade-in slide-in-from-bottom-2 flex gap-2.5 duration-300 md:gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg md:h-8 md:w-8 overflow-hidden">
        <div className="h-full w-full [&>svg]:w-full [&>svg]:h-full">
          <KhadimLogo />
        </div>
      </div>

      <div className="flex min-w-0 w-full max-w-[92%] flex-col items-start md:max-w-[80%]">
        <span className="mb-1 flex items-center gap-1.5 px-1 text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] md:text-[10px]">
          Khadim
          {timeLabel && <span className="font-mono opacity-60">{timeLabel}</span>}
        </span>

        <div className="w-full">
          <ThinkingSteps steps={steps} onOpenFile={onOpenFile} />
        </div>
      </div>
    </div>
  );
}
