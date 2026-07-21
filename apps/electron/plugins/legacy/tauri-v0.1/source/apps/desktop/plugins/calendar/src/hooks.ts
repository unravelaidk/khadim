import { useState, useEffect, useCallback } from "react";
import type { CalEvent } from "./types";
import { loadEvents, saveEvents, nextId as makeId, onCalendarUpdated } from "./api";

/** Load and keep events in sync with agent tool mutations. */
export function useEvents() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await loadEvents();
    setEvents(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // Re-fetch whenever the WASM tools mutate via host-ui::emit-event
    const unlisten = onCalendarUpdated(refresh);
    return unlisten;
  }, [refresh]);

  const addEvent = useCallback(
    async (ev: Omit<CalEvent, "id">) => {
      const newEvent: CalEvent = { id: makeId(), ...ev };
      const updated = [...events, newEvent];
      await saveEvents(updated);
      setEvents(updated);
    },
    [events]
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      const updated = events.filter((e) => e.id !== id);
      await saveEvents(updated);
      setEvents(updated);
    },
    [events]
  );

  return { events, loading, refresh, addEvent, deleteEvent };
}

/** Format an ISO datetime for display. */
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function isSameDay(isoA: string, isoB: string): boolean {
  return isoA?.slice(0, 10) === isoB?.slice(0, 10);
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
