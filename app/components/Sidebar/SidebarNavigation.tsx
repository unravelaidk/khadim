import { LuSearch, LuBook } from "react-icons/lu";
interface SidebarNavigationProps {
  onNavigate: (view: 'chat' | 'library') => void;
}

export function SidebarNavigation({ onNavigate }: SidebarNavigationProps) {
  return (
    <nav className="gb-nav">
      <button className="gb-nav-item">
        <LuSearch className="w-[18px] h-[18px]" />
        <span>Search</span>
      </button>

      <button className="gb-nav-item" onClick={() => onNavigate('library')}>
        <LuBook className="w-[18px] h-[18px]" />
        <span>Library</span>
      </button>
    </nav>
  );
}
