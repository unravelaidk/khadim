import { Button } from "../ui";
import type { AgentConfig } from "./types";
import DexoLogo from "../../assets/Dexo-logo.svg";

interface HeaderProps {
  agentConfig: AgentConfig | null;
  onPreview: () => void;
}

export function Header({ agentConfig, onPreview }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-gb-bg/90 border-b border-gb-border">
      <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DexoLogo />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-gb-text">
              Dexo
            </h1>
            <p className="text-xs text-gb-text-muted">
              AI Agent Builder
            </p>
          </div>
        </div>

        {agentConfig && (
          <Button onClick={onPreview} size="sm">
            Preview
          </Button>
        )}
      </div>
    </header>
  );
}
