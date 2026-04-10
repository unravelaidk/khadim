import { useEffect, useState } from "react";
import { commands } from "../lib/bindings";
import type { PluginEntry, PluginUiTab } from "../lib/bindings";

export interface PluginTabEntry {
  pluginId: string;
  pluginEntry: PluginEntry;
  tab: PluginUiTab;
}

/**
 * Returns all [[ui.tabs]] entries from enabled plugins, sorted by priority.
 * Refreshes whenever the component mounts.
 */
export function usePluginTabs(): PluginTabEntry[] {
  const [tabs, setTabs] = useState<PluginTabEntry[]>([]);

  useEffect(() => {
    commands.pluginList().then((plugins) => {
      const entries: PluginTabEntry[] = [];
      for (const plugin of plugins) {
        if (!plugin.enabled) continue;
        for (const tab of plugin.ui_tabs) {
          entries.push({ pluginId: plugin.id, pluginEntry: plugin, tab });
        }
      }
      entries.sort((a, b) => a.tab.priority - b.tab.priority);
      setTabs(entries);
    });
  }, []);

  return tabs;
}
