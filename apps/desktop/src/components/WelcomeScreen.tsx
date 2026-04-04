import { useRef, useMemo } from "react";
import KhadimLogo from "../assets/Khadim-logo.svg";

interface WelcomeScreenProps {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  hideInput?: boolean;
  /** compact=true → only show quick-prompt examples, no hero, no chart */
  compact?: boolean;
}

const examples = [
  { title: "Fix a bug", desc: "Diagnose and fix an issue in the current codebase.", prompt: "Find and fix the bug causing this issue. Explain what was wrong and why your fix is correct." },
  { title: "Refactor this code", desc: "Clean up and simplify without changing behavior.", prompt: "Refactor this code to be cleaner and more maintainable. Keep the same behavior, improve readability and structure." },
  { title: "Write tests", desc: "Add unit or integration tests for existing logic.", prompt: "Write thorough tests for this module. Cover the happy path, edge cases, and failure modes." },
  { title: "Review my PR", desc: "Get a critical code review before merging.", prompt: "Review this code as a senior engineer would. Point out bugs, performance issues, and anything that doesn't meet production quality." },
];

export function WelcomeScreen({ input, setInput, onSend, hideInput = false, compact = false }: WelcomeScreenProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }, []);

  // Compact mode: only quick prompts, no hero, no chart
  if (compact) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 animate-in fade-in duration-500">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-3 px-1">Quick prompts</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {examples.map((ex) => (
            <button
              key={ex.title}
              onClick={() => { setInput(ex.prompt); textareaRef.current?.focus(); }}
              className="group rounded-2xl text-left px-4 py-3 transition-colors"
              style={{ background: "var(--surface-card)", border: "1px solid var(--glass-border)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{ex.title}</span>
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7v10" />
                </svg>
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">{ex.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-start space-y-4 px-3 pb-8 pt-6 sm:space-y-6 sm:px-4 sm:pt-6 md:px-6 animate-in fade-in duration-700">
      {/* Hero card */}
      <div className="relative w-full rounded-[28px] glass-card-static px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7">
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col items-center gap-4 md:flex-row">
            <div className="logo-adaptive mb-2 h-20 w-20 shrink-0 sm:mb-2 sm:h-20 sm:w-20 lg:mb-0 lg:h-32 lg:w-32 animate-float [&>svg]:w-full [&>svg]:h-full text-[var(--text-primary)]">
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

      {/* Input card */}
      {!hideInput && (
      <div className="group relative z-50 mx-auto flex w-full flex-col rounded-[28px] glass-panel-strong transition-all duration-300">
        <div className="flex items-center justify-between rounded-t-[28px] border-b border-[var(--glass-border)] px-4 py-3 sm:px-6 md:px-8">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
            <svg className="h-4 w-4 text-[var(--text-primary)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            Ask Khadim
          </div>
          <div className="text-xs text-[var(--text-muted)]">Shift + Enter for new line</div>
        </div>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (input.trim()) onSend();
            }
          }}
          placeholder="Awaiting instructions..."
          className="w-full resize-y bg-transparent px-4 sm:px-6 md:px-8 text-base leading-relaxed transition-all placeholder:text-[var(--text-muted)] focus:outline-none text-[var(--text-primary)] min-h-24 md:min-h-40 pt-5 md:pt-8 md:text-lg"
          style={{ maxHeight: "50vh" }}
        />

        <div className="rounded-b-[28px] border-t border-[var(--glass-border)] px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center justify-end">
            <button
              onClick={onSend}
              disabled={!input.trim()}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full btn-ink transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
              aria-label="Send prompt"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Examples */}
      <div className="mt-4 w-full sm:mt-6 md:mt-8">
        <div className="w-full rounded-[28px] glass-card-static px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-4 flex items-center gap-2 text-lg font-medium text-[var(--text-primary)]">
            <svg className="h-4 w-4 text-[var(--text-primary)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <span>Try these examples</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {examples.map((ex) => (
              <button
                key={ex.title}
                onClick={() => { setInput(ex.prompt); textareaRef.current?.focus(); }}
                className="group rounded-3xl glass-card p-4 text-left"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold leading-tight text-[var(--text-primary)]">{ex.title}</h3>
                  <svg className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text-primary)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7v10" />
                  </svg>
                </div>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{ex.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
