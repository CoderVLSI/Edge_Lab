declare module "y-websocket/bin/utils" {
  import type { WebSocket } from "ws";
  import type { IncomingMessage } from "http";

  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    opts?: { docName?: string; gc?: boolean }
  ): void;

  export function setPersistence(persistence: {
    bindState: (docName: string, ydoc: import("yjs").Doc) => void;
    writeState: (docName: string, ydoc: import("yjs").Doc) => Promise<void>;
  }): void;
}
