import { Badge } from "./ui/primitives";

export type FeatureId = "agents" | "studio";
export type FeatureMaturity = "alpha" | "beta";

interface FeatureStatus {
  maturity: FeatureMaturity;
  public: true;
  summary: string;
}

export const featureStatus: Record<FeatureId, FeatureStatus> = {
  agents: {
    maturity: "alpha",
    public: true,
    summary: "Available to everyone while agent setup, permissions, and run behavior continue to change.",
  },
  studio: {
    maturity: "beta",
    public: true,
    summary: "Available to everyone and ready for regular use, with some workflows still being refined.",
  },
};

export function FeatureMaturityBadge({ feature, compact = false }: { feature: FeatureId; compact?: boolean }): React.JSX.Element {
  const status = featureStatus[feature];
  return (
    <Badge className={`feature-maturity-badge is-${status.maturity} ${compact ? "is-compact" : ""}`} title={status.summary}>
      {status.maturity === "alpha" ? "Alpha" : "Beta"}
    </Badge>
  );
}
