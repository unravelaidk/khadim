import * as Collapsible from "@radix-ui/react-collapsible";
import { useState } from "react";
import type { Workspace } from "./workspace-types";
import { countFiles, formatRetroDate } from "./workspace-types";
import { FileTree } from "./FileTree";

interface WorkspaceItemProps {
  workspace: Workspace;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function WorkspaceItem({ workspace, isSelected, onSelect }: WorkspaceItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fileCount = countFiles(workspace.files);

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <Collapsible.Trigger asChild>
        <button
          className={`retro-workspace-item ${isSelected ? "selected" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(workspace.id);
          }}
        >
          <span className="retro-ws-icon">{isOpen ? "📂" : "📁"}</span>
          <span className="retro-ws-name">{workspace.name}</span>
          <span className="retro-ws-count">{fileCount}</span>
          <span className="retro-ws-date">
            {formatRetroDate(workspace.createdAt)}
          </span>
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="retro-workspace-preview">
        <FileTree files={workspace.files} />
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
