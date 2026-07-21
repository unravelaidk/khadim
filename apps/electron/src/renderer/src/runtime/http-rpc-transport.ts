import type { KhadimPushEvent, KhadimRpcMethod, KhadimRpcTransport } from "./rpc-khadim-client";

interface RpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

export interface HttpRpcTransportOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  createWebSocket?: (url: string) => WebSocket;
}

/** Same-origin RPC plus push events; usable by normal browsers and Deno Desktop's local HTTP server. */
export class HttpKhadimRpcTransport implements KhadimRpcTransport {
  private readonly listeners = new Set<(event: KhadimPushEvent) => void>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly options: HttpRpcTransportOptions = {}) {}

  async invoke<T>(method: KhadimRpcMethod, args: unknown[] = []): Promise<T> {
    const response = await (this.options.fetcher ?? fetch)(`${this.options.baseUrl ?? ""}/api/runtime/invoke`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method, args }),
    });
    const body = await response.json() as RpcResponse<T>;
    if (!response.ok || body.error) throw new Error(body.error?.message || `Runtime request failed (${response.status}).`);
    return body.result as T;
  }

  subscribe(listener: (event: KhadimPushEvent) => void): () => void {
    this.listeners.add(listener);
    this.connect();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.disconnect();
    };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.disconnect();
  }

  private connect(): void {
    if (this.disposed || this.socket || this.listeners.size === 0) return;
    const base = new URL(this.options.baseUrl || window.location.origin, window.location.origin);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    base.pathname = "/api/runtime/ws";
    const socket = (this.options.createWebSocket ?? ((url) => new WebSocket(url)))(base.toString());
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as KhadimPushEvent;
        if (message.type === "agent.event" || message.type === "discord.status") {
          this.listeners.forEach((listener) => listener(message));
        }
      } catch {
        // Ignore malformed server messages; the connection remains usable.
      }
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      if (!this.disposed && this.listeners.size > 0) {
        this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, 1_000);
      }
    });
  }

  private disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}
