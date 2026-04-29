/**
 * Agent backend interface — replaceable provider for provider/model discovery.
 *
 * Each installed agent (Khadim, OpenCode, Claude Code, etc.) can
 * implement this interface so the Settings panel dynamically picks up
 * the providers and models that the agent supports.
 */

export interface ProviderInfo {
  id: string;
  name: string;
}

export interface ModelInfo {
  id: string;
  name: string;
}

export interface AgentBackend {
  readonly name: string;
  getProviders(): Promise<ProviderInfo[]>;
  getModels(provider: string): Promise<ModelInfo[]>;
}

/**
 * Resolve the active agent backend. Returns null when no agent is installed.
 * Extend this function when adding new agent backends.
 */
export async function resolveAgentBackend(): Promise<AgentBackend | null> {
  try {
    const { KhadimBackend } = await import("./khadim");
    const backend = new KhadimBackend();
    const providers = await backend.getProviders();
    if (providers.length > 0) return backend;
  } catch {
    // Khadim not installed or binary not found
  }
  return null;
}
