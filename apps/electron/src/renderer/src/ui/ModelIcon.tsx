import { Robot as Bot } from "@phosphor-icons/react";
import type { ModelConfig } from "../../../shared/types";
import { getResolvedModelIconUrl } from "../model-icons";

export function ModelIcon({ model, size = 22 }: { model: Pick<ModelConfig, "name" | "model" | "provider">; size?: number }): React.JSX.Element {
  const source = getResolvedModelIconUrl(model.name, model.model, model.provider);
  return <span className="model-brand-icon" style={{ width: size, height: size }}>{source ? <img src={source} alt="" /> : <Bot size={Math.max(12, size - 8)} />}</span>;
}
