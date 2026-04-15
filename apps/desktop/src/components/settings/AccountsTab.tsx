import type { GitHubAuthStatus } from "../../lib/bindings";
import { GitHubAuthPanel } from "../GitHubAuthPanel";

export function AccountsTab({
  githubAuthStatus,
  onGitHubAuthChange,
}: {
  githubAuthStatus: GitHubAuthStatus | null;
  onGitHubAuthChange: (status: GitHubAuthStatus) => void;
}) {
  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div>
        <p className="text-[12px] text-[var(--text-secondary)] mb-6 leading-relaxed">
          Linked accounts for repository access and integrations.
        </p>
      </div>

      <section>
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">GitHub</h3>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Connect your GitHub account to enable repository operations.
        </p>
        <div className="depth-card p-5">
          <GitHubAuthPanel authStatus={githubAuthStatus} onAuthChange={onGitHubAuthChange} />
        </div>
      </section>
    </div>
  );
}
