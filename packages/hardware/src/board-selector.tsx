"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API_URL: string = (typeof globalThis !== "undefined" && (globalThis as any).process?.env?.NEXT_PUBLIC_API_URL)
  ?? "http://localhost:4000";

// ── Types ────────────────────────────────────────────────────────────────────
export interface Board {
  id: string;
  name: string;
  mcu: string;
  platform: string;
  frameworks: string[];
  rom: number;
  ram: number;
  vendor: string;
  // legacy compat
  fqbn?: string;
}

// ── Platform → display category ───────────────────────────────────────────────
function getCategory(platform: string): string {
  if (platform.startsWith("espressif")) return "ESP";
  if (platform.startsWith("ststm32") || platform.startsWith("stm32")) return "STM32";
  if (platform.startsWith("nordicnrf")) return "Nordic";
  if (platform === "raspberrypi") return "RP2040";
  if (platform === "teensy") return "Teensy";
  if (platform === "sifive" || platform === "gd32v" || platform === "kendryte") return "RISC-V";
  if (platform === "atmelsam") return "SAMD";
  if (platform === "atmelavr" || platform === "atmelmegaavr") return "Arduino";
  return "Other";
}

const CATEGORIES = ["All", "Arduino", "ESP", "STM32", "SAMD", "Nordic", "RP2040", "Teensy", "RISC-V", "Other"] as const;
type Category = typeof CATEGORIES[number];

