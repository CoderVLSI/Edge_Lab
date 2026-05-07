import React, { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { FileTree, type FileTreeNode } from "@edge-lab/ui";
import { SerialMonitor, BoardSelector, BOARDS, type Board } from "@edge-lab/hardware";
import { FolderOpen, Upload, Play, ChevronRight, Wifi, GitBranch, GitMerge } from "lucide-react";
import * as Y from "yjs";
import { CodeEditor } from "@edge-lab/editor";

// ── CSS variables (mirrors web globals.css) ────────────────────────────────
const CSS_VARS = `
  :root {
    --bg: #07080f; --s1: #0c0d1a; --s2: #10121f;
    --b1: #1a1d2e; --b2: #252840; --b3: #303558;
    --amber: #f59e0b; --amber-dim: #d97706;
    --amber-lo: rgba(245,158,11,0.10); --amber-md: rgba(245,158,11,0.20);
    --blue: #60a5fa; --green: #4ade80; --red: #f87171;
    --t1: #f1f5f9; --t2: #94a3b8; --t3: #475569; --t4: #2d3550;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--t1); font-family: 'DM Sans', 'Segoe UI', sans-serif; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--b3); border-radius: 2px; }
  .cm-editor { height: 100% !important; }
  .cm-scroller { overflow: auto !important; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

type BottomTab = "terminal" | "serial" | "ports" | "git";

export function DesktopApp() {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [files, setFiles] = useState<FileTreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(null);
  const [board, setBoard] = useState<Board>(BOARDS[3]);
  const [buildOutput, setBuildOutput] = useState<string[]>([]);
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [bottomHeight] = useState(200);
  const [commitMsg, setCommitMsg] = useState("");
  const [gitLog, setGitLog] = useState<string[]>([]);
  const [gitRunning, setGitRunning] = useState(false);
  const yDocRef = useRef(new Y.Doc());
  const yTextRef = useRef(yDocRef.current.getText("file"));
  const [, forceUpdate] = useState(0);

  // Refresh serial ports list
  const refreshPorts = async () => {
    try {
      const ports = await invoke<string[]>("list_serial_ports");
      setSerialPorts(ports);
    } catch {
      setSerialPorts([]);
    }
  };

  useEffect(() => { refreshPorts(); }, []);

  // ── Git operations (calls local git via backend or Tauri Command) ──
  const gitCmd = async (args: string[]) => {
    if (!rootPath) { setGitLog((l) => [...l, "✗ Open a folder first"]); return; }
    setGitRunning(true);
    try {
      const cmd = Command.create("git", args, { cwd: rootPath });
      let out = "";
      cmd.stdout.on("data", (d: string) => { out += d; });
      cmd.stderr.on("data", (d: string) => { out += d; });
      const res = await cmd.execute();
      const lines = out.trim().split("\n").filter(Boolean);
      setGitLog((l) => [
        ...l,
        `$ git ${args.join(" ")}`,
        ...lines,
        res.code === 0 ? `✓ Done` : `✗ Exit ${res.code}`,
      ]);
    } catch (e) {
      setGitLog((l) => [...l, `✗ Error: ${String(e)}`]);
    } finally {
      setGitRunning(false);
    }
  };

  const gitCommit = async () => {
    if (!commitMsg.trim()) return;
    await gitCmd(["add", "."]);
    await gitCmd(["commit", "-m", commitMsg]);
    setCommitMsg("");
  };

  const openFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    setRootPath(selected);
    try {
      const entries = await readDir(selected);
      const nodes: FileTreeNode[] = entries.map((e) => ({
        id: e.name ?? "",
        name: e.name ?? "",
        type: e.isDirectory ? "directory" : "file",
      }));
      setFiles(nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
    } catch (e) {
      setBuildOutput([`Error reading folder: ${String(e)}`]);
    }
  };

  const openFile = async (node: FileTreeNode) => {
    if (node.type !== "file" || !rootPath) return;
    setSelectedFile(node);
    try {
      const content = await readTextFile(`${rootPath}/${node.name}`);
      const yt = yDocRef.current.getText("file");
      yDocRef.current.transact(() => {
        yt.delete(0, yt.length);
        yt.insert(0, content);
      });
      yTextRef.current = yt;
      forceUpdate((n) => n + 1);
    } catch (e) {
      setBuildOutput([`Error reading file: ${String(e)}`]);
    }
  };

  const saveFile = async () => {
    if (!selectedFile || !rootPath) return;
    try {
      await writeTextFile(`${rootPath}/${selectedFile.name}`, yTextRef.current.toString());
      setBuildOutput((o) => [...o, `Saved ${selectedFile.name}`]);
    } catch (e) {
      setBuildOutput((o) => [...o, `Save error: ${String(e)}`]);
    }
  };

  const runBuild = async () => {
    if (rootPath) await saveFile();
    setBuildOutput(["$ pio run", "Building…"]);
    try {
      const cmd = Command.create("pio", ["run"], { cwd: rootPath ?? undefined });
      cmd.stdout.on("data", (line: string) => setBuildOutput((o) => [...o, line]));
      cmd.stderr.on("data", (line: string) => setBuildOutput((o) => [...o, `  ${line}`]));
      const res = await cmd.execute();
      setBuildOutput((o) => [...o, res.code === 0 ? "✓ Build successful" : `✗ Exit code ${res.code}`]);
    } catch (e) {
      setBuildOutput((o) => [...o, `Error: ${String(e)}`]);
    }
  };

  const runFlash = async () => {
    setBuildOutput(["$ pio run --target upload", "Flashing…"]);
    try {
      const cmd = Command.create("pio", ["run", "--target", "upload"], { cwd: rootPath ?? undefined });
      cmd.stdout.on("data", (l: string) => setBuildOutput((o) => [...o, l]));
      cmd.stderr.on("data", (l: string) => setBuildOutput((o) => [...o, l]));
      const res = await cmd.execute();
      setBuildOutput((o) => [...o, res.code === 0 ? "✓ Flash successful" : `✗ Exit code ${res.code}`]);
    } catch (e) {
      setBuildOutput((o) => [...o, `Error: ${String(e)}`]);
    }
  };

  const bottomTabStyle = (t: BottomTab): React.CSSProperties => ({
    padding: "0 14px", height: "100%", border: "none",
    borderBottom: bottomTab === t ? "2px solid var(--amber)" : "2px solid transparent",
    background: bottomTab === t ? "var(--amber-lo)" : "transparent",
    color: bottomTab === t ? "var(--amber)" : "var(--t3)",
    fontSize: 10, fontFamily: "monospace", letterSpacing: "0.08em",
    cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <>
      <style>{CSS_VARS}</style>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--t1)", overflow: "hidden" }}>

        {/* ── Toolbar ── */}
        <div style={{ display: "flex", alignItems: "center", height: 44, borderBottom: "1px solid var(--b1)", background: "var(--s1)", padding: "0 12px", gap: 8, flexShrink: 0 }}>
          {/* Logo */}
          <span style={{ fontFamily: "sans-serif", fontWeight: 900, fontSize: 13, letterSpacing: "0.06em", color: "var(--t1)", marginRight: 4 }}>
            EDGE <span style={{ color: "var(--amber)" }}>LAB</span>
          </span>
          <div style={{ width: 1, height: 16, background: "var(--b2)" }} />

          {/* Open folder */}
          <button
            onClick={openFolder}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", border: "1px solid var(--b2)", borderRadius: 5, background: "transparent", color: "var(--t2)", fontSize: 12, cursor: "pointer" }}
          >
            <FolderOpen size={13} /> Open Folder
          </button>

          {rootPath && (
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--t4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
              {rootPath}
            </span>
          )}

          <BoardSelector value={board.id} onChange={setBoard} />

          <div style={{ flex: 1 }} />

          {/* Save */}
          {selectedFile && (
            <button
              onClick={saveFile}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", border: "1px solid var(--b2)", borderRadius: 5, background: "transparent", color: "var(--t2)", fontSize: 12, cursor: "pointer" }}
            >
              Save
            </button>
          )}

          {/* Build */}
          <button
            onClick={runBuild}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", border: "1px solid var(--b2)", borderRadius: 5, background: "transparent", color: "var(--t2)", fontSize: 12, cursor: "pointer" }}
          >
            <Play size={11} color="var(--green)" /> Build
          </button>

          {/* Flash */}
          <button
            onClick={runFlash}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 13px", border: "none", borderRadius: 5, background: "var(--amber)", color: "#07080f", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
          >
            <Upload size={11} /> Flash
          </button>

          <div style={{ width: 1, height: 16, background: "var(--b2)" }} />

          {/* Git Push */}
          <button
            onClick={() => gitCmd(["push"])}
            disabled={gitRunning}
            title="git push"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: "1px solid var(--b2)", borderRadius: 5, background: "transparent", color: "var(--t2)", fontSize: 12, cursor: "pointer", opacity: gitRunning ? 0.45 : 1 }}
          >
            <GitBranch size={11} /> Push
          </button>

          {/* Git Pull */}
          <button
            onClick={() => gitCmd(["pull"])}
            disabled={gitRunning}
            title="git pull"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", border: "1px solid var(--b2)", borderRadius: 5, background: "transparent", color: "var(--t2)", fontSize: 12, cursor: "pointer", opacity: gitRunning ? 0.45 : 1 }}
          >
            <GitMerge size={11} /> Pull
          </button>
        </div>

        {/* ── Main area ── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

          {/* ── Sidebar ── */}
          <div style={{ width: sidebarWidth, flexShrink: 0, borderRight: "1px solid var(--b1)", display: "flex", flexDirection: "column", background: "var(--s1)", overflow: "hidden" }}>
            <div style={{ padding: "6px 12px", fontFamily: "monospace", fontSize: 9, color: "var(--t4)", letterSpacing: "0.1em", borderBottom: "1px solid var(--b1)", textTransform: "uppercase" }}>
              // Explorer
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {files.length > 0 ? (
                <FileTree nodes={files} selectedId={selectedFile?.id} onSelect={openFile} />
              ) : (
                <div style={{ padding: 20, textAlign: "center", color: "var(--t4)", fontSize: 11, fontFamily: "monospace" }}>
                  <div style={{ fontSize: 24, marginBottom: 10 }}>📁</div>
                  Open a folder to start
                </div>
              )}
            </div>

            {/* Resize handle */}
            <div
              style={{ position: "absolute", left: sidebarWidth - 2, top: 44, bottom: 0, width: 4, cursor: "col-resize", zIndex: 10 }}
              onMouseDown={(e) => {
                const start = e.clientX;
                const startW = sidebarWidth;
                const move = (ev: MouseEvent) => setSidebarWidth(Math.max(150, Math.min(400, startW + ev.clientX - start)));
                const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }}
            />
          </div>

          {/* ── Editor + bottom ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

            {/* File tab */}
            <div style={{ height: 32, display: "flex", alignItems: "center", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0 }}>
              {selectedFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, height: "100%", padding: "0 14px", fontFamily: "monospace", fontSize: 11, color: "var(--t2)", borderBottom: "2px solid var(--amber)", background: "var(--amber-lo)", whiteSpace: "nowrap" }}>
                  <ChevronRight size={11} color="var(--amber)" />
                  {selectedFile.name}
                </div>
              ) : (
                <div style={{ padding: "0 14px", fontFamily: "monospace", fontSize: 11, color: "var(--t4)" }}>No file open</div>
              )}
            </div>

            {/* Editor */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
              <div style={{ position: "absolute", inset: 0 }}>
                {selectedFile && yTextRef.current
                  ? <CodeEditor filename={selectedFile.name} yText={yTextRef.current} />
                  : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t4)", gap: 12 }}>
                      <div style={{ fontSize: 36 }}>⚡</div>
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--t3)" }}>Open a folder · Select a file to edit</div>
                    </div>
                  )}
              </div>
            </div>

            {/* Bottom panel */}
            <div style={{ height: bottomHeight, borderTop: "1px solid var(--b1)", flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
              <div style={{ height: 30, display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0 }}>
                <button style={bottomTabStyle("terminal")} onClick={() => setBottomTab("terminal")}>TERMINAL</button>
                <button style={bottomTabStyle("serial")} onClick={() => setBottomTab("serial")}>SERIAL</button>
                <button style={bottomTabStyle("ports")} onClick={() => { setBottomTab("ports"); refreshPorts(); }}>PORTS</button>
                <button style={bottomTabStyle("git")} onClick={() => { setBottomTab("git"); gitCmd(["status", "--short"]); }}>GIT</button>
              </div>
              <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>

                {/* Terminal output */}
                <div style={{ position: "absolute", inset: 0, display: bottomTab === "terminal" ? "flex" : "none", flexDirection: "column", overflowY: "auto", padding: "8px 12px", gap: 1 }}>
                  {buildOutput.length === 0
                    ? <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--t4)" }}>// Build output will appear here</span>
                    : buildOutput.map((l, i) => (
                      <div key={i} style={{ fontFamily: "monospace", fontSize: 11, color: l.startsWith("✓") ? "var(--green)" : l.startsWith("✗") || l.startsWith("Error") ? "var(--red)" : "var(--t2)", lineHeight: 1.6 }}>
                        {l}
                      </div>
                    ))}
                </div>

                {/* Serial monitor */}
                <div style={{ position: "absolute", inset: 0, display: bottomTab === "serial" ? "flex" : "none", flexDirection: "column" }}>
                  <SerialMonitor />
                </div>

                {/* Git panel */}
                <div style={{ position: "absolute", inset: 0, display: bottomTab === "git" ? "flex" : "none", flexDirection: "column" }}>
                  {/* Git action row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid var(--b1)", flexShrink: 0, background: "var(--s1)" }}>
                    <button
                      onClick={() => gitCmd(["add", "."])}
                      disabled={gitRunning}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, background: "var(--amber-lo)", color: "var(--amber)", fontSize: 10, cursor: "pointer", fontFamily: "monospace", opacity: gitRunning ? 0.45 : 1 }}
                    >
                      + Stage All
                    </button>
                    <button
                      onClick={() => gitCmd(["status", "--short"])}
                      disabled={gitRunning}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", border: "1px solid var(--b2)", borderRadius: 4, background: "transparent", color: "var(--t3)", fontSize: 10, cursor: "pointer", fontFamily: "monospace", opacity: gitRunning ? 0.45 : 1 }}
                    >
                      ↻ Status
                    </button>
                    <button
                      onClick={() => gitCmd(["push"])}
                      disabled={gitRunning}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", border: "1px solid var(--b2)", borderRadius: 4, background: "transparent", color: "var(--t3)", fontSize: 10, cursor: "pointer", fontFamily: "monospace", opacity: gitRunning ? 0.45 : 1 }}
                    >
                      ↑ Push
                    </button>
                    <button
                      onClick={() => gitCmd(["pull"])}
                      disabled={gitRunning}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", border: "1px solid var(--b2)", borderRadius: 4, background: "transparent", color: "var(--t3)", fontSize: 10, cursor: "pointer", fontFamily: "monospace", opacity: gitRunning ? 0.45 : 1 }}
                    >
                      ↓ Pull
                    </button>
                    {gitRunning && <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--amber)" }}>running…</span>}
                    <button
                      onClick={() => setGitLog([])}
                      style={{ marginLeft: "auto", padding: "3px 8px", border: "1px solid var(--b2)", borderRadius: 4, background: "transparent", color: "var(--t4)", fontSize: 10, cursor: "pointer", fontFamily: "monospace" }}
                    >
                      Clear
                    </button>
                  </div>
                  {/* Commit input */}
                  <div style={{ display: "flex", gap: 6, padding: "6px 10px", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
                    <input
                      value={commitMsg}
                      onChange={(e) => setCommitMsg(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && gitCommit()}
                      placeholder="Commit message…"
                      style={{ flex: 1, height: 26, border: "1px solid var(--b2)", borderRadius: 4, background: "var(--s1)", color: "var(--t1)", padding: "0 8px", fontFamily: "monospace", fontSize: 11, outline: "none" }}
                    />
                    <button
                      onClick={gitCommit}
                      disabled={!commitMsg.trim() || gitRunning}
                      style={{ padding: "0 10px", height: 26, border: "none", borderRadius: 4, background: commitMsg.trim() ? "var(--amber)" : "var(--b2)", color: commitMsg.trim() ? "#07080f" : "var(--t4)", fontSize: 11, fontWeight: 700, cursor: commitMsg.trim() ? "pointer" : "default", fontFamily: "monospace" }}
                    >
                      ✓ Commit
                    </button>
                  </div>
                  {/* Git log */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px" }}>
                    {gitLog.length === 0
                      ? <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--t4)" }}>// Git output will appear here</span>
                      : gitLog.map((l, i) => (
                        <div key={i} style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, color: l.startsWith("✓") ? "var(--green)" : l.startsWith("✗") ? "var(--red)" : l.startsWith("$") ? "var(--amber)" : "var(--t2)" }}>
                          {l}
                        </div>
                      ))}
                  </div>
                </div>

                {/* Ports list */}
                <div style={{ position: "absolute", inset: 0, display: bottomTab === "ports" ? "block" : "none", overflowY: "auto", padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--t4)", letterSpacing: "0.08em" }}>// SERIAL PORTS</span>
                    <button onClick={refreshPorts} style={{ fontFamily: "monospace", fontSize: 10, color: "var(--amber)", border: "1px solid rgba(245,158,11,0.3)", background: "var(--amber-lo)", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>
                      Refresh
                    </button>
                  </div>
                  {serialPorts.length === 0
                    ? <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--t4)" }}>No serial ports detected</div>
                    : serialPorts.map((p) => (
                      <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--b1)" }}>
                        <Wifi size={11} color="var(--green)" />
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--t2)" }}>{p}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
