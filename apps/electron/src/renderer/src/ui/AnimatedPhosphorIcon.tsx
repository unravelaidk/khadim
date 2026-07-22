import type { CSSProperties, ElementType } from "react";

export type AnimatedPhosphorIconKind =
  | "add"
  | "apps"
  | "artifacts"
  | "collapse"
  | "delete"
  | "disclosure"
  | "project"
  | "search"
  | "settings";

const partCounts: Record<AnimatedPhosphorIconKind, number> = {
  add: 1,
  apps: 2,
  artifacts: 3,
  collapse: 2,
  delete: 2,
  disclosure: 1,
  project: 1,
  search: 2,
  settings: 1,
};

interface AnimatedPhosphorIconProps {
  icon: ElementType;
  kind: AnimatedPhosphorIconKind;
  size: number;
}

export function AnimatedPhosphorIcon({ icon: Icon, kind, size }: AnimatedPhosphorIconProps): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`animated-phosphor-icon animated-phosphor-icon-${kind}`}
      style={{ "--animated-icon-size": `${size}px` } as CSSProperties}
    >
      {Array.from({ length: partCounts[kind] }, (_, index) => (
        <Icon
          aria-hidden="true"
          className={`animated-phosphor-icon-part animated-phosphor-icon-part-${index + 1}`}
          key={index}
          size={size}
        />
      ))}
    </span>
  );
}
