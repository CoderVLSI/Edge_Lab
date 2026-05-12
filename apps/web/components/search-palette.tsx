"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, FileCode2, FileCog, FileText, X, Loader2, Zap, Hash } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface PaletteFile {
  id: string;
  name: string;
  path: string;
}

interface SearchResult {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
  mode: "text" | "semantic";
}

type Tab = "files" | "text" | "semantic";

interface SearchPaletteProps {
  projectId: string;
  files: PaletteFile[];
  isOpen: boolean;
  onClose: () => void;
  onSelect: (file: PaletteFile) => void;
  onSelectChunk?: (filePath: string, startLine: number) => void;
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

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "rgba(245,158,11,0.35)", color: "inherit", borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 5,
  padding: "0 14px", height: 36, border: "none",
  borderBottom: active ? "2px solid var(--amber)" : "2px solid transparent",
  background: active ? "var(--amber-lo)" : "transparent",
  color: active ? "var(--amber)" : "var(--t3)",
  fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer",
  letterSpacing: "0.04em", whiteSpace: "nowrap",
  transition: "color 0.15s",
});

export function SearchPalette({
  projectId,
  files,
  isOpen,
  onClose,
  onSelect,
  onSelectChunk,
}: SearchPaletteProps) {
  const [tab, setTab] = useState<Tab>("files");
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexStatus, setIndexStatus] = useState<{ indexed: boolean; chunkCount: number; modelReady: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Fetch index status when opening
  useEffect(() => {
    if (!isOpen) return;
    fetch(`${API_URL}/api/projects/${projectId}/index/status`)
      .then(r => r.json())
      .then(setIndexStatus)
      .catch(() => {});
  }, [isOpen, projectId]);

  // Reset and focus when opening
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setIdx(0);
      setSearchResults([]);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  // Keep selected item visible
  useEffect(() => {
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  // Local file filter
  const filteredFiles = query.trim()
    ? files.filter(f =>
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.path.toLowerCase().includes(query.toLowerCase())
      )
    : files;

  // Remote search (text + semantic)
  const runRemoteSearch = useCallback((q: string, mode: "text" | "semantic") => {
    if (!q.trim()) { setSearchResults([]); return; }
    setLoading(true);
    fetch(`${API_URL}/api/projects/${projectId}/search?q=${encodeURIComponent(q)}&mode=${mode}&k=12`)
      .then(r => r.json())
      .then(data => {
        setSearchResults(data.results ?? []);
        setIdx(0);
      })
      .catch(() => setSearchResults([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Debounced search for remote tabs
  useEffect(() => {
    if (tab === "files") return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runRemoteSearch(query, tab as "text" | "semantic"), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, tab, runRemoteSearch]);

  const triggerIndex = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${projectId}/index`, { method: "POST" });
      const data = await res.json();
      setIndexStatus({ indexed: true, chunkCount: data.chunks ?? 0, modelReady: true });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const currentItems = tab === "files" ? filteredFiles.length : searchResults.length;

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(i + 1, currentItems - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (tab === "files" && filteredFiles[idx]) { onSelect(filteredFiles[idx]); onClose(); }
      else if (tab !== "files" && searchResults[idx]) {
        const r = searchResults[idx];
        onSelectChunk?.(r.filePath, r.startLine);
        // also select the file so it opens
        const match = files.find(f => f.path === r.filePath || f.name === r.filePath);
        if (match) { onSelect(match); }
        onClose();
      }
    }
    else if (e.key === "Escape") onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 600, maxWidth: "calc(100vw - 40px)", background: "var(--bg)", border: "1px solid var(--b2)", borderRadius: "var(--r3)", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}
      >
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--b1)" }}>
          {loading
            ? <Loader2 size={15} style={{ color: "var(--amber)", flexShrink: 0, animation: "spin 1s linear infinite" }} />
            : <Search size={15} style={{ color: "var(--t4)", flexShrink: 0 }} />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setIdx(0); }}
            onKeyDown={handleKey}
            placeholder={tab === "files" ? "Go to file…" : tab === "text" ? "Keyword search in code…" : "Semantic search (natural language)…"}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--t1)", fontFamily: "var(--font-mono)", fontSize: 13 }}
          />
          {query && (
            <button onClick={() => { setQuery(""); setIdx(0); setSearchResults([]); inputRef.current?.focus(); }} style={{ background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer", display: "flex", padding: 2 }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--b1)", background: "var(--s1)" }}>
          <button style={tabStyle(tab === "files")} onClick={() => { setTab("files"); setIdx(0); }}>
            <FileText size={11} /> Files
          </button>
          <button style={tabStyle(tab === "text")} onClick={() => { setTab("text"); setIdx(0); }}>
            <Hash size={11} /> Text
          </button>
          <button style={tabStyle(tab === "semantic")} onClick={() => { setTab("semantic"); setIdx(0); }}>
            <Zap size={11} /> Semantic
          </button>

          {/* Index status chip */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", padding: "0 12px", gap: 8 }}>
            {indexStatus && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: indexStatus.indexed ? "var(--green)" : "var(--t4)" }}>
                {indexStatus.indexed ? `✓ ${indexStatus.chunkCount} chunks` : "not indexed"}
              </span>
            )}
            <button
              onClick={triggerIndex}
              disabled={loading}
              title="Re-index project"
              style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--b2)", background: "transparent", color: "var(--amber)", cursor: "pointer" }}
            >
              {loading ? "…" : "Index"}
            </button>
          </div>
        </div>

        {/* Results list */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: "auto", padding: "4px 0" }}>
          {tab === "files" && (
            filteredFiles.length === 0 ? (
              <div style={{ padding: "20px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t4)", textAlign: "center" }}>
                No files match "{query}"
              </div>
            ) : filteredFiles.map((f, i) => (
              <button
                key={f.id}
                onClick={() => { onSelect(f); onClose(); }}
                onMouseEnter={() => setIdx(i)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", border: "none", background: i === idx ? "var(--amber-lo)" : "transparent", color: i === idx ? "var(--t1)" : "var(--t2)", cursor: "pointer", textAlign: "left", borderLeft: i === idx ? "2px solid var(--amber)" : "2px solid transparent" }}
              >
                {fileIcon(f.name)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: i === idx ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {highlight(f.name, query)}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                    {f.path}
                  </div>
                </div>
                {i === idx && <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--amber)", background: "var(--amber-lo)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>↵</kbd>}
              </button>
            ))
          )}

          {(tab === "text" || tab === "semantic") && (
            loading ? (
              <div style={{ padding: "24px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Searching…
              </div>
            ) : !query.trim() ? (
              <div style={{ padding: "20px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t4)", textAlign: "center" }}>
                {tab === "text" ? "Type to search file contents" : "Type a natural language query to find relevant code"}
              </div>
            ) : searchResults.length === 0 ? (
              <div style={{ padding: "20px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t4)", textAlign: "center" }}>
                No results — try indexing the project first
              </div>
            ) : searchResults.map((r, i) => (
              <button
                key={`${r.filePath}:${r.startLine}`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => {
                  const match = files.find(f => f.path === r.filePath || f.name === r.filePath || f.path.endsWith(r.filePath));
                  if (match) onSelect(match);
                  onSelectChunk?.(r.filePath, r.startLine);
                  onClose();
                }}
                style={{ width: "100%", display: "flex", flexDirection: "column", gap: 4, padding: "10px 16px", border: "none", background: i === idx ? "var(--amber-lo)" : "transparent", cursor: "pointer", textAlign: "left", borderLeft: i === idx ? "2px solid var(--amber)" : "2px solid transparent" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {fileIcon(r.filePath.split("/").pop() ?? r.filePath)}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: i === idx ? "var(--amber)" : "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.filePath}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", flexShrink: 0 }}>
                    :{r.startLine}–{r.endLine}
                  </span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t4)", flexShrink: 0 }}>
                    {(r.score * 100).toFixed(0)}%
                  </span>
                </div>
                <pre style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 80, overflow: "hidden", lineHeight: 1.5, background: "var(--s1)", borderRadius: 4, padding: "4px 6px" }}>
                  {r.content.trim().slice(0, 300)}
                </pre>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid var(--b1)", padding: "6px 16px", display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>
          <span><kbd style={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 3, padding: "1px 4px" }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 3, padding: "1px 4px" }}>↵</kbd> open</span>
          <span><kbd style={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 3, padding: "1px 4px" }}>ESC</kbd> close</span>
          <span style={{ marginLeft: "auto" }}>
            {tab === "files" ? `${filteredFiles.length} file${filteredFiles.length !== 1 ? "s" : ""}` : `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>
    </div>
  );
}
