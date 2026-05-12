"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { CodeEditor } from "@edge-lab/editor";
import { FileTree, type FileTreeNode } from "@edge-lab/ui";
import { SerialMonitor, BoardSelector, BOARDS, type Board } from "@edge-lab/hardware";
import { Files, GitBranch, Play, Upload, RefreshCw, Wifi, WifiOff, FileCode2, FileCog, FileText, BookOpen, Search as SearchIcon } from "lucide-react";
import { AgentChat } from "./agent-chat";
import { GitPanel } from "./git-panel";
import { TerminalPanel } from "./terminal-panel";
import { SettingsModal } from "./settings-modal";
import { KiCanvasViewer } from "./kicad-viewer";
import { LibraryManager } from "./library-manager";
import { SearchPalette, type PaletteFile } from "./search-palette";

const SYNC_URL = process.env.NEXT_PUBLIC_SYNC_URL ?? "ws://localhost:1234";

// ── Demo files ────────────────────────────────────────────────────────────────
const DEMO_FILES: FileTreeNode[] = [
  {
    id: "src", name: "src", type: "directory",
    children: [
      { id: "main.cpp", name: "main.cpp", type: "file" },
      { id: "config.h", name: "config.h", type: "file" },
    ],
  },
  { id: "platformio.ini", name: "platformio.ini", type: "file" },
  { id: "schematic.kicad_sch", name: "schematic.kicad_sch", type: "file" },
  { id: "board.kicad_pcb", name: "board.kicad_pcb", type: "file" },
  { id: "README.md", name: "README.md", type: "file" },
];

const DEMO_CONTENT: Record<string, string> = {
  "main.cpp": `#include <Arduino.h>\n#include "config.h"\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED_PIN, OUTPUT);\n  Serial.println("Edge Lab — ESP32 Ready");\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(BLINK_DELAY);\n  digitalWrite(LED_PIN, LOW);\n  delay(BLINK_DELAY);\n  Serial.println("Blink!");\n}\n`,
  "config.h": `#pragma once\n\n#define LED_PIN    2\n#define BLINK_DELAY 500\n`,
  "platformio.ini": `[env:esp32dev]\nplatform = espressif32\nboard = esp32dev\nframework = arduino\nmonitor_speed = 115200\n`,
  "README.md": `# My ESP32 Project\n\nBuilt with Edge Lab — AI-powered embedded IDE.\n`,
  // Minimal valid KiCad 7 schematic — ask the AI agent to populate it
  "schematic.kicad_sch": `(kicad_sch\n  (version 20230121)\n  (generator eeschema)\n  (paper "A4")\n  (lib_symbols)\n  (sheet_instances\n    (path "/"\n      (page "1")\n    )\n  )\n)\n`,
  // Minimal valid KiCad 7 PCB
  "board.kicad_pcb": `(kicad_pcb\n  (version 20230121)\n  (generator pcbnew)\n  (general\n    (thickness 1.6)\n  )\n  (paper "A4")\n  (layers\n    (0 "F.Cu" signal)\n    (31 "B.Cu" signal)\n    (36 "B.SilkS" user "B.Silkscreen")\n    (37 "F.SilkS" user "F.Silkscreen")\n    (44 "Edge.Cuts" user)\n  )\n  (setup\n    (pad_to_mask_clearance 0)\n  )\n  (net 0 "")\n)\n`,
};

type Mode = "firmware" | "schematics" | "board";
type BottomTab = "terminal" | "serial" | "problems";

// Flatten file tree to palette entries
function flattenFiles(nodes: FileTreeNode[], prefix = ""): PaletteFile[] {
  const out: PaletteFile[] = [];
  for (const n of nodes) {
    if (n.type === "file") {
      out.push({ id: n.id, name: n.name, path: prefix ? `${prefix}/${n.name}` : n.name });
    } else if (n.children) {
      out.push(...flattenFiles(n.children, prefix ? `${prefix}/${n.name}` : n.name));
    }
  }
  return out;
}

const ALL_PALETTE_FILES = flattenFiles(DEMO_FILES);
const ALL_FILE_NAMES = ALL_PALETTE_FILES.map(f => f.name);

