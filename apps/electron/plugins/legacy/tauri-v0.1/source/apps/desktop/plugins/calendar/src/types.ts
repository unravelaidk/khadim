/** A single calendar event as stored in the plugin's KV store. */
export interface CalEvent {
  id: string;
  title: string;
  start: string;       // ISO 8601 datetime
  end: string;         // ISO 8601 datetime
  description: string;
  all_day: boolean;
}

/** The shape of window.__khadim(pluginId) provided by the host. */
export interface KhadimPluginApi {
  store: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };
  events: {
    on: (eventName: string, handler: (data: string) => void) => () => void;
  };
}
