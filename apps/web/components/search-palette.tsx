"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, FileCode2, FileCog, FileText, X } from "lucide-react";

export interface PaletteFile {
  id: string;
  name: string;
  path: string; // e.g. "src/main.cpp"
}

interface SearchPaletteProps {
  files: PaletteFile[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (file: PaletteFile) => void;
}

function fileIcon(name: string): React.ReactNode {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "cpp" || ext === "c" || ext === "h")
    return <FileCode2 size={13} style={{ color: "var(--blue)", flexShrink: 0 }} />;
  if (ext === "ini" || ext === "toml" || ext === "yaml" || ext === "json")
    return <FileCog size={13} style={{ color: "var(--purple)", flexShrink: 0 }} />;
  if (ext === "kicad_sch") return <span style={{ fontSize: 12, flexShrink: 0 }}>📐</span>;
  if (ext === "kicad_pcb") return <span style={{ fontSize: 12, flexShrink: 0 }}>🔲</span>;
  return <FileText size={13} style={{ color: "var(--t3)", flexShrink: 0 }} />;
}

export function SearchPalette({ files, isOpen, onClose, onSelect }: SearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? files.filter(f =>
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.path.toLowerCase().includes(query.toLowerCase())
      )
    : files;

  // Reset query and focus when opening
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  // Keep selected item visible
  useEffect(() => {
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const confirm = useCallback((file: PaletteFile) => {
    onSelect(file);
    onClose();
  }, [onSelect, onClose]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { if (filtered[idx]) { e.preventDefault(); confirm(filtered[idx]); } }
    else if (e.key === "Escape") { onClose(); }
  };

  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 120, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 560, maxWidth: "calc(100vw - 40px)", background: "var(--bg)", border: "1px solid var(--b2)", borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}
      >
        {/* Search input row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--b1)" }}>
          <Search size={15} style={{ color: "var(--t4)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setIdx(0); }}
            onKeyDown={handleKey}
            placeholder="Go to file…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--t1)", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.4 }}
          />
          {query && (
            <button onClick={() => { setQuery(""); setIdx(0); inputRef.current?.focus(); }} style={{ background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer", display: "flex", padding: 2 }}>
              <X size={13} />
            </button>
          )}
          <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 4, padding: "2px 5px" }}>ESC</kbd>
        </div>

        {/* File list */}
        <div ref={listRef} style={{ maxHeight: 360, overflowY: "auto", padding: "4px 0" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "20px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t4)", textAlign: "center" }}>
              No files match "{query}"
            </div>
          ) : (
            filtered.map((f, i) => (
              <button
                key={f.id}
                onClick={() => confirm(f)}
                onMouseEnter={() => setIdx(i)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 16px",
                  border: "none",
                  background: i === idx ? "var(--amber-lo)" : "transparent",
                  color: i === idx ? "var(--t1)" : "var(--t2)",
                  cursor: "pointer",
                  textAlign: "left",
                  borderLeft: i === idx ? "2px solid var(--amber)" : "2px solid transparent",
                  transition: "background 0.1s",
                }}
              >
                {fileIcon(f.name)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: i === idx ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                    {f.path}
                  </div>
                </div>
                {i === idx && (
                  <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--amber)", background: "var(--amber-lo)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>↵</kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--b1)", padding: "6px 16px", display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>
          <span><kbd style={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 3, padding: "1px 4px" }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 3, padding: "1px 4px" }}>↵</kbd> open</span>
          <span style={{ marginLeft: "auto" }}>{filtered.length} file{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
