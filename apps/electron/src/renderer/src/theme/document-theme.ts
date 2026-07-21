import type { CustomTheme, ThemeMode, ThemePalette } from "../../../shared/types";
import { findBuiltInTheme } from "../../../shared/themes";

const themeTokenProperties = ["--shell", "--surface", "--surface-raised", "--surface-hover", "--line", "--text", "--text-2", "--text-3", "--blue", "--chrome", "--search-bg", "--code-bg", "--choice-active", "--artifact-panel", "--artifact-panel-hover", "--artifact-rule", "--artifact-muted", "--artifact-matte", "--artifact-draft-bg", "--artifact-draft-ink"] as const;

function applyThemePalette(palette?: ThemePalette): void {
  const style = document.documentElement.style;
  for (const property of themeTokenProperties) style.removeProperty(property);
  style.removeProperty("color");
  style.removeProperty("background-color");
  if (!palette) return;
  const mix = (left: string, amount: number, right: string) => `color-mix(in oklch, ${left} ${amount}%, ${right})`;
  const values: Record<(typeof themeTokenProperties)[number], string> = {
    "--shell": palette.background,
    "--surface": palette.surface,
    "--surface-raised": palette.elevated,
    "--surface-hover": mix(palette.elevated, 82, palette.text),
    "--line": mix(palette.muted, 32, "transparent"),
    "--text": palette.text,
    "--text-2": palette.muted,
    "--text-3": mix(palette.muted, 78, palette.background),
    "--blue": palette.accent,
    "--chrome": mix(palette.background, 72, palette.surface),
    "--search-bg": palette.elevated,
    "--code-bg": palette.background,
    "--choice-active": mix(palette.accent, 18, palette.surface),
    "--artifact-panel": palette.elevated,
    "--artifact-panel-hover": mix(palette.elevated, 84, palette.text),
    "--artifact-rule": mix(palette.muted, 36, palette.background),
    "--artifact-muted": palette.muted,
    "--artifact-matte": palette.background,
    "--artifact-draft-bg": mix(palette.accent, 18, palette.surface),
    "--artifact-draft-ink": palette.accent,
  };
  for (const [property, value] of Object.entries(values)) style.setProperty(property, value);
  style.color = palette.text;
  style.backgroundColor = palette.background;
}

export function applyDocumentTheme(themeId: ThemeMode, customThemes: CustomTheme[] = [], prefersDark = false): void {
  const builtIn = findBuiltInTheme(themeId);
  const custom = customThemes.find((theme) => theme.id === themeId);
  const resolved = themeId === "system" ? (prefersDark ? "dark" : "light") : builtIn?.appearance ?? custom?.appearance ?? "dark";
  const palette = themeId === "system" ? undefined : builtIn?.palette ?? custom?.palette;
  const shouldAnimate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    && document.documentElement.dataset.theme
    && (document.documentElement.dataset.theme !== resolved || document.documentElement.dataset.themeId !== themeId);
  if (shouldAnimate) document.documentElement.classList.add("theme-changing");
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeId = themeId;
  applyThemePalette(palette);
  document.documentElement.style.colorScheme = resolved;
  if (shouldAnimate) window.setTimeout(() => document.documentElement.classList.remove("theme-changing"), 180);
}
