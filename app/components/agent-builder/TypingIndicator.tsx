import KhadimLogo from "../../assets/Khadim-logo.svg";

export function TypingIndicator() {
  return (
    <div className="flex gap-2.5 justify-start animate-in fade-in duration-300 md:gap-3">
      {/* Khadim logo avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg md:h-8 md:w-8 overflow-hidden">
        <div className="h-full w-full [&>svg]:w-full [&>svg]:h-full">
          <KhadimLogo />
        </div>
      </div>

      <div className="flex flex-col items-start">
        <span className="mb-1 px-1 text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] md:text-[10px]">
          Khadim
        </span>
        <div className="rounded-2xl rounded-tl-md glass-card-static px-4 py-3">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-primary)] animate-bounce" />
          </div>
        </div>
      </div>
    </div>
  );
}
