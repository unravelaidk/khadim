/**
 * Desktop platform capabilities.
 * Provides a typed interface for native Tauri functionality
 * that components can consume without direct Tauri imports.
 */
export interface Platform {
  platform: "desktop";
  version: string;
  openLink: (url: string) => void;
}

export function createPlatform(): Platform {
  return {
    platform: "desktop",
    version: "0.1.0",
    openLink: (url: string) => {
      window.open(url, "_blank");
    },
  };
}
