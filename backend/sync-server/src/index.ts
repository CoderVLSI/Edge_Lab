import { WebSocketServer } from "ws";
import { setupWSConnection, setPersistence } from "y-websocket/bin/utils";
import * as Y from "yjs";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
const PORT = Number(process.env.SYNC_PORT ?? 1234);

// Persist Yjs snapshots to PostgreSQL
setPersistence({
  bindState: async (docName: string, ydoc: Y.Doc) => {
    const [row] = await sql`
      SELECT ydoc_state FROM sync_snapshots
      WHERE project_id = ${docName.replace("project:", "")}
      ORDER BY saved_at DESC LIMIT 1
    `;
    if (row?.ydoc_state) {
      Y.applyUpdate(ydoc, row.ydoc_state);
    }
  },
  writeState: async (docName: string, ydoc: Y.Doc) => {
    const projectId = docName.replace("project:", "");
    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));
    await sql`
      INSERT INTO sync_snapshots (project_id, ydoc_state)
      VALUES (${projectId}, ${state})
    `;
  },
});

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws, req) => {
  setupWSConnection(ws, req, { gc: true });
});

console.log(`Sync server running on ws://localhost:${PORT}`);
