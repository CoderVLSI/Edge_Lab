"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { CodeEditor } from "@edge-lab/editor";
import { FileTree, type FileTreeNode } from "@edge-lab/ui";
import { SerialMonitor, BoardSelector, BOARDS, type Board } from "@edge-lab/hardware";
import {
  Files, GitBranch, Play, Upload, Wifi, WifiOff, RefreshCw,
  FileCode2, FileCog, FileText, BookOpen, Search as SearchIcon,
  ChevronRight, Settings, Cpu, Activity, Layers,
} from "lucide-react";
import { AgentChat } from "./agent-chat";
import { GitPanel } from "./git-panel";
import { TerminalPanel } from "./terminal-panel";
import { SettingsModal } from "./settings-modal";
import { KiCanvasViewer } from "./kicad-viewer";
import { LibraryManager } from "./library-manager";
import { SearchPalette, type PaletteFile } from "./search-palette";

const SYNC_URL = process.env.NEXT_PUBLIC_SYNC_URL ?? "ws://localhost:1234";

// ── Demo project files ───────────────────────────────────────────────────────
const DEMO_FILES: FileTreeNode[] = [
  {
    id: "src", name: "src", type: "directory",
    children: [
      { id: "main.cpp",  name: "main.cpp",  type: "file" },
      { id: "config.h",  name: "config.h",  type: "file" },
    ],
  },
  { id: "platformio.ini",      name: "platformio.ini",      type: "file" },
  { id: "schematic.kicad_sch", name: "schematic.kicad_sch", type: "file" },
  { id: "board.kicad_pcb",     name: "board.kicad_pcb",     type: "file" },
  { id: "README.md",           name: "README.md",           type: "file" },
];

const DEMO_CONTENT: Record<string, string> = {
  "main.cpp": `#include <Arduino.h>\n#include "config.h"\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED_PIN, OUTPUT);\n  Serial.println("Edge Lab — ESP32 ready");\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(BLINK_DELAY);\n  digitalWrite(LED_PIN, LOW);\n  delay(BLINK_DELAY);\n}\n`,
  "config.h": `#pragma once\n\n#define LED_PIN     2\n#define BLINK_DELAY 500\n`,
  "platformio.ini": `[env:esp32dev]\nplatform  = espressif32\nboard     = esp32dev\nframework = arduino\nmonitor_speed = 115200\n`,
  "README.md": `# ESP32 Blink\n\nBuilt with Edge Lab.\n`,
  "schematic.kicad_sch": `(kicad_sch\n  (version 20230121)\n  (generator eeschema)\n  (paper "A4")\n  (lib_symbols)\n  (sheet_instances (path "/" (page "1")))\n)\n`,
  "board.kicad_pcb": `(kicad_pcb\n  (version 20230121)\n  (generator pcbnew)\n  (general (thickness 1.6))\n  (paper "A4")\n  (layers\n    (0 "F.Cu" signal)\n    (31 "B.Cu" signal)\n    (44 "Edge.Cuts" user)\n  )\n  (setup (pad_to_mask_clearance 0))\n  (net 0 "")\n)\n`,
};

type Mode      = "firmware" | "schematics" | "board";
type BottomTab = "terminal" | "serial" | "problems";
type SideTab   = "files" | "git";

// ── Helpers ──────────────────────────────────────────────────────────────────
function flattenFiles(nodes: FileTreeNode[], prefix = ""): PaletteFile[] {
  const out: PaletteFile[] = [];
  for (const n of nodes) {
    if (n.type === "file") out.push({ id: n.id, name: n.name, path: prefix ? `${prefix}/${n.name}` : n.name });
    else if (n.children)   out.push(...flattenFiles(n.children, prefix ? `${prefix}/${n.name}` : n.name));
  }
  return out;
}

const ALL_PALETTE_FILES = flattenFiles(DEMO_FILES);
const ALL_FILE_NAMES    = ALL_PALETTE_FILES.map(f => f.name);

function fileIcon(name: string, size = 13): React.ReactNode {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "cpp" || ext === "c" || ext === "h" || ext === "hpp") return <FileCode2 size={size} style={{ color: "var(--blue)", flexShrink: 0 }} />;
  if (ext === "ini" || ext === "toml" || ext === "yaml" || ext === "json") return <FileCog size={size} style={{ color: "var(--purple)", flexShrink: 0 }} />;
  if (ext === "kicad_sch") return <Layers size={size} style={{ color: "var(--orange)", flexShrink: 0 }} />;
  if (ext === "kicad_pcb") return <Cpu size={size} style={{ color: "var(--green)", flexShrink: 0 }} />;
  return <FileText size={size} style={{ color: "var(--t3)", flexShrink: 0 }} />;
}

