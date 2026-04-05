import { useCallback, useEffect, useState } from "react";
import type { GitHubAuthStatus, KhadimProviderStatus, KhadimConfiguredModel, KhadimDiscoveredModel, KhadimCodexSession, KhadimCodexStatus, RuntimeSummary } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { GitHubAuthPanel } from "./GitHubAuthPanel";
import { ModelSettingsTab } from "./ModelSettingsTab";
import { getProviderIconUrl, isMonochromeProvider } from "../assets/model-icons";

let openDialog: typeof import("@tauri-apps/plugin-dialog").open | null = null;
import("@tauri-apps/plugin-dialog").then((mod) => { openDialog = mod.open; }).catch(() => {});

/* ─── Theme definitions ───────────────────────────────────────────────── */

export type ThemeFamily = "default" | "catppuccin" | "nord" | "tokyo-night" | "gruvbox" | "one-dark" | "dracula";
export type ThemeMode = "dark" | "light";
export type CatppuccinVariant = "mocha" | "macchiato" | "frappe" | "latte";

interface ThemeFamilyOption {
  id: ThemeFamily;
  label: string;
  description: string;
  previewBgDark: string;
  previewBgLight: string;
  previewCardDark: string;
  previewCardLight: string;
  previewTextDark: string;
  previewTextLight: string;
  previewAccentDark: string;
  previewAccentLight: string;
  hasLightVariant: boolean;
}

const THEME_FAMILIES: ThemeFamilyOption[] = [
  {
    id: "default",
    label: "Default",
    description: "Clean, minimal, Mac-native",
    previewBgDark: "#1a1a1a",
    previewBgLight: "#f5f5f4",
    previewCardDark: "rgba(38, 38, 38, 0.72)",
    previewCardLight: "rgba(255, 255, 254, 0.72)",
    previewTextDark: "#e8e8e8",
    previewTextLight: "#1c1c1a",
    previewAccentDark: "#e8e8e8",
    previewAccentLight: "#1c1c1a",
    hasLightVariant: true,
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    description: "Soothing pastel theme",
    previewBgDark: "#1e1e2e",
    previewBgLight: "#eff1f5",
    previewCardDark: "rgba(49, 50, 68, 0.72)",
    previewCardLight: "rgba(255, 255, 254, 0.72)",
    previewTextDark: "#cdd6f4",
    previewTextLight: "#4c4f69",
    previewAccentDark: "#89b4fa",
    previewAccentLight: "#1e66f5",
    hasLightVariant: true,
  },
  {
    id: "nord",
    label: "Nord",
    description: "Arctic, bluish palette",
    previewBgDark: "#2e3440",
    previewBgLight: "#e8eef0",
    previewCardDark: "rgba(59, 66, 82, 0.72)",
    previewCardLight: "rgba(255, 255, 255, 0.72)",
    previewTextDark: "#eceff4",
    previewTextLight: "#2e3440",
    previewAccentDark: "#88c0d0",
    previewAccentLight: "#5e81ac",
    hasLightVariant: true,
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    description: "Tokyo neon lights",
    previewBgDark: "#1a1b26",
    previewBgLight: "#e1e2eb",
    previewCardDark: "rgba(36, 40, 59, 0.72)",
    previewCardLight: "rgba(255, 255, 255, 0.72)",
    previewTextDark: "#c0caf5",
    previewTextLight: "#343b59",
    previewAccentDark: "#7aa2f7",
    previewAccentLight: "#3484e4",
    hasLightVariant: true,
  },
  {
    id: "gruvbox",
    label: "Gruvbox",
    description: "Retro warm colors",
    previewBgDark: "#282828",
    previewBgLight: "#fbf1c7",
    previewCardDark: "rgba(60, 56, 54, 0.72)",
    previewCardLight: "rgba(255, 251, 241, 0.72)",
    previewTextDark: "#ebdbb2",
    previewTextLight: "#282828",
    previewAccentDark: "#fe8019",
    previewAccentLight: "#d79921",
    hasLightVariant: true,
  },
  {
    id: "one-dark",
    label: "One Dark",
    description: "Atom's iconic theme",
    previewBgDark: "#282c34",
    previewBgLight: "#fafafa",
    previewCardDark: "rgba(59, 64, 72, 0.72)",
    previewCardLight: "rgba(255, 255, 255, 0.72)",
    previewTextDark: "#abb2bf",
    previewTextLight: "#383a42",
    previewAccentDark: "#61afef",
    previewAccentLight: "#528bff",
    hasLightVariant: true,
  },
  {
    id: "dracula",
    label: "Dracula",
    description: "Dark purple-tinted",
    previewBgDark: "#282a36",
    previewBgLight: "#f5f5f4",
    previewCardDark: "rgba(68, 71, 90, 0.72)",
    previewCardLight: "rgba(255, 255, 254, 0.72)",
    previewTextDark: "#f8f8f2",
    previewTextLight: "#1c1c1a",
    previewAccentDark: "#bd93f9",
    previewAccentLight: "#bd93f9",
    hasLightVariant: false,
  },
];

