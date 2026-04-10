import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { queryClient } from "./lib/query-client";
import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PluginUiEvent } from "./lib/bindings";

// ── Plugin host bridge ────────────────────────────────────────────────
//
// window.__khadim(pluginId) returns a scoped API object the plugin's
// web components use to read/write their store and listen to UI events.
// This must be set up before any plugin <script> tags are injected.

declare global {
  interface Window {
    __khadim: (pluginId: string) => KhadimPluginApi;
  }
}

export interface KhadimPluginApi {
  store: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };
  events: {
    on: (eventName: string, handler: (data: string) => void) => () => void;
  };
}

window.__khadim = (pluginId: string): KhadimPluginApi => ({
  store: {
    get: (key) => invoke<string | null>("plugin_store_get", { pluginId, key }),
    set: (key, value) => invoke<void>("plugin_store_set", { pluginId, key, value }),
  },
  events: {
    on: (eventName, handler) => {
      // listen() returns a Promise<UnlistenFn>; we wrap it so plugins get a
      // synchronous cleanup function back immediately.
      let unlisten: (() => void) | null = null;
      listen<PluginUiEvent>("plugin-ui-event", (e) => {
        if (e.payload.plugin_id === pluginId && e.payload.event === eventName) {
          handler(e.payload.data);
        }
      }).then((fn) => {
        unlisten = fn;
      });
      return () => unlisten?.();
    },
  },
});

// ─────────────────────────────────────────────────────────────────────

const root = document.getElementById("root");
if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error("Root element not found. Check index.html has a <div id='root'>.");
}

ReactDOM.createRoot(root!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
