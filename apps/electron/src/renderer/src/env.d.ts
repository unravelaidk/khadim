import type { KhadimClient } from "../../shared/types";

declare global {
  interface WindowOrWorkerGlobalScope {
    MonacoEnvironment?: {
      getWorker(moduleId: string, label: string): Worker;
    };
  }

  interface Window {
    khadim: KhadimClient;
  }
}

export {};
