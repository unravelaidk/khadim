/**
 * Typed wrapper around window.__khadim for the calendar plugin.
 * The host injects __khadim before any plugin scripts run.
 */

import type { CalEvent, KhadimPluginApi } from "./types";

export const PLUGIN_ID = "calendar";
const EVENTS_KEY = "events";

function khadim(): KhadimPluginApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__khadim(PLUGIN_ID);
}

export async function loadEvents(): Promise<CalEvent[]> {
  const raw = await khadim().store.get(EVENTS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as CalEvent[];
  } catch {
    return [];
  }
}

export async function saveEvents(events: CalEvent[]): Promise<void> {
  await khadim().store.set(EVENTS_KEY, JSON.stringify(events));
}

export function nextId(): string {
  return `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function onCalendarUpdated(handler: () => void): () => void {
  return khadim().events.on("calendar_updated", handler);
}
