import { useEffect, useRef, useState } from "react";
import { createWorkspaceDoc, type WorkspaceDoc } from "./workspace-doc";

type SyncStatus = "connecting" | "connected" | "disconnected";

export function useSync(projectId: string, serverUrl: string) {
  const docRef = useRef<WorkspaceDoc | null>(null);
  const [status, setStatus] = useState<SyncStatus>("connecting");

  useEffect(() => {
    const workspace = createWorkspaceDoc(projectId, serverUrl);
    docRef.current = workspace;

    workspace.provider.on("status", ({ status: s }: { status: string }) => {
      setStatus(s === "connected" ? "connected" : s === "disconnected" ? "disconnected" : "connecting");
    });

    return () => workspace.destroy();
  }, [projectId, serverUrl]);

  return { workspace: docRef.current, status };
}
