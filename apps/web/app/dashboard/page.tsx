"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FolderOpen,
  Plus,
  Trash2,
  ChevronRight,
  Cpu,
  Clock,
  FileCode,
  Zap,
  Circle,
} from "lucide-react";

interface Project {
  id: string;
  name: string;
  boardType: string;
  mcu?: string;
  updatedAt: string;
  files?: number;
  language?: string;
}

const DEMO_PROJECTS: Project[] = [
  { id: "demo-1", name: "led-blink-esp32",  boardType: "ESP32 Dev Module", mcu: "Xtensa LX6", updatedAt: "2h ago",  files: 3, language: "C++" },
  { id: "demo-2", name: "dht22-sensor",     boardType: "Arduino Uno",      mcu: "ATmega328P",  updatedAt: "1d ago",  files: 5, language: "C++" },
  { id: "demo-3", name: "mqtt-client",      boardType: "ESP8266 NodeMCU",  mcu: "ESP8266EX",   updatedAt: "3d ago",  files: 7, language: "C++" },
  { id: "demo-4", name: "pico-temp-logger", boardType: "Raspberry Pi Pico",mcu: "RP2040",      updatedAt: "1w ago",  files: 4, language: "C++" },
];

const BOARD_OPTIONS = [
  "ESP32 Dev Module",
  "ESP32-S3",
  "ESP32-C3",
  "ESP8266 NodeMCU",
  "Arduino Uno",
  "Arduino Nano",
  "Arduino Mega 2560",
  "Raspberry Pi Pico",
  "STM32 Blue Pill",
  "Nordic nRF52840",
];

