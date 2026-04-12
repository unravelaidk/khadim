import type { RuntimeSummary } from "../../lib/bindings";

const APP_VERSION = __APP_VERSION__;

export function AboutTab({ runtime }: { runtime: RuntimeSummary | null }) {
  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div>
        <p className="text-[12px] text-[var(--text-secondary)] mb-6 leading-relaxed">
          Version information and runtime status.
        </p>
      </div>

      {/* Identity */}
      <section className="flex items-start gap-4">
        <div className="shrink-0 h-11 w-11 rounded-2xl bg-[var(--surface-card)] border border-[var(--glass-border)] flex items-center justify-center shadow-[var(--shadow-glass-sm)]">
          <span className="font-display text-[18px] font-bold text-[var(--text-primary)]">K</span>
        </div>
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)] tracking-tight">Khadim Desktop</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-2 py-0.5 rounded-md">
              {APP_VERSION}
            </span>
          </div>
        </div>
      </section>

      {/* Runtime */}
      {runtime && (
        <>
          <div className="h-px bg-[var(--glass-border)]" />
          <section>
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">Runtime</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              <RuntimeRow label="Platform" value={runtime.platform ?? "unknown"} />
              <RuntimeRow label="Runtime" value={runtime.runtime ?? "unknown"} />
              <RuntimeRow label="Status" value={runtime.status ?? "unknown"} />
              <RuntimeRow
                label="OpenCode"
                value={runtime.opencode_available ? "Available" : "Not available"}
                accent={runtime.opencode_available}
              />
            </div>
          </section>
        </>
      )}

      <div className="h-px bg-[var(--glass-border)]" />

      {/* Credits */}
      <section>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          Developed by{" "}
          <a
            href="https://uai.dk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] hover:underline underline-offset-2 font-medium"
          >
            Unravel AI
          </a>
        </p>
        <p className="text-[10px] text-[var(--text-muted)] mt-2">
          &copy; {new Date().getFullYear()} Unravel AI. All rights reserved.
        </p>
      </section>
    </div>
  );
}

function RuntimeRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
      <span className={`text-[11px] font-medium ${accent ? "text-[var(--color-success-text)]" : "text-[var(--text-primary)]"}`}>
        {value}
      </span>
    </div>
  );
}
