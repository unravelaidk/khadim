/** A single study task stored in the plugin's KV store. */
export interface PomodoroTask {
  id: string;
  title: string;
  description: string;
  estimated_minutes: number;
  elapsed_seconds: number;
  completed: boolean;
  pomodoros_done: number;
}

/** Timer state stored in the plugin's KV store. */
export interface TimerState {
  status: "idle" | "running" | "paused" | "break";
  task_id: string;
  remaining_seconds: number;
  session_minutes: number;
  break_minutes: number;
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
