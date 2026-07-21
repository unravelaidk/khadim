import { describe, expect, it, vi } from "vitest";
import { installLiquidGlass, liquidGlassWindowOptions } from "../../../src/main/liquid-glass";

describe("liquid glass integration", () => {
  it("uses a transparent native window only on macOS", () => {
    expect(liquidGlassWindowOptions("darwin")).toEqual({
      transparent: true,
      backgroundColor: "#00000000",
    });
    expect(liquidGlassWindowOptions("linux")).toEqual({
      transparent: false,
      backgroundColor: "#1a1c20",
    });
    expect(liquidGlassWindowOptions("win32")).toEqual({
      transparent: false,
      backgroundColor: "#1a1c20",
    });
  });

  it("does not load the native module on unsupported platforms", async () => {
    const window = { isDestroyed: vi.fn(() => false) };

    await expect(installLiquidGlass(window as never, "linux")).resolves.toBe(false);
    expect(window.isDestroyed).not.toHaveBeenCalled();
  });

  it("does not load the native module for a destroyed macOS window", async () => {
    const window = { isDestroyed: vi.fn(() => true) };

    await expect(installLiquidGlass(window as never, "darwin")).resolves.toBe(false);
    expect(window.isDestroyed).toHaveBeenCalledOnce();
  });
});
