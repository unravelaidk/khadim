import type { RuntimeSummary } from "../../lib/bindings";

const APP_VERSION = "alpha 1.0";

export function AboutTab({ runtime }: { runtime: RuntimeSummary | null }) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-2xl glass-card-static p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Khadim Desktop</h2>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-2 py-0.5 rounded-lg">
            {APP_VERSION}
          </span>
        </div>
        <div className="space-y-2 text-[11px] text-[var(--text-secondary)]">
          {runtime && (
            <>
              <p><span className="text-[var(--text-muted)]">Platform:</span> {runtime.platform ?? "unknown"}</p>
              <p><span className="text-[var(--text-muted)]">Runtime:</span> {runtime.runtime ?? "unknown"}</p>
              <p><span className="text-[var(--text-muted)]">Status:</span> {runtime.status ?? "unknown"}</p>
              <p><span className="text-[var(--text-muted)]">OpenCode:</span> {runtime.opencode_available ? "Available" : "Not available"}</p>
            </>
          )}
        </div>
      </div>

      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-3">About</h2>
        <div className="space-y-3 text-[11px] text-[var(--text-secondary)]">
          <p>
            Developed by{" "}
            <a
              href="https://uai.dk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline font-medium"
            >
              Unravel AI
            </a>
          </p>
        </div>
      </div>

      <div className="rounded-2xl glass-card-static p-4">
        <p className="text-[10px] text-[var(--text-muted)] text-center">
          &copy; {new Date().getFullYear()} Unravel AI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
