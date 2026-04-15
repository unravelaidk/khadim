/**
 * ASCII Art Components — decorative ASCII elements that give Khadim
 * a distinctive retro-futuristic identity layered over the glass design.
 *
 * These render in the mono font and use theme color tokens so they
 * adapt to any theme automatically.
 */

import { memo, useEffect, useState, useMemo } from "react";

/* ─── Brand Mark ───────────────────────────────────────────────────── */

const KHADIM_LOGO_ASCII = `
    ╭─────────────────╮
    │  ╭─╮  ╭─╮  ╭─╮ │
    │  │K│──│H│──│D│  │
    │  ╰─╯  ╰─╯  ╰─╯ │
    │    \\   │   /     │
    │     ╰──┼──╯      │
    │        ▼         │
    │    [  agent  ]   │
    ╰─────────────────╯`.trimStart();

const KHADIM_LOGO_COMPACT = `╭─╮╭─╮╭─╮
│K││H││D│
╰─╯╰─╯╰─╯`;

export const AsciiBrand = memo(function AsciiBrand({
  variant = "full",
  className = "",
}: {
  variant?: "full" | "compact";
  className?: string;
}) {
  const art = variant === "compact" ? KHADIM_LOGO_COMPACT : KHADIM_LOGO_ASCII;
  return (
    <pre
      className={`font-mono text-[var(--color-accent)] leading-tight select-none whitespace-pre ${className}`}
      style={{ fontSize: variant === "compact" ? "10px" : "11px" }}
      aria-hidden="true"
    >
      {art}
    </pre>
  );
});

/* ─── Animated Bot Face ────────────────────────────────────────────── */

const BOT_FACES = [
  "[o_o]",
  "[O_o]",
  "[o_O]",
  "[^_^]",
  "[>_<]",
  "[-_-]",
  "[o_o]",
  "[°_°]",
];

const BOT_THINKING = [
  "[o_o] ...",
  "[O_o]  ..",
  "[o_O] ...",
  "[·_·]  ..",
];

const BOT_IDLE = [
  "[-_-]  zzz",
  "[-_-] zz",
  "[-_-]  z",
  "[-_-]",
];

const BOT_SUCCESS = "[^_^] ✓";
const BOT_ERROR = "[x_x] !";

export const AsciiBotFace = memo(function AsciiBotFace({
  state = "idle",
  className = "",
}: {
  state?: "idle" | "thinking" | "success" | "error";
  className?: string;
}) {
  const [frame, setFrame] = useState(0);

  const frames = useMemo(() => {
    switch (state) {
      case "thinking": return BOT_THINKING;
      case "idle": return BOT_IDLE;
      default: return BOT_FACES;
    }
  }, [state]);

  useEffect(() => {
    if (state === "success" || state === "error") return;
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, state === "thinking" ? 200 : 800);
    return () => clearInterval(interval);
  }, [state, frames]);

  const display = state === "success" ? BOT_SUCCESS : state === "error" ? BOT_ERROR : frames[frame];

  return (
    <span
      className={`font-mono text-[var(--color-accent)] select-none inline-block min-w-[12ch] ${className}`}
      aria-hidden="true"
    >
      {display}
    </span>
  );
});

/* ─── Section Dividers ─────────────────────────────────────────────── */

