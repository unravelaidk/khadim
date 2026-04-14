/**
 * Shared icon components — thin wrappers around Remix Icon classes.
 * Each component renders an <i> tag with the appropriate ri-* class.
 * The `className` prop controls sizing via Tailwind text-size utilities.
 */

export function BranchIcon({ className = "text-[14px]" }: { className?: string }) {
  return <i className={`ri-git-branch-line leading-none ${className}`} />;
}

export function WorktreeIcon({ className = "text-[14px]" }: { className?: string }) {
  return <i className={`ri-folder-open-line leading-none ${className}`} />;
}

export function PlusIcon({ className = "text-[14px]" }: { className?: string }) {
  return <i className={`ri-add-line leading-none ${className}`} />;
}

export function ChevronLeftIcon({ className = "text-[16px]" }: { className?: string }) {
  return <i className={`ri-arrow-left-s-line leading-none ${className}`} />;
}

export function CloseIcon({ className = "text-[16px]" }: { className?: string }) {
  return <i className={`ri-close-line leading-none ${className}`} />;
}

export function MoreDotsIcon({ className = "text-[16px]" }: { className?: string }) {
  return <i className={`ri-more-line leading-none ${className}`} />;
}

export function SettingsIcon({ className = "text-[16px]" }: { className?: string }) {
  return <i className={`ri-settings-3-line leading-none ${className}`} />;
}

export function ChatBubbleIcon({ className = "text-[20px]" }: { className?: string }) {
  return <i className={`ri-chat-1-line leading-none ${className}`} />;
}

export function TrashIcon({ className = "text-[16px]" }: { className?: string }) {
  return <i className={`ri-delete-bin-line leading-none ${className}`} />;
}

export function TerminalIcon({ className = "text-[14px]" }: { className?: string }) {
  return <i className={`ri-terminal-box-line leading-none ${className}`} />;
}

export function SearchIcon({ className = "text-[14px]" }: { className?: string }) {
  return <i className={`ri-search-line leading-none ${className}`} />;
}

export function EditorIcon({ className = "text-[14px]" }: { className?: string }) {
  return <i className={`ri-external-link-line leading-none ${className}`} />;
}

export function DiffIcon({ className = "text-[14px]" }: { className?: string }) {
  return <i className={`ri-git-commit-line leading-none ${className}`} />;
}
