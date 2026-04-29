import KhadimLogo from "../../assets/Khadim-logo.svg";

export function TypingIndicator() {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="mb-1.5 flex items-center gap-2 md:mb-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-xs)] md:h-7 md:w-7">
          <div className="h-full w-full [&>svg]:w-full [&>svg]:h-full">
            <KhadimLogo />
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] md:text-[11px]">
          Khadim
        </span>
      </div>
      <div className="pl-8 md:pl-9">
        <div className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-primary)] animate-bounce" />
        </div>
      </div>
    </div>
  );
}
