import { useState } from "react";
import type { GitHubAuthStatus, RuntimeSummary } from "../lib/bindings";
import { commands } from "../lib/bindings";
import { GitHubAuthPanel } from "./GitHubAuthPanel";
import { ModelSettingsTab } from "./ModelSettingsTab";

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
          {activeTab === "accounts" && (
            <AccountsTab
              githubAuthStatus={githubAuthStatus}
              onGitHubAuthChange={onGitHubAuthChange}
            />
          )}
          {activeTab === "models" && <ModelSettingsTab />}
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