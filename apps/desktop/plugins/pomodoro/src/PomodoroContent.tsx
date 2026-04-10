import { useState, useMemo } from "react";
import { useTasks, useTimer, fmtTime, fmtEstimate, progressPercent } from "./hooks";
import type { PomodoroTask } from "./types";
import { AddTaskModal } from "./AddTaskModal";

// ── Inline Timer ──────────────────────────────────────────────────────

function InlineTimer() {
  const { timer, start, pause, resume, stop, skipBreak } = useTimer();
  const { tasks } = useTasks();

  const isRunning = timer.status === "running";
  const isBreak = timer.status === "break";
  const isPaused = timer.status === "paused";
  const isIdle = timer.status === "idle";
  const isActive = !isIdle;

  const total = isBreak ? timer.break_minutes * 60 : timer.session_minutes * 60;
  const progress = total > 0 && isActive ? timer.remaining_seconds / total : 1;

  const task = timer.task_id ? tasks.find((t) => t.id === timer.task_id) : null;

  // Ring
  const size = 120;
  const stroke = 4;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);

  const accentColor = isRunning
    ? "var(--surface-ink-solid, #6366f1)"
    : isBreak ? "#34d399" : isPaused ? "var(--text-muted, #64748b)" : "var(--glass-border-strong)";

  const btnSm = "px-4 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all duration-100 outline-none";

  return (
    <div className="flex items-center gap-6 px-5 py-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]">
      {/* Ring */}
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        {isActive && (
          <div className="absolute rounded-full" style={{
            inset: "8px",
            background: isRunning
              ? "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)"
              : isBreak
                ? "radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)"
                : "none",
          }} />
        )}
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="var(--glass-bg-strong, rgba(255,255,255,0.06))" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={accentColor} strokeWidth={stroke}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" className="transition-all duration-500 ease-linear" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular-nums leading-none transition-colors duration-300" style={{
            fontSize: "26px", fontWeight: 800, letterSpacing: "-0.03em",
            color: isIdle ? "var(--text-muted, #475569)" : "var(--text-primary)",
          }}>
            {fmtTime(isIdle ? 25 * 60 : timer.remaining_seconds)}
          </span>
          <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.12em] transition-colors" style={{ color: accentColor }}>
            {isRunning ? "focusing" : isBreak ? "break" : isPaused ? "paused" : "ready"}
          </span>
        </div>
      </div>

      {/* Right side: task info + controls */}
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        {/* Task label or idle prompt */}
        {task ? (
          <div>
            <div className="text-[12px] font-bold text-[var(--text-primary)] truncate">{task.title}</div>
            {task.description && (
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{task.description}</div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-[var(--text-muted)]">
            {isActive ? "Free focus session" : "Select a task or start a free session"}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 flex-wrap">
          {isIdle && (
            <button className={`${btnSm} border-none bg-[var(--surface-ink-solid)] text-white shadow-[0_2px_12px_-2px_rgba(99,102,241,0.3)] hover:brightness-110 active:scale-[0.97]`}
              onClick={() => void start("", 25, 5)}>
              Start Session
            </button>
          )}
          {isRunning && (
            <>
              <button className={`${btnSm} bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.12)]`}
                onClick={() => void pause()}>Pause</button>
              <button className={`${btnSm} bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.18)] text-[#f87171] hover:bg-[rgba(239,68,68,0.15)]`}
                onClick={() => void stop()}>Stop</button>
            </>
          )}
          {isPaused && (
            <>
              <button className={`${btnSm} border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110`}
                onClick={() => void resume()}>Resume</button>
              <button className={`${btnSm} bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.18)] text-[#f87171] hover:bg-[rgba(239,68,68,0.15)]`}
                onClick={() => void stop()}>Stop</button>
            </>
          )}
          {isBreak && (
            <button className={`${btnSm} bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.12)]`}
              onClick={() => void skipBreak()}>Skip Break</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stats Row ─────────────────────────────────────────────────────────

function StatsRow({ tasks }: { tasks: PomodoroTask[] }) {
  const totalPomodoros = tasks.reduce((s, t) => s + t.pomodoros_done, 0);
  const totalMinutes = tasks.reduce((s, t) => s + Math.floor(t.elapsed_seconds / 60), 0);
  const completedCount = tasks.filter((t) => t.completed).length;

  if (tasks.length === 0) return null;

  return (
    <div className="flex gap-4 text-[11px] tabular-nums">
      <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--surface-ink-solid)] opacity-70" />
        <strong className="text-[var(--text-primary)]">{totalPomodoros}</strong> sessions
      </span>
      <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] opacity-70" />
        <strong className="text-[var(--text-primary)]">{fmtEstimate(totalMinutes)}</strong> focused
      </span>
      <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] opacity-70" />
        <strong className="text-[var(--text-primary)]">{completedCount}/{tasks.length}</strong> done
      </span>
    </div>
  );
}

// ── Task Row ──────────────────────────────────────────────────────────

function TaskRow({ task, isActive, isCurrent, onStart, onComplete, onDelete }: {
  task: PomodoroTask;
  isActive: boolean;
  isCurrent: boolean;
  onStart: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const pct = progressPercent(task);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={[
        "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-100",
        task.completed
          ? "opacity-40 border-transparent"
          : isCurrent
            ? "border-[var(--surface-ink-solid)] bg-[rgba(99,102,241,0.05)]"
            : hover
              ? "border-[var(--glass-border-strong)] bg-[var(--glass-bg-strong)]"
              : "border-transparent bg-transparent hover:bg-[var(--glass-bg)]",
      ].join(" ")}
    >
      {/* Checkbox */}
      <button
        onClick={() => !task.completed && onComplete()}
        className={[
          "w-[16px] h-[16px] rounded-[5px] border-[1.5px] flex items-center justify-center flex-shrink-0 cursor-pointer transition-all bg-transparent",
          task.completed
            ? "bg-[#34d399] border-[#34d399]"
            : hover
              ? "border-[var(--text-muted)] hover:border-[var(--surface-ink-solid)]"
              : "border-[var(--glass-border-strong)]",
        ].join(" ")}
      >
        {task.completed && (
          <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth={3.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Title + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={[
            "text-[12px] font-semibold truncate",
            task.completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]",
          ].join(" ")}>
            {task.title}
          </span>
          {isCurrent && (
            <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--surface-ink-solid)] animate-pulse" />
          )}
        </div>
        {task.description && !task.completed && (
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate m-0">{task.description}</p>
        )}
      </div>

      {/* Progress + time */}
      {!task.completed && (
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {/* Mini progress arc */}
          {pct > 0 && (() => {
            const s = 20; const sw = 2; const pr = (s - sw * 2) / 2;
            const c = 2 * Math.PI * pr; const o = c * (1 - pct / 100);
            return (
              <svg width={s} height={s} className="-rotate-90">
                <circle cx={s/2} cy={s/2} r={pr} fill="none" stroke="var(--glass-bg-strong)" strokeWidth={sw} />
                <circle cx={s/2} cy={s/2} r={pr} fill="none"
                  stroke={pct >= 100 ? "#34d399" : "var(--surface-ink-solid)"}
                  strokeWidth={sw} strokeDasharray={c} strokeDashoffset={o}
                  strokeLinecap="round" />
              </svg>
            );
          })()}
          <span className="text-[10px] font-bold text-[var(--text-muted)] tabular-nums w-8 text-right">
            {fmtEstimate(task.estimated_minutes)}
          </span>
        </div>
      )}

      {/* Hover actions */}
      {hover && !task.completed && (
        <div className="flex gap-1 flex-shrink-0">
          {!isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); onStart(); }}
              className="w-6 h-6 flex items-center justify-center rounded-md cursor-pointer border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110 transition-all"
              title="Start timer"
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-6 h-6 flex items-center justify-center rounded-md cursor-pointer border border-[rgba(239,68,68,0.15)] bg-transparent text-[#f87171] hover:bg-[rgba(239,68,68,0.08)] transition-all"
            title="Remove"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[var(--glass-bg)] border border-dashed border-[var(--glass-border-strong)] flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">No tasks yet</h3>
      <p className="text-[11px] text-[var(--text-muted)] max-w-[220px] leading-relaxed mb-4">
        Add study tasks or ask the AI — it will estimate time for you.
      </p>
      <button
        onClick={onAdd}
        className="px-4 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110 active:scale-[0.97] transition-all"
      >
        + Add Task
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────

export function PomodoroContent() {
  const { tasks, completeTask, deleteTask } = useTasks();
  const { timer, start } = useTimer();
  const [showModal, setShowModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const isTimerActive = timer.status !== "idle";
  const pending = useMemo(() => tasks.filter((t) => !t.completed), [tasks]);
  const completed = useMemo(() => tasks.filter((t) => t.completed), [tasks]);

  const handleStart = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    void start(taskId, Math.min(task.estimated_minutes, 90) || 25, 5);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[var(--surface-bg)] text-[var(--text-primary)]" style={{ fontFamily: "inherit" }}>
      {/* Scrollable content — single centered column */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        <div className="mx-auto max-w-[560px] px-5 py-5 flex flex-col gap-5">

          {/* Timer card */}
          <InlineTimer />

          {/* Stats + section header */}
          <div className="flex items-center justify-between">
            <StatsRow tasks={tasks} />
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110 active:scale-[0.97] transition-all flex-shrink-0"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          </div>

          {/* Task list */}
          {pending.length === 0 && !showCompleted ? (
            <EmptyState onAdd={() => setShowModal(true)} />
          ) : (
            <div className="flex flex-col gap-0.5">
              {pending.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  isActive={isTimerActive}
                  isCurrent={timer.task_id === t.id && isTimerActive}
                  onStart={() => handleStart(t.id)}
                  onComplete={() => void completeTask(t.id)}
                  onDelete={() => void deleteTask(t.id)}
                />
              ))}
            </div>
          )}

          {/* Completed section */}
          {completed.length > 0 && (
            <div>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)] cursor-pointer bg-transparent border-none hover:text-[var(--text-secondary)] transition-colors mb-1"
              >
                <svg className={`w-2.5 h-2.5 transition-transform ${showCompleted ? "rotate-90" : ""}`}
                  fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {completed.length} completed
              </button>
              {showCompleted && (
                <div className="flex flex-col gap-0.5">
                  {completed.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      isActive={isTimerActive}
                      isCurrent={false}
                      onStart={() => {}}
                      onComplete={() => {}}
                      onDelete={() => void deleteTask(t.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showModal && <AddTaskModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
