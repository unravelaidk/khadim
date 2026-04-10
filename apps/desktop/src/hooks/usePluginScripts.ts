import { useEffect } from "react";
import type { PluginEntry } from "../lib/bindings";

/**
 * Injects a <script src="khadim-plugin://{id}/{ui_js}"> tag for each enabled
 * plugin that ships a UI JS file.  Each tag is injected once and never removed
 * (removing it wouldn't unregister the custom elements anyway).
 */
export function usePluginScripts(plugins: PluginEntry[]): void {
  useEffect(() => {
    for (const plugin of plugins) {
      if (!plugin.enabled || !plugin.ui_js) continue;

      const attr = `data-khadim-plugin="${plugin.id}"`;
      if (document.querySelector(`script[${attr}]`)) continue;

      const script = document.createElement("script");
      script.type = "module";
      script.src = `khadim-plugin://${plugin.id}/${plugin.ui_js}`;
      script.setAttribute("data-khadim-plugin", plugin.id);
      script.onerror = () => {
        console.warn(`[khadim] Failed to load plugin UI script for "${plugin.id}"`);
      };
      document.head.appendChild(script);
    }
  }, [plugins]);
}
