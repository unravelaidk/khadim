import { useState, useEffect, useCallback, useRef } from "react";
import type { PomodoroTask, TimerState } from "./types";
import {
  loadTasks, saveTasks, loadTimer, saveTimer,
  nextId as makeId, onPomodoroUpdated, onTimerEvent, DEFAULT_TIMER,
} from "./api";

// ── Tasks hook ────────────────────────────────────────────────────────

export function useTasks() {
  const [tasks, setTasks] = useState<PomodoroTask[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await loadTasks();
    setTasks(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = onPomodoroUpdated(refresh);
    return unlisten;
  }, [refresh]);

  const addTask = useCallback(async (task: Omit<PomodoroTask, "id" | "elapsed_seconds" | "completed" | "pomodoros_done">) => {
    const newTask: PomodoroTask = {
      id: makeId(), ...task,
      elapsed_seconds: 0, completed: false, pomodoros_done: 0,
    };
    const updated = [...tasks, newTask];
    await saveTasks(updated);
    setTasks(updated);
    return newTask;
  }, [tasks]);

  const deleteTask = useCallback(async (id: string) => {
    const updated = tasks.filter((t) => t.id !== id);
    await saveTasks(updated);
    setTasks(updated);
  }, [tasks]);

  const completeTask = useCallback(async (id: string) => {
    const updated = tasks.map((t) => t.id === id ? { ...t, completed: true } : t);
    await saveTasks(updated);
    setTasks(updated);
  }, [tasks]);

  const updateTask = useCallback(async (id: string, patch: Partial<PomodoroTask>) => {
    const updated = tasks.map((t) => t.id === id ? { ...t, ...patch } : t);
    await saveTasks(updated);
    setTasks(updated);
  }, [tasks]);

  return { tasks, loading, refresh, addTask, deleteTask, completeTask, updateTask };
}

// ── Timer hook ────────────────────────────────────────────────────────

export function useTimer() {
  const [timer, setTimer] = useState<TimerState>(DEFAULT_TIMER);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef(timer);
  timerRef.current = timer;

  // Load initial timer state
  useEffect(() => {
    loadTimer().then(setTimer);
  }, []);

  // Listen for agent-triggered timer events
  useEffect(() => {
    const unlisten = onTimerEvent((data) => {
      try {
        const newState = JSON.parse(data) as TimerState;
        setTimer(newState);
      } catch { /* ignore */ }
    });
    return unlisten;
  }, []);

  // Tick the timer
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (timer.status === "running" || timer.status === "break") {
      intervalRef.current = setInterval(() => {
        setTimer((prev) => {
          if (prev.remaining_seconds <= 1) {
            // Session or break ended
            const next: TimerState = prev.status === "running"
              ? { ...prev, status: "break", remaining_seconds: prev.break_minutes * 60 }
              : { ...prev, status: "idle", remaining_seconds: 0 };

            // If a focus session just ended, increment pomodoros
            if (prev.status === "running" && prev.task_id) {
              incrementPomodoro(prev.task_id, prev.session_minutes);
            }

            saveTimer(next);
            return next;
          }
          return { ...prev, remaining_seconds: prev.remaining_seconds - 1 };
        });
      }, 1000);
    }

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timer.status]);

  const start = useCallback(async (taskId: string, sessionMinutes = 25, breakMinutes = 5) => {
    const next: TimerState = {
      status: "running",
      task_id: taskId,
      remaining_seconds: sessionMinutes * 60,
      session_minutes: sessionMinutes,
      break_minutes: breakMinutes,
    };
    await saveTimer(next);
    setTimer(next);
  }, []);

  const pause = useCallback(async () => {
    const next = { ...timerRef.current, status: "paused" as const };
    await saveTimer(next);
    setTimer(next);
  }, []);

  const resume = useCallback(async () => {
    const next = { ...timerRef.current, status: "running" as const };
    await saveTimer(next);
    setTimer(next);
  }, []);

  const stop = useCallback(async () => {
    const next: TimerState = { ...DEFAULT_TIMER };
    await saveTimer(next);
    setTimer(next);
  }, []);

  const skipBreak = useCallback(async () => {
    const next: TimerState = { ...DEFAULT_TIMER };
    await saveTimer(next);
    setTimer(next);
  }, []);

  return { timer, start, pause, resume, stop, skipBreak };
}

async function incrementPomodoro(taskId: string, sessionMinutes: number) {
  const tasks = await loadTasks();
  const updated = tasks.map((t) =>
    t.id === taskId
      ? { ...t, pomodoros_done: t.pomodoros_done + 1, elapsed_seconds: t.elapsed_seconds + sessionMinutes * 60 }
      : t
  );
  await saveTasks(updated);
}

// ── Formatting ────────────────────────────────────────────────────────

export function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function progressPercent(task: PomodoroTask): number {
  if (task.estimated_minutes <= 0) return 0;
  return Math.min(100, Math.round((task.elapsed_seconds / (task.estimated_minutes * 60)) * 100));
}
