import type { GitHubAuthStatus, RuntimeSummary } from "../../lib/bindings";

export type ThemeFamily = "default" | "catppuccin" | "nord" | "tokyo-night" | "gruvbox" | "one-dark" | "dracula";
export type ThemeMode = "dark" | "light";
export type CatppuccinVariant = "mocha" | "macchiato" | "frappe" | "latte";

export type SettingsTab = "general" | "providers" | "accounts" | "models" | "plugins" | "skills" | "about";

export interface ThemeFamilyOption {
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

export interface SettingsPanelProps {
  onClose: () => void;
  runtime: RuntimeSummary | null;
  githubAuthStatus: GitHubAuthStatus | null;
  onGitHubAuthChange: (status: GitHubAuthStatus) => void;
  themeFamily: ThemeFamily;
  themeMode: ThemeMode;
  catppuccinVariant: CatppuccinVariant;
  onSetThemeFamily: (family: ThemeFamily) => void;
  onSetThemeMode: (mode: ThemeMode) => void;
  onSetCatppuccinVariant: (variant: CatppuccinVariant) => void;
  chatDirectory: string | null;
  onChatDirectoryChange: (dir: string | null) => void;
}

export interface GeneralTabProps {
  themeFamily: ThemeFamily;
  themeMode: ThemeMode;
  catppuccinVariant: CatppuccinVariant;
  onSetThemeFamily: (family: ThemeFamily) => void;
  onSetThemeMode: (mode: ThemeMode) => void;
  onSetCatppuccinVariant: (variant: CatppuccinVariant) => void;
  chatDirectory: string | null;
  onChatDirectoryChange: (dir: string | null) => void;
}
