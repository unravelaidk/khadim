import { useState } from "react";
import { useEvents, fmtTime, isSameDay, MONTH_NAMES } from "./hooks";
import type { CalEvent } from "./types";
import { AddEventModal } from "./AddEventModal";

// ── Styles ────────────────────────────────────────────────────────────

const S = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    background: "var(--surface-bg, #131520)",
    fontFamily: "inherit",
    color: "var(--text-primary, #e2e8f0)",
  },
  topBar: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    borderBottom: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
  },
  navGroup: { display: "flex", alignItems: "center", gap: "8px" },
  navBtn: {
    background: "var(--glass-bg, rgba(255,255,255,0.06))",
    border: "1px solid var(--glass-border, rgba(255,255,255,0.12))",
    color: "var(--text-primary, #e2e8f0)",
    borderRadius: "8px",
    padding: "4px 12px",
    fontSize: "14px",
    cursor: "pointer",
  } as React.CSSProperties,
  monthTitle: { margin: 0, fontSize: "16px", fontWeight: 700, minWidth: "180px", textAlign: "center" as const },
  todayBtn: {
    background: "var(--glass-bg, rgba(255,255,255,0.06))",
    border: "1px solid var(--glass-border, rgba(255,255,255,0.12))",
    color: "var(--text-primary, #e2e8f0)",
    borderRadius: "8px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  addBtn: {
    background: "var(--surface-ink-solid, #6366f1)",
    border: "none",
    color: "#fff",
    borderRadius: "8px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  body: { flex: 1, display: "flex", minHeight: 0, overflow: "hidden" },
  gridCol: {
    flex: 1,
    overflow: "hidden",
    padding: "16px",
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  },
  dayHeaders: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "4px",
  },
  dayHeader: {
    textAlign: "center" as const,
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--text-muted, #94a3b8)",
    padding: "4px",
  },
  daysGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "4px",
    flex: 1,
  },
  sidePanel: {
    width: "260px",
    borderLeft: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
    padding: "16px",
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },
  sidePanelDate: { fontSize: "12px", fontWeight: 700 },
  eventCard: {
    padding: "10px",
    borderRadius: "10px",
    background: "var(--glass-bg, rgba(255,255,255,0.04))",
    border: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  },
  eventCardTitle: { fontSize: "12px", fontWeight: 700 },
  eventCardTime: { fontSize: "10px", color: "var(--text-muted, #94a3b8)" },
  eventCardDesc: { fontSize: "10px", color: "var(--text-secondary, #cbd5e1)", marginTop: "2px" },
  deleteBtn: {
    alignSelf: "flex-start" as const,
    marginTop: "4px",
    background: "transparent",
    border: "1px solid rgba(239,68,68,0.35)",
    color: "#f87171",
    borderRadius: "6px",
    padding: "3px 10px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  sidePanelAddBtn: {
    width: "100%",
    background: "var(--surface-ink-solid, #6366f1)",
    border: "none",
    color: "#fff",
    borderRadius: "8px",
    padding: "7px 0",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
};

// ── Day cell ─────────────────────────────────────────────────────────

interface DayCellProps {
  day: number;
  iso: string;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  dayEvents: CalEvent[];
  onClick: () => void;
}

