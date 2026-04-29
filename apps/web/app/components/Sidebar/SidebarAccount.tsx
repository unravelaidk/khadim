import { Link, useNavigate } from "react-router";
import { LuLoaderCircle, LuLogIn, LuLogOut, LuUserRound } from "react-icons/lu";
import { authClient } from "../../lib/auth-client";

interface SidebarAccountProps {
  isCollapsed?: boolean;
}

export function SidebarAccount({ isCollapsed = false }: SidebarAccountProps) {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const user = session.data?.user;

  if (session.isPending) {
    return (
      <div className={`border-t border-[var(--glass-border)] ${isCollapsed ? "p-3" : "p-4"}`}>
        <div className={`flex items-center gap-3 text-[var(--text-muted)] ${isCollapsed ? "justify-center" : ""}`}>
          <LuLoaderCircle className="h-4 w-4 animate-spin" />
          {!isCollapsed ? <span className="text-sm">Checking account</span> : null}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`border-t border-[var(--glass-border)] ${isCollapsed ? "p-2" : "p-3"}`}>
        <Link
          to="/login"
          className={`flex items-center rounded-xl text-[var(--text-secondary)] transition-all hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] ${
            isCollapsed ? "mx-auto h-11 w-11 justify-center" : "gap-3 px-3 py-2"
          }`}
          title={isCollapsed ? "Log in" : undefined}
        >
          <LuLogIn className="h-[18px] w-[18px] shrink-0" />
          {!isCollapsed ? <span className="text-sm font-medium">Log in</span> : null}
        </Link>
      </div>
    );
  }

  return (
    <div className={`border-t border-[var(--glass-border)] ${isCollapsed ? "p-2" : "p-3"}`}>
      <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#10150a] text-[var(--text-inverse)]">
          <LuUserRound className="h-4 w-4" />
        </div>
        {!isCollapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{user.name || "Khadim user"}</p>
            <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
          </div>
        ) : null}
        {!isCollapsed ? (
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            title="Log out"
            aria-label="Log out"
            onClick={() => {
              void authClient.signOut({
                fetchOptions: {
                  onSuccess: () => navigate("/login", { replace: true }),
                },
              });
            }}
          >
            <LuLogOut className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
