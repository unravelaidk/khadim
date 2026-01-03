import { ScrollArea } from "../ui/scroll-area";
import type { Workspace } from "../workspace/workspace-types";
import { FileExplorerHeader } from "./FileExplorer/FileExplorerHeader";
import { FilePreviewCard } from "./FileExplorer/FilePreviewCard";

interface LibraryFileExplorerProps {
  workspace: Workspace;
  onBack: () => void;
  onLoad: () => void;
}

export function LibraryFileExplorer({ workspace, onBack, onLoad }: LibraryFileExplorerProps) {
  return (
    <div className="flex-1 h-full bg-gb-bg-subtle p-8 overflow-hidden flex flex-col">
      <FileExplorerHeader 
        workspaceName={workspace.name}
        workspaceId={workspace.id}
        onBack={onBack}
        onLoad={onLoad}
      />

      {/* Main Content Area */}
      <div className="flex-1 bg-gb-bg-subtle flex flex-col relative overflow-hidden">
        <div className="mb-4 font-sans text-xs font-medium flex justify-between items-center text-gb-text-secondary px-1">
          <span>Project Files</span>
          <span className="uppercase tracking-wider text-[10px]">Grid View</span>
        </div>

        <ScrollArea className="flex-1 -mr-4 pr-4">
          {workspace.files.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-64 text-gb-text-muted font-sans">
               <span className="text-4xl mb-3 opacity-30">📭</span>
               <p>[Empty Directory]</p>
             </div>
          ) : (
             <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
               {workspace.files.map((file) => (
                 <FilePreviewCard key={file.id} file={file} />
               ))}
             </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

