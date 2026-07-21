import { describe, expect, it, vi } from "vitest";
import { handleWindowClose } from "../../../src/main/window-close-policy";

describe("window close policy", () => {
  it("turns the first window close into an application quit request", () => {
    const preventDefault = vi.fn();
    const requestQuit = vi.fn();

    handleWindowClose({ preventDefault }, false, requestQuit);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(requestQuit).toHaveBeenCalledOnce();
  });

  it("allows the window to close once shutdown is in progress", () => {
    const preventDefault = vi.fn();
    const requestQuit = vi.fn();

    handleWindowClose({ preventDefault }, true, requestQuit);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(requestQuit).not.toHaveBeenCalled();
  });
});
