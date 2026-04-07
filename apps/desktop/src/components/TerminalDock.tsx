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
  /** Controlled collapsed state from the parent. */
  collapsed: boolean;
  /** Callback to toggle collapsed. */
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

const STORAGE_HEIGHT = "khadim:terminal-dock:width";
const STORAGE_COLLAPSED = "khadim:terminal-dock:collapsed";
const MIN_HEIGHT = 280;
const MAX_HEIGHT = 900;
const DEFAULT_HEIGHT = 480;
const COLLAPSED_HEIGHT = 0;

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
    background:    cssVar("--terminal-bg")            || "#101010",
    foreground:    cssVar("--terminal-fg")            || "#e0e0e0",
    cursor:        cssVar("--terminal-cursor")        || "#e8e8e8",
    cursorAccent:  cssVar("--terminal-cursor-accent") || "#101010",
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

  useEffect(() => { storeValue(STORAGE_COLLAPSED, collapsed ? "1" : "0"); }, [collapsed]);
  useEffect(() => { storeValue(STORAGE_HEIGHT, String(height)); }, [height]);

  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tabsRef = useRef<TabState[]>([]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const hostMapRef = useRef(new Map<string, HTMLDivElement>());

  // ── Theme sync ────────────────────────────────────────────────────
  // Watch for data-theme-* attribute changes and reapply the xterm theme.
  useEffect(() => {
    const applyTheme = () => {
      const theme = buildXtermTheme();
      for (const tab of tabsRef.current) {
        if (!tab.term) continue;
        tab.term.options.theme = theme;
        try {
          const rows = tab.term.rows ?? 0;
          if (rows > 0) tab.term.refresh(0, rows - 1);
        } catch {
          /* ignore repaint failures */
        }
      }
    };
    // Initial apply after mount.
    applyTheme();
    // Watch the shell element for theme attribute changes.
    const shell = document.querySelector(".glass-page-shell");
    if (!shell) return;
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName?.startsWith("data-theme")) {
          // Small delay so the CSS variables actually update first.
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
              ? `\r\n\x1b[2m[process exited with code ${p.code}]\x1b[0m\r\n`
              : `\r\n\x1b[2m[process exited]\x1b[0m\r\n`,
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
        {
          session,
          term: null,
          fit: null,
          pending: [],
          exited: false,
          createdAt: Date.now(),
        },
      ]);
      setActiveId(session.id);
      if (collapsed) onToggleCollapsed();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [context]);

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
        fontFamily: "'Symbols Nerd Font Mono', 'Symbols Nerd Font', var(--font-mono), 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12.5,
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
        try {
          await openUrl(uri);
        } catch (error) {
          console.warn("Failed to open terminal link:", uri, error);
        }
      }, {
        urlRegex: /https?:\/\/[^\s"'<>`]+/gi,
      });
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

    // Defer fitting until after paint so the active panel definitely has size.
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

  // ── Auto-fit ──────────────────────────────────────────────────────
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
  const dragX = useRef(0);
  const dragW = useRef(0);
  const dragging = useRef(false);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (collapsed) return;
    dragging.current = true;
    dragX.current = e.clientX;
    dragW.current = height;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [collapsed, height]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = dragX.current - e.clientX;
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragW.current + dx)));
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

  // ── Keyboard: Cmd/Ctrl + ` ────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "`") {
        e.preventDefault();
        if (collapsed && tabsRef.current.length === 0 && context) void createTerminal();
        onToggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [context, createTerminal]);

  // Keep the active tab valid as tabs are added/removed.
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
  const dockWidth = collapsed ? COLLAPSED_HEIGHT : height;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      className="relative flex flex-col border-l border-[var(--glass-border)] h-full"
      style={{
        width: dockWidth,
        background: "var(--terminal-bg, var(--surface-bg-subtle))",
        transition: collapsed ? "width 140ms ease" : undefined,
        boxShadow: collapsed ? "none" : "-4px 0 24px rgba(0,0,0,0.25)",
      }}
    >
      {/* Drag handle (left edge) */}
      {!collapsed && (
        <div onMouseDown={onDragStart} className="absolute -left-1 inset-y-0 w-2 cursor-col-resize z-20 group">
          <div className="ml-[3px] mt-auto mb-auto w-[2px] h-10 rounded-full bg-[var(--glass-border)] group-hover:bg-[var(--color-accent)] transition-colors" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)' }} />
        </div>
      )}

      {/* Header bar */}
      <div
        className="shrink-0 h-8 px-3 flex items-center gap-2 border-b border-[var(--glass-border)] select-none"
        style={{ background: "var(--surface-bg-subtle)" }}
      >
        <button
          onClick={onToggleCollapsed}
          className="h-5 w-5 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] transition-colors"
          title="Close terminal (⌘`)"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>

        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <PromptIcon />
          Terminal
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <kbd className="hidden sm:inline-flex h-5 items-center px-1.5 rounded text-[9px] font-mono text-[var(--text-muted)] bg-[var(--glass-bg)] border border-[var(--glass-border)]">
            ⌘`
          </kbd>
          <button
            onClick={() => void createTerminal()}
            disabled={!context}
            className="h-6 px-2.5 rounded-lg text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] disabled:opacity-40 inline-flex items-center gap-1 transition-colors"
            title={context ? `New terminal in ${context.cwd}` : "No workspace"}
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 2v8M2 6h8" />
            </svg>
            New
          </button>
        </div>
      </div>

      {/* Tab strip — separate scrollable row */}
      {tabs.length > 0 && (
        <div className="shrink-0 px-2 py-1 border-b border-[var(--glass-border)] flex items-center gap-1 overflow-x-auto scrollbar-none" style={{ background: "var(--surface-bg-subtle)" }}>
          {tabs.map((tab, index) => {
            const isActive = tab.session.id === activeId;
            return (
              <div
                key={tab.session.id}
                className={`relative shrink-0 h-7 pl-2.5 pr-1 flex items-center gap-1.5 rounded-lg text-[10.5px] font-medium cursor-pointer transition-colors ${
                  isActive
                    ? "bg-[var(--glass-bg-strong)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]"
                }`}
                onClick={() => setActiveId(tab.session.id)}
                title={`${tab.session.cwd} \u2022 session ${tab.session.id.slice(0, 6)}`}
              >
                {isActive && (
                  <span className="absolute left-1.5 right-1.5 bottom-0 h-[2px] rounded-full bg-[var(--color-accent)]" />
                )}
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    tab.exited ? "bg-[var(--text-muted)]" : "bg-[var(--color-success)]"
                  }`}
                />
                <span className="truncate font-mono max-w-[140px]">{shortName(tab.session.cwd)} \u00b7 {index + 1}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); void closeTab(tab.session.id); }}
                  className="ml-0.5 h-4 w-4 rounded-sm flex items-center justify-center opacity-50 hover:opacity-100 hover:bg-[var(--glass-bg-strong)]"
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

      {/* Body */}
      <div className="flex-1 min-h-0 p-2 bg-[var(--surface-bg-subtle)]">
          <div
            className="relative h-full overflow-hidden rounded-2xl border"
            style={{
              borderColor: "var(--glass-border-strong, var(--glass-border))",
              background: "var(--terminal-bg, var(--surface-bg-subtle))",
              boxShadow: "var(--shadow-glass-sm)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: "var(--glass-shine, rgba(255,255,255,0.08))" }}
            />
            {error && (
              <div className="absolute top-2 left-2 right-2 z-10 rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg-strong)] px-2 py-1 text-[10px] text-[var(--color-danger-text)]">
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
                  className={`terminal-host absolute inset-0 px-2 py-2 ${tab.session.id === activeId ? "block" : "hidden"}`}
                  style={{
                    background: "var(--terminal-bg, var(--surface-bg-subtle))",
                    borderColor: "var(--glass-border)",
                  }}
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
    <div className="h-full flex flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
        <PromptIcon />
        Native shell
      </div>
      <p className="text-[11px] max-w-xs text-center leading-relaxed">
        {context
          ? <>A PTY-backed terminal in <span className="font-mono text-[var(--text-secondary)]">{shortName(context.cwd)}</span> that follows the active agent's worktree.</>
          : "Enter a workspace to spawn a terminal."}
      </p>
      <button
        onClick={onCreate}
        disabled={!context}
        className="h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold disabled:opacity-40 inline-flex items-center gap-2"
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
