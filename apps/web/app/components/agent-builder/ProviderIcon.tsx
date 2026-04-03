import { memo } from "react";
import { getProviderIconUrl } from "../../assets/model-icons";

const DEFAULT_SVG = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
    <path d="M20.66 7A10 10 0 0 0 14 2v6.66z" />
  </svg>
);

function ProviderIconComponent({ provider, className = "h-4 w-4" }: { provider: string; className?: string }) {
  const iconUrl = getProviderIconUrl(provider as Parameters<typeof getProviderIconUrl>[0]);

  if (iconUrl) {
    return <img src={iconUrl} alt={provider} className={className} />;
  }

  return <span className={className}>{DEFAULT_SVG}</span>;
}

export const ProviderIcon = memo(ProviderIconComponent);