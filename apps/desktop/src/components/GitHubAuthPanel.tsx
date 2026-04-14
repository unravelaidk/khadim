import { useState, useEffect } from "react";
import { commands, type GitHubAuthStatus, type GhCliInfo } from "../lib/bindings";

interface GitHubAuthPanelProps {
  authStatus: GitHubAuthStatus | null;
  onAuthChange: (status: GitHubAuthStatus) => void;
}

export function GitHubAuthPanel({ authStatus, onAuthChange }: GitHubAuthPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [ghCli, setGhCli] = useState<GhCliInfo | null>(null);
  const [setupGitBusy, setSetupGitBusy] = useState(false);
  const [setupGitDone, setSetupGitDone] = useState(false);

  const authenticated = authStatus?.authenticated ?? false;

  useEffect(() => {
    void commands.githubGhCliInfo().then(setGhCli).catch(() => {});
  }, []);

  async function startLogin() {
    setError(null);
    setLoggingIn(true);
    try {
      // This runs `gh auth login --web` which blocks until the user
      // completes browser auth. On success, `gh` stores the token.
      await commands.githubAuthLogin();
      // Now check status to get user info
      const status = await commands.githubAuthStatus();
      onAuthChange(status);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: unknown }).message)
          : typeof e === "string"
            ? e
            : "Login failed. Make sure `gh` CLI is installed.";
      setError(msg);
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    try {
      await commands.githubAuthLogout();
      onAuthChange({ authenticated: false, user: null });
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: unknown }).message)
          : typeof e === "string"
            ? e
            : "Logout failed";
      setError(msg);
    }
  }

  async function handleSetupGit() {
    setSetupGitBusy(true);
    try {
      await commands.githubGhSetupGit();
      setSetupGitDone(true);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: unknown }).message)
          : typeof e === "string"
            ? e
            : "gh auth setup-git failed";
      setError(msg);
    } finally {
      setSetupGitBusy(false);
    }
  }

  // ── Authenticated state ────────────────────────────────────────────
  if (authenticated && authStatus?.user) {
    const user = authStatus.user;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl glass-card-static p-4">
          <div className="flex items-center gap-3">
            <img
              src={user.avatar_url}
              alt={user.login}
              className="w-10 h-10 rounded-full border border-[var(--glass-border-strong)]"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-[var(--text-primary)] truncate">
                {user.name ?? user.login}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] truncate">@{user.login}</p>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-success-text)] bg-[var(--color-success-muted)] rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
              Connected
            </span>
          </div>
          <button
            onClick={() => void logout()}
            className="mt-3 h-7 px-3 rounded-xl text-[11px] font-semibold text-[var(--color-danger-text)] bg-[var(--color-danger-muted)] border border-[var(--color-danger-border)] hover:bg-[var(--color-danger-bg-strong)] transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* gh CLI info */}
        {ghCli && (
          <div className="rounded-2xl glass-card-static p-4">
            <h3 className="text-[12px] font-bold text-[var(--text-primary)] mb-2">gh CLI</h3>
            {ghCli.installed ? (
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Installed at{" "}
                  <span className="font-mono text-[var(--text-primary)]">{ghCli.path}</span>
                  {ghCli.version && (
                    <span className="text-[var(--text-muted)]"> v{ghCli.version}</span>
                  )}
                </p>
                <button
                  onClick={() => void handleSetupGit()}
                  disabled={setupGitBusy || setupGitDone}
                  className="h-7 px-3 rounded-xl btn-glass text-[11px] font-semibold disabled:opacity-50"
                >
                  {setupGitDone
                    ? "Configured"
                    : setupGitBusy
                      ? "Setting up..."
                      : "Run gh auth setup-git"}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--text-muted)]">
                Not installed. Install <span className="font-mono">gh</span> for git credential
                management.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Login flow ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="rounded-2xl glass-card-static p-4">
        <h3 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Connect GitHub</h3>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Sign in with your GitHub account to manage issues and pull requests.
          {!ghCli?.installed && (
            <span className="block mt-1 text-[var(--color-warning-text)]">
              Requires the{" "}
              <a
                href="https://cli.github.com"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                GitHub CLI (gh)
              </a>{" "}
              to be installed.
            </span>
          )}
        </p>

        {error && (
          <div className="rounded-xl bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] p-3 mb-3">
            <p className="text-[11px] text-[var(--color-danger-text)]">{error}</p>
          </div>
        )}

        {loggingIn ? (
          <div className="space-y-3">
            <p className="text-[11px] text-[var(--text-secondary)] text-center">
              Waiting for browser authentication...
            </p>
            <div className="flex justify-center">
              <div className="w-5 h-5 border-2 border-[var(--glass-border-strong)] border-t-[var(--text-primary)] rounded-full dot-spinner" />
            </div>
            <p className="text-[10px] text-[var(--text-muted)] text-center">
              Complete the login in your browser. This window will update automatically.
            </p>
          </div>
        ) : (
          <button
            onClick={() => void startLogin()}
            disabled={!ghCli?.installed}
            className="h-8 px-4 rounded-xl btn-ink text-[12px] font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <i className="ri-github-fill text-[16px] leading-none" />
            Sign in with GitHub
          </button>
        )}
      </div>
    </div>
  );
}
