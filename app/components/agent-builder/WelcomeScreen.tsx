import { useRef } from "react";
import { LuX, LuFile, LuImage, LuTable } from "react-icons/lu";
import KhadimLogo from "../../assets/Khadim-logo.svg";
import { FeatureSelection } from "./FeatureSelection";

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content?: string; // Base64 or text content
}

interface WelcomeScreenProps {
  input: string;
  setInput: (value: string) => void;
  handleSend: () => void;
  activeBadges: Array<{ label: string; icon: React.ReactNode; prompt?: string }>;
  removeBadge: (label: string) => void;
  onSuggestionClick: (feature: { label: string; icon: React.ReactNode; prompt?: string }) => void;
  attachedFiles?: AttachedFile[];
  onFilesAttached?: (files: AttachedFile[]) => void;
  onRemoveFile?: (fileName: string) => void;
}

export function WelcomeScreen({
  input,
  setInput,
  handleSend,
  activeBadges,
  removeBadge,
  onSuggestionClick,
  attachedFiles = [],
  onFilesAttached,
  onRemoveFile,
}: WelcomeScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !onFilesAttached) return;

    const newFiles: AttachedFile[] = [];
    
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const content = await new Promise<string>((resolve) => {
        if (file.type.startsWith('image/')) {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.csv')) {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        } else {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsText(file);
        }
      });
      
      newFiles.push({
        name: file.name,
        type: file.type,
        size: file.size,
        content,
      });
    }
    
    onFilesAttached([...attachedFiles, ...newFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getFileIcon = (file: AttachedFile) => {
    if (file.type.startsWith('image/')) return <LuImage className="w-4 h-4" />;
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.csv')) return <LuTable className="w-4 h-4" />;
    return <LuFile className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  return (
    <div className="flex flex-col items-center justify-start min-h-[60vh] w-full max-w-3xl mx-auto space-y-6 pt-6 pb-10 animate-in fade-in duration-700">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gb-bg-card border border-gb-border shadow-sm text-xs font-mono font-medium text-gb-text-secondary uppercase tracking-wider">
        <span className="text-gb-text-muted">TURN 1</span>
        <span className="w-px h-3 bg-gb-border"></span>
        <span className="text-gb-accent hover:underline cursor-pointer animate-pulse">
          ROLL DICE
        </span>
      </div>

      {/* Header - Logo & Subtitle */}
      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 animate-in fade-in zoom-in duration-1000 text-center md:text-left mb-2 md:mb-0">
        <div className="w-24 h-24 md:w-32 md:h-32 text-gb-text animate-float">
          <KhadimLogo />
        </div>
        <p className="text-xl md:text-2xl font-mono text-gb-text-secondary tracking-wide max-w-[200px] md:max-w-none">
          Get started building
        </p>
      </div>

      {/* Large Input Card */}
      <div className="w-full bg-gb-bg-card border border-gb-border rounded-3xl shadow-gb-md hover:shadow-gb-lg transition-all duration-300 overflow-hidden relative group flex flex-col">
        {/* Active Badges */}
        {activeBadges.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-6 pt-6 pb-2 animate-in fade-in slide-in-from-bottom-2">
            {activeBadges.map((badge) => (
              <div
                key={badge.label}
                className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md bg-blue-500/10 text-blue-600 border border-blue-500/20 text-sm font-medium"
              >
                <span className="text-base">{badge.icon}</span>
                <span>{badge.label}</span>
                <button
                  onClick={() => removeBadge(badge.label)}
                  className="ml-1 p-0.5 rounded-sm hover:bg-blue-500/20 text-blue-600/60 hover:text-blue-600 transition-colors"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            activeBadges.length > 0
              ? "Describe what you want..."
              : "Awaiting instructions..."
          }
          className={`w-full bg-transparent px-6 md:px-8 text-base md:text-lg resize-none focus:outline-none placeholder:text-gb-text-muted/50 font-mono transition-all ${
            activeBadges.length > 0
              ? "h-24 md:h-32 pt-4"
              : "h-32 md:h-40 pt-6 md:pt-8"
          }`}
        />

        {/* Attached Files Display */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-6 pb-3 animate-in fade-in">
            {attachedFiles.map((file) => (
              <div
                key={file.name}
                className="relative group"
              >
                {/* Image Preview */}
                {file.type.startsWith('image/') && file.content ? (
                  <div className="relative">
                    <img 
                      src={file.content} 
                      alt={file.name}
                      className="w-20 h-20 object-cover rounded-lg border-2 border-emerald-500/30 shadow-md"
                    />
                    {onRemoveFile && (
                      <button
                        onClick={() => onRemoveFile(file.name)}
                        className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <LuX className="w-3 h-3" />
                      </button>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-b-lg truncate">
                      {file.name}
                    </div>
                  </div>
                ) : (
                  /* Non-image file badge */
                  <div className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 text-sm">
                    {getFileIcon(file)}
                    <span className="max-w-[120px] truncate">{file.name}</span>
                    <span className="text-xs text-emerald-600/60">{formatFileSize(file.size)}</span>
                    {onRemoveFile && (
                      <button
                        onClick={() => onRemoveFile(file.name)}
                        className="ml-1 p-0.5 rounded-sm hover:bg-emerald-500/20 text-emerald-600/60 hover:text-emerald-600 transition-colors"
                      >
                        <LuX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.json"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Input Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-gb-bg-subtle/50 border-t border-gb-border/50">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg hover:bg-gb-bg-card text-gb-text-muted hover:text-gb-text transition-colors group"
              title="Attach files (images, Excel, CSV)"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="group-hover:scale-110 transition-transform"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg hover:bg-gb-bg-card text-gb-text-muted hover:text-gb-text transition-colors group"
              title="Upload document"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="group-hover:scale-110 transition-transform"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </button>
            {attachedFiles.length > 0 && (
              <span className="text-xs text-gb-text-muted ml-1">
                {attachedFiles.length} file{attachedFiles.length !== 1 ? 's' : ''} attached
              </span>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() && attachedFiles.length === 0}
            className="p-2 rounded-lg bg-gb-accent text-white hover:bg-gb-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-sm"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Feature Selection Chips */}
      <FeatureSelection onSelect={onSuggestionClick} />
    </div>
  );
}
