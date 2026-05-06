import { WebSocketServer, WebSocket } from "ws";
import { spawn, type ChildProcess } from "child_process";
import type { IncomingMessage } from "http";

const PORT = Number(process.env.LSP_PORT ?? 1235);

const LSP_COMMANDS: Record<string, string[]> = {
  typescript: ["typescript-language-server", "--stdio"],
  javascript: ["typescript-language-server", "--stdio"],
  python: ["pylsp"],
  cpp: ["clangd"],
  c: ["clangd"],
  rust: ["rust-analyzer"],
};

interface Session {
  process: ChildProcess;
  clients: Set<WebSocket>;
  buffer: string;
}

const sessions = new Map<string, Session>();

function getSessionKey(lang: string, projectId: string) {
  return `${lang}:${projectId}`;
}

function getOrSpawnSession(lang: string, projectId: string): Session | null {
  const key = getSessionKey(lang, projectId);
  if (sessions.has(key)) return sessions.get(key)!;

  const cmd = LSP_COMMANDS[lang];
  if (!cmd) return null;

  const proc = spawn(cmd[0], cmd.slice(1), {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const session: Session = { process: proc, clients: new Set(), buffer: "" };
  sessions.set(key, session);

  proc.stdout?.on("data", (chunk: Buffer) => {
    session.buffer += chunk.toString();
    // Parse Content-Length framed LSP messages
    while (true) {
      const headerEnd = session.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = session.buffer.slice(0, headerEnd);
      const lenMatch = header.match(/Content-Length: (\d+)/);
      if (!lenMatch) { session.buffer = ""; break; }
      const len = Number(lenMatch[1]);
      const start = headerEnd + 4;
      if (session.buffer.length < start + len) break;
      const message = session.buffer.slice(start, start + len);
      session.buffer = session.buffer.slice(start + len);
      session.clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(message);
      });
    }
  });

  proc.on("exit", () => {
    sessions.delete(key);
  });

  return session;
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "/", `http://localhost`);
  const lang = url.searchParams.get("lang") ?? "typescript";
  const projectId = url.searchParams.get("project") ?? "default";

  const session = getOrSpawnSession(lang, projectId);
  if (!session) {
    ws.close(1008, `No language server for: ${lang}`);
    return;
  }

  session.clients.add(ws);

  ws.on("message", (data: Buffer) => {
    const msg = data.toString();
    const header = `Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n`;
    session.process.stdin?.write(header + msg);
  });

  ws.on("close", () => {
    session.clients.delete(ws);
  });
});

console.log(`LSP gateway running on ws://localhost:${PORT}`);
