import { useCallback, useMemo, useRef, useState } from "react";
import type { CatppuccinVariant, ThemeFamily, ThemeMode } from "../components/settings/types";

const THEME_FAMILY_KEY = "khadim:themeFamily";
const THEME_MODE_KEY = "khadim:themeMode";
const CATPPUCCIN_VARIANT_KEY = "khadim:catppuccinVariant";

function readThemeFamily() {
  return (localStorage.getItem(THEME_FAMILY_KEY) as ThemeFamily) ?? "default";
}

function readThemeMode() {
  return (localStorage.getItem(THEME_MODE_KEY) as ThemeMode) ?? "light";
}

function readCatppuccinVariant() {
  return (localStorage.getItem(CATPPUCCIN_VARIANT_KEY) as CatppuccinVariant) ?? "mocha";
}

function readPreviousDarkVariant() {
  const stored = localStorage.getItem(CATPPUCCIN_VARIANT_KEY) ?? "mocha";
  if (stored === "mocha" || stored === "macchiato" || stored === "frappe") {
    return stored;
  }
  return "mocha";
}

export function useThemePreferences() {
  const [themeFamily, setThemeFamily] = useState<ThemeFamily>(() => readThemeFamily());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode());
  const [catppuccinVariant, setCatppuccinVariant] = useState<CatppuccinVariant>(() => readCatppuccinVariant());
  const prevDarkCatppuccinVariant = useRef<"mocha" | "macchiato" | "frappe">(readPreviousDarkVariant());

  const handleSetThemeFamily = useCallback((next: ThemeFamily) => {
    setThemeFamily(next);
    localStorage.setItem(THEME_FAMILY_KEY, next);
  }, []);

  const handleSetThemeMode = useCallback((next: ThemeMode) => {
    setThemeMode(next);
    localStorage.setItem(THEME_MODE_KEY, next);
    setThemeFamily((currentFamily) => {
      if (currentFamily === "catppuccin") {
        if (next === "light") {
          setCatppuccinVariant((prev) => {
            if (prev !== "latte") {
              prevDarkCatppuccinVariant.current = prev;
            }
            localStorage.setItem(CATPPUCCIN_VARIANT_KEY, "latte");
            return "latte";
          });
        } else {
          const restored = prevDarkCatppuccinVariant.current;
          setCatppuccinVariant(restored);
          localStorage.setItem(CATPPUCCIN_VARIANT_KEY, restored);
        }
      }
      return currentFamily;
    });
  }, []);

  const handleSetCatppuccinVariant = useCallback((next: CatppuccinVariant) => {
    setCatppuccinVariant(next);
    localStorage.setItem(CATPPUCCIN_VARIANT_KEY, next);
  }, []);

  const handleToggleTheme = useCallback(() => {
    handleSetThemeMode(themeMode === "dark" ? "light" : "dark");
  }, [handleSetThemeMode, themeMode]);

  const themeVariant = useMemo(() => {
    if (themeFamily === "catppuccin") {
      return catppuccinVariant;
    }
    return themeMode;
  }, [catppuccinVariant, themeFamily, themeMode]);

  return {
    themeFamily,
    themeMode,
    catppuccinVariant,
    themeVariant,
    handleSetThemeFamily,
    handleSetThemeMode,
    handleSetCatppuccinVariant,
    handleToggleTheme,
  };
}
