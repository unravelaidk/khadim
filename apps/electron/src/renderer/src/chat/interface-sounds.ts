import { playSound } from "./sound-engine";
import { clickSoftSound } from "./sound-click-soft";
import { errorBuzzSound } from "./sound-error-buzz";
import { notificationPopSound } from "./sound-notification-pop";
import { successChimeSound } from "./sound-success-chime";
import type { SoundAsset } from "./sound-types";
import type { SoundMood } from "../../../shared/types";

export type InterfaceSound = "send" | "attention" | "complete" | "error";

const cues: Record<InterfaceSound, { sound: SoundAsset; subtleVolume: number; expressiveVolume: number }> = {
  send: { sound: clickSoftSound, subtleVolume: 0.12, expressiveVolume: 0.22 },
  attention: { sound: notificationPopSound, subtleVolume: 0.2, expressiveVolume: 0.34 },
  complete: { sound: successChimeSound, subtleVolume: 0.17, expressiveVolume: 0.32 },
  error: { sound: errorBuzzSound, subtleVolume: 0.15, expressiveVolume: 0.28 },
};

/**
 * Plays a deliberately small set of semantic SoundCN cues. Tool steps and
 * ambient agent work stay silent so long runs never become noisy.
 */
export function playInterfaceSound(cue: InterfaceSound, mood: SoundMood): void {
  if (mood === "off") return;
  const definition = cues[cue];
  const volume = mood === "expressive" ? definition.expressiveVolume : definition.subtleVolume;
  void playSound(definition.sound.dataUri, { volume }).catch(() => {
    // Audio feedback is optional and must never interrupt the primary action.
  });
}
