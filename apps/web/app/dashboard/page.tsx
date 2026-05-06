"use client";

import React, { useState } from "react";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  boardType: string;
  updatedAt: string;
  files?: number;
}

const DEMO_PROJECTS: Project[] = [
  { id: "demo-1", name: "LED Blink ESP32", boardType: "ESP32 Dev Module", updatedAt: "2 hours ago", files: 3 },
  { id: "demo-2", name: "DHT22 Sensor", boardType: "Arduino Uno", updatedAt: "Yesterday", files: 5 },
  { id: "demo-3", name: "MQTT Client", boardType: "ESP8266 NodeMCU", updatedAt: "3 days ago", files: 7 },
];

const BOARD_ICONS: Record<string, string> = {
  "ESP32": "⚡",
  "Arduino": "🔵",
  "ESP8266": "📡",
};
function boardIcon(boardType: string) {
  for (const [k, v] of Object.entries(BOARD_ICONS)) {
    if (boardType.includes(k)) return v;
  }
  return "🔌";
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>(DEMO_PROJECTS);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [boardType, setBoardType] = useState("ESP32 Dev Module");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const create = () => {
    if (!name.trim()) return;
    const id = `project-${Date.now()}`;
    setProjects((p) => [{ id, name, boardType, updatedAt: "Just now", files: 1 }, ...p]);
    setName("");
    setCreating(false);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--t1)",
      fontFamily: "var(--font-ui)",
    }}>

      {/* Circuit grid background */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "linear-gradient(var(--b1) 1px, transparent 1px), linear-gradient(90deg, var(--b1) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />

      {/* Amber glow — top right */}
      <div style={{
        position: "fixed", top: -100, right: -100, pointerEvents: "none", zIndex: 0,
        width: 500, height: 400,
        background: "radial-gradient(ellipse, rgba(245,158,11,0.07) 0%, transparent 70%)",
      }} />

      {/* Nav */}
      <nav style={{
        position: "relative", zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 48px",
        borderBottom: "1px solid var(--b1)",
        background: "rgba(7,8,15,0.85)",
        backdropFilter: "blur(12px)",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Edge Lab" width={26} height={26} style={{ borderRadius: 5 }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 14, letterSpacing: "0.06em", color: "var(--t1)" }}>
            EDGE <span style={{ color: "var(--amber)" }}>LAB</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--amber-lo)", border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 99, padding: "4px 12px",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--amber)", display: "inline-block", animation: "pulse-amber 2s infinite" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--amber)", letterSpacing: "0.08em" }}>
              {projects.length} PROJECT{projects.length !== 1 ? "S" : ""}
            </span>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="btn-amber"
            style={{ padding: "6px 16px", fontSize: 12 }}
          >
            + New Project
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main style={{
        position: "relative", zIndex: 1,
        maxWidth: 860,
        margin: "0 auto",
        padding: "48px 48px 80px",
      }}>

        {/* Header */}
        <div className="animate-fade-up" style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)", letterSpacing: "0.1em", marginBottom: 10 }}>
            // WORKSPACE
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800, fontSize: 36,
            letterSpacing: "-0.02em",
            margin: 0, lineHeight: 1.1,
          }}>
            Your Projects
          </h1>
          <p style={{ color: "var(--t3)", fontSize: 13, marginTop: 8, fontFamily: "var(--font-ui)" }}>
            Open a project to start coding — the agent is ready.
          </p>
        </div>

        {/* New project form */}
        {creating && (
          <div className="animate-fade-up" style={{
            marginBottom: 20,
            background: "var(--s1)",
            border: "1px solid rgba(245,158,11,0.35)",
            borderRadius: 10,
            padding: "20px 24px",
            boxShadow: "0 0 30px rgba(245,158,11,0.06)",
          }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--amber)", letterSpacing: "0.1em", marginBottom: 14 }}>
              // NEW PROJECT
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Project name…"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--b2)",
                  borderRadius: 6,
                  padding: "10px 14px",
                  color: "var(--t1)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(245,158,11,0.5)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--b2)"; }}
              />
              <select
                value={boardType}
                onChange={(e) => setBoardType(e.target.value)}
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--b2)",
                  borderRadius: 6,
                  padding: "10px 14px",
                  color: "var(--t2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option>ESP32 Dev Module</option>
                <option>ESP32-S3</option>
                <option>ESP8266 NodeMCU</option>
                <option>Arduino Uno</option>
                <option>Arduino Nano</option>
                <option>Arduino Mega 2560</option>
                <option>Raspberry Pi Pico</option>
                <option>STM32 Blue Pill</option>
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={create}
                  className="btn-amber"
                  style={{ padding: "8px 20px", fontSize: 12 }}
                >
                  Create Project
                </button>
                <button
                  onClick={() => { setCreating(false); setName(""); }}
                  className="btn-ghost"
                  style={{ padding: "8px 16px", fontSize: 12 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Project list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {projects.map((p, i) => (
            <div
              key={p.id}
              className={i === 0 ? "animate-fade-up" : `animate-fade-up-d${Math.min(i, 5) as 1|2|3|4|5}`}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: hoveredId === p.id ? "var(--s2)" : "var(--s1)",
                border: `1px solid ${hoveredId === p.id ? "var(--b2)" : "var(--b1)"}`,
                borderRadius: 8,
                padding: "18px 24px",
                transition: "background 0.15s, border-color 0.15s",
                cursor: "pointer",
                marginBottom: 1,
              }}
            >
              {/* Board icon */}
              <div style={{
                width: 42, height: 42,
                background: "var(--bg)",
                border: "1px solid var(--b2)",
                borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20,
                flexShrink: 0,
              }}>
                {boardIcon(p.boardType)}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  href={`/editor/${p.id}`}
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 15,
                    color: hoveredId === p.id ? "var(--amber)" : "var(--t1)",
                    textDecoration: "none",
                    display: "block",
                    transition: "color 0.15s",
                    letterSpacing: "0.01em",
                  }}
                >
                  {p.name}
                </Link>
                <div style={{
                  display: "flex", alignItems: "center", gap: 12,
                  marginTop: 4,
                }}>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--amber)",
                    background: "var(--amber-lo)",
                    border: "1px solid rgba(245,158,11,0.2)",
                    borderRadius: 4,
                    padding: "2px 7px",
                    letterSpacing: "0.05em",
                  }}>
                    {p.boardType}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>
                    {p.files} file{p.files !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>
                    {p.updatedAt}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setProjects((ps) => ps.filter((x) => x.id !== p.id)); }}
                  title="Delete project"
                  style={{
                    width: 30, height: 30,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    color: "var(--t4)",
                    cursor: "pointer",
                    fontSize: 14,
                    opacity: hoveredId === p.id ? 1 : 0,
                    transition: "opacity 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--t4)"; }}
                >
                  ✕
                </button>
                <Link
                  href={`/editor/${p.id}`}
                  className="btn-amber"
                  style={{ padding: "6px 16px", fontSize: 11 }}
                >
                  Open →
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {projects.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "80px 0",
            color: "var(--t4)",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔌</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, color: "var(--t3)", marginBottom: 8 }}>
              No projects yet
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t4)", marginBottom: 24 }}>
              Create a project to start building
            </div>
            <button
              onClick={() => setCreating(true)}
              className="btn-amber"
              style={{ padding: "10px 24px" }}
            >
              + New Project
            </button>
          </div>
        )}

        {/* Quick stats footer */}
        <div style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: "1px solid var(--b1)",
          display: "flex", gap: 32,
        }}>
          {[
            { label: "Boards Supported", value: "1000+" },
            { label: "AI Providers", value: "5" },
            { label: "Sync Protocol", value: "Yjs CRDT" },
          ].map((stat) => (
            <div key={stat.label}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--amber)" }}>
                {stat.value}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", letterSpacing: "0.06em", marginTop: 2 }}>
                {stat.label.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
