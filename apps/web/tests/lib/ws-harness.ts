import WebSocket from "ws";

export class WsHarness<TMessage extends Record<string, unknown> = Record<string, unknown>> {
  readonly received: TMessage[] = [];
  private readonly onMessage: (data: WebSocket.RawData) => void;

  constructor(private readonly socket: WebSocket) {
    this.onMessage = (data) => {
      this.received.push(JSON.parse(data.toString()) as TMessage);
    };

    socket.on("message", this.onMessage);
  }

  static async connect<TMessage extends Record<string, unknown> = Record<string, unknown>>(url: string) {
    const socket = new WebSocket(url);

    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });

    return new WsHarness<TMessage>(socket);
  }

  send(message: Record<string, unknown>) {
    this.socket.send(JSON.stringify(message));
  }

  async waitFor(predicate: (message: TMessage) => boolean, timeoutMs = 2000): Promise<TMessage> {
    const existing = this.received.find(predicate);
    if (existing) {
      return existing;
    }

    return new Promise<TMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for WebSocket message. Received: ${JSON.stringify(this.received)}`));
      }, timeoutMs);

      const onMessage = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString()) as TMessage;
        if (!predicate(message)) {
          return;
        }

        cleanup();
        resolve(message);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.socket.off("message", onMessage);
        this.socket.off("error", onError);
      };

      this.socket.on("message", onMessage);
      this.socket.on("error", onError);
    });
  }

  close() {
    this.socket.off("message", this.onMessage);
    this.socket.terminate();
  }
}
