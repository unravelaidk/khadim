import { useState } from "react";
import { useEvents, fmtDate, fmtTime, isSameDay, MONTH_NAMES } from "./hooks";
import type { CalEvent } from "./types";
import { AddEventModal } from "./AddEventModal";

const S = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    padding: "12px",
    gap: "8px",
    fontFamily: "inherit",
    color: "var(--text-primary, #e2e8f0)",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBtn: {
    background: "var(--glass-bg, rgba(255,255,255,0.06))",
    border: "1px solid var(--glass-border, rgba(255,255,255,0.12))",
    color: "var(--text-primary, #e2e8f0)",
    borderRadius: "8px",
    padding: "2px 10px",
    fontSize: "13px",
    cursor: "pointer",
  } as React.CSSProperties,
  monthLabel: {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--text-primary, #e2e8f0)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: "1px",
  },
  dayHeader: {
    textAlign: "center" as const,
    fontSize: "9px",
    fontWeight: 700,
    color: "var(--text-muted, #94a3b8)",
    padding: "3px 0",
  },
  divider: {
    height: "1px",
    background: "var(--glass-border, rgba(255,255,255,0.08))",
    margin: "4px 0",
  },
  label: {
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--text-muted, #94a3b8)",
    letterSpacing: "0.05em",
  },
  list: {
    flex: 1,
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  },
  eventItem: {
    padding: "6px 8px",
    borderRadius: "8px",
    background: "var(--glass-bg, rgba(255,255,255,0.04))",
    border: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
    cursor: "pointer",
  },
  eventTitle: {
    fontSize: "11px",
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  eventTime: {
    fontSize: "10px",
    color: "var(--text-muted, #94a3b8)",
    marginTop: "1px",
  },
  addBtn: {
    width: "100%",
    marginTop: "4px",
    background: "var(--surface-ink-solid, #6366f1)",
    color: "var(--text-inverse, #fff)",
    border: "none",
    borderRadius: "10px",
    padding: "7px 0",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
};

interface DayCellProps {
  day: number;
  iso: string;
  isToday: boolean;
  hasEvent: boolean;
  onClick: () => void;
}

function DayCell({ day, iso: _iso, isToday, hasEvent, onClick }: DayCellProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        aspectRatio: "1",
        border: "none",
        cursor: "pointer",
        borderRadius: "6px",
        fontSize: "10px",
        fontWeight: isToday ? 800 : 500,
        background: isToday
          ? "var(--surface-ink-solid, #6366f1)"
          : hover
            ? "var(--glass-bg-strong, rgba(255,255,255,0.1))"
            : "transparent",
        color: isToday ? "var(--text-inverse, #fff)" : "var(--text-primary, #e2e8f0)",
        position: "relative",
      }}
    >
      {day}
      {hasEvent && (
        <span
          style={{
            position: "absolute",
            bottom: "2px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            background: isToday
              ? "var(--text-inverse, #fff)"
              : "var(--color-accent, #6366f1)",
          }}
        />
      )}
    </button>
  );
}

export function CalendarSidebar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [showModal, setShowModal] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);
  const { events } = useEvents();

  const todayISO = today.toISOString().slice(0, 10);
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const now = new Date().toISOString();
  const upcoming = events
    .filter((e) => e.end >= now)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 10);

  return (
    <div style={S.root}>
      {/* Month nav */}
      <div style={S.nav}>
        <button style={S.navBtn} onClick={prevMonth}>‹</button>
        <span style={S.monthLabel}>{MONTH_NAMES[month]} {year}</span>
        <button style={S.navBtn} onClick={nextMonth}>›</button>
      </div>

      {/* Mini month grid */}
      <div style={S.grid}>
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
          <div key={d} style={S.dayHeader}>{d}</div>
        ))}
        {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          return (
            <DayCell
              key={day}
              day={day}
              iso={iso}
              isToday={iso === todayISO}
              hasEvent={events.some((e) => isSameDay(e.start, iso))}
              onClick={() => { setPrefillDate(iso); setShowModal(true); }}
            />
          );
        })}
      </div>

      <div style={S.divider} />

      {/* Upcoming events */}
      <div style={S.label}>{upcoming.length ? "UPCOMING" : "NO UPCOMING EVENTS"}</div>
      <div style={S.list}>
        {upcoming.map((ev) => (
          <EventItem key={ev.id} ev={ev} />
        ))}
      </div>

      <button style={S.addBtn} onClick={() => { setPrefillDate(null); setShowModal(true); }}>
        + Add Event
      </button>

      {showModal && (
        <AddEventModal
          prefillDate={prefillDate}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function EventItem({ ev }: { ev: CalEvent }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        ...S.eventItem,
        background: hover
          ? "var(--glass-bg-strong, rgba(255,255,255,0.08))"
          : "var(--glass-bg, rgba(255,255,255,0.04))",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={S.eventTitle}>{ev.title}</div>
      <div style={S.eventTime}>{fmtDate(ev.start)} {fmtTime(ev.start)}</div>
    </div>
  );
}
