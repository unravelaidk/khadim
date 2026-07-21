import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Shared browser shims for renderer integration and workflow tests.

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  if (typeof document.elementsFromPoint !== "function") {
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => []),
    });
  }
}
