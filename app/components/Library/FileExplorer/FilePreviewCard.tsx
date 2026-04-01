import type { FileNode } from "../../workspace/workspace-types";
import { formatFileSize } from "../../workspace/workspace-types";
import {
  LuFolder,
  LuFileCode2,
  LuGlobe,
  LuFileJson,
  LuFileSpreadsheet,
  LuFileImage,
  LuFileText,
  LuFile,
} from "react-icons/lu";

function getFileType(name: string, type: "file" | "folder"): "image" | "code" | "web" | "data" | "folder" | "unknown" {
  if (type === "folder") return "folder";
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png": case "jpg": case "jpeg": case "gif": case "svg": return "image";
    case "html": case "htm": return "web";
    case "js": case "ts": case "tsx": case "jsx": case "py": case "css": return "code";
    case "json": case "csv": case "xml": return "data";
    default: return "unknown";
  }
}

function getFileKind(name: string, type: "file" | "folder"): string {
  if (type === "folder") return "Folder";
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts": return "TypeScript";
    case "tsx": return "TSX";
    case "js": return "JavaScript";
    case "jsx": return "JSX";
    case "py": return "Python";
    case "css": return "Stylesheet";
    case "html": case "htm": return "HTML Document";
    case "json": return "JSON";
    case "csv": return "CSV Data";
    case "md": return "Markdown";
    case "png": case "jpg": case "jpeg": case "gif": case "svg": return "Image";
    default: return "Document";
  }
}

function FileIcon({ name, type }: { name: string; type: "file" | "folder" }) {
  const fileType = getFileType(name, type);
  const baseClass = "w-7 h-7";
  switch (fileType) {
    case "folder": return <LuFolder className={`${baseClass} text-[#5BA0D0]`} />;
    case "code": return <LuFileCode2 className={`${baseClass} text-[#8B9F78]`} />;
    case "web": return <LuGlobe className={`${baseClass} text-[#D08B5B]`} />;
    case "data": return <LuFileJson className={`${baseClass} text-[#C4A35A]`} />;
    case "image": return <LuFileImage className={`${baseClass} text-[#B07DB0]`} />;
    default: return <LuFile className={`${baseClass} text-[var(--text-muted)]`} />;
  }
}

interface FilePreviewCardProps {
  file: FileNode;
  onClick?: () => void;
}

export function FilePreviewCard({ file, onClick }: FilePreviewCardProps) {
  const type = getFileType(file.name, file.type);
  const kind = getFileKind(file.name, file.type);

  const renderPreview = () => {
    switch (type) {
      case "web":
        return (
          <div className="w-full h-full bg-white flex flex-col overflow-hidden relative group-hover:scale-[1.02] transition-transform duration-500 origin-top">
            <div className="h-5 bg-gray-50/80 border-b border-gray-100 flex items-center gap-1.5 px-2.5">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-300/60" />
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-300/60" />
                <div className="w-1.5 h-1.5 rounded-full bg-green-300/60" />
              </div>
              <div className="flex-1 mx-2 h-2.5 bg-gray-100 rounded-full" />
            </div>
            <div className="flex-1 p-3 space-y-2">
              <div className="h-2 w-3/4 bg-gray-100 rounded-sm" />
              <div className="h-14 w-full bg-gray-50 rounded-md border border-gray-100" />
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-gray-100 rounded-sm" />
                <div className="h-1.5 w-5/6 bg-gray-100 rounded-sm" />
              </div>
            </div>
          </div>
        );
      case "code":
        return (
          <div className="w-full h-full bg-[#1a1e14] p-3 overflow-hidden group-hover:scale-[1.02] transition-transform duration-500 origin-top">
            <div className="space-y-1.5">
              <div className="flex gap-1.5 items-center mb-2">
                <div className="w-1 h-1 rounded-full bg-emerald-500/40" />
                <div className="w-16 h-1.5 bg-white/8 rounded-sm" />
              </div>
              <div className="w-3/4 h-1.5 bg-emerald-400/10 rounded-sm" />
              <div className="w-full h-1.5 bg-white/6 rounded-sm" />
              <div className="w-5/6 h-1.5 bg-white/6 rounded-sm" />
              <div className="ml-4 w-1/2 h-1.5 bg-yellow-400/8 rounded-sm" />
              <div className="ml-4 w-2/3 h-1.5 bg-white/5 rounded-sm" />
              <div className="w-4/5 h-1.5 bg-white/6 rounded-sm" />
            </div>
          </div>
        );
      case "data":
        return (
          <div className="w-full h-full bg-white p-2.5 overflow-hidden group-hover:scale-[1.02] transition-transform duration-500 origin-top">
            <div className="border border-gray-100 rounded-md overflow-hidden">
              <div className="flex border-b border-gray-100 bg-gray-50/80 h-5">
                <div className="flex-1 border-r border-gray-100 px-1.5 flex items-center"><div className="h-1.5 w-full bg-gray-200 rounded-sm" /></div>
                <div className="flex-1 border-r border-gray-100 px-1.5 flex items-center"><div className="h-1.5 w-full bg-gray-200 rounded-sm" /></div>
                <div className="flex-1 px-1.5 flex items-center"><div className="h-1.5 w-full bg-gray-200 rounded-sm" /></div>
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex border-b border-gray-50 h-4 last:border-0">
                  <div className="flex-1 border-r border-gray-50" />
                  <div className="flex-1 border-r border-gray-50" />
                  <div className="flex-1" />
                </div>
              ))}
            </div>
          </div>
        );
      case "folder":
        return (
          <div className="w-full h-full bg-[var(--glass-bg)] flex items-center justify-center group-hover:scale-[1.02] transition-transform duration-500">
            <LuFolder className="w-12 h-12 text-[#5BA0D0] opacity-40" />
          </div>
        );
      default:
        return (
          <div className="w-full h-full bg-gray-50 flex items-center justify-center group-hover:scale-[1.02] transition-transform duration-500">
            <LuFile className="w-10 h-10 text-gray-300" />
          </div>
        );
    }
  };

  return (
    <div 
      onClick={onClick}
      className="group glass-card rounded-xl cursor-pointer flex flex-col h-[200px] overflow-hidden"
    >
      {/* Preview Area */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0">
          {renderPreview()}
        </div>
      </div>

      {/* Footer — Finder style */}
      <div className="px-3 py-2.5 border-t border-[var(--glass-border)] bg-[var(--surface-card)] flex items-center gap-2.5">
        <FileIcon name={file.name} type={file.type} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--text-primary)] truncate leading-tight">
            {file.name}
          </p>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
            <span>{kind}</span>
            <span className="opacity-40">·</span>
            <span>{file.type === "folder" ? "—" : file.size ? formatFileSize(file.size) : "—"}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