export const AsciiDivider = memo(function AsciiDivider({
  label,
  variant = "line",
  className = "",
}: {
  label?: string;
  variant?: "line" | "double" | "dots" | "arrows";
  className?: string;
}) {
  const patterns = {
    line:   "─",
    double: "═",
    dots:   "·",
    arrows: "►",
  };

  const char = patterns[variant];

  if (label) {
    return (
      <div
        className={`flex items-center gap-2 font-mono text-[10px] text-[var(--text-muted)] select-none ${className}`}
        aria-hidden="true"
      >
        <span className="opacity-40">{char.repeat(3)}</span>
        <span className="uppercase tracking-[0.2em] shrink-0">{label}</span>
        <span className="flex-1 opacity-40 overflow-hidden whitespace-nowrap">
          {char.repeat(60)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`font-mono text-[10px] text-[var(--text-muted)] opacity-30 select-none overflow-hidden whitespace-nowrap ${className}`}
      aria-hidden="true"
    >
      {char.repeat(80)}
    </div>
  );
});

/* ─── Box Frame ────────────────────────────────────────────────────── */

export const AsciiBox = memo(function AsciiBox({
  children,
  title,
  variant = "single",
  className = "",
}: {
  children: React.ReactNode;
  title?: string;
  variant?: "single" | "double" | "rounded";
  className?: string;
}) {
  const chars = {
    single:  { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
    double:  { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
    rounded: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  };

  const c = chars[variant];

  return (
    <div className={`relative ${className}`}>
      {/* Top border */}
      <div className="font-mono text-[10px] text-[var(--text-muted)] opacity-40 select-none flex items-center" aria-hidden="true">
        <span>{c.tl}</span>
        {title ? (
          <>
            <span>{c.h.repeat(2)}</span>
            <span className="opacity-100 text-[var(--text-secondary)] px-1 uppercase tracking-[0.15em]">{title}</span>
            <span className="flex-1 overflow-hidden whitespace-nowrap">{c.h.repeat(60)}</span>
          </>
        ) : (
          <span className="flex-1 overflow-hidden whitespace-nowrap">{c.h.repeat(60)}</span>
        )}
        <span>{c.tr}</span>
      </div>

      {/* Content with side borders */}
      <div className="relative">
        <span className="absolute left-0 top-0 bottom-0 font-mono text-[10px] text-[var(--text-muted)] opacity-40 select-none leading-[1.8]" aria-hidden="true">{c.v}</span>
        <span className="absolute right-0 top-0 bottom-0 font-mono text-[10px] text-[var(--text-muted)] opacity-40 select-none leading-[1.8]" aria-hidden="true">{c.v}</span>
        <div className="px-4 py-2">
          {children}
        </div>
      </div>

      {/* Bottom border */}
      <div className="font-mono text-[10px] text-[var(--text-muted)] opacity-40 select-none flex" aria-hidden="true">
        <span>{c.bl}</span>
        <span className="flex-1 overflow-hidden whitespace-nowrap">{c.h.repeat(60)}</span>
        <span>{c.br}</span>
      </div>
    </div>
  );
});

/* ─── Progress Bar (ASCII-style) ───────────────────────────────────── */

export const AsciiProgress = memo(function AsciiProgress({
  percent,
  width = 20,
  label,
  className = "",
}: {
  percent: number;
  width?: number;
  label?: string;
  className?: string;
}) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = `[${"█".repeat(filled)}${"░".repeat(empty)}]`;

  return (
    <span className={`font-mono text-[10px] inline-flex items-center gap-2 ${className}`}>
      <span className="text-[var(--color-accent)]">{bar}</span>
      {label && <span className="text-[var(--text-muted)]">{label}</span>}
      <span className="text-[var(--text-secondary)] tabular-nums">{percent.toFixed(0)}%</span>
    </span>
  );
});

/* ─── Spinner (ASCII-style) ────────────────────────────────────────── */

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export const AsciiSpinner = memo(function AsciiSpinner({
  label,
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className={`font-mono text-[var(--color-accent)] inline-flex items-center gap-2 ${className}`}>
      <span className="inline-block w-[1ch]">{SPINNER_FRAMES[frame]}</span>
      {label && <span className="text-[var(--text-muted)] text-[11px]">{label}</span>}
    </span>
  );
});

/* ─── Typing Effect ────────────────────────────────────────────────── */

export const AsciiTyping = memo(function AsciiTyping({
  text,
  speed = 40,
  className = "",
  onComplete,
}: {
  text: string;
  speed?: number;
  className?: string;
  onComplete?: () => void;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, onComplete]);

  return (
    <span className={`font-mono ${className}`}>
      {displayed}
      {!done && <span className="text-[var(--color-accent)] animate-pulse">▋</span>}
    </span>
  );
});

/* ─── Status Badge (ASCII) ─────────────────────────────────────────── */

const STATUS_ASCII: Record<string, { icon: string; color: string }> = {
  running:  { icon: "►",  color: "var(--color-accent)" },
  complete: { icon: "✓",  color: "var(--color-success)" },
  error:    { icon: "✗",  color: "var(--color-danger)" },
  idle:     { icon: "○",  color: "var(--text-muted)" },
  waiting:  { icon: "◇",  color: "var(--text-secondary)" },
};

export const AsciiStatusBadge = memo(function AsciiStatusBadge({
  status,
  label,
  className = "",
}: {
  status: "running" | "complete" | "error" | "idle" | "waiting";
  label?: string;
  className?: string;
}) {
  const config = STATUS_ASCII[status] ?? STATUS_ASCII.idle;

  return (
    <span
      className={`font-mono text-[11px] inline-flex items-center gap-1.5 ${className}`}
      style={{ color: config.color }}
    >
      <span>{config.icon}</span>
      {label && <span>{label}</span>}
    </span>
  );
});

/* ─── Empty State ──────────────────────────────────────────────────── */

const EMPTY_ART = {
  noChats: `
    ╭──────────╮
    │  (    )  │
    │  |    |  │
    │  | ── |  │
    │  (    )  │
    ╰──────────╯
   no chats yet`,
  noAgents: `
     ┌─┐
    ┌┤ ├┐
    │└─┘│
    │ ? │
    └───┘
  no agents`,
  noResults: `
  ╭─────╮
  │ ¿ ? │
  ╰─────╯
  nothing found`,
  error: `
   ╱╲
  ╱  ╲
 ╱ !! ╲
╱──────╲
something broke`,
};

export const AsciiEmptyState = memo(function AsciiEmptyState({
  type = "noResults",
  message,
  className = "",
}: {
  type?: keyof typeof EMPTY_ART;
  message?: string;
  className?: string;
}) {
  const art = EMPTY_ART[type];

  return (
    <div className={`flex flex-col items-center py-8 ${className}`}>
      <pre
        className="font-mono text-[11px] leading-tight text-[var(--text-muted)] opacity-60 select-none whitespace-pre text-center"
        aria-hidden="true"
      >
        {art}
      </pre>
      {message && (
        <p className="mt-3 text-[12px] text-[var(--text-muted)]">{message}</p>
      )}
    </div>
  );
});

/* ─── Decorative Corner Marks ──────────────────────────────────────── */

export const AsciiCornerMarks = memo(function AsciiCornerMarks({
  className = "",
}: {
  className?: string;
}) {
  return (
    <>
      <span className={`absolute top-0 left-0 font-mono text-[10px] text-[var(--text-muted)] opacity-20 select-none ${className}`} aria-hidden="true">┌</span>
      <span className={`absolute top-0 right-0 font-mono text-[10px] text-[var(--text-muted)] opacity-20 select-none ${className}`} aria-hidden="true">┐</span>
      <span className={`absolute bottom-0 left-0 font-mono text-[10px] text-[var(--text-muted)] opacity-20 select-none ${className}`} aria-hidden="true">└</span>
      <span className={`absolute bottom-0 right-0 font-mono text-[10px] text-[var(--text-muted)] opacity-20 select-none ${className}`} aria-hidden="true">┘</span>
    </>
  );
});

/* ─── Prompt Prefix ────────────────────────────────────────────────── */

export const AsciiPrompt = memo(function AsciiPrompt({
  symbol = "❯",
  className = "",
}: {
  symbol?: "❯" | "$" | ">" | "λ" | "→";
  className?: string;
}) {
  return (
    <span className={`font-mono text-[var(--color-accent)] select-none ${className}`} aria-hidden="true">
      {symbol}
    </span>
  );
});