export function IdeLayout({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<Mode>("firmware");
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(DEMO_FILES[0].children![0]);
  const [board, setBoard] = useState<Board>(BOARDS[0]); // ESP32 Dev Module
  const [sidebarTab, setSidebarTab] = useState<"files" | "git">("files");
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [syncStatus, setSyncStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [showLibManager, setShowLibManager] = useState(false);
  const [showSearchPalette, setShowSearchPalette] = useState(false);
  const [askToFixText, setAskToFixText] = useState<string | undefined>(undefined);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const filesRef = useRef<Y.Map<Y.Text> | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new WebsocketProvider(SYNC_URL, `project:${projectId}`, doc);
    const files = doc.getMap<Y.Text>("files");

    provider.on("status", ({ status }: { status: string }) => {
      setSyncStatus(status === "connected" ? "connected" : status === "disconnected" ? "disconnected" : "connecting");
    });

    doc.transact(() => {
      Object.entries(DEMO_CONTENT).forEach(([path, content]) => {
        if (!files.has(path)) {
          const t = new Y.Text();
          t.insert(0, content);
          files.set(path, t);
        }
      });
    });

    providerRef.current = provider;
    filesRef.current = files;
    forceUpdate(n => n + 1);
    return () => {
      filesRef.current = null;
      providerRef.current = null;
      provider.destroy();
      doc.destroy();
    };
  }, [projectId]);

  // Ctrl+K — open search palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowSearchPalette(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleAskToFix = (errorText: string) => {
    setAskToFixText(errorText);
    // Clear it after a tick so the useEffect in AgentChat fires on each new error
    setTimeout(() => setAskToFixText(undefined), 100);
  };

  const handlePaletteSelect = (file: PaletteFile) => {
    const findNode = (nodes: FileTreeNode[]): FileTreeNode | null => {
      for (const n of nodes) {
        if (n.id === file.id) return n;
        if (n.children) { const r = findNode(n.children); if (r) return r; }
      }
      return null;
    };
    const node = findNode(DEMO_FILES);
    if (node) { setSelectedFile(node); setMode("firmware"); }
  };

  const getYText = (name: string): Y.Text | null => {
    if (!filesRef.current) return null;
    const m = filesRef.current;
    if (!m.has(name)) { const t = new Y.Text(); m.set(name, t); }
    return m.get(name)!;
  };

  const currentYText = selectedFile ? getYText(selectedFile.name) : null;
  const schematicYText = getYText("schematic.kicad_sch");
  const boardYText = getYText("board.kicad_pcb");

  // When switching modes, auto-select the relevant file in sidebar
  const handleModeChange = (m: Mode) => {
    setMode(m);
    if (m === "schematics") {
      const node = DEMO_FILES.find(f => f.id === "schematic.kicad_sch");
      if (node) setSelectedFile(node);
    } else if (m === "board") {
      const node = DEMO_FILES.find(f => f.id === "board.kicad_pcb");
      if (node) setSelectedFile(node);
    }
  };

  const modeBtnStyle = (m: Mode): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "0 16px", height: "100%",
    border: "none",
    borderBottom: mode === m ? "2px solid var(--amber)" : "2px solid transparent",
    background: mode === m ? "var(--amber-lo)" : "transparent",
    color: mode === m ? "var(--amber)" : "var(--t3)",
    fontFamily: "var(--font-display)",
    fontSize: 12, fontWeight: mode === m ? 700 : 500,
    letterSpacing: "0.03em",
    cursor: "pointer", whiteSpace: "nowrap",
    transition: "color 0.15s, background 0.15s",
  });

  const bottomTabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0 14px", height: "100%", border: "none",
    borderBottom: active ? "2px solid var(--amber)" : "2px solid transparent",
    background: active ? "var(--amber-lo)" : "transparent",
    color: active ? "var(--amber)" : "var(--t3)",
    fontFamily: "var(--font-mono)",
    fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
    letterSpacing: "0.04em",
    transition: "color 0.15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--t1)", overflow: "hidden" }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", height: 44, borderBottom: "1px solid var(--b1)", background: "var(--s1)", padding: "0 12px", gap: 8, flexShrink: 0 }}>
        {/* Logo */}
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Edge Lab" width={22} height={22} style={{ borderRadius: 4 }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 12, letterSpacing: "0.07em", color: "var(--t1)" }}>
            EDGE <span style={{ color: "var(--amber)" }}>LAB</span>
          </span>
        </Link>
        <div style={{ width: 1, height: 16, background: "var(--b2)", margin: "0 2px" }} />
        <BoardSelector value={board.id} onChange={setBoard} />

        {/* Mode switcher — center */}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "stretch", height: 32, background: "var(--bg)", borderRadius: 6, border: "1px solid var(--b2)", overflow: "hidden" }}>
            <button onClick={() => setMode("firmware")} style={modeBtnStyle("firmware")}>
              ⚡ Firmware
            </button>
            <div style={{ width: 1, background: "var(--b2)", alignSelf: "stretch" }} />
            <button onClick={() => handleModeChange("schematics")} style={modeBtnStyle("schematics")}>
              📐 Schematics
            </button>
            <div style={{ width: 1, background: "var(--b2)", alignSelf: "stretch" }} />
            <button onClick={() => handleModeChange("board")} style={modeBtnStyle("board")}>
              🔲 Board
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Ctrl+K search */}
          <button
            onClick={() => setShowSearchPalette(true)}
            title="Go to file (Ctrl+K)"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 5, border: "1px solid var(--b2)", background: "transparent", color: "var(--t3)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer", letterSpacing: "0.04em" }}
          >
            <SearchIcon size={11} /> <span style={{ color: "var(--t4)" }}>Ctrl+K</span>
          </button>
          {/* Library Manager */}
          <button
            onClick={() => setShowLibManager(true)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 5, border: "1px solid var(--b2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 11, cursor: "pointer", letterSpacing: "0.03em" }}
          >
            <BookOpen size={11} /> Libs
          </button>
          <div style={{ width: 1, height: 16, background: "var(--b2)" }} />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("edge-lab:build"))}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 5, border: "1px solid var(--b2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12, cursor: "pointer", letterSpacing: "0.03em" }}
          >
            <Play size={11} color="var(--green)" /> Build
          </button>
          <button
            className="btn-amber"
            style={{ padding: "5px 12px", fontSize: 12 }}
          >
            <Upload size={11} /> Flash
          </button>
          <div style={{ width: 1, height: 16, background: "var(--b2)" }} />
          <SettingsModal />
          <div style={{ width: 1, height: 16, background: "var(--b2)" }} />
          {syncStatus === "connected"
            ? <Wifi size={13} color="var(--green)" />
            : syncStatus === "connecting"
            ? <RefreshCw size={13} color="var(--t3)" style={{ animation: "spin 1s linear infinite" }} />
            : <WifiOff size={13} color="var(--t4)" />}
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* ── Activity bar ── */}
        <div style={{ width: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 4px", borderRight: "1px solid var(--b1)", background: "var(--bg)", flexShrink: 0 }}>
          {([
            { id: "files" as const, icon: <Files size={16} />, title: "Explorer" },
            { id: "git" as const, icon: <GitBranch size={16} />, title: "Source Control" },
          ]).map(t => (
            <button key={t.id} title={t.title} onClick={() => setSidebarTab(t.id)}
              style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "none", cursor: "pointer", background: sidebarTab === t.id ? "var(--amber-lo)" : "transparent", color: sidebarTab === t.id ? "var(--amber)" : "var(--t4)", transition: "background 0.15s, color 0.15s" }}>
              {t.icon}
            </button>
          ))}
        </div>

        {/* ── Sidebar ── */}
        <div style={{ width: 220, borderRight: "1px solid var(--b1)", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0, background: "var(--s1)" }}>
          <div style={{ padding: "7px 12px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--t4)", borderBottom: "1px solid var(--b1)", flexShrink: 0, textTransform: "uppercase" }}>
            {sidebarTab === "files" ? "// Explorer" : "// Source Control"}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {sidebarTab === "files"
              ? <FileTree nodes={DEMO_FILES} selectedId={selectedFile?.id} onSelect={n => { if (n.type === "file") { setSelectedFile(n); setMode("firmware"); } }} />
              : <GitPanel projectId={projectId} />}
          </div>
        </div>

        {/* ── Center: Firmware / Schematics / Board ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* ── FIRMWARE mode ── */}
          {mode === "firmware" && (
            <>
              {/* File tab bar */}
              <div style={{ height: 34, display: "flex", alignItems: "center", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0, overflowX: "auto" }}>
                {selectedFile ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, height: "100%", borderRight: "1px solid var(--b1)", padding: "0 14px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t2)", whiteSpace: "nowrap", borderBottom: "2px solid var(--amber)", background: "var(--amber-lo)" }}>
                    {getFileIcon(selectedFile.name)}{selectedFile.name}
                  </div>
                ) : (
                  <div style={{ padding: "0 16px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>No file open</div>
                )}
              </div>

              {/* Editor */}
              <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
                <div style={{ position: "absolute", inset: 0 }}>
                  {currentYText && selectedFile
                    ? <CodeEditor filename={selectedFile.name} yText={currentYText} provider={providerRef.current ?? undefined} />
                    : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Select a file to edit</div>}
                </div>
              </div>

              {/* Bottom panels */}
              <div style={{ height: 220, borderTop: "1px solid var(--b1)", flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
                <div style={{ height: 32, display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0 }}>
                  {(["terminal", "serial", "problems"] as BottomTab[]).map(tab => (
                    <button key={tab} onClick={() => setBottomTab(tab)} style={bottomTabStyle(bottomTab === tab)}>
                      {tab === "terminal" ? "TERMINAL" : tab === "serial" ? "SERIAL" : "PROBLEMS"}
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
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>// No problems detected.</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── SCHEMATICS mode ── */}
          {mode === "schematics" && (
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              {/* Toolbar */}
              <div style={{ height: 34, display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--b1)", background: "var(--s1)", padding: "0 14px", flexShrink: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)" }}>📐 schematic.kicad_sch</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>// Ask the AI agent to add components</span>
              </div>
              <div style={{ position: "absolute", top: 34, left: 0, right: 0, bottom: 0 }}>
                {schematicYText
                  ? <KiCanvasViewer yText={schematicYText} filename="schematic.kicad_sch" />
                  : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading…</div>}
              </div>
            </div>
          )}

          {/* ── BOARD mode ── */}
          {mode === "board" && (
            <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
              {/* Toolbar */}
              <div style={{ height: 34, display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--b1)", background: "var(--s1)", padding: "0 14px", flexShrink: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)" }}>🔲 board.kicad_pcb</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>// Ask the AI agent to place &amp; route</span>
              </div>
              <div style={{ position: "absolute", top: 34, left: 0, right: 0, bottom: 0 }}>
                {boardYText
                  ? <KiCanvasViewer yText={boardYText} filename="board.kicad_pcb" />
                  : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Loading…</div>}
              </div>
            </div>
          )}
        </div>

        {/* ── AI Agent panel ── */}
        <div style={{ width: 380, borderLeft: "1px solid var(--b1)", flexShrink: 0, position: "relative" }}>
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

      {/* Library Manager overlay */}
      <LibraryManager isOpen={showLibManager} onClose={() => setShowLibManager(false)} projectId={projectId} />

      {/* Ctrl+K search palette */}
      <SearchPalette
        projectId={projectId}
        files={ALL_PALETTE_FILES}
        isOpen={showSearchPalette}
        onClose={() => setShowSearchPalette(false)}
        onSelect={handlePaletteSelect}
      />

      <style>{`
        * { box-sizing: border-box; }
        .cm-editor { height: 100% !important; }
        .cm-scroller { overflow: auto !important; }
        .cm-scroller::-webkit-scrollbar { width: 4px; height: 4px; }
        .cm-scroller::-webkit-scrollbar-track { background: transparent; }
        .cm-scroller::-webkit-scrollbar-thumb { background: var(--b3); border-radius: 2px; }
      `}</style>
    </div>
  );
}

function getFileIcon(filename: string): React.ReactNode {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "cpp" || ext === "c" || ext === "h") return <FileCode2 size={12} color="var(--blue)" style={{ marginRight: 4 }} />;
  if (ext === "ini" || ext === "toml" || ext === "yaml" || ext === "json") return <FileCog size={12} color="var(--purple)" style={{ marginRight: 4 }} />;
  if (ext === "kicad_sch") return <span style={{ marginRight: 4, fontSize: 11 }}>📐</span>;
  if (ext === "kicad_pcb") return <span style={{ marginRight: 4, fontSize: 11 }}>🔲</span>;
  return <FileText size={12} color="var(--t3)" style={{ marginRight: 4 }} />;
}