function boardPlatform(boardType: string): string {
  if (boardType.startsWith("ESP32")) return "espressif32";
  if (boardType.startsWith("ESP8266")) return "espressif8266";
  if (boardType.startsWith("Arduino")) return "atmelavr";
  if (boardType.startsWith("Raspberry")) return "raspberrypi";
  if (boardType.startsWith("STM32")) return "ststm32";
  if (boardType.startsWith("Nordic")) return "nordicnrf52";
  return "atmelavr";
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>(DEMO_PROJECTS);
  const [creating, setCreating] = useState(false);
  const [name, setName]         = useState("");
  const [boardType, setBoardType] = useState("ESP32 Dev Module");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const create = () => {
    if (!name.trim()) return;
    const id = `project-${Date.now()}`;
    setProjects((p) => [
      { id, name: name.trim(), boardType, updatedAt: "just now", files: 1, language: "C++" },
      ...p,
    ]);
    setName("");
    setCreating(false);
  };

  const confirmDelete = (id: string) => {
    if (deleteConfirm === id) {
      setProjects((ps) => ps.filter((x) => x.id !== id));
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--t1)",
      fontFamily: "var(--font-ui)",
      display: "flex",
      flexDirection: "column",
    }}>

      {/* ── Titlebar ─────────────────────────────────────────────────────── */}
      <div style={{
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid var(--b1)",
        background: "var(--s1)",
        flexShrink: 0,
      }}>
        {/* Left: logo */}
        <Link href="/" style={{
          display: "flex", alignItems: "center", gap: 8,
          textDecoration: "none",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--amber)",
          letterSpacing: "0.04em",
        }}>
          <Zap size={13} />
          edgelab
        </Link>

        {/* Center: breadcrumb */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t3)",
        }}>
          <span>workspace</span>
          <ChevronRight size={11} />
          <span style={{ color: "var(--t2)" }}>projects</span>
        </div>

        {/* Right: actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 10,
            color: "var(--t3)",
          }}>
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </span>
          <div className="vdiv" />
          <button
            onClick={() => setCreating(true)}
            className="btn-amber"
            style={{ height: 24, padding: "0 10px", fontSize: 11, gap: 4 }}
          >
            <Plus size={11} />
            New
          </button>
        </div>
      </div>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{
          width: 200,
          borderRight: "1px solid var(--b1)",
          background: "var(--s1)",
          padding: "16px 0",
          flexShrink: 0,
        }}>
          <div style={{
            padding: "0 12px 6px",
            fontFamily: "var(--font-mono)", fontSize: 10,
            color: "var(--t4)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            EXPLORER
          </div>

          {[
            { label: "Projects",  icon: FolderOpen, active: true  },
            { label: "Templates", icon: FileCode,   active: false },
            { label: "Boards",    icon: Cpu,        active: false },
          ].map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "5px 12px",
                background: active ? "var(--s2)" : "transparent",
                border: "none",
                borderLeft: active ? "1px solid var(--amber)" : "1px solid transparent",
                color: active ? "var(--t1)" : "var(--t3)",
                fontFamily: "var(--font-ui)", fontSize: 12,
                cursor: "pointer", textAlign: "left",
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>

          {/* Header row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 16,
          }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t3)",
            }}>
              PROJECTS · {projects.length} items
            </div>
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "transparent", border: "none",
                  color: "var(--t3)", fontFamily: "var(--font-ui)", fontSize: 11,
                  cursor: "pointer", padding: "2px 6px",
                  borderRadius: "var(--r1)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--amber)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--t3)"; }}
              >
                <Plus size={11} /> New project
              </button>
            )}
          </div>

          {/* New project form */}
          {creating && (
            <div className="animate-slide" style={{
              marginBottom: 4,
              background: "var(--s2)",
              border: "1px solid var(--amber)",
              borderRadius: "var(--r2)",
              padding: "14px 16px",
            }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--amber)", letterSpacing: "0.08em", marginBottom: 10,
              }}>
                NEW PROJECT
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  autoFocus
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                    if (e.key === "Escape") { setCreating(false); setName(""); }
                  }}
                  placeholder="project-name"
                  style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
                <select
                  value={boardType}
                  onChange={(e) => setBoardType(e.target.value)}
                  className="input"
                  style={{ width: 200, fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer" }}
                >
                  {BOARD_OPTIONS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={create} className="btn-amber" style={{ height: 26, padding: "0 12px", fontSize: 11 }}>
                  Create
                </button>
                <button onClick={() => { setCreating(false); setName(""); }} className="btn-ghost" style={{ height: 26, padding: "0 10px", fontSize: 11 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Column headers */}
          {projects.length > 0 && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 160px 80px 70px 80px",
              gap: "0 12px",
              padding: "4px 10px",
              fontFamily: "var(--font-mono)", fontSize: 10,
              color: "var(--t4)",
              letterSpacing: "0.06em",
              borderBottom: "1px solid var(--b1)",
              marginBottom: 2,
            }}>
              <span>NAME</span>
              <span>BOARD</span>
              <span>PLATFORM</span>
              <span>FILES</span>
              <span>MODIFIED</span>
            </div>
          )}

          {/* Project rows */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {projects.map((p) => (
              <div
                key={p.id}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px 80px 70px 80px",
                  gap: "0 12px",
                  alignItems: "center",
                  padding: "5px 10px",
                  background: hoveredId === p.id ? "var(--s2)" : "transparent",
                  borderRadius: "var(--r1)",
                  transition: "background 0.1s",
                  cursor: "pointer",
                  minHeight: 30,
                }}
              >
                {/* Name */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  <FileCode size={13} style={{ color: "var(--amber)", flexShrink: 0 }} />
                  <Link
                    href={`/editor/${p.id}`}
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 12,
                      color: hoveredId === p.id ? "var(--t1)" : "var(--t2)",
                      textDecoration: "none",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      transition: "color 0.1s",
                    }}
                  >
                    {p.name}
                  </Link>
                  {hoveredId === p.id && (
                    <span style={{
                      fontFamily: "var(--font-mono)", fontSize: 10,
                      color: "var(--t4)",
                      background: "var(--s3)",
                      border: "1px solid var(--b2)",
                      borderRadius: "var(--r1)",
                      padding: "1px 5px",
                      marginLeft: 4,
                    }}>
                      {p.language ?? "C++"}
                    </span>
                  )}
                </div>

                {/* Board */}
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "var(--amber)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.boardType}
                </div>

                {/* Platform */}
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)",
                }}>
                  {boardPlatform(p.boardType)}
                </div>

                {/* Files */}
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)",
                }}>
                  {p.files ?? 1}
                </div>

                {/* Modified + actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock size={10} style={{ color: "var(--t4)", flexShrink: 0 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)", flex: 1 }}>
                    {p.updatedAt}
                  </span>
                  {hoveredId === p.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); confirmDelete(p.id); }}
                      title={deleteConfirm === p.id ? "Click again to confirm" : "Delete project"}
                      style={{
                        background: "transparent", border: "none",
                        color: deleteConfirm === p.id ? "var(--red)" : "var(--t4)",
                        cursor: "pointer", padding: 2,
                        display: "flex", alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Empty state */}
          {projects.length === 0 && (
            <div style={{
              padding: "60px 0",
              textAlign: "center",
            }}>
              <FolderOpen size={32} style={{ color: "var(--b3)", marginBottom: 12 }} />
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 12,
                color: "var(--t4)", marginBottom: 16,
              }}>
                no projects — create one to get started
              </div>
              <button
                onClick={() => setCreating(true)}
                className="btn-amber"
                style={{ height: 28, padding: "0 14px", fontSize: 11 }}
              >
                <Plus size={11} /> New Project
              </button>
            </div>
          )}
        </div>

        {/* Right panel — stats */}
        <div style={{
          width: 220,
          borderLeft: "1px solid var(--b1)",
          background: "var(--s1)",
          padding: "16px 0",
          flexShrink: 0,
        }}>
          <div style={{
            padding: "0 12px 10px",
            fontFamily: "var(--font-mono)", fontSize: 10,
            color: "var(--t4)", letterSpacing: "0.08em",
          }}>
            WORKSPACE
          </div>

          {[
            { label: "Projects",       value: String(projects.length) },
            { label: "Boards",         value: "1,549+" },
            { label: "Sync protocol",  value: "Yjs CRDT" },
            { label: "AI providers",   value: "5" },
          ].map(({ label, value }) => (
            <div key={label} style={{
              padding: "6px 12px",
              borderBottom: "1px solid var(--b1)",
            }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 10,
                color: "var(--t4)", marginBottom: 2,
              }}>
                {label}
              </div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 12,
                color: "var(--t1)",
              }}>
                {value}
              </div>
            </div>
          ))}

          {/* Status */}
          <div style={{ padding: "12px 12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", marginBottom: 4 }}>
              SERVICES
            </div>
            {[
              { name: "API",         ok: true  },
              { name: "Sync server", ok: true  },
              { name: "LSP gateway", ok: false },
            ].map(({ name, ok }) => (
              <div key={name} style={{
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)",
              }}>
                <Circle
                  size={6}
                  fill={ok ? "var(--green)" : "var(--t4)"}
                  style={{ color: ok ? "var(--green)" : "var(--t4)", flexShrink: 0 }}
                />
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <div style={{
        height: 22,
        background: "var(--s1)",
        borderTop: "1px solid var(--b1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <span className="statusbar-item" style={{ color: "var(--amber)", fontWeight: 600 }}>
            <Zap size={10} /> edgelab
          </span>
          <span className="statusbar-item">dashboard</span>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span className="statusbar-item">PlatformIO</span>
          <span className="statusbar-item">UTF-8</span>
          <span className="statusbar-item">
            <Circle size={6} fill="var(--green)" style={{ color: "var(--green)" }} />
            synced
          </span>
        </div>
      </div>
    </div>
  );
}