// ── IdeLayout ────────────────────────────────────────────────────────────────
export function IdeLayout({ projectId }: { projectId: string }) {
  const [mode, setMode]               = useState<Mode>("firmware");
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(DEMO_FILES[0].children![0]);
  const [board, setBoard]             = useState<Board>(BOARDS[0]);
  const [sideTab, setSideTab]         = useState<SideTab>("files");
  const [bottomTab, setBottomTab]     = useState<BottomTab>("terminal");
  const [syncStatus, setSyncStatus]   = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [showLibManager, setShowLibManager]       = useState(false);
  const [showSearchPalette, setShowSearchPalette] = useState(false);
  const [askToFixText, setAskToFixText]           = useState<string | undefined>(undefined);

  const providerRef = useRef<WebsocketProvider | null>(null);
  const filesRef    = useRef<Y.Map<Y.Text> | null>(null);
  const [, forceUpdate] = useState(0);

  // ── Yjs sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const doc      = new Y.Doc();
    const provider = new WebsocketProvider(SYNC_URL, `project:${projectId}`, doc);
    const files    = doc.getMap<Y.Text>("files");

    provider.on("status", ({ status }: { status: string }) =>
      setSyncStatus(status === "connected" ? "connected" : status === "disconnected" ? "disconnected" : "connecting")
    );

    doc.transact(() => {
      Object.entries(DEMO_CONTENT).forEach(([path, content]) => {
        if (!files.has(path)) { const t = new Y.Text(); t.insert(0, content); files.set(path, t); }
      });
    });

    providerRef.current = provider;
    filesRef.current    = files;
    forceUpdate(n => n + 1);
    return () => { filesRef.current = null; providerRef.current = null; provider.destroy(); doc.destroy(); };
  }, [projectId]);

  // ── Ctrl+K ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setShowSearchPalette(v => !v); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const handleAskToFix = (errorText: string) => {
    setAskToFixText(errorText);
    setTimeout(() => setAskToFixText(undefined), 100);
  };

  const handlePaletteSelect = (file: PaletteFile) => {
    const find = (nodes: FileTreeNode[]): FileTreeNode | null => {
      for (const n of nodes) {
        if (n.id === file.id) return n;
        if (n.children) { const r = find(n.children); if (r) return r; }
      }
      return null;
    };
    const node = find(DEMO_FILES);
    if (node) { setSelectedFile(node); setMode("firmware"); }
  };

  const handleModeChange = (m: Mode) => {
    setMode(m);
    if (m === "schematics") { const n = DEMO_FILES.find(f => f.id === "schematic.kicad_sch"); if (n) setSelectedFile(n); }
    if (m === "board")      { const n = DEMO_FILES.find(f => f.id === "board.kicad_pcb");     if (n) setSelectedFile(n); }
  };

  const getYText = (name: string): Y.Text | null => {
    if (!filesRef.current) return null;
    const m = filesRef.current;
    if (!m.has(name)) { const t = new Y.Text(); m.set(name, t); }
    return m.get(name)!;
  };

  const currentYText   = selectedFile ? getYText(selectedFile.name) : null;
  const schematicYText = getYText("schematic.kicad_sch");
  const boardYText     = getYText("board.kicad_pcb");

  // ── Sync status indicator ─────────────────────────────────────────────────
  const SyncIndicator = () => {
    if (syncStatus === "connected")    return <Wifi size={12} style={{ color: "var(--green)" }} />;
    if (syncStatus === "connecting")   return <RefreshCw size={12} style={{ color: "var(--t3)", animation: "spin 1.5s linear infinite" }} />;
    return <WifiOff size={12} style={{ color: "var(--t4)" }} />;
  };

  const modeActive = (m: Mode) => mode === m;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--t1)", overflow: "hidden", fontFamily: "var(--font-ui)" }}>

      {/* ── Title bar / Toolbar ─────────────────────────────────────────────── */}
      <div style={{ height: 38, display: "flex", alignItems: "center", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0, gap: 0 }}>

        {/* Logo */}
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 14px", height: "100%", textDecoration: "none", borderRight: "1px solid var(--b1)", flexShrink: 0 }}>
          <img src="/logo.jpg" alt="" width={18} height={18} style={{ borderRadius: 3, opacity: 0.9 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 12, letterSpacing: "0.08em", color: "var(--t2)" }}>
            edge<span style={{ color: "var(--amber)" }}>lab</span>
          </span>
        </Link>

        {/* Board selector */}
        <div style={{ padding: "0 8px", borderRight: "1px solid var(--b1)", height: "100%", display: "flex", alignItems: "center" }}>
          <BoardSelector value={board.id} onChange={setBoard} />
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", alignItems: "stretch", height: "100%", borderRight: "1px solid var(--b1)" }}>
          {([
            { id: "firmware"   as Mode, label: "Firmware",   icon: <Activity size={11} /> },
            { id: "schematics" as Mode, label: "Schematic",  icon: <Layers size={11} /> },
            { id: "board"      as Mode, label: "PCB",        icon: <Cpu size={11} /> },
          ] as { id: Mode; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => handleModeChange(id)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 14px", height: "100%", border: "none", borderBottom: modeActive(id) ? "1px solid var(--amber)" : "1px solid transparent", background: modeActive(id) ? "var(--bg)" : "transparent", color: modeActive(id) ? "var(--t1)" : "var(--t3)", fontFamily: "var(--font-ui)", fontSize: 12, cursor: "pointer", transition: "color 0.1s, background 0.1s", whiteSpace: "nowrap" }}
            >
              <span style={{ color: modeActive(id) ? "var(--amber)" : "var(--t4)" }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto", padding: "0 8px" }}>

          {/* Ctrl+K */}
          <button
            onClick={() => setShowSearchPalette(true)}
            title="Go to file (Ctrl+K)"
            style={{ display: "flex", alignItems: "center", gap: 5, height: 26, padding: "0 8px", borderRadius: "var(--r2)", border: "1px solid var(--b2)", background: "transparent", color: "var(--t3)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer", gap: 6 }}
          >
            <SearchIcon size={11} />
            <span style={{ color: "var(--t4)", fontSize: 10 }}>Ctrl+K</span>
          </button>

          <div className="vdiv" style={{ margin: "0 4px" }} />

          {/* Libs */}
          <button
            onClick={() => setShowLibManager(true)}
            title="Library Manager"
            style={{ display: "flex", alignItems: "center", gap: 5, height: 26, padding: "0 8px", borderRadius: "var(--r2)", border: "1px solid var(--b2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-ui)", fontSize: 12, cursor: "pointer" }}
          >
            <BookOpen size={11} /> Libs
          </button>

          <div className="vdiv" style={{ margin: "0 4px" }} />

          {/* Build */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("edge-lab:build"))}
            style={{ display: "flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", borderRadius: "var(--r2)", border: "1px solid var(--b2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-ui)", fontSize: 12, cursor: "pointer" }}
          >
            <Play size={11} style={{ color: "var(--green)" }} /> Build
          </button>

          {/* Flash */}
          <button
            className="btn-amber"
            style={{ height: 26, padding: "0 10px", fontSize: 12, borderRadius: "var(--r2)" }}
          >
            <Upload size={11} /> Flash
          </button>

          <div className="vdiv" style={{ margin: "0 4px" }} />
          <SettingsModal />
          <div style={{ padding: "0 6px", display: "flex", alignItems: "center" }}>
            <SyncIndicator />
          </div>
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* ── Activity bar ── */}
        <div style={{ width: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 6, borderRight: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0 }}>
          {([
            { id: "files" as SideTab, icon: <Files size={17} />,     title: "Explorer" },
            { id: "git"   as SideTab, icon: <GitBranch size={17} />, title: "Source Control" },
          ] as { id: SideTab; icon: React.ReactNode; title: string }[]).map(t => (
            <button key={t.id} title={t.title} onClick={() => setSideTab(t.id)}
              style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--r2)", border: "none", cursor: "pointer", background: sideTab === t.id ? "var(--s3)" : "transparent", color: sideTab === t.id ? "var(--t1)" : "var(--t4)", transition: "background 0.1s, color 0.1s", borderLeft: sideTab === t.id ? "2px solid var(--amber)" : "2px solid transparent" }}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* ── Sidebar ── */}
        <div style={{ width: 220, borderRight: "1px solid var(--b1)", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0, background: "var(--s1)" }}>
          <div style={{ height: 28, display: "flex", alignItems: "center", padding: "0 10px", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, fontWeight: 600, color: "var(--t3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {sideTab === "files" ? "Explorer" : "Source Control"}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {sideTab === "files"
              ? <FileTree nodes={DEMO_FILES} selectedId={selectedFile?.id} onSelect={n => { if (n.type === "file") { setSelectedFile(n); setMode("firmware"); } }} />
              : <GitPanel projectId={projectId} />}
          </div>
        </div>

        {/* ── Editor / Viewer area ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* FIRMWARE mode */}
          {mode === "firmware" && (
            <>
              {/* File tab bar */}
              <div style={{ height: 35, display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0, overflowX: "auto" }}>
                {selectedFile ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", background: "var(--bg)", borderRight: "1px solid var(--b1)", borderBottom: "1px solid var(--amber)", fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--t1)", whiteSpace: "nowrap" }}>
                    {fileIcon(selectedFile.name, 12)}
                    <span>{selectedFile.name}</span>
                  </div>
                ) : (
                  <div style={{ padding: "0 14px", display: "flex", alignItems: "center", fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--t4)" }}>
                    Select a file
                  </div>
                )}
              </div>

              {/* Editor */}
              <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
                <div style={{ position: "absolute", inset: 0 }}>
                  {currentYText && selectedFile
                    ? <CodeEditor filename={selectedFile.name} yText={currentYText} provider={providerRef.current ?? undefined} />
                    : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        Select a file to edit
                      </div>}
                </div>
              </div>

              {/* Bottom panels */}
              <div style={{ height: 210, borderTop: "1px solid var(--b1)", flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
                <div style={{ height: 30, display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0 }}>
                  {(["terminal", "serial", "problems"] as BottomTab[]).map(t => (
                    <button key={t} onClick={() => setBottomTab(t)}
                      className={`tab ${bottomTab === t ? "active" : ""}`}
                      style={{ padding: "0 14px", height: "100%", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11 }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, display: bottomTab === "terminal" ? "flex" : "none", flexDirection: "column" }}>
                    <TerminalPanel projectId={projectId} onAskToFix={handleAskToFix} />
                  </div>
                  <div style={{ position: "absolute", inset: 0, display: bottomTab === "serial" ? "flex" : "none", flexDirection: "column" }}>
                    <SerialMonitor />
                  </div>
                  <div style={{ position: "absolute", inset: 0, display: bottomTab === "problems" ? "block" : "none", overflowY: "auto", padding: 12 }}>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>No problems detected.</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* SCHEMATICS mode */}
          {mode === "schematics" && (
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              <div style={{ height: 35, display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--b1)", background: "var(--s1)", padding: "0 14px", flexShrink: 0 }}>
                <Layers size={12} style={{ color: "var(--orange)" }} />
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--t2)" }}>schematic.kicad_sch</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>Ask the AI agent to add components</span>
              </div>
              <div style={{ position: "absolute", top: 35, left: 0, right: 0, bottom: 0 }}>
                {schematicYText
                  ? <KiCanvasViewer yText={schematicYText} filename="schematic.kicad_sch" />
                  : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading…</div>}
              </div>
            </div>
          )}

          {/* BOARD mode */}
          {mode === "board" && (
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              <div style={{ height: 35, display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--b1)", background: "var(--s1)", padding: "0 14px", flexShrink: 0 }}>
                <Cpu size={12} style={{ color: "var(--green)" }} />
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--t2)" }}>board.kicad_pcb</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>Ask the AI agent to place &amp; route</span>
              </div>
              <div style={{ position: "absolute", top: 35, left: 0, right: 0, bottom: 0 }}>
                {boardYText
                  ? <KiCanvasViewer yText={boardYText} filename="board.kicad_pcb" />
                  : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading…</div>}
              </div>
            </div>
          )}
        </div>

        {/* ── AI Agent panel ── */}
        <div style={{ width: 360, borderLeft: "1px solid var(--b1)", flexShrink: 0, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <AgentChat
              projectId={projectId}
              boardType={board.name}
              fileContext={selectedFile ? DEMO_CONTENT[selectedFile.name] : undefined}
              mode={mode}
              files={ALL_FILE_NAMES}
              externalInput={askToFixText}
            />
          </div>
        </div>
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────────────── */}
      <div style={{ height: 22, display: "flex", alignItems: "stretch", borderTop: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0 }}>
        {/* Left */}
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <div className="statusbar-item" style={{ background: "var(--amber)", color: "#0a0a0a", fontWeight: 600, gap: 5 }}>
            <ChevronRight size={11} />
            edgelab
          </div>
          <div className="statusbar-item" style={{ color: "var(--t3)" }}>
            <SyncIndicator />
            <span>{syncStatus}</span>
          </div>
        </div>
        {/* Right */}
        <div style={{ display: "flex", alignItems: "stretch", marginLeft: "auto" }}>
          <div className="statusbar-item">
            <Cpu size={10} />
            <span>{board.name}</span>
          </div>
          <div className="statusbar-item">
            <span>{board.mcu?.toUpperCase?.() ?? ""}</span>
          </div>
          <div className="statusbar-item">
            {mode === "firmware" ? "C++" : mode === "schematics" ? "KiCad SCH" : "KiCad PCB"}
          </div>
          {selectedFile && (
            <div className="statusbar-item">
              {fileIcon(selectedFile.name, 10)}
              <span>{selectedFile.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}
      <LibraryManager isOpen={showLibManager} onClose={() => setShowLibManager(false)} projectId={projectId} />
      <SearchPalette
        projectId={projectId}
        files={ALL_PALETTE_FILES}
        isOpen={showSearchPalette}
        onClose={() => setShowSearchPalette(false)}
        onSelect={handlePaletteSelect}
      />
    </div>
  );
}
