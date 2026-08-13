// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_THEMES } from "../../../src/shared/themes";
import { applyDocumentTheme } from "../../../src/renderer/src/theme/document-theme";

function contrastRatio(left: string, right: string): number {
  const luminance = (value: string): number => {
    const hex = value.replace("#", "");
    const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const leftLuminance = luminance(left);
  const rightLuminance = luminance(right);
  return (Math.max(leftLuminance, rightLuminance) + 0.05) / (Math.min(leftLuminance, rightLuminance) + 0.05);
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => {
  document.documentElement.removeAttribute("style");
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeId;
  vi.unstubAllGlobals();
});

describe("applyDocumentTheme", () => {
  it.each(BUILT_IN_THEMES.map((theme) => [theme.id, theme.appearance] as const))(
    "applies the %s theme without losing the chat token contract",
    (themeId, appearance) => {
      applyDocumentTheme(themeId, [], true);

      expect(document.documentElement.dataset.themeId).toBe(themeId);
      expect(document.documentElement.dataset.theme).toBe(themeId === "system" ? "dark" : appearance);
      if (themeId !== "system") {
        expect(document.documentElement.style.getPropertyValue("--surface-raised")).not.toBe("");
        expect(document.documentElement.style.getPropertyValue("--line-strong")).not.toBe("");
        expect(document.documentElement.style.getPropertyValue("--accent-content")).not.toBe("");
        if (appearance === "light") expect(document.documentElement.style.getPropertyValue("--code-bg")).toBe("#111318");
      }
    },
  );

  it("repairs unreadable custom text and accent foregrounds", () => {
    applyDocumentTheme("custom:whiteout", [{
      id: "custom:whiteout",
      name: "Whiteout",
      appearance: "light",
      palette: {
        background: "#ffffff",
        surface: "#ffffff",
        elevated: "#ffffff",
        text: "#ffffff",
        muted: "#ffffff",
        accent: "#ffffff",
      },
    }]);

    expect(document.documentElement.style.getPropertyValue("--text")).toBe("#111318");
    expect(document.documentElement.style.getPropertyValue("--text-2")).toBe("#111318");
    expect(document.documentElement.style.getPropertyValue("--blue")).toBe("#111318");
    expect(document.documentElement.style.getPropertyValue("--accent-content")).toBe("#ffffff");
  });

  it.each(BUILT_IN_THEMES.filter((theme) => theme.palette).map((theme) => [theme.id, theme.palette!] as const))(
    "keeps the %s accent visible across chat surfaces",
    (themeId, palette) => {
      applyDocumentTheme(themeId);
      const accent = document.documentElement.style.getPropertyValue("--blue");

      for (const background of [palette.background, palette.surface, palette.elevated]) {
        expect(contrastRatio(accent, background)).toBeGreaterThanOrEqual(3);
      }
    },
  );
});
