const primaryProviderCredential: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_CODEX_API_KEY",
  google: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_CN_API_KEY",
  zai: "ZAI_API_KEY",
  "kimi-coding": "KIMI_API_KEY",
  huggingface: "HF_TOKEN",
  opencode: "OPENCODE_API_KEY",
  "opencode-go": "OPENCODE_API_KEY",
  "azure-openai-responses": "AZURE_OPENAI_API_KEY",
  "github-copilot": "GITHUB_TOKEN",
  "amazon-bedrock": "AWS_BEARER_TOKEN_BEDROCK",
  nvidia: "NVIDIA_API_KEY",
  "google-vertex": "GOOGLE_CLOUD_API_KEY",
  ollama: "OLLAMA_API_KEY",
};

const providerCredentials: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN", "KHADIM_API_KEY"],
  openai: ["OPENAI_API_KEY", "KHADIM_API_KEY"],
  "openai-codex": ["OPENAI_CODEX_TOKEN", "OPENAI_CODEX_API_KEY", "CHATGPT_TOKEN", "OPENAI_API_KEY"],
  "github-copilot": ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"],
  groq: ["GROQ_API_KEY"],
  xai: ["XAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  "azure-openai-responses": ["AZURE_OPENAI_API_KEY"],
  google: ["GEMINI_API_KEY"],
  "google-vertex": ["GOOGLE_CLOUD_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"],
  "amazon-bedrock": ["AWS_BEARER_TOKEN_BEDROCK", "AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_WEB_IDENTITY_TOKEN_FILE", "KHADIM_API_KEY"],
  cerebras: ["CEREBRAS_API_KEY"],
  huggingface: ["HF_TOKEN"],
  opencode: ["OPENCODE_API_KEY"],
  "opencode-go": ["OPENCODE_API_KEY"],
  "kimi-coding": ["KIMI_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  "minimax-cn": ["MINIMAX_CN_API_KEY"],
  zai: ["ZAI_API_KEY"],
  nvidia: ["NVIDIA_API_KEY"],
  ollama: ["OLLAMA_API_KEY"],
};

const providerBaseUrl: Record<string, string> = {
  openai: "OPENAI_BASE_URL",
  anthropic: "ANTHROPIC_BASE_URL",
  "azure-openai-responses": "AZURE_OPENAI_BASE_URL",
  "google-vertex": "GOOGLE_VERTEX_BASE_URL",
  ollama: "OLLAMA_BASE_URL",
};

const everyCredentialName = new Set(Object.values(providerCredentials).flat());
const everyBaseUrlName = new Set([...Object.values(providerBaseUrl), "KHADIM_BASE_URL"]);
const runtimeEnvironmentNames = [
  "PATH", "HOME", "USER", "LOGNAME", "SHELL",
  "TMPDIR", "TMP", "TEMP",
  "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA",
  "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR",
  "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TERM", "COLORTERM", "NO_COLOR", "FORCE_COLOR",
  "DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS", "PIPEWIRE_REMOTE", "PULSE_SERVER",
  "SSL_CERT_FILE", "SSL_CERT_DIR",
] as const;

/**
 * Give a run only the selected provider's authentication material and only the
 * endpoint captured in its immutable model snapshot. Unrelated inherited
 * credentials remain available to Electron itself, never to agent tools.
 */
export function buildRunEnvironment(
  source: NodeJS.ProcessEnv,
  provider: string,
  encryptedStoreApiKey?: string,
  configuredBaseUrl?: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of runtimeEnvironmentNames) {
    if (source[name] !== undefined) env[name] = source[name];
  }
  const selectedInheritedCredentials = new Map<string, string>();
  for (const name of providerCredentials[provider] ?? []) {
    const value = source[name];
    if (value !== undefined) selectedInheritedCredentials.set(name, value);
  }
  // Keep these explicit even though the allowlist above currently excludes
  // them; this prevents a future runtime addition from weakening the boundary.
  for (const name of everyCredentialName) delete env[name];
  for (const name of everyBaseUrlName) delete env[name];
  delete env.KHADIM_RUN_API_KEY;

  if (encryptedStoreApiKey) {
    env.KHADIM_RUN_API_KEY = encryptedStoreApiKey;
    const primaryName = primaryProviderCredential[provider];
    if (primaryName) env[primaryName] = encryptedStoreApiKey;
  } else if (!configuredBaseUrl) {
    for (const [name, value] of selectedInheritedCredentials) env[name] = value;
  }

  const baseUrlName = providerBaseUrl[provider];
  if (configuredBaseUrl && baseUrlName) env[baseUrlName] = configuredBaseUrl;
  return env;
}
