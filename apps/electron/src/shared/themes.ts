export type ThemeAppearance = "light" | "dark";

export interface ThemePalette {
  background: string;
  surface: string;
  elevated: string;
  text: string;
  muted: string;
  accent: string;
}

export interface CustomTheme {
  id: `custom:${string}`;
  name: string;
  appearance: ThemeAppearance;
  palette: ThemePalette;
}

export type BuiltInThemeId = "light" | "dark" | "system" | "aura" | "catppuccin-latte" | "catppuccin-frappe" | "catppuccin-macchiato" | "catppuccin-mocha";
export type ThemeMode = BuiltInThemeId | `custom:${string}`;

export interface BuiltInTheme {
  id: BuiltInThemeId;
  name: string;
  description: string;
  appearance?: ThemeAppearance;
  palette?: ThemePalette;
  family: "Khadim" | "Aura" | "Catppuccin";
}

export const BUILT_IN_THEMES: readonly BuiltInTheme[] = [
  { id: "aura", name: "Aura", description: "Vivid purple on deep ink", appearance: "dark", family: "Aura", palette: { background: "#110f18", surface: "#15141b", elevated: "#21202e", text: "#edecee", muted: "#bdbdbd", accent: "#a277ff" } },
  { id: "dark", name: "Khadim Dark", description: "Quiet and low contrast", appearance: "dark", family: "Khadim", palette: { background: "#1a191d", surface: "#222125", elevated: "#2a292e", text: "#efeff0", muted: "#aaa8ad", accent: "#4f9cf9" } },
  { id: "light", name: "Khadim Light", description: "Bright and warm", appearance: "light", family: "Khadim", palette: { background: "#faf9f7", surface: "#f7f6f3", elevated: "#ffffff", text: "#27262a", muted: "#69666d", accent: "#2878d0" } },
  { id: "system", name: "System", description: "Follow this device", family: "Khadim" },
  { id: "catppuccin-latte", name: "Latte", description: "Soft, warm daylight", appearance: "light", family: "Catppuccin", palette: { background: "#dce0e8", surface: "#eff1f5", elevated: "#ffffff", text: "#4c4f69", muted: "#6c6f85", accent: "#8839ef" } },
  { id: "catppuccin-frappe", name: "Frappé", description: "Cool muted pastels", appearance: "dark", family: "Catppuccin", palette: { background: "#232634", surface: "#303446", elevated: "#414559", text: "#c6d0f5", muted: "#a5adce", accent: "#ca9ee6" } },
  { id: "catppuccin-macchiato", name: "Macchiato", description: "Balanced dusky pastels", appearance: "dark", family: "Catppuccin", palette: { background: "#181926", surface: "#24273a", elevated: "#363a4f", text: "#cad3f5", muted: "#a5adcb", accent: "#c6a0f6" } },
  { id: "catppuccin-mocha", name: "Mocha", description: "Rich, soothing pastels", appearance: "dark", family: "Catppuccin", palette: { background: "#11111b", surface: "#1e1e2e", elevated: "#313244", text: "#cdd6f4", muted: "#a6adc8", accent: "#cba6f7" } },
] as const;

export const BUILT_IN_THEME_IDS = new Set<string>(BUILT_IN_THEMES.map((theme) => theme.id));

export function findBuiltInTheme(id: string): BuiltInTheme | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === id);
}