const CATPPUCCIN_VARIANTS: { id: CatppuccinVariant; label: string; isDark: boolean }[] = [
  { id: "mocha", label: "Mocha", isDark: true },
  { id: "macchiato", label: "Macchiato", isDark: true },
  { id: "frappe", label: "Frappé", isDark: true },
  { id: "latte", label: "Latte", isDark: false },
];

/* ─── Tab definition ───────────────────────────────────────────────── */

type SettingsTab = "general" | "providers" | "accounts" | "models" | "about";

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
    id: "providers",
    label: "Providers",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
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
  themeFamily: ThemeFamily;
  themeMode: ThemeMode;
  catppuccinVariant: "mocha" | "macchiato" | "frappe" | "latte";
  onSetThemeFamily: (family: ThemeFamily) => void;
  onSetThemeMode: (mode: ThemeMode) => void;
  onSetCatppuccinVariant: (variant: "mocha" | "macchiato" | "frappe" | "latte") => void;
  chatDirectory: string | null;
  onChatDirectoryChange: (dir: string | null) => void;
}

/* ─── Component ────────────────────────────────────────────────────── */

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
            <AccountsTab
              githubAuthStatus={githubAuthStatus}
              onGitHubAuthChange={onGitHubAuthChange}
            />
          )}
          {activeTab === "models" && <ModelSettingsTab onOpenProviders={() => setActiveTab("providers")} />}
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
  themeFamily,
  themeMode,
  catppuccinVariant,
  onSetThemeFamily,
  onSetThemeMode,
  onSetCatppuccinVariant,
  chatDirectory,
  onChatDirectoryChange,
}: {
  themeFamily: ThemeFamily;
  themeMode: ThemeMode;
  catppuccinVariant: "mocha" | "macchiato" | "frappe" | "latte";
  onSetThemeFamily: (family: ThemeFamily) => void;
  onSetThemeMode: (mode: ThemeMode) => void;
  onSetCatppuccinVariant: (variant: "mocha" | "macchiato" | "frappe" | "latte") => void;
  chatDirectory: string | null;
  onChatDirectoryChange: (dir: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const selectedFamily = THEME_FAMILIES.find((f) => f.id === themeFamily) ?? THEME_FAMILIES[0];

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
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Appearance</h2>
        <p className="text-[11px] text-[var(--text-muted)] mb-5">Choose your preferred theme family and mode.</p>

        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Theme Family</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {THEME_FAMILIES.map((family) => (
                <ThemeFamilyCard
                  key={family.id}
                  family={family}
                  isSelected={themeFamily === family.id}
                  onSelect={() => onSetThemeFamily(family.id)}
                  currentMode={themeMode}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Mode</p>
            <div className="flex gap-3">
              <button
                onClick={() => onSetThemeMode("dark")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[11px] font-semibold transition-all duration-200 border ${
                  themeMode === "dark"
                    ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] border-[var(--glass-border-strong)]"
                    : "bg-[var(--glass-bg)] text-[var(--text-primary)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] hover:border-[var(--glass-border-strong)]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                Dark
              </button>
              <button
                onClick={() => onSetThemeMode("light")}
                disabled={!selectedFamily.hasLightVariant}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[11px] font-semibold transition-all duration-200 border ${
                  !selectedFamily.hasLightVariant
                    ? "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] opacity-50 cursor-not-allowed"
                    : themeMode === "light"
                    ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] border-[var(--glass-border-strong)]"
                    : "bg-[var(--glass-bg)] text-[var(--text-primary)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] hover:border-[var(--glass-border-strong)]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Light
              </button>
            </div>
            {!selectedFamily.hasLightVariant && (
              <p className="text-[10px] text-[var(--text-muted)] mt-2 italic">
                {selectedFamily.label} doesn't have an official light variant. Light mode will use the default light theme.
              </p>
            )}
          </div>

          {themeFamily === "catppuccin" && (
            <CatppuccinVariantSelector
              currentMode={themeMode}
              catppuccinVariant={catppuccinVariant}
              onSetThemeMode={onSetThemeMode}
              onSetCatppuccinVariant={onSetCatppuccinVariant}
            />
          )}
        </div>
      </div>

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

function CatppuccinVariantSelector({
  currentMode,
  catppuccinVariant,
  onSetThemeMode,
  onSetCatppuccinVariant,
}: {
  currentMode: ThemeMode;
  catppuccinVariant: "mocha" | "macchiato" | "frappe" | "latte";
  onSetThemeMode: (mode: ThemeMode) => void;
  onSetCatppuccinVariant: (variant: "mocha" | "macchiato" | "frappe" | "latte") => void;
}) {
  const handleVariantChange = (variant: "mocha" | "macchiato" | "frappe" | "latte") => {
    onSetCatppuccinVariant(variant);
    const isDark = variant !== "latte";
    if (isDark && currentMode === "light") {
      onSetThemeMode("dark");
    } else if (!isDark && currentMode === "dark") {
      onSetThemeMode("light");
    }
  };

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Catppuccin Variant</p>
      <div className="flex gap-2">
        {CATPPUCCIN_VARIANTS.map((variant) => (
          <button
            key={variant.id}
            onClick={() => handleVariantChange(variant.id)}
            className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-semibold transition-all duration-200 border ${
              catppuccinVariant === variant.id
                ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] border-[var(--glass-border-strong)]"
                : "bg-[var(--glass-bg)] text-[var(--text-primary)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] hover:border-[var(--glass-border-strong)]"
            }`}
          >
            {variant.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeFamilyCard({
  family,
  isSelected,
  onSelect,
  currentMode,
}: {
  family: ThemeFamilyOption;
  isSelected: boolean;
  onSelect: () => void;
  currentMode: ThemeMode;
}) {
  const isDark = currentMode === "dark";
  const previewBg = isDark ? family.previewBgDark : family.previewBgLight;
  const previewCard = isDark ? family.previewCardDark : family.previewCardLight;
  const previewText = isDark ? family.previewTextDark : family.previewTextLight;
  const previewAccent = isDark ? family.previewAccentDark : family.previewAccentLight;

  return (
    <button
      onClick={onSelect}
      className={`group relative flex flex-col rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
        isSelected
          ? "border-[var(--color-accent)] shadow-[var(--shadow-glow)]"
          : "border-[var(--glass-border-strong)] hover:border-[var(--glass-border-strong)]"
      }`}
    >
      <div className="aspect-[4/3] relative overflow-hidden" style={{ background: previewBg }}>
        <div className="absolute left-0 top-0 bottom-0 w-1/3" style={{ background: previewCard }}>
          <div className="p-2 space-y-1.5">
            <div className="h-1.5 w-4 rounded opacity-40" style={{ background: previewText }} />
            <div className="h-1.5 w-5 rounded opacity-30" style={{ background: previewText }} />
            <div className="h-1.5 w-3 rounded opacity-25" style={{ background: previewText }} />
          </div>
        </div>
        <div className="absolute left-1/3 right-2 top-2 bottom-2 rounded-lg" style={{ background: previewCard, border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="p-2">
            <div className="h-1.5 w-6 rounded mb-1.5" style={{ background: previewAccent, opacity: 0.7 }} />
            <div className="h-1 w-10 rounded opacity-50" style={{ background: previewText }} />
            <div className="h-1 w-8 rounded mt-1 opacity-40" style={{ background: previewText }} />
          </div>
        </div>
        {isSelected && (
          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: previewAccent }}>
            <svg className="w-2.5 h-2.5" fill="none" stroke={isDark ? "#000" : "#fff"} strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {!family.hasLightVariant && (
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-semibold" style={{ background: "rgba(0,0,0,0.5)", color: previewText }}>
            DARK ONLY
          </div>
        )}
      </div>
      <div className="p-2.5" style={{ background: "var(--surface-card)" }}>
        <p className="text-[11px] font-semibold text-[var(--text-primary)] text-left">{family.label}</p>
        <p className="text-[9px] text-[var(--text-muted)] text-left mt-0.5">{family.description}</p>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Providers Tab
   ═══════════════════════════════════════════════════════════════════════ */

const STATUS_META: Record<string, { label: string; color: string; bgColor: string }> = {
  active: { label: "Active", color: "text-emerald-400", bgColor: "bg-emerald-500/15" },
  configured: { label: "Key Only", color: "text-sky-400", bgColor: "bg-sky-500/15" },
  no_key: { label: "No Key", color: "text-amber-400", bgColor: "bg-amber-500/15" },
  inactive: { label: "Inactive", color: "text-[var(--text-muted)]", bgColor: "bg-[var(--glass-bg)]" },
};

function ProvidersTab() {
  const [statuses, setStatuses] = useState<KhadimProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await commands.khadimListProviderStatuses();
      setStatuses(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeProviders = statuses.filter((p) => p.status === "active");
  const configuredProviders = statuses.filter((p) => p.status === "configured");
  const otherProviders = statuses.filter((p) => p.status !== "active" && p.status !== "configured");

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="rounded-2xl glass-card-static p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Providers</h2>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="h-7 w-7 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Overview of all available AI providers and their connection status.
        </p>

        {loading && statuses.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl shimmer" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                {activeProviders.length} active
              </span>
              <span className="h-px flex-1 bg-[var(--glass-border)]" />
              <span className="text-[10px] text-[var(--text-muted)]">
                {statuses.length} total
              </span>
            </div>
            {statuses.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)] py-4 text-center">
                No providers available.
              </p>
            ) : (
              <>
                {activeProviders.length > 0 && (
                  <ProviderGroup label="Active" providers={activeProviders} onRefresh={refresh} />
                )}
                {configuredProviders.length > 0 && (
                  <ProviderGroup label="Key Configured" providers={configuredProviders} onRefresh={refresh} />
                )}
                {otherProviders.length > 0 && (
                  <ProviderGroup label="Available" providers={otherProviders} onRefresh={refresh} />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderGroup({ label, providers, onRefresh }: { label: string; providers: KhadimProviderStatus[]; onRefresh: () => Promise<void> }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">{label}</p>
      <div className="grid grid-cols-1 gap-1.5">
        {providers.map((provider) => (
          <ProviderStatusCard key={provider.id} provider={provider} onRefresh={onRefresh} />
        ))}
      </div>
    </div>
  );
}

function ProviderStatusCard({ provider, onRefresh }: { provider: KhadimProviderStatus; onRefresh: () => Promise<void> }) {
  const meta = STATUS_META[provider.status] ?? STATUS_META.inactive;
  const iconUrl = getProviderIconUrl(provider.id);
  const isMono = isMonochromeProvider(provider.id);
  const isCodexProvider = provider.id === "openai-codex";

  // For OAuth providers like Codex, remap "no_key"/"inactive" to a clearer label
  const effectiveMeta = isCodexProvider && (provider.status === "no_key" || provider.status === "inactive")
    ? { label: "Not Connected", color: "text-[var(--text-muted)]", bgColor: "bg-[var(--glass-bg)]" }
    : isCodexProvider && provider.status === "configured"
    ? { label: "Connected", color: "text-emerald-400", bgColor: "bg-emerald-500/15" }
    : meta;

  const [expanded, setExpanded] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  // Saved key display
  const [savedKeyDisplay, setSavedKeyDisplay] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState(false);

  // Auto-activate toggle: when saving a key, discover and create model configs
  const [autoActivate, setAutoActivate] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<{ created: number; total: number } | null>(null);

  // Model checklist for this provider
  const [providerModels, setProviderModels] = useState<KhadimConfiguredModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [removingModel, setRemovingModel] = useState<string | null>(null);

  // Confirm dialog for removing all provider models
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false);

  // Codex OAuth state
  const [codexConnected, setCodexConnected] = useState(false);
  const [codexConnecting, setCodexConnecting] = useState(false);
  const [codexSession, setCodexSession] = useState<KhadimCodexSession | null>(null);
  const [codexStatus, setCodexStatus] = useState<KhadimCodexStatus | null>(null);
  const [manualCode, setManualCode] = useState("");

  // Whether this provider has a saved (editable) key vs only an env key
  const hasSavedKey = provider.has_api_key && !provider.has_env_key;
  const hasEnvKeyOnly = provider.has_env_key && !hasSavedKey;

  // Load masked key when expanded and provider has a saved key
  useEffect(() => {
    if (!expanded || !provider.has_api_key || isCodexProvider) {
      setSavedKeyDisplay(null);
      setRevealedKey(false);
      return;
    }
    void commands.khadimGetProviderApiKeyMasked(provider.id).then((masked) => {
      setSavedKeyDisplay(masked);
    });
  }, [expanded, provider.has_api_key, provider.id, isCodexProvider]);

  // Check codex connection status on mount / expand
  useEffect(() => {
    if (!isCodexProvider || !expanded) return;
    void commands.khadimCodexAuthConnected().then(setCodexConnected);
  }, [isCodexProvider, expanded]);

  // Poll codex auth session for completion
  useEffect(() => {
    if (!codexSession?.sessionId) return;
    const interval = window.setInterval(() => {
      void commands.khadimCodexAuthStatus(codexSession.sessionId)
        .then(async (status) => {
          setCodexStatus(status);
          if (status.status === "connected") {
            setCodexConnected(true);
            setCodexConnecting(false);
            setCodexSession(null);
            setManualCode("");
            // Auto-discover after OAuth connect
            if (autoActivate) {
              await handleAutoDiscover();
            }
            await onRefresh();
            void loadProviderModels();
          }
          if (status.status === "failed") {
            setCodexConnecting(false);
            setError(status.error ?? "Codex authentication failed");
          }
        })
        .catch(() => {
          setCodexConnecting(false);
        });
    }, 1500);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codexSession?.sessionId]);

  // Load provider's model configs when expanded
  const loadProviderModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const all = await commands.khadimListModelConfigs();
      setProviderModels(all.filter((m) => m.provider === provider.id));
    } finally {
      setLoadingModels(false);
    }
  }, [provider.id]);

  useEffect(() => {
    if (expanded) {
      void loadProviderModels();
    }
  }, [expanded, loadProviderModels]);

  /** Shared auto-discover + bulk-create logic used by both API key save and OAuth connect. */
  async function handleAutoDiscover() {
    setDiscovering(true);
    setDiscoveryResult(null);
    try {
      const discovered = await commands.khadimDiscoverModels(provider.id);
      if (discovered.length > 0) {
        const models = discovered.map((m) => ({ model_id: m.id, model_name: m.name }));
        const created = await commands.khadimBulkCreateProviderModels(provider.id, models);
        setDiscoveryResult({ created, total: discovered.length });
      } else {
        setDiscoveryResult({ created: 0, total: 0 });
      }
    } catch (discoverErr: unknown) {
      const msg = discoverErr && typeof discoverErr === "object" && "message" in discoverErr
        ? (discoverErr as { message: string }).message
        : "Model discovery failed";
      setError(`Connected, but model discovery failed: ${msg}`);
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSave() {
    if (!keyInput.trim()) return;
    setSaving(true);
    setError(null);
    setDiscoveryResult(null);
    try {
      await commands.khadimSaveProviderApiKey(provider.id, keyInput.trim());

      // Auto-activate: discover models and bulk-create configs
      if (autoActivate) {
        setDiscovering(true);
        try {
          const discovered = await commands.khadimDiscoverModels(provider.id, keyInput.trim());
          if (discovered.length > 0) {
            const models = discovered.map((m) => ({ model_id: m.id, model_name: m.name }));
            const created = await commands.khadimBulkCreateProviderModels(provider.id, models);
            setDiscoveryResult({ created, total: discovered.length });
          } else {
            setDiscoveryResult({ created: 0, total: 0 });
          }
        } catch (discoverErr: unknown) {
          const msg = discoverErr && typeof discoverErr === "object" && "message" in discoverErr
            ? (discoverErr as { message: string }).message
            : "Model discovery failed";
          setError(`Key saved, but model discovery failed: ${msg}`);
        } finally {
          setDiscovering(false);
        }
      }

      setKeyInput("");
      await onRefresh();
      void loadProviderModels();
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to save key";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    setDiscoveryResult(null);
    try {
      await commands.khadimDeleteProviderApiKey(provider.id);
      setKeyInput("");
      setConfirmRemoveAll(false);
      await onRefresh();
      void loadProviderModels();
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to delete key";
      setError(msg);
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteKeyAndModels() {
    setDeleting(true);
    setError(null);
    setDiscoveryResult(null);
    try {
      await commands.khadimRemoveProviderModels(provider.id);
      await commands.khadimDeleteProviderApiKey(provider.id);
      setKeyInput("");
      setConfirmRemoveAll(false);
      setExpanded(false);
      await onRefresh();
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to remove";
      setError(msg);
    } finally {
      setDeleting(false);
    }
  }

  async function handleRemoveModel(modelId: string) {
    setRemovingModel(modelId);
    try {
      await commands.khadimDeleteModelConfig(modelId);
      await onRefresh();
      void loadProviderModels();
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to remove model";
      setError(msg);
    } finally {
      setRemovingModel(null);
    }
  }

  function handleCodexConnect() {
    setCodexConnecting(true);
    setError(null);
    void commands.khadimCodexAuthStart().then((session) => {
      setCodexSession(session);
      setCodexStatus({ status: "pending", error: null, authUrl: session.authUrl });
      window.open(session.authUrl, "_blank", "noopener,noreferrer");
    }).catch((err: unknown) => {
      setCodexConnecting(false);
      const msg = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to start Codex auth";
      setError(msg);
    });
  }

  function handleCodexManualComplete() {
    if (!codexSession?.sessionId || !manualCode.trim()) return;
    void commands.khadimCodexAuthComplete(codexSession.sessionId, manualCode.trim()).then(async () => {
      setManualCode("");
      setCodexConnected(true);
      setCodexConnecting(false);
      setCodexSession(null);
      if (autoActivate) {
        await handleAutoDiscover();
      }
      await onRefresh();
      void loadProviderModels();
    }).catch((err: unknown) => {
      const msg = err && typeof err === "object" && "message" in err ? (err as { message: string }).message : "Failed to complete Codex auth";
      setError(msg);
    });
  }

  return (
    <div className="rounded-xl glass-panel transition-all hover:border-[var(--glass-border-strong)]">
      {/* Main row */}
      <div
        className="flex items-center gap-3 px-3.5 py-3 cursor-pointer hover:bg-[var(--surface-card-hover)] rounded-xl transition-colors"
        onClick={() => { setExpanded(!expanded); setError(null); setDiscoveryResult(null); setConfirmRemoveAll(false); }}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            provider.status === "active"
              ? "bg-gradient-to-br from-white/90 to-white/60 shadow-sm"
              : "bg-[var(--glass-bg-strong)]"
          }`}
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              className={`h-4.5 w-4.5 shrink-0 object-contain ${isMono ? "model-icon-mono" : ""}`}
            />
          ) : (
            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)]">
              {provider.name.slice(0, 2)}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{provider.name}</p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
            {provider.configured_models > 0
              ? `${provider.configured_models} model${provider.configured_models > 1 ? "s" : ""} configured`
              : "No models configured"}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {provider.has_api_key && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]" title={provider.has_env_key ? "Key from environment variable" : isCodexProvider ? "OAuth connected" : "Saved API key"}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              {provider.has_env_key && (
                <span className="text-[9px] font-medium text-[var(--text-muted)]">ENV</span>
              )}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${effectiveMeta.bgColor} ${effectiveMeta.color}`}>
            {effectiveMeta.label}
          </span>
          <svg
            className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-3.5 pb-3 pt-0">
          <div className="border-t border-[var(--glass-border)] pt-3 mt-0.5 space-y-3">

            {/* ─── Codex OAuth flow ─── */}
            {isCodexProvider ? (
              <>
                {/* Connection status + connect button */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-[var(--text-primary)]">ChatGPT Plus or Pro</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      Connect your OpenAI Codex subscription via OAuth.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      codexConnected
                        ? "bg-emerald-500/15 text-emerald-400"
                        : codexConnecting
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)]"
                    }`}>
                      {codexConnected ? "Connected" : codexConnecting ? "Waiting..." : "Not connected"}
                    </span>
                    <button
                      type="button"
                      onClick={handleCodexConnect}
                      disabled={codexConnecting}
                      className="h-7 px-3 rounded-lg btn-glass text-[10px] font-semibold disabled:opacity-50"
                    >
                      {codexConnected ? "Reconnect" : codexConnecting ? "Connecting..." : "Connect"}
                    </button>
                  </div>
                </div>

                {/* Auth URL + manual code entry */}
                {(codexSession?.authUrl || codexStatus?.authUrl) && (
                  <div className="space-y-2">
                    <a
                      href={codexSession?.authUrl ?? codexStatus?.authUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex text-[10px] text-[var(--color-accent)] underline underline-offset-2"
                    >
                      Open login page again
                    </a>
                    <div className="flex items-center gap-2">
                      <input
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleCodexManualComplete(); }}
                        className="flex-1 h-8 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] px-3 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/30 transition-colors font-mono"
                        placeholder="Paste the redirect URL or authorization code"
                      />
                      <button
                        type="button"
                        onClick={handleCodexManualComplete}
                        disabled={!codexSession?.sessionId || !manualCode.trim()}
                        className="h-8 px-3 rounded-lg btn-glass text-[10px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Submit code
                      </button>
                    </div>
                    {codexStatus?.error && (
                      <p className="text-[10px] text-[var(--color-danger)]">{codexStatus.error}</p>
                    )}
                  </div>
                )}

                {/* Discovering spinner for codex */}
                {discovering && (
                  <div className="flex items-center gap-2 rounded-lg bg-[var(--glass-bg)] px-3 py-2">
                    <svg className="w-3.5 h-3.5 animate-spin text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="text-[10px] text-[var(--text-secondary)]">Discovering models...</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* ─── Standard API key flow ─── */}

                {/* Info banner for env-only keys */}
                {hasEnvKeyOnly && (
                  <div className="flex items-center gap-2 rounded-lg bg-[var(--glass-bg)] px-3 py-2">
                    <svg className="w-3.5 h-3.5 shrink-0 text-sky-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-[10px] text-[var(--text-secondary)]">
                      This key is provided by an environment variable and cannot be edited here. You can still add a saved key to override it.
                    </span>
                  </div>
                )}

                {/* Current saved key display */}
                {hasSavedKey && savedKeyDisplay && (
                  <div className="flex items-center gap-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] px-3 py-2">
                    <svg className="w-3.5 h-3.5 shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span className="flex-1 text-[10px] font-mono text-[var(--text-primary)] truncate">
                      {savedKeyDisplay}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (revealedKey) {
                          setRevealedKey(false);
                          void commands.khadimGetProviderApiKeyMasked(provider.id).then(setSavedKeyDisplay);
                        } else {
                          void commands.khadimGetProviderApiKey(provider.id).then((key) => {
                            if (key) {
                              setSavedKeyDisplay(key);
                              setRevealedKey(true);
                            }
                          });
                        }
                      }}
                      className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      {revealedKey ? "Hide" : "Reveal"}
                    </button>
                  </div>
                )}

                {/* API key input row */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? "text" : "password"}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
                      placeholder={hasSavedKey ? "Enter new API key to update" : "Enter API key"}
                      className="w-full h-8 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] px-3 pr-8 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/30 transition-colors font-mono"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      title={showKey ? "Hide" : "Show"}
                      type="button"
                    >
                      {showKey ? (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>

                  <button
                    onClick={() => void handleSave()}
                    disabled={saving || discovering || !keyInput.trim()}
                    className="h-8 px-3.5 rounded-lg btn-glass text-[10px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving || discovering ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {discovering ? "Discovering..." : "Saving..."}
                      </span>
                    ) : hasSavedKey ? "Update" : "Save"}
                  </button>

                  {hasSavedKey && (
                    <button
                      onClick={() => {
                        if (provider.configured_models > 0) {
                          setConfirmRemoveAll(true);
                        } else {
                          void handleDelete();
                        }
                      }}
                      disabled={deleting}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg-strong)] transition-colors disabled:opacity-40"
                      title="Delete saved API key"
                    >
                      {deleting ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Auto-activate toggle (shared by both flows) */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={autoActivate}
                onClick={() => setAutoActivate(!autoActivate)}
                className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ${
                  autoActivate
                    ? "bg-[var(--color-accent)]"
                    : "bg-[var(--glass-bg-strong)] border border-[var(--glass-border)]"
                }`}
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    autoActivate ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-[10px] text-[var(--text-secondary)]">
                Activate all known models from this provider on {isCodexProvider ? "connect" : "key save"}
              </span>
            </label>

            {/* Confirm remove all dialog */}
            {confirmRemoveAll && (
              <div className="rounded-lg bg-[var(--color-danger-bg-strong)] border border-[var(--color-danger)]/20 px-3 py-2.5 space-y-2">
                <p className="text-[10px] text-[var(--text-primary)] font-semibold">
                  This provider has {provider.configured_models} model{provider.configured_models > 1 ? "s" : ""} configured.
                </p>
                <p className="text-[10px] text-[var(--text-secondary)]">
                  Do you want to also remove all model configurations for this provider?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleDeleteKeyAndModels()}
                    disabled={deleting}
                    className="h-7 px-3 rounded-lg text-[10px] font-semibold bg-[var(--color-danger)] text-white hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {deleting ? "Removing..." : "Remove key & models"}
                  </button>
                  <button
                    onClick={() => void handleDelete()}
                    disabled={deleting}
                    className="h-7 px-3 rounded-lg btn-glass text-[10px] font-semibold disabled:opacity-50"
                  >
                    Key only
                  </button>
                  <button
                    onClick={() => setConfirmRemoveAll(false)}
                    className="h-7 px-3 rounded-lg text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Discovery result banner */}
            {discoveryResult && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                <svg className="w-3.5 h-3.5 shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-[10px] text-emerald-300">
                  {discoveryResult.created > 0
                    ? `Activated ${discoveryResult.created} model${discoveryResult.created > 1 ? "s" : ""} (${discoveryResult.total} discovered, ${discoveryResult.total - discoveryResult.created} already configured)`
                    : discoveryResult.total === 0
                    ? "No models discovered for this provider"
                    : `All ${discoveryResult.total} models were already configured`}
                </span>
              </div>
            )}

            {/* Error display */}
            {error && (
              <p className="text-[10px] text-[var(--color-danger)]">{error}</p>
            )}

            {/* Model checklist */}
            {providerModels.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Configured Models
                  </p>
                  {providerModels.length > 0 && (
                    <span className="text-[9px] text-[var(--text-muted)]">
                      {providerModels.length} model{providerModels.length > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {loadingModels ? (
                  <div className="space-y-1">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-8 rounded-lg shimmer" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                    {providerModels.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center gap-2 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] px-2.5 py-1.5 group hover:border-[var(--glass-border-strong)] transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium text-[var(--text-primary)] truncate">
                            {model.name}
                          </p>
                          <p className="text-[9px] text-[var(--text-muted)] font-mono truncate">
                            {model.model}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {model.is_default && (
                            <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold text-sky-400 bg-sky-500/15">
                              DEFAULT
                            </span>
                          )}
                          <button
                            onClick={() => void handleRemoveModel(model.id)}
                            disabled={removingModel === model.id}
                            className="h-6 w-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg-strong)] transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                            title="Remove this model configuration"
                          >
                            {removingModel === model.id ? (
                              <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">GitHub</h2>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Connect your GitHub account to enable repository operations.
        </p>
        <GitHubAuthPanel authStatus={githubAuthStatus} onAuthChange={onGitHubAuthChange} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   About Tab
   ═══════════════════════════════════════════════════════════════════════ */

function AboutTab({ runtime }: { runtime: RuntimeSummary | null }) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-3">Khadim Desktop</h2>
        <div className="space-y-2 text-[11px] text-[var(--text-secondary)]">
          {runtime && (
            <>
              <p><span className="text-[var(--text-muted)]">Platform:</span> {runtime.platform ?? "unknown"}</p>
              <p><span className="text-[var(--text-muted)]">Runtime:</span> {runtime.runtime ?? "unknown"}</p>
              <p><span className="text-[var(--text-muted)]">Status:</span> {runtime.status ?? "unknown"}</p>
              <p><span className="text-[var(--text-muted)]">OpenCode:</span> {runtime.opencode_available ? "Available" : "Not available"}</p>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-3">Credits</h2>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          Built with Tauri, React, and Tailwind CSS. Theme families from Catppuccin, Nord, Dracula, Tokyo Night, Gruvbox, and One Dark communities.
        </p>
      </div>
    </div>
  );
}
