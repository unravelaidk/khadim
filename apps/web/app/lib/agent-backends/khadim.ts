/**
 * Khadim agent backend — calls the khadim binary to discover
 * available providers and models.
 */

import type { AgentBackend, ProviderInfo, ModelInfo } from "./types";

export class KhadimBackend implements AgentBackend {
  readonly name = "khadim";

  async getProviders(): Promise<ProviderInfo[]> {
    const { getProviders: khadimGetProviders } = await import("@unravelai/khadim");
    return khadimGetProviders();
  }

  async getModels(provider: string): Promise<ModelInfo[]> {
    const { getModels: khadimGetModels } = await import("@unravelai/khadim");
    return khadimGetModels(provider);
  }
}
