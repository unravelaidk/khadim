import { useEffect, useState } from "react";
import type { GitHubAuthStatus, RuntimeSummary } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { GitHubAuthPanel } from "./GitHubAuthPanel";
import { ModelSettingsTab } from "./ModelSettingsTab";

let openDialog: typeof import("@tauri-apps/plugin-dialog").open | null = null;
import("@tauri-apps/plugin-dialog").then((mod) => { openDialog = mod.open; }).catch(() => {});

/* ─── Tab definition ───────────────────────────────────────────────── */

type SettingsTab = "general" | "accounts" | "models" | "about";

interface TabDef {
  id: SettingsTab;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  {
    id: "general",
    label: "General",
    icon: "M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z",
  },
  {
    id: "accounts",
    label: "Accounts",
    icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2m6-4a4 4 0 100-8 4 4 0 000 8zm10 2v-2a4 4 0 00-3-3.87",
  },
  {
    id: "models",
    label: "Models",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
  {
    id: "about",
    label: "About",
    icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];

/* ─── Props ────────────────────────────────────────────────────────── */

interface SettingsPanelProps {
  onClose: () => void;
  runtime: RuntimeSummary | null;
  githubAuthStatus: GitHubAuthStatus | null;
  onGitHubAuthChange: (status: GitHubAuthStatus) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  chatDirectory: string | null;
  onChatDirectoryChange: (dir: string | null) => void;
}

/* ─── Component ────────────────────────────────────────────────────── */

export function SettingsPanel({
  onClose,
  runtime,
  githubAuthStatus,
  onGitHubAuthChange,
  theme,
  onToggleTheme,
  chatDirectory,
  onChatDirectoryChange,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
      {/* ── Header with close button ─────────────────────────────── */}
      <div className="shrink-0 px-6 pt-5 pb-0 flex items-center justify-between">
        <h1 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Settings</h1>
        <button
          onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors"
          title="Close settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── macOS-style tab bar ───────────────────────────────────── */}
      <div className="shrink-0 px-6 pt-3 pb-0">
        <div className="flex gap-0.5 rounded-2xl bg-[var(--glass-bg)] p-0.5 border border-[var(--glass-border)]">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all duration-150 ${
                activeTab === id
                  ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.3)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <svg
                className="w-3 h-3 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                {id === "general" && (
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth={1.8} />
                )}
              </svg>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6" style={{ minHeight: 0 }}>
        <div className="mx-auto max-w-2xl">
          {activeTab === "general" && (
            <GeneralTab
              theme={theme}
              onToggleTheme={onToggleTheme}
              chatDirectory={chatDirectory}
              onChatDirectoryChange={onChatDirectoryChange}
            />
          )}
          {activeTab === "accounts" && (
            <AccountsTab
              githubAuthStatus={githubAuthStatus}
              onGitHubAuthChange={onGitHubAuthChange}
            />
          )}
          {activeTab === "models" && <ModelsTab />}
          {activeTab === "about" && <AboutTab runtime={runtime} />}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   General Tab
   ═══════════════════════════════════════════════════════════════════════ */

function GeneralTab({
  theme,
  onToggleTheme,
  chatDirectory,
  onChatDirectoryChange,
}: {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  chatDirectory: string | null;
  onChatDirectoryChange: (dir: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);

  async function pickChatDir() {
    if (!openDialog) return;
    setPicking(true);
    try {
      const selected = await openDialog({ directory: true, multiple: false, title: "Select chat working directory" });
      if (selected && typeof selected === "string") {
        onChatDirectoryChange(selected);
      }
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Appearance */}
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Appearance</h2>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">Customize how Khadim looks.</p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] font-semibold text-[var(--text-primary)]">Theme</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              {theme === "dark" ? "Dark mode" : "Light mode"} is active
            </p>
          </div>
          <button
            onClick={onToggleTheme}
            className="h-8 px-3.5 rounded-xl btn-glass text-[11px] font-semibold flex items-center gap-2"
          >
            {theme === "dark" ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Switch to light
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                Switch to dark
              </>
            )}
          </button>
        </div>
      </div>

      {/* Chat directory */}
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Chat Directory</h2>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Set a working directory for standalone chat mode. The agent can read, write, and list files inside this folder. When not set, the agent uses an empty temporary directory.
        </p>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {chatDirectory ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2">
                <svg className="w-3.5 h-3.5 shrink-0 text-[var(--color-accent)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-[11px] font-mono text-[var(--text-primary)] truncate">{chatDirectory}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-3 py-2">
                <svg className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-[11px] text-[var(--text-muted)] italic">Not set — using temporary directory</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => void pickChatDir()}
              disabled={picking}
              className="h-8 px-3.5 rounded-xl btn-glass text-[11px] font-semibold flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              {picking ? "Picking..." : chatDirectory ? "Change" : "Choose folder"}
            </button>
            {chatDirectory && (
              <button
                onClick={() => onChatDirectoryChange(null)}
                className="h-8 w-8 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg-strong)] transition-colors"
                title="Clear chat directory"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {chatDirectory && (
          <p className="text-[10px] text-[var(--text-muted)] mt-3">
            New chat sessions will use this directory. Existing sessions keep their original directory until you start a new conversation.
          </p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Accounts Tab
   ═══════════════════════════════════════════════════════════════════════ */

function AccountsTab({
  githubAuthStatus,
  onGitHubAuthChange,
}: {
  githubAuthStatus: GitHubAuthStatus | null;
  onGitHubAuthChange: (status: GitHubAuthStatus) => void;
}) {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">GitHub</h2>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Manage your GitHub connection for issues, pull requests, and repo creation.
        </p>
        <GitHubAuthPanel authStatus={githubAuthStatus} onAuthChange={onGitHubAuthChange} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Models Tab
   ═══════════════════════════════════════════════════════════════════════ */

function ModelsTab() {
  return <ModelSettingsTab />;
}

/* ═══════════════════════════════════════════════════════════════════════
   About Tab
   ═══════════════════════════════════════════════════════════════════════ */

function AboutTab({ runtime }: { runtime: RuntimeSummary | null }) {
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* App info */}
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-3">Khadim</h2>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          A desktop workspace for AI-assisted software engineering.
        </p>

        <div className="space-y-2">
          <InfoRow label="Runtime" value={runtime?.runtime ?? "loading..."} />
          <InfoRow label="Platform" value={runtime?.platform ?? "loading..."} />
          <InfoRow label="Status" value={runtime?.status ?? "loading..."} />
          <InfoRow label="OpenCode available" value={runtime?.opencode_available ? "Yes" : "Not detected"} />
        </div>
      </div>

      {/* Links */}
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-3">Links</h2>
        <div className="space-y-2">
          <p className="text-[11px] text-[var(--text-muted)]">
            Source code and documentation available on GitHub.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared helpers ───────────────────────────────────────────────── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--glass-border)] last:border-0">
      <span className="text-[11px] font-medium text-[var(--text-secondary)]">{label}</span>
      <span className="text-[11px] font-mono text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
