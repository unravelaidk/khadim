import { memo } from "react";

export type AgentStatus = "running" | "complete" | "error" | "idle";

interface Props {
  status: AgentStatus;
  /** Show the text label alongside the icon. Default: false */
  showLabel?: boolean;
  /** Override the label text. */
  label?: string;
  /** Size variant. Default: "sm" */
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const STATUS_CONFIG: Record<AgentStatus, { icon: string; color: string; label: string; bgClass: string }> = {
  running: {
    icon: "running",
    color: "var(--color-accent)",
    label: "Running",
    bgClass: "bg-[var(--color-accent)]",
  },
  complete: {
    icon: "check",
    color: "var(--color-success)",
    label: "Done",
    bgClass: "bg-[var(--color-success)]",
  },
  error: {
    icon: "alert",
    color: "var(--color-danger)",
    label: "Error",
    bgClass: "bg-[var(--color-danger)]",
  },
  idle: {
    icon: "idle",
    color: "var(--text-muted)",
    label: "Idle",
    bgClass: "bg-[var(--scrollbar-thumb)]",
  },
};

const SIZE_MAP = {
  xs: { box: 14, icon: 10, text: "text-[10px]" },
  sm: { box: 18, icon: 12, text: "text-[12px]" },
  md: { box: 22, icon: 14, text: "text-[13px]" },
  lg: { box: 26, icon: 16, text: "text-[14px]" },
};

function StatusIcon({ status, size }: { status: AgentStatus; size: number }) {
  const s = size;
  const sw = 2;

  if (status === "running") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth={sw} opacity={0.25} />
        <path
          d="M8 2.5a5.5 5.5 0 014.95 3.05"
          stroke="currentColor"
          strokeWidth={sw}
          strokeLinecap="round"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 8 8"
            to="360 8 8"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
    );
  }

  if (status === "complete") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={sw}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 8.5l2.5 2.5 4.5-5" />
      </svg>
    );
  }

  if (status === "error") {
    return (
      <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={sw}>
        <path strokeLinecap="round" d="M8 5v3.5M8 10.5v.5" />
      </svg>
    );
  }

  // idle — dash
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={sw}>
      <path strokeLinecap="round" d="M5 8h6" />
    </svg>
  );
}

export const StatusIndicator = memo(function StatusIndicator({
  status,
  showLabel = false,
  label,
  size = "sm",
  className = "",
}: Props) {
  const config = STATUS_CONFIG[status];
  const sz = SIZE_MAP[size];

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      style={{ color: config.color }}
    >
      <span
        className="inline-flex items-center justify-center shrink-0"
        style={{ width: sz.box, height: sz.box }}
      >
        <StatusIcon status={status} size={sz.icon} />
      </span>
      {showLabel && (
        <span className={`${sz.text} font-medium`}>
          {label ?? config.label}
        </span>
      )}
    </span>
  );
});

/** Compact pill variant — status icon + label + optional detail in a rounded chip. */
export const StatusPill = memo(function StatusPill({
  status,
  label,
  detail,
  className = "",
}: {
  status: AgentStatus;
  label?: string;
  detail?: string;
  className?: string;
}) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${className}`}
      style={{
        color: config.color,
        background: `color-mix(in oklch, ${config.color} 10%, transparent)`,
      }}
    >
      <StatusIcon status={status} size={10} />
      <span>{label ?? config.label}</span>
      {detail && (
        <span className="text-[var(--text-muted)] opacity-70">· {detail}</span>
      )}
    </span>
  );
});
