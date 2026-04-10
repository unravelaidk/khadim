import { useState, useRef, useEffect } from "react";
import { useEvents } from "./hooks";

interface Props {
  prefillDate: string | null;
  onClose: () => void;
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(0,0,0,0.5)",
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const card: React.CSSProperties = {
  background: "var(--surface-elevated, #1e2130)",
  border: "1px solid var(--glass-border-strong, rgba(255,255,255,0.15))",
  borderRadius: "16px",
  padding: "20px",
  width: "340px",
  boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  color: "var(--text-primary, #e2e8f0)",
  fontFamily: "inherit",
};

const inputStyle: React.CSSProperties = {
  background: "var(--glass-bg, rgba(255,255,255,0.06))",
  border: "1px solid var(--glass-border, rgba(255,255,255,0.12))",
  color: "var(--text-primary, #e2e8f0)",
  borderRadius: "8px",
  padding: "6px 10px",
  fontSize: "12px",
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  color: "var(--text-muted, #94a3b8)",
  marginBottom: "3px",
  display: "block",
};

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        style={inputStyle}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function AddEventModal({ prefillDate, onClose }: Props) {
  const { addEvent } = useEvents();
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(prefillDate ? `${prefillDate}T09:00` : "");
  const [end, setEnd] = useState(prefillDate ? `${prefillDate}T10:00` : "");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleSave = async () => {
    if (!title.trim() || !start || !end) {
      setError("Title, start and end are required.");
      return;
    }
    await addEvent({ title: title.trim(), start, end, description: desc.trim(), all_day: false });
    onClose();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div style={overlay} onClick={handleOverlayClick}>
      <div style={card}>
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>New Event</h3>

        <div>
          <label style={labelStyle}>Title</label>
          <input
            ref={titleRef}
            style={inputStyle}
            type="text"
            value={title}
            placeholder="Meeting, deadline, appointment…"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>

        <Field label="Start" type="datetime-local" value={start} onChange={setStart} />
        <Field label="End" type="datetime-local" value={end} onChange={setEnd} />
        <Field label="Description (optional)" type="text" value={desc} onChange={setDesc} />

        {error && (
          <p style={{ margin: 0, fontSize: "11px", color: "var(--color-danger, #f87171)" }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "var(--glass-bg, rgba(255,255,255,0.06))",
              border: "1px solid var(--glass-border, rgba(255,255,255,0.12))",
              color: "var(--text-primary, #e2e8f0)",
              borderRadius: "8px",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              background: "var(--surface-ink-solid, #6366f1)",
              border: "none",
              color: "#fff",
              borderRadius: "8px",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Add Event
          </button>
        </div>
      </div>
    </div>
  );
}
