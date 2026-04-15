import React from "react";
import type { Credential } from "../../lib/types";

interface CredentialListProps {
  credentials: Credential[];
  onAddCredential: () => void;
  onEditCredential: (id: string) => void;
  onDeleteCredential: (id: string) => void;
}

export function CredentialList({
  credentials,
  onAddCredential,
  onEditCredential,
  onDeleteCredential,
}: CredentialListProps) {
  const typeLabels: Record<string, string> = {
    api_key: "API key",
    oauth: "OAuth",
    login: "Login",
    certificate: "Certificate",
  };

  /* ── Empty ───────────────────────────────────────────────────── */
  if (credentials.length === 0) {
    return (
      <div className="flex h-full items-center">
        <div className="px-12 py-16 max-w-lg">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Credentials
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--text-secondary)]">
            Store API keys, logins, and service accounts securely. Agents
            reference them by name — raw secrets never appear in prompts.
          </p>
          <button
            onClick={onAddCredential}
            className="btn-ink mt-8 h-11 rounded-full px-6 text-[14px] font-semibold"
          >
            Add credential
          </button>
        </div>
      </div>
    );
  }

  /* ── Populated — compact key-value rows ──────────────────────── */
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-10 pt-8 pb-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Credentials
          </h1>
          <button
            onClick={onAddCredential}
            className="btn-ink h-8 rounded-full px-4 text-xs font-semibold"
          >
            Add credential
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-10 pb-8">
        <div className="flex flex-col">
          {credentials.map((cred) => {
            const detail = cred.metadata.user ?? cred.metadata.host ?? cred.metadata.key ?? "";

            return (
              <div
                key={cred.id}
                className="group flex items-start gap-4 py-4 last:border-0"
              >
                {/* Type badge */}
                <span className="mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]" style={{ background: "var(--tint-violet)" }}>
                  {typeLabels[cred.type] ?? cred.type}
                </span>

                {/* Name + detail */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{cred.name}</p>
                  {detail && (
                    <p className="mt-0.5 truncate text-xs text-[var(--text-muted)] font-mono">{detail}</p>
                  )}
                  {cred.usedByAgents.length > 0 && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Used by {cred.usedByAgents.join(", ")}
                    </p>
                  )}
                </div>

                {/* Last used */}
                <span className="hidden shrink-0 text-xs tabular-nums text-[var(--text-muted)] md:inline">
                  {cred.lastUsedAt ? new Date(cred.lastUsedAt).toLocaleDateString() : "Never used"}
                </span>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => onEditCredential(cred.id)}
                    className="h-7 rounded-full px-3 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDeleteCredential(cred.id)}
                    className="h-7 rounded-full px-2 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--color-danger-text)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
