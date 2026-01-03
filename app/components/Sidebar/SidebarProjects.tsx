
export function SidebarProjects() {
  return (
    <div className="gb-section">
      <div className="gb-section-header">
        <span>Projects</span>
        <button className="gb-icon-btn-sm" title="New project">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <button className="gb-nav-item">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <path d="M12 11v6M9 14h6" />
        </svg>
        <span>New project</span>
      </button>
    </div>
  );
}
