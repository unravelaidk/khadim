import { PuzzlePiece } from "@phosphor-icons/react";

export function PluginLogo({ pluginId, icon, size = 20 }: { pluginId?: string; icon?: string; size?: number }): React.JSX.Element {
  const isOpenCode = pluginId === "khadim.opencode" || icon === "opencode";

  return (
    <span className={`plugin-logo${isOpenCode ? " opencode" : ""}`} style={{ "--plugin-logo-size": `${size}px` } as React.CSSProperties} aria-hidden="true">
      {isOpenCode
        ? <svg viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M16 6H8v12h8V6zm4 16H4V2h16v20z" /></svg>
        : <PuzzlePiece size={size} />}
    </span>
  );
}
