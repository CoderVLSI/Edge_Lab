export interface LspClientOptions {
  gatewayUrl: string;
  languageId: string;
  projectId: string;
}

export class LspClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private handlers = new Map<string, (params: unknown) => void>();

  // Generic event hooks for Transport bridge
  onRawMessage?: (data: string) => void;
  onClose?: () => void;
  onError?: (e: Error) => void;

  constructor(private options: LspClientOptions) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { gatewayUrl, languageId, projectId } = this.options;
      this.ws = new WebSocket(`${gatewayUrl}?lang=${languageId}&project=${projectId}`);

      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => {
        const err = new Error(e instanceof ErrorEvent ? e.message : "WebSocket error");
        this.onError?.(err);
        reject(err);
      };
      this.ws.onclose = () => this.onClose?.();
      this.ws.onmessage = (event) => {
        const raw = event.data as string;
        this.onRawMessage?.(raw);
        this.handleMessage(JSON.parse(raw));
      };
    });
  }

  private handleMessage(msg: { id?: number; method?: string; result?: unknown; error?: unknown; params?: unknown }) {
    if (msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        msg.error ? pending.reject(msg.error) : pending.resolve(msg.result);
      }
    } else if (msg.method) {
      this.handlers.get(msg.method)?.(msg.params);
    }
  }

  request(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pending.set(id, { resolve, reject });
      this.ws?.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  notify(method: string, params: unknown) {
    this.ws?.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  on(method: string, handler: (params: unknown) => void) {
    this.handlers.set(method, handler);
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}
