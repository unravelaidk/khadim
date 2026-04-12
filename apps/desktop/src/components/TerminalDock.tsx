import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import "@xterm/xterm/css/xterm.css";
import {
  commands,
  events,
  type DesktopWorkspaceContext,
  type TerminalSession,
} from "../lib/bindings";

// ── Types ─────────────────────────────────────────────────────────────

interface Props {
  context: DesktopWorkspaceContext | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

interface TabState {
  session: TerminalSession;
  term: Terminal | null;
  fit: FitAddon | null;
  pending: string[];
  exited: boolean;
  createdAt: number;
}

// ── Persisted prefs ───────────────────────────────────────────────────

const STORAGE_HEIGHT = "khadim:terminal-dock:height";
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 260;
const COLLAPSED_BAR_HEIGHT = 32;

function stored(key: string, fallback: string): string {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function storeValue(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
}

// ── Theme bridge ──────────────────────────────────────────────────────

function themeRoot(): HTMLElement {
  return (document.querySelector(".glass-page-shell") as HTMLElement | null)
    ?? document.documentElement;
}

function cssVar(name: string): string {
  return getComputedStyle(themeRoot()).getPropertyValue(name).trim();
}

function buildXtermTheme(): Record<string, string> {
  return {
    background:    cssVar("--terminal-bg")            || "transparent",
    foreground:    cssVar("--terminal-fg")            || cssVar("--text-primary") || "#e0e0e0",
    cursor:        cssVar("--terminal-cursor")        || cssVar("--color-accent") || "#e8e8e8",
    cursorAccent:  cssVar("--terminal-cursor-accent") || cssVar("--surface-bg") || "#101010",
    selectionBackground: cssVar("--terminal-selection") || "rgba(232,232,232,0.18)",
    black:         cssVar("--terminal-black")         || "#1a1a1a",
    red:           cssVar("--terminal-red")           || "#f87171",
    green:         cssVar("--terminal-green")         || "#6ee7b7",
    yellow:        cssVar("--terminal-yellow")        || "#fcd34d",
    blue:          cssVar("--terminal-blue")          || "#93c5fd",
    magenta:       cssVar("--terminal-magenta")       || "#d8b4fe",
    cyan:          cssVar("--terminal-cyan")          || "#67e8f9",
    white:         cssVar("--terminal-white")         || "#e0e0e0",
    brightBlack:   cssVar("--terminal-bright-black")  || "#525252",
    brightRed:     cssVar("--terminal-bright-red")    || "#fca5a5",
    brightGreen:   cssVar("--terminal-bright-green")  || "#a7f3d0",
    brightYellow:  cssVar("--terminal-bright-yellow") || "#fde68a",
    brightBlue:    cssVar("--terminal-bright-blue")   || "#bfdbfe",
    brightMagenta: cssVar("--terminal-bright-magenta")|| "#e9d5ff",
    brightCyan:    cssVar("--terminal-bright-cyan")   || "#a5f3fc",
    brightWhite:   cssVar("--terminal-bright-white")  || "#fafafa",
  };
}

// ── Component ─────────────────────────────────────────────────────────

export function TerminalDock({ context, collapsed, onToggleCollapsed }: Props) {
  const [height, setHeight] = useState(() => {
    const h = Number(stored(STORAGE_HEIGHT, String(DEFAULT_HEIGHT)));
    return Number.isFinite(h) ? h : DEFAULT_HEIGHT;
  });

  useEffect(() => { storeValue(STORAGE_HEIGHT, String(height)); }, [height]);

  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tabsRef = useRef<TabState[]>([]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const hostMapRef = useRef(new Map<string, HTMLDivElement>());

  // ── Theme sync ────────────────────────────────────────────────────
  useEffect(() => {
    const applyTheme = () => {
      const theme = buildXtermTheme();
      for (const tab of tabsRef.current) {
        if (!tab.term) continue;
        tab.term.options.theme = theme;
        try {
          const rows = tab.term.rows ?? 0;
          if (rows > 0) tab.term.refresh(0, rows - 1);
        } catch { /* ignore */ }
      }
    };
    applyTheme();
    const shell = document.querySelector(".glass-page-shell");
    if (!shell) return;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName?.startsWith("data-theme")) {
          requestAnimationFrame(applyTheme);
          return;
        }
      }
    });
    observer.observe(shell, { attributes: true, attributeFilter: ["data-theme-family", "data-theme-variant"] });
    return () => observer.disconnect();
  }, []);

  // ── PTY events ────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    let unOutput: (() => void) | undefined;
    let unExit: (() => void) | undefined;

    void events.onTerminalOutput((p) => {
      if (!alive) return;
      const tab = tabsRef.current.find((t) => t.session.id === p.session_id);
      if (!tab) return;
      if (tab.term) tab.term.write(p.data);
      else tab.pending.push(p.data);
    }).then((fn) => { unOutput = fn; });

    void events.onTerminalExit((p) => {
      if (!alive) return;
      setTabs((prev) => prev.map((t) => {
        if (t.session.id !== p.session_id) return t;
        if (t.term) {
          t.term.write(
            p.code != null
              ? `\r\n\x1b[2m[exited ${p.code}]\x1b[0m\r\n`
              : `\r\n\x1b[2m[exited]\x1b[0m\r\n`,
          );
        }
        return { ...t, exited: true, session: { ...t.session, running: false } };
      }));
    }).then((fn) => { unExit = fn; });

    return () => { alive = false; unOutput?.(); unExit?.(); };
  }, []);

  // ── Spawn ─────────────────────────────────────────────────────────
  const createTerminal = useCallback(async () => {
    if (!context) return;
    setError(null);
    try {
      const session = await commands.terminalCreate(
        context.workspace_id,
        context.conversation_id,
        context.cwd,
      );
      setTabs((prev) => [
        ...prev,
        { session, term: null, fit: null, pending: [], exited: false, createdAt: Date.now() },
      ]);
      setActiveId(session.id);
      // Expand if collapsed — do NOT collapse if already open
      if (collapsed) onToggleCollapsed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [context, collapsed, onToggleCollapsed]);

  // ── Close ─────────────────────────────────────────────────────────
  const closeTab = useCallback(async (sessionId: string) => {
    const tab = tabsRef.current.find((t) => t.session.id === sessionId);
    try { if (tab && !tab.exited) await commands.terminalClose(sessionId); } catch { /* ok */ }
    if (tab?.term) tab.term.dispose();
    setTabs((prev) => prev.filter((t) => t.session.id !== sessionId));
    setActiveId((prev) => {
      if (prev !== sessionId) return prev;
      const rest = tabsRef.current.filter((t) => t.session.id !== sessionId);
      return rest[rest.length - 1]?.session.id ?? null;
    });
  }, []);

  // ── Attach xterm ──────────────────────────────────────────────────
  const attachActive = useCallback(() => {
    if (!activeId) return;
    const host = hostMapRef.current.get(activeId);
    if (!host) return;
    const tab = tabsRef.current.find((t) => t.session.id === activeId);
    if (!tab) return;

    if (!tab.term) {
      const theme = buildXtermTheme();
      const term = new Terminal({
        fontFamily: "'Symbols Nerd Font Mono', 'Symbols Nerd Font', var(--font-mono), 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12.5,
        lineHeight: 1.4,
        letterSpacing: 0,
        cursorBlink: true,
        cursorStyle: "bar",
        convertEol: true,
        scrollback: 8000,
        allowProposedApi: true,
        theme,
      });
      const fit = new FitAddon();
      const webLinks = new WebLinksAddon(async (_event, uri) => {
        if (!uri.startsWith("http://") && !uri.startsWith("https://")) return;
        try { await openUrl(uri); } catch { /* */ }
      }, { urlRegex: /https?:\/\/[^\s"'<>`]+/gi });
      term.loadAddon(fit);
      term.loadAddon(webLinks);
      term.open(host);
      term.onData((data) => { commands.terminalWrite(tab.session.id, data).catch(() => {}); });
      term.onResize(({ cols, rows }) => { commands.terminalResize(tab.session.id, cols, rows).catch(() => {}); });
      if (tab.pending.length > 0) {
        for (const chunk of tab.pending) term.write(chunk);
        tab.pending = [];
      }
      tab.term = term;
      tab.fit = fit;
    } else if (tab.term.element && tab.term.element.parentElement !== host) {
      host.replaceChildren();
      host.appendChild(tab.term.element);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { tab.fit?.fit(); } catch { /* */ }
        try {
          const rows = tab.term?.rows ?? 0;
          if (rows > 0) tab.term?.refresh(0, rows - 1);
        } catch { /* */ }
        tab.term?.focus();
      });
    });
  }, [activeId]);

  // Re-attach when expanded or tab changes
  useLayoutEffect(() => {
    if (!collapsed) attachActive();
  }, [attachActive, collapsed, height, tabs.length, activeId]);

  // ── Auto-fit on resize ────────────────────────────────────────────
  useEffect(() => {
    if (collapsed || !activeId) return;
    const host = hostMapRef.current.get(activeId);
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const tab = tabsRef.current.find((t) => t.session.id === activeId);
      try { tab?.fit?.fit(); } catch { /* */ }
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [collapsed, activeId, height]);

  // ── Cleanup ───────────────────────────────────────────────────────
  useEffect(() => () => {
    for (const tab of tabsRef.current) {
      if (tab.term) tab.term.dispose();
      commands.terminalClose(tab.session.id).catch(() => {});
    }
  }, []);

  // ── Drag to resize ────────────────────────────────────────────────
  const dragY = useRef(0);
  const dragH = useRef(0);
  const dragging = useRef(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (collapsed) return;
    dragging.current = true;
    dragY.current = e.clientY;
    dragH.current = height;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [collapsed, height]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dy = dragY.current - e.clientY;
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragH.current + dy)));
    };
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  // ── Keyboard: ⌘` ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "`") {
        e.preventDefault();
        if (collapsed && tabsRef.current.length === 0 && context) {
          void createTerminal();
          return; // createTerminal already expands
        }
        onToggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [context, collapsed, createTerminal, onToggleCollapsed]);

  // Keep the active tab valid
  useEffect(() => {
    if (tabs.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !tabs.some((t) => t.session.id === activeId)) {
      setActiveId(tabs[tabs.length - 1]?.session.id ?? null);
    }
  }, [tabs, activeId]);

  // ── Derived ───────────────────────────────────────────────────────
  const activeTab = useMemo(() => tabs.find((t) => t.session.id === activeId) ?? null, [tabs, activeId]);
  const runningCount = tabs.filter((t) => !t.exited).length;

  // ── Render ────────────────────────────────────────────────────────

  // When collapsed, show a minimal bar (always mounted, never unmounted)
  // When expanded, show the full terminal dock
  // Key: we NEVER unmount the terminal hosts — we just hide them with CSS

  const dockHeight = collapsed ? COLLAPSED_BAR_HEIGHT : height;

  return (
    <div
      className="relative flex flex-col overflow-hidden border-t border-[var(--glass-border)] shrink-0"
      style={{
        height: dockHeight,
        transition: "height 180ms var(--ease-out-quart)",
      }}
    >
      {/* Drag handle */}
      {!collapsed && (
        <div onMouseDown={onDragStart} className="absolute -top-1 inset-x-0 h-2 cursor-row-resize z-20 group">
          <div className="mx-auto mt-[3px] h-[2px] w-10 rounded-full bg-[var(--glass-border)] group-hover:bg-[var(--color-accent)] transition-colors" />
        </div>
      )}

      {/* Header bar — ALWAYS visible, even when collapsed */}
      <div
        className="shrink-0 flex items-center gap-2 px-3 select-none"
        style={{ height: COLLAPSED_BAR_HEIGHT }}
      >
        {/* Toggle chevron */}
        <button
          onClick={onToggleCollapsed}
          className="h-5 w-5 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors"
          title={collapsed ? "Expand terminal (⌘`)" : "Collapse terminal (⌘`)"}
        >
          <svg
            className={`w-3 h-3 transition-transform duration-150 ${collapsed ? "rotate-180" : ""}`}
            viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.6}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5l3 3 3-3" />
          </svg>
        </button>

        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <PromptIcon />
          Terminal
        </div>

        {/* Tab count / running indicator */}
        {tabs.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-mono bg-[var(--surface-ink-4)] text-[var(--text-muted)]">
            {runningCount > 0 && <span className="w-1 h-1 rounded-full bg-[var(--color-success)]" />}
            {tabs.length}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            onClick={() => void createTerminal()}
            disabled={!context}
            className="h-6 px-2 rounded-md text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] disabled:opacity-40 inline-flex items-center gap-1 transition-colors"
            title={context ? `New terminal in ${shortName(context.cwd)}` : "No workspace"}
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 2v8M2 6h8" />
            </svg>
            New
          </button>
        </div>
      </div>

      {/* Tab strip + body — hidden via CSS when collapsed, NOT unmounted */}
      <div
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
        style={{ display: collapsed ? "none" : undefined }}
      >
        {/* Tab strip */}
        {tabs.length > 1 && (
          <div className="shrink-0 px-2 py-1 border-t border-[var(--glass-border)] flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {tabs.map((tab, index) => {
              const isActive = tab.session.id === activeId;
              return (
                <div
                  key={tab.session.id}
                  className={`relative shrink-0 h-6 pl-2 pr-1 flex items-center gap-1.5 rounded-md text-[10px] font-medium cursor-pointer transition-colors ${
                    isActive
                      ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]"
                  }`}
                  onClick={() => setActiveId(tab.session.id)}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      tab.exited ? "bg-[var(--text-muted)]" : "bg-[var(--color-success)]"
                    }`}
                  />
                  <span className="truncate font-mono max-w-[120px]">{shortName(tab.session.cwd)} · {index + 1}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); void closeTab(tab.session.id); }}
                    className="ml-0.5 h-4 w-4 rounded-sm flex items-center justify-center opacity-40 hover:opacity-100 hover:bg-[var(--glass-bg-strong)]"
                  >
                    <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.6}>
                      <path strokeLinecap="round" d="M3 3l6 6M9 3l-6 6" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Terminal body — no inner card, just the terminal surface */}
        <div className="flex-1 min-h-0 border-t border-[var(--glass-border)]">
          {error && (
            <div className="px-3 py-2 text-[10px] text-[var(--color-danger-text)] border-b border-[var(--glass-border)]">
              {error}
            </div>
          )}

          {tabs.length === 0 ? (
            <EmptyState context={context} onCreate={() => void createTerminal()} />
          ) : (
            tabs.map((tab) => (
              <div
                key={tab.session.id}
                ref={(node) => {
                  if (node) {
                    hostMapRef.current.set(tab.session.id, node);
                    if (!collapsed && tab.session.id === activeId) {
                      requestAnimationFrame(() => attachActive());
                    }
                  } else {
                    hostMapRef.current.delete(tab.session.id);
                  }
                }}
                className={`terminal-host absolute inset-0 px-2 py-1 ${tab.session.id === activeId ? "block" : "hidden"}`}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────────

function EmptyState({ context, onCreate }: { context: DesktopWorkspaceContext | null; onCreate: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
      <p className="text-[11px] max-w-xs text-center leading-relaxed">
        {context
          ? <>Terminal in <span className="font-mono text-[var(--text-secondary)]">{shortName(context.cwd)}</span></>
          : "Enter a workspace to spawn a terminal."}
      </p>
      <button
        onClick={onCreate}
        disabled={!context}
        className="h-7 px-3 rounded-md btn-glass text-[10px] font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
      >
        <PromptIcon />
        Open terminal
      </button>
    </div>
  );
}

function PromptIcon() {
  return (
    <svg className="w-3 h-3 text-[var(--color-accent)]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5l3 3-3 3M8 11h5" />
    </svg>
  );
}

function shortName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
