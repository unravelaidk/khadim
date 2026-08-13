import {
  BookOpen,
  Robot as Bot,
  CaretRight as ChevronRight,
  Check,
  CaretDown as ChevronDown,
  FileCode as FileCode2,
  FolderOpen,
  GlobeHemisphereWest as Globe2,
  ChatCircleDots as MessageSquarePlus,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  MagnifyingGlass as Search,
  Monitor,
  X,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { DiscordSettings, GoogleConnection, HarnessMode, PluginEntry, Project, SearchProviderId, SearchSettings, SkillEntry } from "../../../shared/types";
import { isPluginHarnessId } from "../../../shared/plugins";
import { googleWorkspaceServiceEnabled, googleWorkspaceServices, type GoogleWorkspaceServiceId } from "../../../shared/google-workspace";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { PluginLogo } from "../ui/PluginLogo";

type AppLogoName = "discord" | "gmail" | "github" | "slack" | "drive" | "asana" | "x";

const appLogoPaths: Record<AppLogoName, string> = {
  discord: "M19.54 5.34A16.3 16.3 0 0 0 15.44 4l-.5 1.02a15.1 15.1 0 0 0-5.88 0L8.56 4a16.5 16.5 0 0 0-4.1 1.35C1.86 9.2 1.15 12.96 1.5 16.67a16.8 16.8 0 0 0 5.03 2.55l1.22-1.66a10.5 10.5 0 0 1-1.92-.92l.47-.36c3.7 1.72 7.75 1.72 11.4 0l.48.36c-.62.37-1.26.68-1.92.92l1.22 1.66a16.8 16.8 0 0 0 5.03-2.55c.42-4.3-.72-8.02-2.97-11.33ZM8.5 14.45c-1.1 0-2.01-1.02-2.01-2.27 0-1.25.89-2.27 2.01-2.27 1.13 0 2.03 1.03 2.01 2.27 0 1.25-.89 2.27-2.01 2.27Zm7 0c-1.1 0-2.01-1.02-2.01-2.27 0-1.25.89-2.27 2.01-2.27 1.13 0 2.03 1.03 2.01 2.27 0 1.25-.88 2.27-2.01 2.27Z",
  gmail: "M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z",
  github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  slack: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
  drive: "M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z",
  asana: "M18.78 12.653c-2.882 0-5.22 2.336-5.22 5.22s2.338 5.22 5.22 5.22 5.22-2.34 5.22-5.22-2.336-5.22-5.22-5.22zm-13.56 0c-2.88 0-5.22 2.337-5.22 5.22s2.338 5.22 5.22 5.22 5.22-2.338 5.22-5.22-2.336-5.22-5.22-5.22zm12-6.525c0 2.883-2.337 5.22-5.22 5.22-2.882 0-5.22-2.337-5.22-5.22 0-2.88 2.338-5.22 5.22-5.22 2.883 0 5.22 2.34 5.22 5.22z",
  x: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
};

function AppLogo({ name }: { name: AppLogoName }): React.JSX.Element {
  return <span className={`app-logo ${name}`} aria-hidden="true"><svg viewBox="0 0 24 24"><path d={appLogoPaths[name]} /></svg></span>;
}

const searchLogoPaths: Partial<Record<SearchProviderId, string>> = {
  perplexity: "M22.398 7.09h-2.311V.067l-7.509 6.354V.158h-1.156v6.196L4.49 0v7.09H1.602v10.397H4.49V24l6.932-6.359v6.2h1.156v-6.046l6.932 6.18v-6.488h2.888V7.09zm-3.466-4.531V7.09h-5.355l5.355-4.531zM5.646 2.626l4.869 4.464H5.646V2.626zM2.758 16.332V8.245h7.847L4.49 14.36v1.972H2.758zm2.888 5.04v-6.534l5.776-5.776v7.011l-5.776 5.3zm12.708.025-5.776-5.151V9.062l5.776 5.776v6.559zm2.888-5.065H19.51V14.36l-6.115-6.115h7.848v8.087z",
  brave: "M15.68 0l2.096 2.38s1.84-.512 2.709.358l1.584 1.638-.562 1.381.715 2.047s-2.104 7.98-2.35 8.955c-.486 1.919-.818 2.66-2.198 3.633-1.38.972-3.884 2.66-4.293 2.916-.409.256-.92.692-1.38.692-.46 0-.97-.436-1.38-.692a185.796 185.796 0 01-4.293-2.916c-1.38-.973-1.712-1.714-2.197-3.633-.247-.975-2.351-8.955-2.351-8.955l.715-2.047-.562-1.381 1.585-1.638c.868-.87 2.708-.358 2.708-.358L8.321 0h7.36zM12 14.936c-.14 0-1.038.317-1.758.69-.72.373-1.242.637-1.409.742-.167.104-.065.301.087.409l2.393 1.866c.198.175.489.464.687.464.198 0 .49-.29.688-.464l2.392-1.866c.152-.108.254-.305.087-.41-.167-.104-.689-.368-1.41-.741-.72-.373-1.617-.69-1.757-.69zM7.2 6.2l2.9 1.05-.7 3.05 2.6 1.7 2.6-1.7-.7-3.05 2.9-1.05-1.9 5.5-2.9 2.05-2.9-2.05L7.2 6.2z",
};

function SearchProviderLogo({ provider }: { provider: SearchProviderId }): React.JSX.Element {
  if (provider === "duckduckgo") {
    return <span className="search-provider-logo duckduckgo" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path className="logo-cutout" d="M8.1 10.2c.8-2.6 3.5-4.1 6-3.1 1.8.7 2.9 2.4 2.9 4.3 0 2.8-2.2 5-5 5-2.2 0-4.1-1.4-4.7-3.4l3.3-.8-2.5-2z" /><circle className="logo-fill" cx="13.7" cy="9.7" r=".8" /></svg></span>;
  }
  if (provider === "exa") {
    return <span className="search-provider-logo exa" aria-hidden="true"><svg viewBox="0 0 78.182 100"><path fillRule="evenodd" d="M0 0h78.182v7.463L44.817 50l33.365 42.537V100H0V0zm39.583 43.117L66.696 7.463H12.47l27.113 35.654zM8.796 16.398v29.87h22.715l-22.715-29.87zm22.715 37.333H8.796v29.871l22.715-29.87zM12.47 92.537h54.226L39.583 56.883 12.47 92.537z" /></svg></span>;
  }
  if (provider === "parallel") {
    return <span className="search-provider-logo parallel" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v3H4zm0 5.5h16v3H4zM4 16h16v3H4z" /></svg></span>;
  }
  if (provider === "tavily") {
    return <span className="search-provider-logo tavily" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 1.8 1.7 6.5 6.5 1.7-6.5 1.7-1.7 6.5-1.7-6.5L3.8 10l6.5-1.7L12 1.8zm6.3 13.1.7 2.6 2.6.7-2.6.7-.7 2.6-.7-2.6-2.6-.7 2.6-.7.7-2.6z" /></svg></span>;
  }
  return <span className={`search-provider-logo ${provider}`} aria-hidden="true"><svg viewBox="0 0 24 24"><path d={searchLogoPaths[provider]} /></svg></span>;
}

export function AppsView({ projects, activeProjectId }: { projects: Project[]; activeProjectId: string | null }): React.JSX.Element {
  const connectors = [
    { name: "GitHub", description: "Review repositories, issues, and pull requests", logo: "github" },
    { name: "Slack", description: "Find conversations and summarize team updates", logo: "slack" },
    { name: "Asana", description: "Create tasks and keep projects moving", logo: "asana" },
    { name: "X / Twitter", description: "Research topics and monitor public conversations", logo: "x" },
  ] satisfies Array<{ name: string; description: string; logo: AppLogoName }>;
  const dataSources = [
    { name: "Public web", description: "Available when Web research is enabled for a run", availability: "Run option", icon: <Globe2 size={19} /> },
    { name: "Local project", description: "Available when Project files is enabled for a run", availability: "Run option", icon: <FolderOpen size={19} /> },
    { name: "Chat context", description: "Saved and resumed within each individual chat", availability: "Per chat", icon: <MessageSquarePlus size={19} /> },
    { name: "Artifacts", description: "Stored in this project's library; not injected into chat automatically", availability: "Local library", icon: <FileCode2 size={19} /> },
  ];
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"overview" | "services" | "skills" | "more">("overview");
  const [searchProvidersOpen, setSearchProvidersOpen] = useState(false);
  const [showPlanned, setShowPlanned] = useState(false);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [searchSettings, setSearchSettings] = useState<SearchSettings | null>(null);
  const [searchSettingsError, setSearchSettingsError] = useState<string | null>(null);
  const [googleConnection, setGoogleConnection] = useState<GoogleConnection | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleWorkspaceOpen, setGoogleWorkspaceOpen] = useState(false);
  const [editingSearchProvider, setEditingSearchProvider] = useState<SearchProviderId | null>(null);
  const [searchApiKey, setSearchApiKey] = useState("");
  const [savingSearchProvider, setSavingSearchProvider] = useState(false);
  const [discordSettings, setDiscordSettings] = useState<DiscordSettings | null>(null);
  const [discordToken, setDiscordToken] = useState("");
  const [discordGuildId, setDiscordGuildId] = useState("");
  const [discordProjectId, setDiscordProjectId] = useState(activeProjectId ?? "");
  const [discordHarness, setDiscordHarness] = useState<HarnessMode>("assistant");
  const [discordAllowAll, setDiscordAllowAll] = useState(false);
  const [discordAllowedUsers, setDiscordAllowedUsers] = useState("");
  const [discordAllowedRoles, setDiscordAllowedRoles] = useState("");
  const [discordAllowedChannels, setDiscordAllowedChannels] = useState("");
  const [discordIgnoredChannels, setDiscordIgnoredChannels] = useState("");
  const [discordFreeResponseChannels, setDiscordFreeResponseChannels] = useState("");
  const [discordNoThreadChannels, setDiscordNoThreadChannels] = useState("");
  const [discordRequireMention, setDiscordRequireMention] = useState(true);
  const [discordThreadRequireMention, setDiscordThreadRequireMention] = useState(false);
  const [discordAutoThread, setDiscordAutoThread] = useState(true);
  const [editingDiscord, setEditingDiscord] = useState(false);
  const [savingDiscord, setSavingDiscord] = useState(false);
  const [discordError, setDiscordError] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(Boolean(window.khadim.plugins));
  const [pluginsError, setPluginsError] = useState<string | null>(null);
  const [editingPluginId, setEditingPluginId] = useState<string | null>(null);
  const [pluginDraft, setPluginDraft] = useState<Record<string, string | number | boolean>>({});
  const [savingPlugin, setSavingPlugin] = useState(false);
  useEffect(() => {
    window.khadim.skills.discover()
      .then(setSkills)
      .catch((cause: unknown) => setSkillsError(cause instanceof Error ? cause.message : "Local skills could not be loaded."))
      .finally(() => setSkillsLoading(false));
  }, []);

  async function refreshPlugins(): Promise<void> {
    if (!window.khadim.plugins) return;
    setPluginsLoading(true);
    try { setPlugins(await window.khadim.plugins.list()); }
    catch (cause) { setPluginsError(cause instanceof Error ? cause.message : "Plugins could not be loaded."); }
    finally { setPluginsLoading(false); }
  }

  useEffect(() => { void refreshPlugins(); }, []);

  function publishPluginChange(): void {
    window.dispatchEvent(new Event("khadim:plugins-changed"));
  }

  async function togglePlugin(plugin: PluginEntry): Promise<void> {
    if (!window.khadim.plugins) return;
    setPluginsError(null);
    try {
      await window.khadim.plugins.setEnabled(plugin.id, !plugin.enabled);
      await refreshPlugins();
      publishPluginChange();
    } catch (cause) { setPluginsError(cause instanceof Error ? cause.message : "Plugin state could not be saved."); }
  }

  function editPlugin(plugin: PluginEntry): void {
    setEditingPluginId(plugin.id);
    setPluginDraft(Object.fromEntries(plugin.config.filter((field) => field.type !== "secret" && field.value !== undefined).map((field) => [field.key, field.value!])))
  }

  async function savePluginConfig(plugin: PluginEntry): Promise<void> {
    if (!window.khadim.plugins) return;
    setSavingPlugin(true);
    setPluginsError(null);
    try {
      const values: Record<string, string | number | boolean> = {};
      const clear: string[] = [];
      for (const field of plugin.config) {
        const value = pluginDraft[field.key];
        if (value !== undefined && value !== "") values[field.key] = field.type === "number" ? Number(value) : value;
        else if (field.type !== "secret" && Object.hasOwn(pluginDraft, field.key)) clear.push(field.key);
      }
      await window.khadim.plugins.configure(plugin.id, { values, clear });
      setEditingPluginId(null);
      setPluginDraft({});
      await refreshPlugins();
      publishPluginChange();
    } catch (cause) { setPluginsError(cause instanceof Error ? cause.message : "Plugin configuration could not be saved."); }
    finally { setSavingPlugin(false); }
  }

  async function installPlugin(): Promise<void> {
    if (!window.khadim.plugins) return;
    setPluginsError(null);
    try {
      const installed = await window.khadim.plugins.chooseAndInstall();
      if (!installed) return;
      await refreshPlugins();
      publishPluginChange();
    } catch (cause) { setPluginsError(cause instanceof Error ? cause.message : "Plugin could not be installed."); }
  }

  async function uninstallPlugin(plugin: PluginEntry): Promise<void> {
    if (!window.khadim.plugins || plugin.bundled) return;
    setSavingPlugin(true);
    setPluginsError(null);
    try {
      await window.khadim.plugins.uninstall(plugin.id);
      setEditingPluginId(null);
      setPluginDraft({});
      await refreshPlugins();
      publishPluginChange();
    } catch (cause) { setPluginsError(cause instanceof Error ? cause.message : "Plugin could not be removed."); }
    finally { setSavingPlugin(false); }
  }

  useEffect(() => {
    window.khadim.search.get()
      .then(setSearchSettings)
      .catch((cause: unknown) => setSearchSettingsError(cause instanceof Error ? cause.message : "Search integrations could not be loaded."));
  }, []);

  useEffect(() => {
    window.khadim.google.get()
      .then(setGoogleConnection)
      .catch((cause: unknown) => setGoogleError(cause instanceof Error ? cause.message : "Google connection could not be loaded."));
  }, []);

  useEffect(() => {
    const applySettings = (next: DiscordSettings) => {
      setDiscordSettings(next);
      setDiscordGuildId(next.guildId);
      setDiscordProjectId(next.projectId || activeProjectId || "");
      setDiscordHarness(next.harness);
      setDiscordAllowAll(next.allowAllGuildUsers);
      setDiscordAllowedUsers(next.allowedUserIds.join(", "));
      setDiscordAllowedRoles(next.allowedRoleIds.join(", "));
      setDiscordAllowedChannels(next.allowedChannelIds.join(", "));
      setDiscordIgnoredChannels(next.ignoredChannelIds.join(", "));
      setDiscordFreeResponseChannels(next.freeResponseChannelIds.join(", "));
      setDiscordNoThreadChannels(next.noThreadChannelIds.join(", "));
      setDiscordRequireMention(next.requireMention);
      setDiscordThreadRequireMention(next.threadRequireMention);
      setDiscordAutoThread(next.autoThread);
    };
    void window.khadim.discord.get().then(applySettings).catch((cause: unknown) => {
      setDiscordError(cause instanceof Error ? cause.message : "Discord settings could not be loaded.");
    });
    return window.khadim.discord.onStatus(applySettings);
  }, []);

  async function activateSearchProvider(provider: SearchSettings["providers"][number]): Promise<void> {
    if (provider.requiresApiKey && provider.credentialStatus !== "ready") {
      setEditingSearchProvider(provider.id);
      setSearchApiKey("");
      return;
    }
    setSearchSettingsError(null);
    try {
      setSearchSettings(await window.khadim.search.save({ activeProvider: provider.id }));
    } catch (cause) {
      setSearchSettingsError(cause instanceof Error ? cause.message : "Search provider could not be selected.");
    }
  }

  async function saveSearchProvider(provider: SearchSettings["providers"][number]): Promise<void> {
    setSavingSearchProvider(true);
    setSearchSettingsError(null);
    try {
      setSearchSettings(await window.khadim.search.save({ activeProvider: provider.id, provider: provider.id, apiKey: searchApiKey }));
      setEditingSearchProvider(null);
      setSearchApiKey("");
    } catch (cause) {
      setSearchSettingsError(cause instanceof Error ? cause.message : "Search credential could not be saved.");
    } finally {
      setSavingSearchProvider(false);
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (name: string, description: string) => !normalizedQuery || `${name} ${description}`.toLowerCase().includes(normalizedQuery);
  const visibleConnectors = connectors.filter((item) => matches(item.name, item.description));
  const matchingSkills = skills.filter((skill) => matches(skill.name, skill.description));
  const visibleSkills = showAllSkills || normalizedQuery ? matchingSkills : matchingSkills.slice(0, 8);
  const visibleSources = dataSources.filter((item) => matches(item.name, item.description));
  const matchingSearchProviders = searchSettings?.providers.filter((provider) => matches(provider.name, provider.description)) ?? [];
  const webSearchMatches = matches("Web search", "Research current information using a configurable search provider") || matchingSearchProviders.length > 0;
  const searchProviderQueryMatch = Boolean(normalizedQuery) && matchingSearchProviders.length > 0;
  const visibleSearchProviders = searchProviderQueryMatch ? matchingSearchProviders : searchSettings?.providers ?? [];
  const searchProviderPanelOpen = searchProvidersOpen;
  const discordMatches = matches("Discord", "Continue conversations from authorized channels, threads, and direct messages");
  const googleServiceMatches: Record<GoogleWorkspaceServiceId, boolean> = {
    gmail: matches("Gmail", "Search your inbox and read email threads"),
    drive: matches("Google Drive Docs Sheets Slides", "Search and read documents spreadsheets presentations and shared files"),
    calendar: matches("Google Calendar", "Review calendars schedules meetings and upcoming events"),
  };
  const googleWorkspaceMatches = matches("Google Workspace", "Connect Gmail Drive Calendar Docs Sheets and Slides") || Object.values(googleServiceMatches).some(Boolean);
  const showApps = Boolean(normalizedQuery) || category === "overview" || category === "services";
  const showSkills = Boolean(normalizedQuery) || category === "skills";
  const showMore = Boolean(normalizedQuery) || category === "more";
  const matchingPlugins = plugins.filter((plugin) => matches(plugin.name, plugin.description));
  const discordPluginHarnesses = plugins.filter((plugin) => plugin.enabled && !plugin.error).flatMap((plugin) => plugin.harnesses);
  const discordHarnessAvailable = !isPluginHarnessId(discordHarness) || discordPluginHarnesses.some((harness) => harness.id === discordHarness);
  const appsHaveResults = webSearchMatches || googleWorkspaceMatches || discordMatches || matchingPlugins.length > 0 || visibleConnectors.length > 0 || searchSettings === null;
  const skillsHaveResults = visibleSkills.length > 0 || skillsLoading || Boolean(skillsError);
  const includedHasResults = visibleSources.length > 0;
  const hasResults = (showApps && appsHaveResults) || (showSkills && skillsHaveResults) || (showMore && (includedHasResults || matchingPlugins.length > 0 || visibleConnectors.length > 0));
  const activeSearchProvider = searchSettings?.providers.find((provider) => provider.id === searchSettings.activeProvider);
  const activeSearchNeedsReconnect = activeSearchProvider?.credentialStatus === "locked";
  const enabledSkillCount = skills.filter((skill) => skill.enabled).length;
  const authorizedGoogleServices = googleConnection?.connected ? googleWorkspaceServices(googleConnection.scopes) : [];
  const connectedAppCount = authorizedGoogleServices.length + Number(Boolean(discordSettings?.connected));
  const availableAppCount = Number(webSearchMatches) + Number(googleWorkspaceMatches) + Number(discordMatches);

  async function toggleSkill(skill: SkillEntry): Promise<void> {
    const enabled = !skill.enabled;
    setSkillsError(null);
    setSkills((current) => current.map((item) => item.id === skill.id ? { ...item, enabled } : item));
    try {
      await window.khadim.skills.toggle(skill.id, enabled);
    } catch (cause) {
      setSkills((current) => current.map((item) => item.id === skill.id ? { ...item, enabled: !enabled } : item));
      setSkillsError(cause instanceof Error ? cause.message : "The skill setting could not be saved.");
    }
  }

  function toggleSearchProviderPanel(): void {
    setSearchProvidersOpen((current) => {
      if (current) setEditingSearchProvider(null);
      return !current;
    });
    setEditingDiscord(false);
  }

  function openDiscordEditor(): void {
    setSearchProvidersOpen(false);
    setEditingSearchProvider(null);
    setEditingDiscord(true);
  }

  function updateCapabilityQuery(value: string): void {
    setQuery(value);
    setSearchProvidersOpen(false);
    setGoogleWorkspaceOpen(false);
    setEditingSearchProvider(null);
    setEditingDiscord(false);
  }

  function chooseCapabilityCategory(next: typeof category): void {
    setCategory(next);
    setSearchProvidersOpen(false);
    setGoogleWorkspaceOpen(false);
    setEditingSearchProvider(null);
    setEditingDiscord(false);
  }

  function openCapabilityCollection(next: typeof category, targetId: string): void {
    chooseCapabilityCategory(next);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ block: "start" });
      target?.querySelector<HTMLElement>("h2")?.focus();
    });
  }

  async function saveDiscord(): Promise<void> {
    setSavingDiscord(true);
    setDiscordError(null);
    try {
      const ids = (value: string) => value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
      const next = await window.khadim.discord.save({
        enabled: true,
        guildId: discordGuildId.trim(),
        projectId: discordProjectId,
        harness: discordHarness,
        allowAllGuildUsers: discordAllowAll,
        allowedUserIds: ids(discordAllowedUsers),
        allowedRoleIds: ids(discordAllowedRoles),
        allowedChannelIds: ids(discordAllowedChannels),
        ignoredChannelIds: ids(discordIgnoredChannels),
        freeResponseChannelIds: ids(discordFreeResponseChannels),
        noThreadChannelIds: ids(discordNoThreadChannels),
        requireMention: discordRequireMention,
        threadRequireMention: discordThreadRequireMention,
        autoThread: discordAutoThread,
        botToken: discordToken.trim() || undefined,
      });
      setDiscordSettings(next);
      setDiscordToken("");
      setEditingDiscord(false);
    } catch (cause) {
      setDiscordError(cause instanceof Error ? cause.message : "Discord could not be connected.");
    } finally {
      setSavingDiscord(false);
    }
  }

  async function disconnectDiscord(): Promise<void> {
    setSavingDiscord(true);
    setDiscordError(null);
    try {
      setDiscordSettings(await window.khadim.discord.disconnect());
    } catch (cause) {
      setDiscordError(cause instanceof Error ? cause.message : "Discord could not be disconnected.");
    } finally {
      setSavingDiscord(false);
    }
  }

  async function connectGoogle(): Promise<void> {
    setSavingGoogle(true);
    setGoogleError(null);
    try {
      const next = await window.khadim.google.connect(
        googleConnection?.configured ? undefined : {
          clientId: googleClientId.trim(),
          clientSecret: googleClientSecret.trim(),
        },
      );
      setGoogleConnection(next);
      window.dispatchEvent(new CustomEvent("khadim:google-connection-changed", { detail: next }));
      setGoogleClientId("");
      setGoogleClientSecret("");
    } catch (cause) {
      setGoogleError(cause instanceof Error ? cause.message : "Google Workspace could not be connected.");
    } finally {
      setSavingGoogle(false);
    }
  }

  async function disconnectGoogle(): Promise<void> {
    setSavingGoogle(true);
    setGoogleError(null);
    try {
      const next = await window.khadim.google.disconnect();
      setGoogleConnection(next);
      window.dispatchEvent(new CustomEvent("khadim:google-connection-changed", { detail: next }));
    } catch (cause) {
      setGoogleError(cause instanceof Error ? cause.message : "Google Workspace could not be disconnected.");
    } finally {
      setSavingGoogle(false);
    }
  }

  return (
    <section className="applications-view workspace-arrival" aria-labelledby="applications-title">
      <header className="applications-heading workspace-page-header">
        <div className="workspace-page-copy">
          <span>Capabilities</span>
          <h1 id="applications-title">Apps and capabilities</h1>
          <p>Connect services and choose the local guidance available to Khadim.</p>
        </div>
      </header>

      <dl className="applications-overview" aria-label="Capability overview">
        <div><dt>Connected services</dt><dd>{connectedAppCount || "None"}</dd></div>
        <div><dt>Enabled skills</dt><dd>{skillsLoading ? "Loading" : enabledSkillCount}</dd></div>
        <div className={activeSearchNeedsReconnect ? "needs-attention" : ""}><dt>Web search</dt><dd>{activeSearchNeedsReconnect ? `Reconnect ${activeSearchProvider.name}` : activeSearchProvider?.name ?? "Not configured"}</dd></div>
      </dl>

      <label className="applications-search">
        <span className="sr-only">Search apps and capabilities</span>
        <Search size={16} />
        <input type="search" value={query} onChange={(event) => updateCapabilityQuery(event.target.value)} placeholder="Search apps, skills, and capabilities" />
        {query && <button onClick={() => updateCapabilityQuery("")} aria-label="Clear search"><X size={14} /></button>}
      </label>

      {!normalizedQuery && <div className="applications-categories" role="tablist" aria-label="Capability categories" data-category={category}>
        {([
          ["overview", "Overview"],
          ["services", "Services"],
          ["skills", "Skills"],
          ["more", "More"],
        ] as const).map(([id, label]) => (
          <button
            type="button"
            role="tab"
            id={`capability-tab-${id}`}
            aria-selected={category === id}
            aria-controls="capability-panel"
            tabIndex={category === id ? 0 : -1}
            className={category === id ? "active" : ""}
            onClick={() => chooseCapabilityCategory(id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]") ?? []);
              const currentIndex = tabs.indexOf(event.currentTarget);
              const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
              tabs[nextIndex]?.focus();
              tabs[nextIndex]?.click();
            }}
            key={id}
          >
            {label}
          </button>
        ))}
      </div>}

      <div id="capability-panel" role={normalizedQuery ? "region" : "tabpanel"} aria-label={normalizedQuery ? "Search results" : undefined} aria-labelledby={normalizedQuery ? undefined : `capability-tab-${category}`} tabIndex={0}>
        {showApps && appsHaveResults && (webSearchMatches || googleWorkspaceMatches || discordMatches || !normalizedQuery) && (
          <section className="application-section application-section-first" id="apps-ready">
            <header><div><h2 tabIndex={-1}>{category === "overview" && !normalizedQuery ? "Services" : "Available services"}</h2><p>{category === "overview" && !normalizedQuery ? "Connect the services Khadim can use for you." : "Services you can configure and use today."}</p></div><span>{availableAppCount} {normalizedQuery ? "matching" : availableAppCount === 1 ? "service" : "services"}</span></header>
            {(searchSettingsError || googleError || discordError) && <div className="application-errors">{searchSettingsError && <p className="application-empty error" role="alert">{searchSettingsError}</p>}{googleError && <p className="application-empty error" role="alert">{googleError}</p>}{discordError && <p className="application-empty error" role="alert">{discordError}</p>}</div>}
            <div className="application-grid ready-app-grid">
              {webSearchMatches && (
                <div className="application-entry web-search-entry">
                  <article className="application-row is-active">
                    <span className="application-icon"><Globe2 size={19} /></span>
                    <span><strong>Web search</strong><small>{searchProviderQueryMatch ? `${matchingSearchProviders.map((provider) => provider.name).join(", ")} ${matchingSearchProviders.length === 1 ? "is" : "are"} available here` : activeSearchNeedsReconnect ? `${activeSearchProvider.name} needs its API key re-entered; runs use DuckDuckGo meanwhile` : activeSearchProvider ? `Using ${activeSearchProvider.name} for current web research` : "Choose the provider used for web research"}</small></span>
                    <button className="connector-action" type="button" aria-expanded={searchProviderPanelOpen} aria-controls="search-provider-options" onClick={toggleSearchProviderPanel}>Configure <ChevronDown size={13} /></button>
                  </article>
                  {searchSettings && searchProviderPanelOpen && (
                    <div className="search-provider-picker" id="search-provider-options">
                      <header><span><strong>Search provider</strong><small>Select which service Khadim uses for web research.</small></span><b>{activeSearchProvider?.name ?? "Not configured"}</b></header>
                      <div className="search-provider-grid">{visibleSearchProviders.map((provider) => (
                        <div className="search-provider-entry" key={provider.id}>
                          <article className={`application-row search-provider-row ${searchSettings.activeProvider === provider.id ? "is-active" : ""}`}>
                            <SearchProviderLogo provider={provider.id} />
                            <span><strong>{provider.name}</strong><small>{provider.description}</small></span>
                            <button className={searchSettings.activeProvider === provider.id && provider.credentialStatus !== "locked" ? "connected" : ""} onClick={() => void activateSearchProvider(provider)} aria-label={provider.credentialStatus === "locked" ? `Reconnect ${provider.name}` : searchSettings.activeProvider === provider.id ? `${provider.name} is active` : provider.configured ? `Use ${provider.name}` : `Connect ${provider.name}`}>{provider.credentialStatus === "locked" ? "Reconnect" : searchSettings.activeProvider === provider.id ? <><Check size={13} /> Active</> : provider.configured ? "Use" : <><Plus size={13} /> Connect</>}</button>
                          </article>
                          {editingSearchProvider === provider.id && <div className="search-provider-editor">
                            <label>{provider.name} API key<input type="password" value={searchApiKey} onChange={(event) => setSearchApiKey(event.target.value)} placeholder="Stored securely on this device" autoFocus /></label>
                            <div><button onClick={() => setEditingSearchProvider(null)}>Cancel</button><button className="save" disabled={savingSearchProvider || !searchApiKey.trim()} onClick={() => void saveSearchProvider(provider)}>{savingSearchProvider ? "Saving…" : "Save and use"}</button></div>
                          </div>}
                        </div>
                      ))}</div>
                    </div>
                  )}
                  {!searchSettings && !searchSettingsError && <p className="application-inline-status">Loading search providers…</p>}
                </div>
              )}

              {googleWorkspaceMatches && (
                <div className="application-entry google-workspace-connector">
                  <article className={`application-row google-workspace-account ${googleConnection?.connected ? "is-connected" : ""}`}>
                    <span className="google-workspace-mark" aria-hidden="true"><AppLogo name="gmail" /><AppLogo name="drive" /></span>
                    <span><strong>Google Workspace</strong><small>{googleConnection?.connected ? `${googleConnection.email ?? "Google account"} · ${authorizedGoogleServices.length} of 3 services ready` : googleConnection?.credentialStatus === "locked" ? "Saved access is locked; reconnect to restore it" : googleConnection?.configured ? "Connect one account for Gmail, Drive, and Calendar" : "Add a Google Desktop OAuth credential to connect"}</small></span>
                    <button className={`connector-action ${googleConnection?.connected ? "connected" : ""}`} type="button" aria-expanded={googleWorkspaceOpen} aria-controls="google-workspace-details" onClick={() => setGoogleWorkspaceOpen((current) => !current)} disabled={googleConnection === null}>
                      {googleConnection?.connected ? "Details" : googleConnection?.configured ? "Connect" : "Set up"}<ChevronDown size={13} />
                    </button>
                  </article>
                  <div className="google-workspace-disclosure" id="google-workspace-details" data-open={googleWorkspaceOpen || undefined} inert={!googleWorkspaceOpen || undefined} aria-hidden={!googleWorkspaceOpen || undefined}>
                  <div>
                  <div className="google-workspace-services" aria-label="Google Workspace services">
                    {([
                      { id: "gmail", name: "Gmail", description: "Search messages and read complete threads", logo: "gmail" },
                      { id: "drive", name: "Drive", description: "Search and read Docs, Sheets, Slides, and text files", logo: "drive" },
                      { id: "calendar", name: "Calendar", description: "List calendars and inspect upcoming events", logo: null },
                    ] as const).filter((service) => !normalizedQuery || googleServiceMatches[service.id]).map((service) => {
                      const enabled = Boolean(googleConnection?.connected && googleWorkspaceServiceEnabled(googleConnection.scopes, service.id));
                      return <div className="google-workspace-service" key={service.id}>{service.logo ? <AppLogo name={service.logo} /> : <span className="app-logo calendar" aria-hidden="true"><span>31</span></span>}<span><strong>{service.name}</strong><small>{service.description}</small></span><span className={`workspace-service-state ${enabled ? "ready" : ""}`}>{enabled ? <><Check size={12} /> Ready</> : googleConnection?.connected ? "Needs access" : "Connect account"}</span></div>;
                    })}
                  </div>
                  {googleConnection && !googleConnection.connected && !googleConnection.configured && (
                    <div className="google-client-setup">
                      <label><span>Google Desktop OAuth client ID</span><input value={googleClientId} onChange={(event) => setGoogleClientId(event.target.value)} placeholder="123456789.apps.googleusercontent.com" autoComplete="off" /></label>
                      <label><span>Google Desktop OAuth client secret</span><input type="password" value={googleClientSecret} onChange={(event) => setGoogleClientSecret(event.target.value)} placeholder="GOCSPX-…" autoComplete="off" /></label>
                      <p>Create a Desktop app credential in Google Cloud and enable the Gmail, Drive, and Calendar APIs. Client secrets and account tokens stay encrypted in this device’s credential vault and are never returned to the renderer.</p>
                      <button type="button" onClick={() => void window.khadim.shell.openExternal("https://console.cloud.google.com/apis/credentials")}>Open Google Cloud</button>
                    </div>
                  )}
                  {googleConnection && (
                    <div className="google-workspace-actions">
                      {googleConnection.connected
                        ? <>{authorizedGoogleServices.length < 3 && <button className="save" type="button" onClick={() => void connectGoogle()} disabled={savingGoogle}>{savingGoogle ? "Updating…" : "Update access"}</button>}<button type="button" aria-label="Disconnect Google Workspace" onClick={() => void disconnectGoogle()} disabled={savingGoogle}>Disconnect</button></>
                        : <button className="save" type="button" onClick={() => void connectGoogle()} disabled={savingGoogle || (!googleConnection.configured && (!googleClientId.trim() || !googleClientSecret.trim()))}>{savingGoogle ? "Connecting…" : "Connect Google Workspace"}</button>}
                    </div>
                  )}
                  </div>
                  </div>
                </div>
              )}

              {discordMatches && (
                <div className="application-entry discord-connector">
                  <article className={`application-row ${discordSettings?.connected ? "is-connected" : ""}`}>
                    <AppLogo name="discord" />
                    <span><strong>Discord</strong><small>{discordSettings?.connected ? `Ready for authorized messages as ${discordSettings.botName ?? "your bot"}` : discordSettings?.inviteUrl ? `Ready to invite ${discordSettings.botName ?? "your bot"} to the server` : "Continue conversations from authorized channels, threads, and direct messages"}</small></span>
                    {discordSettings?.connected
                      ? <button className="connected connector-action" onClick={() => void disconnectDiscord()} disabled={savingDiscord}>Disconnect</button>
                      : discordSettings?.inviteUrl
                        ? <button className="connector-action invite" aria-label="Invite Discord bot" onClick={() => void window.khadim.shell.openExternal(discordSettings.inviteUrl!)}>Invite bot</button>
                        : <button className="connector-action" aria-label="Connect Discord" onClick={openDiscordEditor}><Plus size={13} /> Set up</button>}
                  </article>
                  {discordSettings?.inviteUrl && !discordSettings.connected && <div className="discord-invite-note"><span><strong>One step left</strong><small>{discordSettings.lastError ?? "Invite the bot, choose your server, and approve its channel permissions."}</small></span><div><button onClick={openDiscordEditor}>Edit setup</button><button onClick={() => void disconnectDiscord()}>Disable</button></div></div>}
                  {editingDiscord && <div className="discord-editor">
                    <div className="discord-editor-heading"><span><strong>Connect a Discord bot</strong><small>Create a bot in the Discord Developer Portal and enable Message Content Intent. Enable Server Members Intent only when authorizing roles.</small></span><button onClick={() => void window.khadim.shell.openExternal("https://discord.com/developers/applications")}>Open portal</button></div>
                    <label>Bot token<input type="password" value={discordToken} onChange={(event) => setDiscordToken(event.target.value)} placeholder={discordSettings?.configured ? "Saved securely · enter to replace" : "Paste the bot token"} autoComplete="off" /></label>
                    <div className="discord-fields">
                      <label>Server ID<input value={discordGuildId} onChange={(event) => setDiscordGuildId(event.target.value)} placeholder="123456789012345678" /></label>
                      <label>Project<select value={discordProjectId} onChange={(event) => setDiscordProjectId(event.target.value)}>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
                    </div>
                    <div className="discord-runtime-field">
                      <span><strong>Agent runtime</strong><small>Choose the runtime used for new Discord tasks. This does not change regular Khadim chats.</small></span>
                      <div className="discord-runtime-options" role="radiogroup" aria-label="Discord agent runtime">
                        <button type="button" role="radio" aria-checked={discordHarness === "assistant"} className={discordHarness === "assistant" ? "selected" : ""} onClick={() => setDiscordHarness("assistant")}><span className="discord-runtime-icon"><Bot size={16} /></span><span><strong>Assistant</strong><small>Built-in chat and tools</small></span>{discordHarness === "assistant" && <Check size={14} />}</button>
                        <button type="button" role="radio" aria-checked={discordHarness === "rpa"} className={discordHarness === "rpa" ? "selected" : ""} onClick={() => setDiscordHarness("rpa")}><span className="discord-runtime-icon"><Monitor size={16} /></span><span><strong>Computer control</strong><small>Screen, mouse, and keyboard</small></span>{discordHarness === "rpa" && <Check size={14} />}</button>
                        {discordPluginHarnesses.map((harness) => <button type="button" role="radio" aria-checked={discordHarness === harness.id} className={discordHarness === harness.id ? "selected" : ""} onClick={() => setDiscordHarness(harness.id)} key={harness.id}><PluginLogo pluginId={harness.pluginId} icon={harness.icon} size={16} /><span><strong>{harness.name}</strong><small>Plugin runtime</small></span>{discordHarness === harness.id && <Check size={14} />}</button>)}
                        {isPluginHarnessId(discordHarness) && !discordHarnessAvailable && <div className="discord-runtime-unavailable" role="status"><strong>Selected plugin is unavailable</strong><small>Enable the plugin or choose another runtime before connecting.</small></div>}
                      </div>
                    </div>
                    <div className="discord-fields">
                      <label>Allowed user IDs<input value={discordAllowedUsers} onChange={(event) => setDiscordAllowedUsers(event.target.value)} placeholder="123…, 456…" /></label>
                      <label>Allowed role IDs<input value={discordAllowedRoles} onChange={(event) => setDiscordAllowedRoles(event.target.value)} placeholder="Optional · requires Members Intent" /></label>
                    </div>
                    <label>Allowed channel IDs<input value={discordAllowedChannels} onChange={(event) => setDiscordAllowedChannels(event.target.value)} placeholder="Optional · blank allows every visible channel" /></label>
                    <div className="discord-fields">
                      <label>Free-response channel IDs<input value={discordFreeResponseChannels} onChange={(event) => setDiscordFreeResponseChannels(event.target.value)} placeholder="No mention required" /></label>
                      <label>Ignored channel IDs<input value={discordIgnoredChannels} onChange={(event) => setDiscordIgnoredChannels(event.target.value)} placeholder="Always ignored" /></label>
                    </div>
                    <label>No-thread channel IDs<input value={discordNoThreadChannels} onChange={(event) => setDiscordNoThreadChannels(event.target.value)} placeholder="Keep replies in the parent channel" /></label>
                    <label className="discord-access-toggle"><input type="checkbox" checked={discordAllowAll} onChange={(event) => setDiscordAllowAll(event.target.checked)} /><span><strong>Allow everyone in this server</strong><small>Explicit user IDs are still required for direct messages.</small></span></label>
                    <label className="discord-access-toggle"><input type="checkbox" checked={discordRequireMention} onChange={(event) => setDiscordRequireMention(event.target.checked)} /><span><strong>Require a mention in regular channels</strong><small>Free-response channels are exempt.</small></span></label>
                    <label className="discord-access-toggle"><input type="checkbox" checked={discordThreadRequireMention} onChange={(event) => setDiscordThreadRequireMention(event.target.checked)} /><span><strong>Require mentions in active threads</strong><small>When off, one mention starts the conversation for that thread.</small></span></label>
                    <label className="discord-access-toggle"><input type="checkbox" checked={discordAutoThread} onChange={(event) => setDiscordAutoThread(event.target.checked)} /><span><strong>Create a thread for mentioned tasks</strong><small>Skipped in free-response, no-thread, reply, DM, and existing thread contexts.</small></span></label>
                    <p>Regular server channels keep separate context per user. Threads are collaborative; after the first mention, follow-ups in that thread do not need another mention.</p>
                    <div className="discord-editor-actions"><button onClick={() => { setDiscordToken(""); setEditingDiscord(false); }}>Cancel</button><button className="save" disabled={savingDiscord || !discordGuildId.trim() || !discordProjectId || !discordHarnessAvailable || (!discordSettings?.configured && !discordToken.trim()) || (!discordAllowAll && !discordAllowedUsers.trim() && !discordAllowedRoles.trim())} onClick={() => void saveDiscord()}>{savingDiscord ? "Connecting..." : "Connect bot"}</button></div>
                  </div>}
                </div>
              )}
            </div>
          </section>
        )}

        {category === "overview" && !normalizedQuery && (
          <section className="application-section capability-library" aria-labelledby="capability-library-title">
            <header><div><h2 id="capability-library-title">Library</h2><p>Open a collection only when you need to change it.</p></div></header>
            <div className="capability-library-list">
              <button type="button" onClick={() => openCapabilityCollection("skills", "apps-skills")}><span className="application-icon"><BookOpen size={18} /></span><span><strong>Skills</strong><small>Specialized guidance Khadim can use automatically</small></span><span className="library-value">{skillsLoading ? "Loading" : `${enabledSkillCount} enabled`}</span><ChevronRight size={15} /></button>
              <button type="button" onClick={() => openCapabilityCollection("more", "apps-plugins")}><span className="application-icon"><SlidersHorizontal size={18} /></span><span><strong>Plugins</strong><small>Optional runtimes and advanced extensions</small></span><span className="library-value">{pluginsLoading ? "Loading" : `${plugins.filter((plugin) => plugin.enabled).length} enabled`}</span><ChevronRight size={15} /></button>
              <button type="button" onClick={() => openCapabilityCollection("more", "apps-included")}><span className="application-icon"><FolderOpen size={18} /></span><span><strong>Built-in access</strong><small>Local context available without another connection</small></span><span className="library-value">{dataSources.length} sources</span><ChevronRight size={15} /></button>
            </div>
          </section>
        )}

        {showSkills && skillsHaveResults && (
          <section className={`application-section ${category === "skills" ? "application-section-first" : ""}`} id="apps-skills">
            <header><div><h2 tabIndex={-1}>Skills</h2><p>Reusable guidance that helps Khadim handle specialized work.</p></div><div className="application-section-actions"><span>{matchingSkills.length} skills · {enabledSkillCount} enabled</span>{matchingSkills.length > 8 && !normalizedQuery && <button className="section-action" onClick={() => setShowAllSkills((current) => !current)}>{showAllSkills ? "Show less" : "Show all"}</button>}</div></header>
            {skillsLoading ? <p className="application-empty">Finding skills…</p> : skillsError ? <p className="application-empty error" role="alert">{skillsError}</p> : <div className="application-grid skill-grid">{visibleSkills.map((skill) => <article className={`application-row skill ${skill.enabled ? "is-enabled" : ""}`} key={`${skill.sourceDir}:${skill.id}`}><span className="application-icon"><BookOpen size={19} /></span><span><strong>{skill.name}</strong><small title={skill.description || "Reusable guidance"}>{skill.description || "Reusable guidance"}</small></span><button className={skill.enabled ? "connected" : ""} aria-pressed={skill.enabled} onClick={() => void toggleSkill(skill)} aria-label={skill.enabled ? `Disable ${skill.name}` : `Enable ${skill.name}`}><ToggleSwitch enabled={skill.enabled} /></button></article>)}</div>}
          </section>
        )}

        {showMore && window.khadim.plugins && (!normalizedQuery || matchingPlugins.length > 0) && (
          <section className={`application-section ${category === "more" ? "application-section-first" : ""}`} id="apps-plugins">
            <header><div><h2 tabIndex={-1}>Plugins</h2><p>Sandboxed WebAssembly packages that extend Khadim with harnesses and other capabilities.</p></div><button className="section-action" onClick={() => void installPlugin()}><Plus size={13} /> Install plugin</button></header>
            {pluginsError && <p className="application-empty error" role="alert">{pluginsError}</p>}
            {pluginsLoading ? <p className="application-empty">Loading plugins…</p> : matchingPlugins.length === 0 ? <p className="application-empty">No plugins installed.</p> : <div className="application-grid">{matchingPlugins.map((plugin) => (
              <div className="application-entry plugin-entry" key={plugin.id}>
                <article className={`application-row plugin-row ${plugin.enabled ? "is-active" : ""}`}>
                  <PluginLogo pluginId={plugin.id} size={20} />
                  <span className="plugin-identity"><span className="plugin-title"><strong>{plugin.name}</strong><span className="plugin-version">v{plugin.version}</span>{plugin.bundled && <span className="plugin-origin">Bundled</span>}</span><small>{plugin.error ?? plugin.description}</small></span>
                  {(plugin.config.length > 0 || plugin.permissions.network) && <button className="plugin-configure-button" aria-label={editingPluginId === plugin.id ? `Close ${plugin.name} configuration` : `Configure ${plugin.name}`} aria-expanded={editingPluginId === plugin.id} onClick={() => editingPluginId === plugin.id ? setEditingPluginId(null) : editPlugin(plugin)}><SlidersHorizontal size={14} /> {editingPluginId === plugin.id ? "Close" : "Configure"}</button>}
                  <button className={plugin.enabled ? "connected" : ""} aria-pressed={plugin.enabled} disabled={Boolean(plugin.error)} onClick={() => void togglePlugin(plugin)} aria-label={plugin.enabled ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}><ToggleSwitch enabled={plugin.enabled} /></button>
                </article>
                {editingPluginId === plugin.id && <div className="plugin-config-panel">
                  <div className="plugin-config-heading"><PluginLogo pluginId={plugin.id} size={18} /><span><strong>{plugin.name} settings</strong><small>Connection details and runtime preferences for this plugin.</small></span><span className={`plugin-state ${plugin.enabled ? "enabled" : ""}`}><i />{plugin.enabled ? "Enabled" : "Disabled"}</span></div>
                  {plugin.permissions.network && <div className="plugin-permission"><ShieldCheck size={17} /><span><strong>Restricted network access</strong><small>Network access: {plugin.permissions.network.allowHttp ? "HTTP or HTTPS" : "HTTPS"} to {plugin.permissions.network.allowedHosts.join(", ")}.</small></span></div>}
                  <div className="plugin-config-fields">{plugin.config.map((field) => field.type === "boolean" ? <label className="plugin-boolean-field" key={field.key}><input type="checkbox" checked={Boolean(pluginDraft[field.key] ?? field.value ?? false)} onChange={(event) => setPluginDraft((current) => ({ ...current, [field.key]: event.target.checked }))} /><span><strong>{field.label}</strong><small>{field.description}</small></span></label> : <label className={field.type === "secret" ? "plugin-secret-field" : ""} key={field.key}><span>{field.label}</span><input type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"} value={String(pluginDraft[field.key] ?? "")} onChange={(event) => setPluginDraft((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.type === "secret" && field.configured ? "Saved · enter to replace" : field.value === undefined ? "Optional" : String(field.value)} />{field.description && <small>{field.description}</small>}</label>)}</div>
                  <div className="plugin-config-actions">{!plugin.bundled && <button className="danger" disabled={savingPlugin} onClick={() => void uninstallPlugin(plugin)}>Uninstall</button>}<span>Secrets are stored in the operating system credential vault.</span><button onClick={() => setEditingPluginId(null)}>Cancel</button><button className="save" disabled={savingPlugin} onClick={() => void savePluginConfig(plugin)}>{savingPlugin ? "Saving…" : "Save plugin"}</button></div>
                </div>}
              </div>
            ))}</div>}
          </section>
        )}

        {showMore && includedHasResults && (
          <section className="application-section" id="apps-included">
            <header><div><h2 tabIndex={-1}>Included with Khadim</h2><p>Built-in context that is available locally when a run needs it.</p></div><span>{visibleSources.length} sources</span></header>
            <div className="application-grid">{visibleSources.map((item) => <article className="application-row" key={item.name}><span className="application-icon">{item.icon}</span><span><strong>{item.name}</strong><small>{item.description}</small></span><span className="application-availability">{item.availability}</span></article>)}</div>
          </section>
        )}

        {showMore && (!normalizedQuery || visibleConnectors.length > 0) && (
          <section className="application-section application-section-planned">
            <header><div><h2>Coming later</h2><p>Planned integrations that are not configurable yet.</p></div>{normalizedQuery ? <span>{visibleConnectors.length} integrations</span> : <div className="application-section-actions"><span>{connectors.length} integrations</span><button className="section-action planned-toggle" type="button" aria-expanded={showPlanned} onClick={() => setShowPlanned((current) => !current)}>{showPlanned ? "Hide" : "Show"} <ChevronDown size={13} /></button></div>}</header>
            {(showPlanned || normalizedQuery) && <div className="application-grid">{visibleConnectors.map((item) => (
              <article className="application-row is-unavailable" key={item.name}><AppLogo name={item.logo} /><span><strong>{item.name}</strong><small>{item.description}</small></span><button className="connector-unavailable" disabled aria-label={`${item.name} connector unavailable`} title="Not available in this build">Planned</button></article>
            ))}</div>}
          </section>
        )}

        {!hasResults && <div className="applications-no-results"><Search size={20} /><h2>No matching capabilities</h2><p>Nothing matches “{query}”.</p><button type="button" onClick={() => updateCapabilityQuery("")}>Clear search</button></div>}
      </div>
    </section>
  );
}
