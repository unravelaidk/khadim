import { LuBot } from "react-icons/lu";

export function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start animate-in fade-in duration-300">
      {/* Assistant Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-gb-primary to-gb-accent flex items-center justify-center shadow-sm">
        <LuBot className="w-4 h-4 text-white" />
      </div>

      <div className="flex flex-col items-start">
        <span className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 px-1 text-gb-text-secondary">
          Khadim
        </span>
        <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-gb-bg-card border border-gb-border/50 shadow-sm">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full animate-bounce [animation-delay:-0.3s] bg-gb-accent" />
            <div className="w-2 h-2 rounded-full animate-bounce [animation-delay:-0.15s] bg-gb-accent" />
            <div className="w-2 h-2 rounded-full animate-bounce bg-gb-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}
