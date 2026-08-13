import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/renderer/src/chat/sound-engine", () => ({
  playSound: vi.fn(async () => ({ stop: vi.fn() })),
}));

import { playSound } from "../../../src/renderer/src/chat/sound-engine";
import { playInterfaceSound } from "../../../src/renderer/src/chat/interface-sounds";

describe("playInterfaceSound", () => {
  beforeEach(() => {
    vi.mocked(playSound).mockClear();
  });

  it("does nothing when the sound mood is off", () => {
    playInterfaceSound("complete", "off");
    expect(playSound).not.toHaveBeenCalled();
  });

  it("uses distinct local SoundCN assets with restrained subtle volume", () => {
    for (const cue of ["send", "attention", "complete", "error"] as const) playInterfaceSound(cue, "subtle");

    expect(playSound).toHaveBeenCalledTimes(4);
    expect(new Set(vi.mocked(playSound).mock.calls.map(([dataUri]) => dataUri)).size).toBe(4);
    for (const [, options] of vi.mocked(playSound).mock.calls) {
      expect(options?.volume).toBeGreaterThan(0);
      expect(options?.volume).toBeLessThanOrEqual(0.2);
    }
  });

  it("makes expressive cues more present without changing their semantics", () => {
    playInterfaceSound("complete", "subtle");
    playInterfaceSound("complete", "expressive");

    expect(vi.mocked(playSound).mock.calls[1][0]).toBe(vi.mocked(playSound).mock.calls[0][0]);
    expect(vi.mocked(playSound).mock.calls[1][1]?.volume).toBeGreaterThan(vi.mocked(playSound).mock.calls[0][1]?.volume ?? 1);
  });
});
