import { languageServerWithTransport } from "codemirror-languageserver";
import type { Transport } from "codemirror-languageserver";
import type { LspClient } from "./lsp-client";

/**
 * Build a codemirror-languageserver Transport that bridges to our WebSocket LspClient.
 * The Transport interface requires: send, onMessage, onClose, onError, close.
 */
function createTransport(client: LspClient): Transport {
  return {
    send(message: string) {
      const msg = JSON.parse(message) as { id?: number; method: string; params: unknown };
      if (msg.id !== undefined) {
        client.request(msg.method, msg.params).catch(() => { /* errors surface via onError */ });
      } else {
        client.notify(msg.method, msg.params);
      }
    },
    onMessage(cb) {
      client.onRawMessage = cb;
    },
    onClose(cb) {
      client.onClose = cb;
    },
    onError(cb) {
      client.onError = cb;
    },
    close() {
      /* lifecycle managed by LspClient.disconnect() */
    },
  };
}

export function createLspExtension(
  client: LspClient,
  documentUri: string,
  languageId: string,
  rootUri: string = "file:///"
) {
  return languageServerWithTransport({
    rootUri,
    documentUri,
    languageId,
    workspaceFolders: null,
    transport: createTransport(client),
  });
}
