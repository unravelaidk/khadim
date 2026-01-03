import type { Message } from "../agent-builder";

export interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  size?: number;
  modifiedAt: Date;
  children?: FileNode[];
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: Date;
  files: FileNode[];
  messages: Message[];
}

// Sample mock data for demonstration
export const mockWorkspaces: Workspace[] = [
  {
    id: "ws-1",
    name: "Email Assistant Project",
    createdAt: new Date("2025-12-19"),
    messages: [],
    files: [
      {
        id: "f1",
        name: "python_scripts",
        type: "folder",
        modifiedAt: new Date("2025-12-19T22:09:00"),
        children: [
          { id: "f1-1", name: "agent.py", type: "file", size: 4200, modifiedAt: new Date("2025-12-19T22:09:00") },
          { id: "f1-2", name: "prompts.py", type: "file", size: 1800, modifiedAt: new Date("2025-12-18T14:30:00") },
        ],
      },
      {
        id: "f2",
        name: "config.json",
        type: "file",
        size: 1200,
        modifiedAt: new Date("2025-12-15T10:00:00"),
      },
    ],
  },
  {
    id: "ws-2",
    name: "Code Review Bot",
    createdAt: new Date("2025-11-25"),
    messages: [],
    files: [
      {
        id: "f3",
        name: "skills",
        type: "folder",
        modifiedAt: new Date("2025-11-25T21:32:00"),
        children: [
          { id: "f3-1", name: "review.js", type: "file", size: 8400, modifiedAt: new Date("2025-11-25T21:32:00") },
          { id: "f3-2", name: "lint.js", type: "file", size: 2100, modifiedAt: new Date("2025-11-24T16:45:00") },
        ],
      },
      { id: "f4", name: "README.md", type: "file", size: 3200, modifiedAt: new Date("2025-11-28T17:17:00") },
      { id: "f5", name: "index.html", type: "file", size: 1300, modifiedAt: new Date("2025-11-28T17:13:00") },
    ],
  },
  {
    id: "ws-3",
    name: "Customer Support Agent",
    createdAt: new Date("2025-11-20"),
    messages: [],
    files: [
      { id: "f6", name: "responses.csv", type: "file", size: 15200, modifiedAt: new Date("2025-11-20T15:30:00") },
      { id: "f7", name: "training_data.json", type: "file", size: 48000, modifiedAt: new Date("2025-11-19T09:22:00") },
    ],
  },
];

// Helper to count total files recursively
export function countFiles(files: FileNode[]): number {
  return files.reduce((count, file) => {
    if (file.type === "folder" && file.children) {
      return count + countFiles(file.children);
    }
    return count + 1;
  }, 0);
}

// Helper to format file size
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper to format date in retro style
export function formatRetroDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
