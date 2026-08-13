import type { CustomTheme, ThemeMode, ThemePalette } from "../../../shared/types";
import { findBuiltInTheme } from "../../../shared/themes";

const themeTokenProperties = ["--shell", "--surface", "--surface-raised", "--surface-hover", "--line", "--line-strong", "--text", "--text-2", "--text-3", "--blue", "--accent-content", "--chrome", "--search-bg", "--code-bg", "--choice-active", "--artifact-panel", "--artifact-panel-hover", "--artifact-rule", "--artifact-muted", "--artifact-matte", "--artifact-draft-bg", "--artifact-draft-ink"] as const;

function rgbChannels(value: string): [number, number, number] | null {
  const normalized = value.trim().replace(/^#/, "");
  const expanded = normalized.length === 3 ? normalized.split("").map((channel) => channel + channel).join("") : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function luminance(value: string): number | null {
  const channels = rgbChannels(value);
  if (!channels) return null;
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return 0;
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function readableForeground(preferred: string, backgrounds: string[], fallback?: string): string {
  if (backgrounds.every((background) => contrast(preferred, background) >= 4.5)) return preferred;
  if (fallback && backgrounds.every((background) => contrast(fallback, background) >= 4.5)) return fallback;
  const candidates = ["#111318", "#ffffff"];
  return candidates.sort((left, right) => Math.min(...backgrounds.map((background) => contrast(right, background))) - Math.min(...backgrounds.map((background) => contrast(left, background))))[0];
}

function readableSignal(preferred: string, backgrounds: string[]): string {
  if (backgrounds.every((background) => contrast(preferred, background) >= 3)) return preferred;
  return ["#111318", "#ffffff"].sort((left, right) => Math.min(...backgrounds.map((background) => contrast(right, background))) - Math.min(...backgrounds.map((background) => contrast(left, background))))[0];
}

function applyThemePalette(palette?: ThemePalette): void {
  const style = document.documentElement.style;
  for (const property of themeTokenProperties) style.removeProperty(property);
  style.removeProperty("color");
  style.removeProperty("background-color");
  if (!palette) return;
  const mix = (left: string, amount: number, right: string) => `color-mix(in oklch, ${left} ${amount}%, ${right})`;
  const text = readableForeground(palette.text, [palette.surface, palette.elevated]);
  const muted = readableForeground(palette.muted, [palette.surface, palette.elevated], text);
  const accent = readableSignal(palette.accent, [palette.background, palette.surface, palette.elevated]);
  const accentContent = readableForeground("#ffffff", [accent], "#111318");
  const codeBackground = (luminance(palette.background) ?? 0) > 0.45 ? "#111318" : palette.background;
  const values: Record<(typeof themeTokenProperties)[number], string> = {
    "--shell": palette.background,
    "--surface": palette.surface,
    "--surface-raised": palette.elevated,
    "--surface-hover": mix(palette.elevated, 82, palette.text),
    "--line": mix(palette.muted, 32, "transparent"),
    "--line-strong": mix(muted, 56, "transparent"),
    "--text": text,
    "--text-2": muted,
    "--text-3": mix(muted, 88, text),
    "--blue": accent,
    "--accent-content": accentContent,
    "--chrome": mix(palette.background, 72, palette.surface),
    "--search-bg": palette.elevated,
    "--code-bg": codeBackground,
    "--choice-active": mix(accent, 18, palette.surface),
    "--artifact-panel": palette.elevated,
    "--artifact-panel-hover": mix(palette.elevated, 84, palette.text),
    "--artifact-rule": mix(palette.muted, 36, palette.background),
    "--artifact-muted": palette.muted,
    "--artifact-matte": palette.background,
    "--artifact-draft-bg": mix(accent, 18, palette.surface),
    "--artifact-draft-ink": accent,
  };
  for (const [property, value] of Object.entries(values)) style.setProperty(property, value);
  style.color = text;
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