function fmtBytes(b: number): string {
  if (b >= 1048576) return `${(b / 1048576).toFixed(0)} MB`;
  if (b >= 1024)    return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

// ── LEGACY export for backward compat ────────────────────────────────────────
export const BOARDS: Board[] = [
  { id:"esp32dev", name:"ESP32 Dev Module", platform:"espressif32", frameworks:["arduino","espidf"], mcu:"esp32", rom:4194304, ram:327680, vendor:"Espressif" },
  { id:"uno",      name:"Arduino Uno",      platform:"atmelavr",    frameworks:["arduino"],           mcu:"atmega328p", rom:32768, ram:2048, vendor:"Arduino" },
  { id:"nodemcuv2",name:"NodeMCU 1.0",      platform:"espressif8266",frameworks:["arduino"],          mcu:"esp8266", rom:4194304, ram:81920, vendor:"NodeMCU" },
];

// ── BoardSelector ─────────────────────────────────────────────────────────────
interface BoardSelectorProps {
  value: string;          // board id
  onChange: (board: Board) => void;
}

export function BoardSelector({ value, onChange }: BoardSelectorProps) {
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [hoverIdx, setHoverIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch board list once
  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/boards`)
      .then(r => r.json())
      .then((d: { boards: Board[] }) => setBoards(d.boards ?? []))
      .catch(() => setBoards(BOARDS))
      .finally(() => setLoading(false));
  }, []);

  // Resolve selected board name from id
  useEffect(() => {
    const found = boards.find(b => b.id === value);
    if (found) setSelectedBoard(found);
    else if (boards.length) setSelectedBoard(boards[0]);
  }, [value, boards]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setHoverIdx(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[hoverIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [hoverIdx]);

  const filtered = boards.filter(b => {
    const matchCat = category === "All" || getCategory(b.platform) === category;
    const q = query.toLowerCase();
    const matchQ = !q || b.name.toLowerCase().includes(q) || b.mcu.toLowerCase().includes(q) || b.vendor.toLowerCase().includes(q) || b.platform.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  // Category counts
  const catCount = useCallback((cat: Category) =>
    cat === "All" ? boards.length : boards.filter(b => getCategory(b.platform) === cat).length,
  [boards]);

  const select = (b: Board) => {
    setSelectedBoard(b);
    onChange(b);
    setOpen(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHoverIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHoverIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { if (filtered[hoverIdx]) select(filtered[hoverIdx]); }
    else if (e.key === "Escape") setOpen(false);
  };

  const triggerStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px",
    border: "1px solid var(--b2)", borderRadius: 6, background: "transparent",
    color: "var(--t2)", fontFamily: "var(--font-mono)", fontSize: 11,
    cursor: "pointer", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden",
    transition: "border-color 0.15s",
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={triggerStyle}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(245,158,11,0.4)"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b2)"; }}
        title="Change board"
      >
        <span style={{ fontSize: 13 }}>🔧</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
          {selectedBoard?.name ?? (loading ? "Loading…" : "Select board")}
        </span>
        <span style={{ color: "var(--t4)", fontSize: 9 }}>▾</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 70, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 680, maxWidth: "calc(100vw - 32px)", background: "var(--bg)", border: "1px solid var(--b2)", borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.7)", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 100px)" }}
          >
            {/* Header */}
            <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, color: "var(--t1)", letterSpacing: "0.04em", marginBottom: 10 }}>
                BOARD <span style={{ color: "var(--amber)" }}>SELECTOR</span>
                {boards.length > 0 && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 400, color: "var(--t4)", marginLeft: 10 }}>
                    {boards.length.toLocaleString()} supported targets
                  </span>
                )}
              </div>
              {/* Search */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid var(--b2)", borderRadius: 8, background: "var(--s1)" }}>
                <span style={{ fontSize: 13 }}>🔍</span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => { setQuery(e.target.value); setHoverIdx(0); }}
                  onKeyDown={handleKey}
                  placeholder="Search boards, MCUs, platforms, or families…"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--t1)", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
                {query && (
                  <button onClick={() => setQuery("")} style={{ background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
                )}
              </div>
            </div>

            {/* Category filter tabs */}
            <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0, padding: "0 4px" }}>
              {CATEGORIES.map(cat => {
                const count = catCount(cat);
                if (count === 0 && cat !== "All") return null;
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => { setCategory(cat); setHoverIdx(0); }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 12px", height: 36, border: "none", borderBottom: active ? "2px solid var(--amber)" : "2px solid transparent", background: active ? "var(--amber-lo)" : "transparent", color: active ? "var(--amber)" : "var(--t3)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", transition: "color 0.15s, background 0.15s", flexShrink: 0 }}
                  >
                    {cat}
                    <span style={{ fontSize: 9, opacity: 0.7, background: active ? "rgba(245,158,11,0.15)" : "var(--s2)", borderRadius: 8, padding: "1px 5px" }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Board list */}
            <div ref={listRef} style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t4)" }}>
                  Loading board registry…
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t4)" }}>
                  No boards match "{query}"
                </div>
              ) : filtered.map((b, i) => {
                const active = b.id === value;
                const hover = i === hoverIdx;
                return (
                  <button
                    key={b.id}
                    onClick={() => select(b)}
                    onMouseEnter={() => setHoverIdx(i)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", border: "none", background: hover ? "var(--amber-lo)" : "transparent", cursor: "pointer", textAlign: "left", borderLeft: hover ? "2px solid var(--amber)" : active ? "2px solid rgba(245,158,11,0.4)" : "2px solid transparent", transition: "background 0.1s" }}
                  >
                    {/* Board icon placeholder */}
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--s2)", border: "1px solid var(--b2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>
                      {getCategory(b.platform) === "ESP" ? "📡" :
                       getCategory(b.platform) === "Arduino" ? "🟦" :
                       getCategory(b.platform) === "STM32" ? "⬛" :
                       getCategory(b.platform) === "Nordic" ? "🔵" :
                       getCategory(b.platform) === "RP2040" ? "🟢" :
                       getCategory(b.platform) === "Teensy" ? "🟡" :
                       getCategory(b.platform) === "RISC-V" ? "🔺" : "🔧"}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: hover ? "var(--amber)" : "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {b.name}
                        </span>
                        {active && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "rgba(245,158,11,0.2)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: "1px 6px", flexShrink: 0 }}>
                            CURRENT
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 4, padding: "1px 5px" }}>
                          {b.platform}
                        </span>
                        {b.frameworks.slice(0, 2).map(f => (
                          <span key={f} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--blue)", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 4, padding: "1px 5px" }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Specs */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t2)", fontWeight: 600, marginBottom: 2 }}>
                        {b.mcu.toUpperCase()}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>
                        {fmtBytes(b.rom)} / {fmtBytes(b.ram)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ borderTop: "1px solid var(--b1)", padding: "6px 16px", display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", background: "var(--s1)", flexShrink: 0 }}>
              <span><kbd style={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 3, padding: "1px 4px" }}>↑↓</kbd> navigate</span>
              <span><kbd style={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 3, padding: "1px 4px" }}>↵</kbd> select</span>
              <span><kbd style={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 3, padding: "1px 4px" }}>ESC</kbd> close</span>
              <span style={{ marginLeft: "auto" }}>{filtered.length.toLocaleString()} result{filtered.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
