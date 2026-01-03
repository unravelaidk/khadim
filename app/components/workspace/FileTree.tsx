import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import type { FileNode } from "./workspace-types";
import { formatFileSize, formatRetroDate } from "./workspace-types";

interface FileItemProps {
  file: FileNode;
  depth?: number;
}

// File extension to icon mapping
function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "py":
      return "🐍";
    case "js":
    case "ts":
    case "tsx":
    case "jsx":
      return "📜";
    case "html":
      return "🌐";
    case "css":
      return "🎨";
    case "json":
      return "📋";
    case "md":
      return "📄";
    case "csv":
      return "📊";
    default:
      return "📃";
  }
}

export function FileItem({ file, depth = 0 }: FileItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isFolder = file.type === "folder";
  const paddingLeft = 12 + depth * 16;

  if (isFolder) {
    return (
      <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
        <Collapsible.Trigger asChild>
          <button
            className="retro-file-item retro-folder"
            style={{ paddingLeft }}
          >
            <span className="retro-file-icon">
              {isOpen ? "📂" : "📁"}
            </span>
            <span className="retro-file-name">{file.name}</span>
            <span className="retro-file-date">
              {formatRetroDate(file.modifiedAt)}
            </span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className="retro-folder-content">
          {file.children?.map((child) => (
            <FileItem key={child.id} file={child} depth={depth + 1} />
          ))}
        </Collapsible.Content>
      </Collapsible.Root>
    );
  }

  return (
    <button
      className="retro-file-item"
      style={{ paddingLeft }}
    >
      <span className="retro-file-icon">{getFileIcon(file.name)}</span>
      <span className="retro-file-name">{file.name}</span>
      <span className="retro-file-size">
        {file.size ? formatFileSize(file.size) : ""}
      </span>
      <span className="retro-file-date">
        {formatRetroDate(file.modifiedAt)}
      </span>
    </button>
  );
}

interface FileTreeProps {
  files: FileNode[];
}

export function FileTree({ files }: FileTreeProps) {
  if (files.length === 0) {
    return (
      <div className="retro-empty-state">
        No files in workspace
      </div>
    );
  }

  return (
    <div className="retro-file-tree">
      {files.map((file) => (
        <FileItem key={file.id} file={file} />
      ))}
    </div>
  );
}
