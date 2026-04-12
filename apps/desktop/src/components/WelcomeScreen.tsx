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
  {
    title: "Explain a concept",
    desc: "A clear, simple explanation of any topic.",
    prompt: "Explain quantum computing to me like I'm 12 years old. Use simple analogies and avoid jargon.",
  },
  {
    title: "Brainstorm ideas",
    desc: "Creative solutions, possibilities, directions.",
    prompt: "Help me brainstorm 10 creative project ideas for learning web development. I'm interested in practical apps I can actually build.",
  },
  {
    title: "Write something",
    desc: "Draft emails, articles, or any written content.",
    prompt: "Help me write a professional but warm email to my team announcing a deadline extension for our project.",
  },
  {
    title: "Solve a problem",
    desc: "Work through challenges step by step.",
    prompt: "I need to make a decision between three job offers. Help me think through the trade-offs systematically.",
  },
];

export function WelcomeScreen({ input, setInput, onSend, hideInput = false, compact = false }: WelcomeScreenProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }, []);

  /* ─── Compact: just the example rows ─────────────────────────── */
  if (compact) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 pb-6 pt-2">
        <p className="mb-3 px-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
          Starters
        </p>
        <ul className="flex flex-col">
          {examples.map((ex, i) => (
            <li
              key={ex.title}
              className="stagger-in"
              style={{ ["--stagger-delay" as string]: `${i * 60}ms` }}
            >
              <button
                onClick={() => {
                  setInput(ex.prompt);
                  textareaRef.current?.focus();
                }}
                className="group flex w-full items-baseline gap-4 border-t border-[var(--glass-border)] px-1 py-3 text-left transition-colors last:border-b hover:bg-[var(--color-accent-subtle)]"
              >
                <span className="w-4 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1">
                  <span className="block font-display text-md font-medium leading-snug text-[var(--text-primary)]">
                    {ex.title}
                  </span>
                  <span className="block text-[13px] leading-snug text-[var(--text-secondary)]">
                    {ex.desc}
                  </span>
                </span>
                <svg
                  className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-all duration-[var(--duration-base)] group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7v10" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /* ─── Full welcome — typography-led, no nested cards ─────────── */
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-10 pt-12 sm:px-8 lg:pt-16">
      {/* Hero — bare, no container */}
      <div className="flex flex-col items-start gap-8 stagger-in" style={{ ["--stagger-delay" as string]: "0ms" }}>
        <div className="logo-adaptive h-10 w-10 text-[var(--color-accent)]">
          <KhadimLogo />
        </div>
        <div className="space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">
            {greeting}
          </p>
          <h1
            className="font-display font-medium tracking-[-0.02em] text-[var(--text-primary)]"
            style={{ fontSize: "var(--text-display)", lineHeight: 1.05 }}
          >
            What do you want<br />
            <span className="text-[var(--text-secondary)]">to build today?</span>
          </h1>
        </div>
      </div>

      {/* Input — single contained element, the only "card" on screen */}
      {!hideInput && (
        <div
          className="mt-10 stagger-in"
          style={{ ["--stagger-delay" as string]: "120ms" }}
        >
          <div className="relative rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--surface-card)] transition-all duration-[var(--duration-base)] focus-within:border-[var(--color-accent-muted)] focus-within:shadow-[0_0_0_4px_var(--color-accent-subtle)]">
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
              placeholder="Describe what you're working on…"
              className="w-full resize-none bg-transparent px-6 pt-6 pb-14 font-sans text-md leading-[1.55] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              style={{ minHeight: "10rem", maxHeight: "50vh" }}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-5 py-3">
              <span className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Enter to send · Shift+Enter new line
              </span>
              <button
                onClick={onSend}
                disabled={!input.trim()}
                aria-label="Send prompt"
                className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full btn-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
              >
                <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Examples — bare rows, no card wrapper */}
      <div className="mt-14">
        <p
          className="mb-4 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)] stagger-in"
          style={{ ["--stagger-delay" as string]: "240ms" }}
        >
          Or try one of these
        </p>
        <ul className="flex flex-col">
          {examples.map((ex, i) => (
            <li
              key={ex.title}
              className="stagger-in"
              style={{ ["--stagger-delay" as string]: `${280 + i * 70}ms` }}
            >
              <button
                onClick={() => {
                  setInput(ex.prompt);
                  textareaRef.current?.focus();
                }}
                className="group flex w-full items-baseline gap-5 border-t border-[var(--glass-border)] px-1 py-4 text-left transition-colors last:border-b hover:bg-[var(--color-accent-subtle)]"
              >
                <span className="w-5 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1">
                  <span className="block font-display text-lg font-medium leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--color-accent)]">
                    {ex.title}
                  </span>
                  <span className="mt-0.5 block text-[14px] leading-snug text-[var(--text-secondary)]">
                    {ex.desc}
                  </span>
                </span>
                <svg
                  className="mt-2 h-4 w-4 shrink-0 text-[var(--text-muted)] transition-all duration-[var(--duration-base)] group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7v10" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
