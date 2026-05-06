import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export interface WorkspaceDoc {
  doc: Y.Doc;
  provider: WebsocketProvider;
  files: Y.Map<Y.Text>;
  awareness: WebsocketProvider["awareness"];
  destroy: () => void;
}

export function createWorkspaceDoc(projectId: string, serverUrl: string): WorkspaceDoc {
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(serverUrl, `project:${projectId}`, doc, {
    connect: true,
  });

  // Top-level map: path → Y.Text (file content)
  const files = doc.getMap<Y.Text>("files");

  return {
    doc,
    provider,
    files,
    awareness: provider.awareness,
    destroy: () => {
      provider.destroy();
      doc.destroy();
    },
  };
}

export function getOrCreateFile(files: Y.Map<Y.Text>, path: string): Y.Text {
  if (!files.has(path)) {
    files.set(path, new Y.Text());
  }
  return files.get(path)!;
}