function DayCell({ day, isToday, isSelected, isCurrentMonth, dayEvents, onClick }: DayCellProps) {
  const [hover, setHover] = useState(false);

  const bg = isSelected
    ? "var(--glass-bg-strong, rgba(255,255,255,0.08))"
    : hover
      ? "var(--glass-bg-strong, rgba(255,255,255,0.06))"
      : "var(--glass-bg, rgba(255,255,255,0.03))";

  const border = isSelected
    ? "1px solid var(--color-accent, #6366f1)"
    : "1px solid var(--glass-border, rgba(255,255,255,0.06))";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: "8px",
        padding: "6px",
        minHeight: "60px",
        cursor: "pointer",
        background: isCurrentMonth ? bg : "var(--glass-bg, rgba(255,255,255,0.02))",
        border,
        opacity: isCurrentMonth ? 1 : 0.3,
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        overflow: "hidden",
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: isToday ? 800 : 500,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: isToday ? "var(--surface-ink-solid, #6366f1)" : "transparent",
          color: isToday ? "var(--text-inverse, #fff)" : "var(--text-primary, #e2e8f0)",
        }}
      >
        {day}
      </div>

      {dayEvents.slice(0, 2).map((ev) => (
        <div
          key={ev.id}
          style={{
            fontSize: "9px",
            fontWeight: 600,
            background: "var(--color-accent, #6366f1)",
            opacity: 0.9,
            color: "#fff",
            borderRadius: "4px",
            padding: "1px 4px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ev.title}
        </div>
      ))}
      {dayEvents.length > 2 && (
        <div style={{ fontSize: "9px", color: "var(--text-muted, #94a3b8)" }}>
          +{dayEvents.length - 2} more
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function CalendarContent() {
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<string | null>(todayISO);
  const [showModal, setShowModal] = useState(false);
  const { events, deleteEvent } = useEvents();

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelected(todayISO);
  };

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const trailingCount = (7 - ((firstDay + daysInMonth) % 7)) % 7;

  const selectedEvents = selected ? events.filter((e) => isSameDay(e.start, selected)) : [];

  return (
    <div style={S.root}>
      {/* Top bar */}
      <div style={S.topBar}>
        <div style={S.navGroup}>
          <button style={S.navBtn} onClick={prevMonth}>‹</button>
          <h2 style={S.monthTitle}>{MONTH_NAMES[month]} {year}</h2>
          <button style={S.navBtn} onClick={nextMonth}>›</button>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={S.todayBtn} onClick={goToday}>Today</button>
          <button style={S.addBtn} onClick={() => setShowModal(true)}>+ New Event</button>
        </div>
      </div>

      {/* Body */}
      <div style={S.body}>
        {/* Calendar grid */}
        <div style={S.gridCol}>
          <div style={S.dayHeaders}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} style={S.dayHeader}>{d}</div>
            ))}
          </div>

          <div style={S.daysGrid}>
            {/* Leading cells — prev month */}
            {Array.from({ length: firstDay }, (_, i) => {
              const d = prevMonthDays - firstDay + i + 1;
              return (
                <DayCell
                  key={`prev-${i}`}
                  day={d}
                  iso=""
                  isToday={false}
                  isSelected={false}
                  isCurrentMonth={false}
                  dayEvents={[]}
                  onClick={() => {}}
                />
              );
            })}

            {/* Current month */}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              return (
                <DayCell
                  key={iso}
                  day={day}
                  iso={iso}
                  isToday={iso === todayISO}
                  isSelected={iso === selected}
                  isCurrentMonth
                  dayEvents={events.filter((e) => isSameDay(e.start, iso))}
                  onClick={() => setSelected(iso)}
                />
              );
            })}

            {/* Trailing cells — next month */}
            {Array.from({ length: trailingCount }, (_, i) => (
              <DayCell
                key={`next-${i}`}
                day={i + 1}
                iso=""
                isToday={false}
                isSelected={false}
                isCurrentMonth={false}
                dayEvents={[]}
                onClick={() => {}}
              />
            ))}
          </div>
        </div>

        {/* Day detail panel */}
        <div style={S.sidePanel}>
          <div style={S.sidePanelDate}>
            {selected
              ? new Date(selected + "T00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : "Select a day"}
          </div>

          {selected && (
            <>
              {selectedEvents.length === 0 && (
                <div style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)" }}>
                  No events. Click + New Event to add one.
                </div>
              )}

              {selectedEvents.map((ev) => (
                <div key={ev.id} style={S.eventCard}>
                  <div style={S.eventCardTitle}>{ev.title}</div>
                  <div style={S.eventCardTime}>
                    {ev.all_day ? "All day" : `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`}
                  </div>
                  {ev.description && <div style={S.eventCardDesc}>{ev.description}</div>}
                  <button style={S.deleteBtn} onClick={() => deleteEvent(ev.id)}>
                    Delete
                  </button>
                </div>
              ))}

              <button style={S.sidePanelAddBtn} onClick={() => setShowModal(true)}>
                + Add Event
              </button>
            </>
          )}
        </div>
      </div>

      {showModal && (
        <AddEventModal
          prefillDate={selected}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
