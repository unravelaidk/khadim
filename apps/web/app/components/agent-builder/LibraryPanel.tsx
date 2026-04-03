import { LibraryView } from "../Library/LibraryView";
import type { Workspace } from "../workspace";

interface LibraryPanelProps {
  workspaces: Workspace[];
  onSelectWorkspace: (id: string) => void;
}

export function LibraryPanel({ workspaces, onSelectWorkspace }: LibraryPanelProps) {
  return <LibraryView workspaces={workspaces} onSelectWorkspace={onSelectWorkspace} />;
}
