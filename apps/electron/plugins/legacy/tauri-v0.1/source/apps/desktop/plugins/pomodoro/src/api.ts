import type { PomodoroTask, TimerState, KhadimPluginApi } from "./types";

export const PLUGIN_ID = "pomodoro";
const TASKS_KEY = "tasks";
const TIMER_KEY = "timer";

function khadim(): KhadimPluginApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).__khadim(PLUGIN_ID);
}

export const DEFAULT_TIMER: TimerState = {
  status: "idle",
  task_id: "",
  remaining_seconds: 0,
  session_minutes: 25,
  break_minutes: 5,
};

export async function loadTasks(): Promise<PomodoroTask[]> {
  const raw = await khadim().store.get(TASKS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as PomodoroTask[]; }
  catch { return []; }
}

export async function saveTasks(tasks: PomodoroTask[]): Promise<void> {
  await khadim().store.set(TASKS_KEY, JSON.stringify(tasks));
}

export async function loadTimer(): Promise<TimerState> {
  const raw = await khadim().store.get(TIMER_KEY);
  if (!raw) return DEFAULT_TIMER;
  try { return JSON.parse(raw) as TimerState; }
  catch { return DEFAULT_TIMER; }
}

export async function saveTimer(timer: TimerState): Promise<void> {
  await khadim().store.set(TIMER_KEY, JSON.stringify(timer));
}

export function nextId(): string {
  return `task_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function onPomodoroUpdated(handler: () => void): () => void {
  return khadim().events.on("pomodoro_updated", handler);
}

export function onTimerEvent(handler: (data: string) => void): () => void {
  return khadim().events.on("pomodoro_timer", handler);
}
