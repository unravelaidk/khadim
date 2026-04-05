import { useState } from "react";
import { ModelSettingsTab } from "./ModelSettingsTab";
import { AboutTab } from "./settings/AboutTab";
import { AccountsTab } from "./settings/AccountsTab";
import { TABS } from "./settings/constants";
import { GeneralTab } from "./settings/GeneralTab";
import { ProvidersTab } from "./settings/ProvidersTab";
import type { SettingsPanelProps, SettingsTab } from "./settings/types";

export type { CatppuccinVariant, ThemeFamily, ThemeMode } from "./settings/types";

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
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
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                {id === "general" && <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth={1.8} />}
              </svg>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6" style={{ minHeight: 0 }}>
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
          {activeTab === "about" && <AboutTab runtime={runtime} />}
        </div>
      </div>
    </div>
  );
}
