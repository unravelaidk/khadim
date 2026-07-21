export function ToggleSwitch({ enabled }: { enabled: boolean }): React.JSX.Element {
  return <span className={`capability-switch ${enabled ? "enabled" : ""}`} aria-hidden="true"><i /></span>;
}
