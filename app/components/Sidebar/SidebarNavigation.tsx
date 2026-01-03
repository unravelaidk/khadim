
interface SidebarNavigationProps {
  onNavigate: (view: 'chat' | 'library') => void;
}

export function SidebarNavigation({ onNavigate }: SidebarNavigationProps) {
  return (
    <nav className="gb-nav">
      <button className="gb-nav-item">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <span>Search</span>
      </button>

      <button className="gb-nav-item" onClick={() => onNavigate('library')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span>Library</span>
      </button>
    </nav>
  );
}
