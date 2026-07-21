import { useState, useRef, useEffect } from "react";
import { useTasks } from "./hooks";

interface Props {
  onClose: () => void;
}

const PRESETS = [
  { m: 15, label: "15m", desc: "Quick review" },
  { m: 25, label: "25m", desc: "Standard" },
  { m: 30, label: "30m", desc: "Light study" },
  { m: 45, label: "45m", desc: "Deep read" },
  { m: 60, label: "1h", desc: "Problem set" },
  { m: 90, label: "1.5h", desc: "Long session" },
];

export function AddTaskModal({ onClose }: Props) {
  const { addTask } = useTasks();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [minutes, setMinutes] = useState(25);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleSave = async () => {
    if (!title.trim()) { setError("Give your task a name."); return; }
    await addTask({ title: title.trim(), description: desc.trim(), estimated_minutes: minutes });
    onClose();
  };

  const inputCls = [
    "w-full px-3 py-2 rounded-xl text-[12px] outline-none transition-all duration-150",
    "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
    "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
    "focus:border-[var(--surface-ink-solid)] focus:bg-[rgba(99,102,241,0.04)]",
  ].join(" ");

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col gap-4 w-[380px] p-5 rounded-2xl border text-[var(--text-primary)]"
        style={{
          background: "var(--surface-elevated, #1e2130)",
          borderColor: "var(--glass-border-strong, rgba(255,255,255,0.15))",
          boxShadow: "0 24px 64px -12px rgba(0,0,0,0.5)",
          fontFamily: "inherit",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-extrabold tracking-tight m-0">New Study Task</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] cursor-pointer border-none bg-transparent transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Title */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1.5">
            What are you studying?
          </label>
          <input
            ref={titleRef}
            className={inputCls}
            type="text"
            value={title}
            placeholder="e.g. Linear Algebra Ch. 5"
            onChange={(e) => { setTitle(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            style={{ fontFamily: "inherit" }}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-1.5">
            Details <span className="normal-case tracking-normal font-normal">(optional)</span>
          </label>
          <input
            className={inputCls}
            type="text"
            value={desc}
            placeholder="Topics, exercises, page numbers…"
            onChange={(e) => setDesc(e.target.value)}
            style={{ fontFamily: "inherit" }}
          />
        </div>

        {/* Time presets */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-2">
            Estimated time
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.m}
                onClick={() => setMinutes(p.m)}
                className={[
                  "flex flex-col items-center py-2 rounded-xl text-center cursor-pointer border transition-all duration-100",
                  minutes === p.m
                    ? "bg-[var(--surface-ink-solid)] border-[var(--surface-ink-solid)] text-white shadow-[0_2px_12px_-2px_rgba(99,102,241,0.3)]"
                    : "bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-strong)] hover:border-[var(--glass-border-strong)]",
                ].join(" ")}
              >
                <span className="text-[13px] font-extrabold leading-none">{p.label}</span>
                <span className={`text-[8px] font-semibold mt-0.5 ${minutes === p.m ? "text-white/70" : "text-[var(--text-muted)]"}`}>
                  {p.desc}
                </span>
              </button>
            ))}
          </div>

          {/* Custom input */}
          <div className="flex items-center gap-2 mt-2.5">
            <span className="text-[10px] font-semibold text-[var(--text-muted)]">or</span>
            <input
              className="w-16 px-2.5 py-1.5 rounded-lg text-[12px] text-center outline-none tabular-nums bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:border-[var(--surface-ink-solid)]"
              type="number" min={1} max={300} value={minutes}
              onChange={(e) => setMinutes(Math.max(1, parseInt(e.target.value) || 25))}
              style={{ fontFamily: "inherit" }}
            />
            <span className="text-[10px] font-semibold text-[var(--text-muted)]">minutes</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-[11px] text-[#f87171] m-0 -mt-1">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[12px] font-semibold cursor-pointer bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-[12px] font-bold cursor-pointer border-none bg-[var(--surface-ink-solid)] text-white hover:brightness-110 active:scale-[0.97] transition-all shadow-[0_2px_12px_-2px_rgba(99,102,241,0.3)]"
          >
            Add Task
          </button>
        </div>
      </div>
    </div>
  );
}
