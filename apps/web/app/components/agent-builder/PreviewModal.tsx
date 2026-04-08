import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../ui";
import { Button } from "../ui";
import type { AgentConfig } from "../../types/chat";

interface PreviewModalProps {
  agentConfig: AgentConfig;
  isOpen: boolean;
  onClose: () => void;
  onDeploy: () => void;
}

export function PreviewModal({ agentConfig, isOpen, onClose, onDeploy }: PreviewModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#10150a]">
              <svg
                className="w-5 h-5 text-[var(--text-inverse)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <DialogTitle>{agentConfig.name}</DialogTitle>
              <DialogDescription>
                {agentConfig.personality || "Friendly assistant"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide mb-2 text-[var(--text-muted)]">
              Capabilities
            </h3>
            <div className="flex flex-wrap gap-2">
              {agentConfig.capabilities.map((cap, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-lg text-sm bg-[var(--glass-bg)] text-[var(--text-secondary)]"
                >
                  {cap}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide mb-2 text-[var(--text-muted)]">
              Description
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {agentConfig.description}
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" className="flex-1">
              Keep Editing
            </Button>
          </DialogClose>
          <Button onClick={onDeploy} className="flex-1">
            Deploy Agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
