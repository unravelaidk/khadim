import { PuzzlePiece } from "@phosphor-icons/react";
import { getModelIconUrl } from "../assets/model-icons";

export function PluginLogo({ pluginId, icon, size = 20 }: { pluginId?: string; icon?: string; size?: number }): React.JSX.Element {
  const isOpenCode = pluginId === "khadim.opencode" || icon === "opencode";
  const isClaudeCode = pluginId === "khadim.claude-code" || icon === "claude";
  const modelIcon = isClaudeCode
    ? getModelIconUrl("claude")
    : pluginId === "khadim.codex" || icon === "openai"
      ? getModelIconUrl("codex") ?? getModelIconUrl("openai")
      : pluginId === "khadim.grok" || icon === "grok"
        ? getModelIconUrl("grok")
        : null;

  return (
    <span className={`plugin-logo${isOpenCode ? " opencode" : ""}`} style={{ "--plugin-logo-size": `${size}px` } as React.CSSProperties} aria-hidden="true">
      {isOpenCode
        ? <svg viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M16 6H8v12h8V6zm4 16H4V2h16v20z" /></svg>
        : modelIcon
          ? <img src={modelIcon} alt="" width={size} height={size} />
        : <PuzzlePiece size={size} />}
    </span>
  );
}
