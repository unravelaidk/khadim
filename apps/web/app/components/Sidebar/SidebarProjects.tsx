import { LuPlus, LuFolderPlus } from "react-icons/lu";
export function SidebarProjects() {
  return (
    <div className="gb-section">
      <div className="gb-section-header">
        <span>Projects</span>
        <button className="gb-icon-btn-sm" title="New project">
          <LuPlus className="w-3.5 h-3.5" />
        </button>
      </div>

      <button className="gb-nav-item">
        <LuFolderPlus className="w-[18px] h-[18px]" />
        <span>New project</span>
      </button>
    </div>
  );
}
