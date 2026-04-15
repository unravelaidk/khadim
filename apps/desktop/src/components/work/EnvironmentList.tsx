import React from "react";
import type { Environment } from "../../lib/types";

interface EnvironmentListProps {
  environments: Environment[];
  onCreateEnvironment: () => void;
  onEditEnvironment: (id: string) => void;
}

export function EnvironmentList({
  environments,
  onCreateEnvironment,
  onEditEnvironment,
}: EnvironmentListProps) {
  /* ── Empty ───────────────────────────────────────────────────── */
  if (environments.length === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="px-12 py-16 max-w-lg">
          <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--text-primary)]">
            Environments
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
            Environments let agents run with different credentials and settings.
            Use them to separate development from production.
          </p>
          <button
            onClick={onCreateEnvironment}
            className="btn-ink mt-8 h-11 rounded-full px-6 text-[14px] font-medium"
          >
            Create environment
          </button>
        </div>
      </div>
    );
  }

  /* ── Populated ───────────────────────────────────────────────── */
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-10 pt-8 pb-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-xl font-medium tracking-tight text-[var(--text-primary)]">
            Environments
          </h1>
          <button
            onClick={onCreateEnvironment}
            className="btn-ink h-8 rounded-full px-4 text-xs font-medium"
          >
            New environment
          </button>
        </div>
      </div>

      {/* Grid of environment cards — not a table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-10 pb-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {environments.map((env) => {
            const varCount = Object.keys(env.variables).length;
            const runnerLabel = env.runnerType === "local" ? "Local" : env.runnerType === "docker" ? "Docker" : "Cloud";

            return (
              <button
                key={env.id}
                onClick={() => onEditEnvironment(env.id)}
                className="group flex flex-col gap-3 depth-card-interactive p-4 text-left"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{env.name}</p>
                    {env.description && (
                      <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">{env.description}</p>
                    )}
                  </div>
                  {env.isDefault && (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--text-primary)]" style={{ background: "var(--tint-sky)" }}>Default</span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]" style={{ background: env.runnerType === "docker" ? "var(--tint-violet)" : env.runnerType === "cloud" ? "var(--tint-sky)" : "var(--tint-warm)" }}>{runnerLabel}</span>
                  <span>{env.credentialIds.length} credential{env.credentialIds.length !== 1 ? "s" : ""}</span>
                  {varCount > 0 && <span>{varCount} var{varCount !== 1 ? "s" : ""}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
