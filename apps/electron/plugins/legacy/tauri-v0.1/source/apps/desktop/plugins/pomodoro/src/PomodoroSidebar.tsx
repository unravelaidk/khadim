import { useState } from "react";
import { useTasks, useTimer, fmtTime, fmtEstimate, progressPercent } from "./hooks";
import type { PomodoroTask } from "./types";
import { AddTaskModal } from "./AddTaskModal";

// ── Mini Timer ────────────────────────────────────────────────────────

function MiniTimer() {
  const { timer, pause, resume, stop, skipBreak, start } = useTimer();
  const { tasks } = useTasks();

  const isActive = timer.status !== "idle";
  const task = timer.task_id ? tasks.find((t) => t.id === timer.task_id) : null;

  const isRunning = timer.status === "running";
  const isBreak = timer.status === "break";
  const isPaused = timer.status === "paused";

  // Mini ring
  const size = 64;
  const stroke = 3;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const total = timer.status === "break" ? timer.break_minutes * 60 : timer.session_minutes * 60;
  const progress = total > 0 && isActive ? timer.remaining_seconds / total : 1;
  const offset = circ * (1 - progress);

  const ringColor = isRunning
    ? "var(--surface-ink-solid, #6366f1)"
    : isBreak ? "#34d399" : "var(--text-muted, #64748b)";

  const statusLabel = isRunning ? "Focusing" : isPaused ? "Paused" : isBreak ? "Break" : "Ready";
  const statusColor = isRunning ? "var(--surface-ink-solid, #6366f1)" : isBreak ? "#34d399" : "var(--text-muted, #94a3b8)";

  const btnSmall = "px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all duration-100";

  return (
    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
      <div className="flex items-center gap-3">
        {/* Mini ring */}
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--glass-bg-strong, rgba(255,255,255,0.06))" strokeWidth={stroke} />
            {isActive && (
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringColor} strokeWidth={stroke}
                strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                className="transition-all duration-500 ease-linear" />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[15px] font-extrabold tabular-nums leading-none" style={{
              letterSpacing: "-0.02em",
              color: isActive ? "var(--text-primary)" : "var(--text-muted, #64748b)",
            }}>
              {fmtTime(isActive ? timer.remaining_seconds : 25 * 60)}
            </span>
          </div>
        </div>

        {/* Status + task label */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.1em] mb-0.5" style={{ color: statusColor }}>
            {statusLabel}
          </div>
          {task ? (
            <div className="text-[11px] font-semibold text-[var(--text-primary)] truncate">{task.title}</div>
          ) : (
            <div className="text-[11px] text-[var(--text-muted)]">
              {isActive ? "Free session" : "Pick a task below"}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-1.5 mt-2.5">
        {timer.status === "idle" && (
          <button
            className={`${btnSmall} flex-1 border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110`}
            onClick={() => void start("", 25, 5)}
          >
            Start
          </button>
        )}
        {isRunning && (
          <>
            <button className={`${btnSmall} flex-1 border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.12)]`}
              onClick={() => void pause()}>Pause</button>
            <button className={`${btnSmall} border border-[rgba(239,68,68,0.2)] bg-transparent text-[#f87171] hover:bg-[rgba(239,68,68,0.1)]`}
              onClick={() => void stop()}>Stop</button>
          </>
        )}
        {isPaused && (
          <>
            <button className={`${btnSmall} flex-1 border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110`}
              onClick={() => void resume()}>Resume</button>
            <button className={`${btnSmall} border border-[rgba(239,68,68,0.2)] bg-transparent text-[#f87171] hover:bg-[rgba(239,68,68,0.1)]`}
              onClick={() => void stop()}>Stop</button>
          </>
        )}
        {isBreak && (
          <button className={`${btnSmall} flex-1 border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.12)]`}
            onClick={() => void skipBreak()}>Skip Break</button>
        )}
      </div>
    </div>
  );
}

// ── Task Item (sidebar compact) ───────────────────────────────────────

function TaskItem({ task, isCurrent, onStart }: { task: PomodoroTask; isCurrent: boolean; onStart: () => void }) {
  const [hover, setHover] = useState(false);
  const pct = progressPercent(task);

  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => !task.completed && onStart()}
      className={[
        "w-full text-left rounded-xl border px-2.5 py-2 transition-all duration-100 cursor-pointer",
        "flex flex-col gap-1",
        task.completed
          ? "opacity-40 border-[var(--glass-border)] bg-transparent"
          : isCurrent
            ? "border-[var(--surface-ink-solid)] bg-[rgba(99,102,241,0.08)]"
            : hover
              ? "border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)]"
              : "border-[var(--glass-border)] bg-[var(--glass-bg)]",
      ].join(" ")}
      style={{ outline: "none" }}
    >
      <div className="flex items-center gap-2">
        {/* Tiny status dot */}
        <div
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{
            background: task.completed
              ? "#34d399"
              : isCurrent
                ? "var(--surface-ink-solid, #6366f1)"
                : pct > 0
                  ? "var(--text-muted, #94a3b8)"
                  : "var(--glass-border-strong, rgba(255,255,255,0.15))",
          }}
        />
        <span className={[
          "text-[11px] font-semibold truncate flex-1",
          task.completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]",
        ].join(" ")}>
          {task.title}
        </span>
        <span className="flex-shrink-0 text-[9px] font-bold text-[var(--text-muted)] tabular-nums">
          {fmtEstimate(task.estimated_minutes)}
        </span>
      </div>

      {/* Progress track */}
      {!task.completed && pct > 0 && (
        <div className="h-[2px] w-full rounded-full bg-[var(--glass-bg-strong)] overflow-hidden ml-3.5" style={{ width: "calc(100% - 14px)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: pct >= 100
                ? "#34d399"
                : isCurrent
                  ? "var(--surface-ink-solid)"
                  : "var(--text-muted, #64748b)",
            }}
          />
        </div>
      )}
    </button>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────

export function PomodoroSidebar() {
  const { tasks } = useTasks();
  const { timer, start } = useTimer();
  const [showModal, setShowModal] = useState(false);

  const isTimerActive = timer.status !== "idle";
  const pending = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  const totalMinutes = pending.reduce((s, t) => s + t.estimated_minutes, 0);

  const handleStart = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    void start(taskId, Math.min(task.estimated_minutes, 90) || 25, 5);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-3 gap-2.5 text-[var(--text-primary)]" style={{ fontFamily: "inherit" }}>
      <MiniTimer />

      {/* Section label */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {pending.length > 0 ? `${pending.length} tasks · ${fmtEstimate(totalMinutes)}` : "No tasks"}
        </span>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1" style={{ scrollbarWidth: "thin" }}>
        {pending.map((t) => (
          <TaskItem
            key={t.id}
            task={t}
            isCurrent={timer.task_id === t.id && isTimerActive}
            onStart={() => handleStart(t.id)}
          />
        ))}

        {done.length > 0 && (
          <>
            <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)] mt-2 mb-0.5 px-1">
              Done
            </div>
            {done.slice(0, 4).map((t) => (
              <TaskItem key={t.id} task={t} isCurrent={false} onStart={() => {}} />
            ))}
            {done.length > 4 && (
              <span className="text-[9px] text-[var(--text-muted)] px-1">
                +{done.length - 4} more
              </span>
            )}
          </>
        )}
      </div>

      {/* Add button */}
      <button
        onClick={() => setShowModal(true)}
        className="w-full py-2 rounded-xl text-[11px] font-bold cursor-pointer border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110 active:scale-[0.98] transition-all"
      >
        + Add Task
      </button>

      {showModal && <AddTaskModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
