import type { SearchProviderId, SearchSettings, SearchSettingsUpdate } from "../../shared/types";
import type { CredentialVault, StoredSearchSettings } from "../domain/configuration";
import type { DocumentRepository } from "../domain/repositories";

export const searchProviderDefinitions = [
  { id: "duckduckgo", name: "DuckDuckGo", description: "No-key provider for basic public web search", requiresApiKey: false, env: null },
  { id: "parallel", name: "Parallel", description: "AI-native search with long, source-grounded excerpts", requiresApiKey: true, env: "PARALLEL_API_KEY" },
  { id: "exa", name: "Exa", description: "Semantic search for research, code, companies, and people", requiresApiKey: true, env: "EXA_API_KEY" },
  { id: "tavily", name: "Tavily", description: "Agent-focused web search with clean extracted content", requiresApiKey: true, env: "TAVILY_API_KEY" },
  { id: "perplexity", name: "Perplexity", description: "Ranked web results from Perplexity Search", requiresApiKey: true, env: "PERPLEXITY_API_KEY" },
  { id: "brave", name: "Brave", description: "Independent web index with rich result snippets", requiresApiKey: true, env: "BRAVE_SEARCH_API_KEY" },
] as const;

export function normalizeStoredSearchSettings(value: unknown): StoredSearchSettings {
  const source = value && typeof value === "object" ? value as Partial<StoredSearchSettings> : {};
  const activeProvider = searchProviderDefinitions.some((provider) => provider.id === source.activeProvider)
    ? source.activeProvider as SearchProviderId
    : "duckduckgo";
  return {
    activeProvider,
    encryptedApiKeys: source.encryptedApiKeys && typeof source.encryptedApiKeys === "object"
      ? source.encryptedApiKeys
      : {},
  };
}

export class SearchSettingsService {
  #mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: DocumentRepository<StoredSearchSettings>,
    private readonly credentials: CredentialVault,
  ) {}

  async get(): Promise<SearchSettings> {
    return this.toPublic(await this.repository.read());
  }

  save(update: SearchSettingsUpdate): Promise<SearchSettings> {
    return this.serialize(async () => {
    if (!update || typeof update !== "object") throw new Error("Invalid search settings.");
    const active = searchProviderDefinitions.find((provider) => provider.id === update.activeProvider);
    if (!active) throw new Error("Unknown search provider.");
    const target = update.provider
      ? searchProviderDefinitions.find((provider) => provider.id === update.provider)
      : undefined;
    if (update.provider && !target) throw new Error("Unknown search credential provider.");
    if (update.apiKey !== undefined && (typeof update.apiKey !== "string" || !update.apiKey.trim() || update.apiKey.length > 4_096)) {
      throw new Error("Search API key must be between 1 and 4096 characters.");
    }
    const current = await this.repository.read();
    const encryptedApiKeys = { ...current.encryptedApiKeys };
    if (target && update.clearApiKey) delete encryptedApiKeys[target.id];
    if (target && update.apiKey) encryptedApiKeys[target.id] = this.credentials.encrypt(update.apiKey.trim());
    if (active.requiresApiKey && !encryptedApiKeys[active.id]) {
      throw new Error(`Add a ${active.name} API key before selecting it.`);
    }
    const next = { activeProvider: active.id, encryptedApiKeys };
    await this.repository.write(next);
      return this.toPublic(next);
    });
  }

  async runConfiguration(): Promise<{ provider: SearchProviderId; env: NodeJS.ProcessEnv; warning?: string }> {
    const settings = await this.repository.read();
    const provider = searchProviderDefinitions.find((candidate) => candidate.id === settings.activeProvider);
    if (!provider) return {
      provider: "duckduckgo",
      env: {},
      warning: "The selected search provider is unavailable. This run is using DuckDuckGo instead.",
    };
    const env: NodeJS.ProcessEnv = {};
    if (!provider.env) return { provider: provider.id, env };
    const encrypted = settings.encryptedApiKeys[provider.id];
    if (!encrypted) return {
      provider: "duckduckgo",
      env,
      warning: `${provider.name} needs an API key. This run is using DuckDuckGo instead.`,
    };
    const value = this.credentials.decrypt(encrypted);
    if (!value) return {
      provider: "duckduckgo",
      env,
      warning: `The saved ${provider.name} search credential could not be unlocked. This run is using DuckDuckGo instead.`,
    };
    env[provider.env] = value;
    return { provider: provider.id, env };
  }

  flush(): Promise<void> {
    return this.repository.flush();
  }

  private toPublic(settings: StoredSearchSettings): SearchSettings {
    return {
      activeProvider: settings.activeProvider,
      providers: searchProviderDefinitions.map(({ env: _env, ...provider }) => ({
        ...provider,
        ...this.credentialHealth(provider.id, provider.requiresApiKey, settings),
      })),
    };
  }

  private credentialHealth(
    providerId: SearchProviderId,
    requiresApiKey: boolean,
    settings: StoredSearchSettings,
  ): Pick<SearchSettings["providers"][number], "configured" | "credentialStatus"> {
    if (!requiresApiKey) return { configured: true, credentialStatus: "not-required" };
    const encrypted = settings.encryptedApiKeys[providerId];
    if (!encrypted) return { configured: false, credentialStatus: "missing" };
    if (!this.credentials.decrypt(encrypted)) return { configured: false, credentialStatus: "locked" };
    return { configured: true, credentialStatus: "ready" };
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    let result: T;
    const mutation = this.#mutationQueue.then(async () => { result = await operation(); });
    this.#mutationQueue = mutation.catch(() => undefined);
    return mutation.then(() => result!);
  }
}
