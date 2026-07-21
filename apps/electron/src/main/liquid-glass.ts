import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";

type LiquidGlassModule = {
  default: {
    addView: (handle: Buffer, options?: {
      cornerRadius?: number;
      tintColor?: string;
      opaque?: boolean;
    }) => number;
  };
};

export function liquidGlassWindowOptions(platform: NodeJS.Platform = process.platform): Pick<BrowserWindowConstructorOptions, "transparent" | "backgroundColor"> {
  return platform === "darwin"
    ? { transparent: true, backgroundColor: "#00000000" }
    : { transparent: false, backgroundColor: "#1a1c20" };
}

export async function installLiquidGlass(window: BrowserWindow, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  if (platform !== "darwin" || window.isDestroyed()) return false;

  try {
    const liquidGlass = (await import("electron-liquid-glass") as LiquidGlassModule).default;
    if (window.isDestroyed()) return false;
    liquidGlass.addView(window.getNativeWindowHandle(), {
      cornerRadius: 0,
      tintColor: "#10141a66",
      opaque: false,
    });
    return true;
  } catch (error) {
    console.warn("Native liquid glass is unavailable; using solid macOS surfaces.", error);
    return false;
  }
}
