import { useState, useRef, useEffect } from "react";
import { ModelSettingsTab } from "./ModelSettingsTab";
import { AboutTab } from "./settings/AboutTab";
import { AccountsTab } from "./settings/AccountsTab";
import { GeneralTab } from "./settings/GeneralTab";
import { PluginsTab } from "./settings/PluginsTab";
import { ProvidersTab } from "./settings/ProvidersTab";
import { SkillsTab } from "./settings/SkillsTab";
import type { SettingsPanelProps, SettingsTab } from "./settings/types";

export type { CatppuccinVariant, ThemeFamily, ThemeMode } from "./settings/types";

/**
 * Grouped navigation — items with separator lines between groups.
 */
const NAV_ITEMS: Array<{ id: SettingsTab; label: string } | "sep"> = [
  { id: "general", label: "General" },
  "sep",
  { id: "providers", label: "Providers" },
  { id: "models", label: "Models" },
  "sep",
  { id: "plugins", label: "Plugins" },
  { id: "skills", label: "Skills" },
  "sep",
  { id: "accounts", label: "Accounts" },
  { id: "about", label: "About" },
];

export function SettingsPanel({
  onClose,
  runtime,
  githubAuthStatus,
  onGitHubAuthChange,
  themeFamily,
  themeMode,
  catppuccinVariant,
  onSetThemeFamily,
  onSetThemeMode,
  onSetCatppuccinVariant,
  chatDirectory,
  onChatDirectoryChange,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll to top on tab change
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [activeTab]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const activeLabel = NAV_ITEMS.find(
    (item): item is { id: SettingsTab; label: string } => item !== "sep" && item.id === activeTab,
  )?.label ?? "Settings";

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200" style={{ minHeight: 0 }}>
      {/* ── Header: title + close ────────────────────────────────── */}
      <div className="shrink-0 px-8 pt-6 pb-0 flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-[var(--text-primary)] tracking-tight">
          Settings
        </h1>
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

      {/* ── Tab bar: grouped, inline separators ──────────────────── */}
      <div className="shrink-0 px-8 pt-3 pb-0">
        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-thin">
          {NAV_ITEMS.map((item, i) =>
            item === "sep" ? (
              <div
                key={`sep-${i}`}
                className="w-px h-4 bg-[var(--glass-border)] mx-1.5 shrink-0"
              />
            ) : (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`shrink-0 px-3 py-1.5 rounded-[var(--radius-sm)] text-[11px] font-semibold transition-all duration-150 ${
                  activeTab === item.id
                    ? "bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)] border border-[var(--glass-border)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg)] border border-transparent"
                }`}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>
      </div>

      {/* ── Scrollable content ───────────────────────────────────── */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-8 py-6"
        style={{ minHeight: 0 }}
      >
        <div className="mx-auto max-w-2xl">
          {activeTab === "general" && (
            <GeneralTab
              themeFamily={themeFamily}
              themeMode={themeMode}
              catppuccinVariant={catppuccinVariant}
              onSetThemeFamily={onSetThemeFamily}
              onSetThemeMode={onSetThemeMode}
              onSetCatppuccinVariant={onSetCatppuccinVariant}
              chatDirectory={chatDirectory}
              onChatDirectoryChange={onChatDirectoryChange}
            />
          )}
          {activeTab === "providers" && <ProvidersTab />}
          {activeTab === "accounts" && (
            <AccountsTab githubAuthStatus={githubAuthStatus} onGitHubAuthChange={onGitHubAuthChange} />
          )}
          {activeTab === "models" && <ModelSettingsTab onOpenProviders={() => setActiveTab("providers")} />}
          {activeTab === "plugins" && <PluginsTab />}
          {activeTab === "skills" && <SkillsTab />}
          {activeTab === "about" && <AboutTab runtime={runtime} />}
        </div>
      </div>
    </div>
  );
}
