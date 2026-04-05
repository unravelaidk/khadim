import type { RuntimeSummary } from "../../lib/bindings";

export function AboutTab({ runtime }: { runtime: RuntimeSummary | null }) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-3">Khadim Desktop</h2>
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
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-3">Credits</h2>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
          Built with Tauri, React, and Tailwind CSS. Theme families from Catppuccin, Nord, Dracula, Tokyo Night, Gruvbox, and One Dark communities.
        </p>
      </div>
    </div>
  );
}
