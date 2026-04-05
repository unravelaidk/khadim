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
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">GitHub</h2>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Connect your GitHub account to enable repository operations.
        </p>
        <GitHubAuthPanel authStatus={githubAuthStatus} onAuthChange={onGitHubAuthChange} />
      </div>
    </div>
  );
}
