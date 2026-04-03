import { describe, it, expect, vi } from "vitest";
import { decoratePromptWithBadges } from "../../app/lib/badges";

describe("decoratePromptWithBadges", () => {
  it("returns original prompt when no badges", () => {
    const result = decoratePromptWithBadges("Hello world");
    expect(result.prompt).toBe("Hello world");
    expect(result.hasPremadeBadge).toBe(false);
    expect(result.hasCategoryBadge).toBe(false);
  });

  it("annotates prompt and flags badges", () => {
    const badgesJson = JSON.stringify([
      { label: "Auth", isPremade: true },
      { label: "Analytics", isPremade: false },
    ]);

    const result = decoratePromptWithBadges("Build something", badgesJson);

    expect(result.prompt.startsWith("[User Context/Selected Features: Auth, Analytics]")).toBe(true);
    expect(result.hasPremadeBadge).toBe(true);
    expect(result.hasCategoryBadge).toBe(true);
  });

  it("is resilient to malformed JSON", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = decoratePromptWithBadges("Hi", "{invalid json}");
    expect(result.prompt).toBe("Hi");
    expect(result.hasPremadeBadge).toBe(false);
    expect(result.hasCategoryBadge).toBe(false);
    consoleSpy.mockRestore();
  });
});
