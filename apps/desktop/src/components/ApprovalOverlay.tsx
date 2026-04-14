import { useMemo, useState } from "react";
import type { PendingApproval } from "../lib/bindings";

interface Props {
  approval: PendingApproval;
  onApprove: (remember: boolean) => void;
  onDeny: () => void;
}

function formatInput(input: Record<string, unknown> | null | undefined) {
  if (!input || Object.keys(input).length === 0) return "";
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return "";
  }
}

export function ApprovalOverlay({ approval, onApprove, onDeny }: Props) {
  const [remember, setRemember] = useState(false);
  const inputPreview = useMemo(() => formatInput(approval.input), [approval.input]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-[var(--surface-ink-25)] backdrop-blur-sm" />

      <div
        className="relative z-10 mx-4 flex max-h-[80vh] w-full max-w-[560px] flex-col rounded-[var(--radius-xl)] glass-panel-strong animate-in zoom-in slide-in-from-bottom-4 duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="Claude Code approval request"
      >
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 shrink-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--color-pop)]/15 text-[var(--color-pop)]">
            <i className="ri-error-warning-line text-[16px] leading-none" />
          </span>
          <div>
            <h2 className="font-display text-base font-medium text-[var(--text-primary)]">Approval required</h2>
            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
              Claude Code wants to use {approval.displayName}
            </p>
          </div>
        </div>

        <div className="mx-6 h-px shrink-0 bg-[var(--glass-border)]" />

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug">{approval.title}</p>
            {approval.description && (
              <p className="text-[12px] leading-5 text-[var(--text-secondary)]">{approval.description}</p>
            )}
            {approval.blockedPath && (
              <p className="text-[11px] text-[var(--text-muted)]">
                Path: <span className="font-mono text-[var(--text-secondary)]">{approval.blockedPath}</span>
              </p>
            )}
          </div>

          {inputPreview && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Tool input
              </p>
              <pre className="max-h-64 overflow-auto rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-3 text-[11px] leading-5 text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                {inputPreview}
              </pre>
            </div>
          )}

          {approval.canRemember && (
            <label className="flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3.5 py-3 text-[12px] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-4 w-4 rounded border-[var(--glass-border-strong)] bg-transparent"
              />
              <span>Remember this choice for this session when possible</span>
            </label>
          )}
        </div>

        <div className="mx-6 h-px shrink-0 bg-[var(--glass-border)]" />

        <div className="flex items-center justify-end gap-2 px-6 py-4 shrink-0">
          <button
            onClick={onDeny}
            className="h-9 rounded-2xl px-4 text-[12px] font-semibold btn-glass"
          >
            Deny
          </button>
          <button
            onClick={() => onApprove(remember)}
            className="h-9 rounded-2xl bg-[var(--color-accent)] px-4 text-[12px] font-semibold text-[var(--color-accent-ink)] shadow-[0_10px_30px_-18px_var(--color-accent)] transition hover:brightness-110"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
