import type { SandboxInstance } from "./tools";

export type { SandboxInstance } from "./tools";

export type SandboxProvider = {
  create: (options: { lifetime: string }) => Promise<SandboxInstance>;
  connect: (options: { id: string }) => Promise<SandboxInstance>;
};

export type SandboxBackend = "remote" | "firecracker";
