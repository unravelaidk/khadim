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
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 280;
const HEADER_HEIGHT = 34;

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
  // Use the app's surface as bg so the terminal blends in
  const bg = cssVar("--terminal-bg") || cssVar("--surface-bg-subtle") || "#121212";
  return {
    background:    bg,
    foreground:    cssVar("--terminal-fg")            || cssVar("--text-primary") || "#e0e0e0",
    cursor:        cssVar("--terminal-cursor")        || cssVar("--color-accent") || "#e8e8e8",
    cursorAccent:  cssVar("--terminal-cursor-accent") || bg,
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
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

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

  // ── Spawn — uses ref for collapsed to avoid stale closure ─────────
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
      if (collapsedRef.current) onToggleCollapsed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [context, onToggleCollapsed]);

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
        fontFamily: "'Symbols Nerd Font Mono', 'Symbols Nerd Font', 'Geist Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        lineHeight: 1.35,
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
        if (collapsedRef.current && tabsRef.current.length === 0 && context) {
          void createTerminal();
          return;
        }
        onToggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [context, createTerminal, onToggleCollapsed]);

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
  const runningCount = tabs.filter((t) => !t.exited).length;
  const dockHeight = collapsed ? HEADER_HEIGHT : height;

  // ── Render ────────────────────────────────────────────────────────
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

      {/* ── Header bar — always visible ─────────────────────────── */}
      <div
        className="shrink-0 flex items-center gap-2 px-4 border-b border-[var(--glass-border)] select-none"
        style={{ height: HEADER_HEIGHT, background: "var(--surface-bg-subtle)" }}
      >
        <button
          onClick={onToggleCollapsed}
          className="h-5 w-5 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors"
          title={collapsed ? "Expand (⌘`)" : "Collapse (⌘`)"}
        >
          <i className="ri-arrow-up-s-line text-[12px] leading-none" />
        </button>

        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)] flex items-center gap-1.5">
          <PromptIcon />
          Terminal
        </span>

        {/* Tab pills — always show, inline in the header */}
        {tabs.length > 0 && (
          <div className="flex items-center gap-1 ml-2 overflow-x-auto scrollbar-none">
            {tabs.map((tab, i) => {
              const isActive = tab.session.id === activeId;
              return (
                <button
                  key={tab.session.id}
                  onClick={() => setActiveId(tab.session.id)}
                  className={`shrink-0 h-5 pl-1.5 pr-1 flex items-center gap-1 rounded text-[9px] font-mono transition-colors ${
                    isActive
                      ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--glass-bg)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <span className={`w-1 h-1 rounded-full ${tab.exited ? "bg-[var(--text-muted)]" : "bg-[var(--color-success)]"}`} />
                  <span className="truncate max-w-[80px]">{i + 1}</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); void closeTab(tab.session.id); }}
                    className="ml-0.5 w-3 h-3 rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:bg-[var(--glass-bg-strong)] cursor-pointer"
                    style={{ opacity: isActive ? 0.5 : 0 }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = isActive ? "0.5" : "0"; }}
                  >
                    <i className="ri-close-line text-[12px] leading-none" />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Right — new button */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {runningCount > 0 && collapsed && (
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono bg-[var(--surface-ink-4)] text-[var(--text-muted)]">
              <span className="w-1 h-1 rounded-full bg-[var(--color-success)]" />
              {runningCount}
            </span>
          )}
          <button
            onClick={() => void createTerminal()}
            disabled={!context}
            className="h-6 px-2 rounded-md text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] disabled:opacity-40 inline-flex items-center gap-1 transition-colors"
            title={context ? `New terminal in ${shortName(context.cwd)}` : "No workspace"}
          >
            <i className="ri-add-line text-[12px] leading-none" />
          </button>
        </div>
      </div>

      {/* ── Terminal body — hidden via CSS, never unmounted ──────── */}
      <div
        className="relative flex-1 min-h-0"
        style={{
          display: collapsed ? "none" : undefined,
          background: "var(--terminal-bg, var(--surface-bg-subtle))",
        }}
      >
        {error && (
          <div className="absolute top-0 inset-x-0 z-10 px-4 py-1.5 text-[10px] text-[var(--color-danger-text)] bg-[var(--color-danger-bg-strong)] border-b border-[var(--color-danger-border)]">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-medium hover:underline">dismiss</button>
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
                  if (!collapsedRef.current && tab.session.id === activeId) {
                    requestAnimationFrame(() => attachActive());
                  }
                } else {
                  hostMapRef.current.delete(tab.session.id);
                }
              }}
              className={`terminal-host absolute inset-0 p-1 ${tab.session.id === activeId ? "" : "invisible pointer-events-none"}`}
              style={{ background: "var(--terminal-bg, var(--surface-bg-subtle))" }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────────

function EmptyState({ context, onCreate }: { context: DesktopWorkspaceContext | null; onCreate: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
      <p className="text-[11px] max-w-xs text-center leading-relaxed">
        {context
          ? <>Shell in <span className="font-mono text-[var(--text-secondary)]">{shortName(context.cwd)}</span></>
          : "Enter a workspace to open a terminal."}
      </p>
      <button
        onClick={onCreate}
        disabled={!context}
        className="h-7 px-3 rounded-md btn-glass text-[10px] font-medium disabled:opacity-40 inline-flex items-center gap-1.5"
      >
        <PromptIcon />
        Open
      </button>
    </div>
  );
}

function PromptIcon() {
  return (
    <i className="ri-terminal-box-line text-[12px] leading-none text-[var(--color-accent)]" />
  );
}

function shortName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
