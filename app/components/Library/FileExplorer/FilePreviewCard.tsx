import type { FileNode } from "../../workspace/workspace-types";
import { formatFileSize, formatRetroDate } from "../../workspace/workspace-types";

function getFileType(name: string, type: "file" | "folder"): "image" | "code" | "web" | "data" | "folder" | "unknown" {
  if (type === "folder") return "folder";
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
      return "image";
    case "html":
    case "htm":
      return "web";
    case "js":
    case "ts":
    case "tsx":
    case "jsx":
    case "py":
    case "css":
      return "code";
    case "json":
    case "csv":
    case "xml":
      return "data";
    default:
      return "unknown";
  }
}

interface FilePreviewCardProps {
  file: FileNode;
  onClick?: () => void;
}

export function FilePreviewCard({ file, onClick }: FilePreviewCardProps) {
  const type = getFileType(file.name, file.type);

  const renderPreview = () => {
    switch (type) {
      case "web":
        return (
          <div className="w-full h-full bg-white flex flex-col overflow-hidden relative group-hover:scale-105 transition-transform duration-500 origin-top">
            {/* Mock Browser Header */}
            <div className="h-4 bg-gray-50 border-b border-gray-100 flex items-center gap-1.5 px-3">
              <div className="w-1.5 h-1.5 rounded-full bg-gb-border-dark" />
              <div className="w-1.5 h-1.5 rounded-full bg-gb-border-dark" />
            </div>
             {/* Mock Website Content - Cleaner */}
            <div className="flex-1 p-3 space-y-2">
              <div className="h-2 w-3/4 bg-gray-100 rounded-sm" />
              <div className="h-16 w-full bg-gray-50 rounded-md border border-gray-100" />
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-gray-100 rounded-sm" />
                <div className="h-1.5 w-5/6 bg-gray-100 rounded-sm" />
              </div>
            </div>
          </div>
        );
      case "code":
        return (
          <div className="w-full h-full bg-gb-bg-subtle p-3 overflow-hidden font-mono text-[7px] leading-[1.6] text-gb-text opacity-70 group-hover:scale-105 transition-transform duration-500 origin-top">
             <div className="space-y-0.5">
               <div className="w-2/3 h-1.5 bg-gray-300 rounded-sm mb-2" />
               <div className="w-full h-1.5 bg-gray-200 rounded-sm" />
               <div className="w-5/6 h-1.5 bg-gray-200 rounded-sm" />
               <div className="w-4/5 h-1.5 bg-gray-200 rounded-sm" />
               <div className="ml-4 w-1/2 h-1.5 bg-gray-200 rounded-sm" />
             </div>
          </div>
        );
      case "data":
        return (
          <div className="w-full h-full bg-white p-2 overflow-hidden group-hover:scale-105 transition-transform duration-500 origin-top">
            <div className="border border-gray-100 rounded-sm overflow-hidden">
                <div className="flex border-b border-gray-100 bg-gray-50 h-4">
                     <div className="flex-1 border-r border-gray-100"></div>
                     <div className="flex-1 border-r border-gray-100"></div>
                     <div className="flex-1"></div>
                </div>
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex border-b border-gray-100 h-4 last:border-0">
                         <div className="flex-1 border-r border-gray-100"></div>
                         <div className="flex-1 border-r border-gray-100"></div>
                         <div className="flex-1"></div>
                    </div>
                ))}
            </div>
          </div>
        );
      case "folder":
        return (
          <div className="w-full h-full bg-gb-bg-subtle/50 flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
            <div className="text-5xl opacity-80 select-none grayscale opacity-40">📁</div>
          </div>
        );
      default:
        return (
          <div className="w-full h-full bg-gray-50 flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
             <div className="text-4xl text-gray-300">📄</div>
          </div>
        );
    }
  };

  return (
    <div 
      onClick={onClick}
      className="group bg-gb-bg-card border border-gb-border rounded-xl cursor-pointer flex flex-col h-[180px] overflow-hidden shadow-gb-sm hover:shadow-gb-md hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gb-border-medium/30 bg-white flex items-center justify-between">
         <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-sm opacity-70">
              {type === 'folder' ? '📁' : type === 'web' ? '🌐' : type === 'code' ? '📜' : '📄'}
            </span>
            <span className="font-sans text-xs font-medium text-gb-text truncate">
              {file.name}
            </span>
         </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 overflow-hidden relative bg-gb-bg-subtle/30">
        <div className="absolute inset-0 p-3">
           <div className="w-full h-full rounded-lg border border-gb-border/40 overflow-hidden bg-white shadow-sm">
                {renderPreview()}
           </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gb-border-medium/30 bg-gb-bg-card text-[10px] font-medium font-sans text-gb-text-muted flex justify-between">
        <span>{type === 'folder' ? 'FOLDER' : file.size ? formatFileSize(file.size) : 'FILE'}</span>
        <span>{formatRetroDate(file.modifiedAt).split(' ')[0]}</span>
      </div>
    </div>
  );
}
