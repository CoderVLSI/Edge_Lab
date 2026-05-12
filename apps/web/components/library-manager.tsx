"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, X, Search, Plus, Trash2, GitBranch, Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ── Types ────────────────────────────────────────────────────────────────────
interface LibResult {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  keywords: string[];
}

// ── Popular fallback (shown before a search is made) ─────────────────────────
const POPULAR: LibResult[] = [
  { id: "ArduinoJson",        name: "ArduinoJson",         version: "7.1.0",  author: "bblanchon",   description: "JSON library for embedded C++. Efficient, portable and easy to use.", keywords: ["json","data"] },
  { id: "PubSubClient",       name: "PubSubClient",        version: "2.8.0",  author: "knolleary",   description: "MQTT messaging library for Arduino.", keywords: ["mqtt","iot","networking"] },
  { id: "Adafruit NeoPixel",  name: "Adafruit NeoPixel",   version: "1.12.3", author: "adafruit",    description: "Arduino library for controlling NeoPixel (WS2812B) RGB LEDs.", keywords: ["led","rgb","neopixel"] },
  { id: "FastLED",            name: "FastLED",             version: "3.7.0",  author: "FastLED",     description: "Multi-platform library for controlling LEDs.", keywords: ["led","rgb","animation"] },
  { id: "DHT sensor library", name: "DHT sensor library",  version: "1.4.6",  author: "adafruit",    description: "Sensor library for DHT11, DHT22 temperature/humidity sensors.", keywords: ["sensor","temperature","humidity"] },
  { id: "Adafruit BME280 Library", name: "Adafruit BME280 Library", version: "2.2.4", author: "adafruit", description: "BME280 humidity, temperature and pressure sensor.", keywords: ["sensor","i2c","spi"] },
  { id: "TFT_eSPI",           name: "TFT_eSPI",            version: "2.5.43", author: "Bodmer",      description: "TFT graphics library for Arduino compatible processors.", keywords: ["display","tft","spi"] },
  { id: "U8g2",               name: "U8g2",                version: "2.35.9", author: "olikraus",    description: "Monochrome LCD, OLED graphics library.", keywords: ["display","oled","i2c"] },
  { id: "LVGL",               name: "LVGL",                version: "9.1.0",  author: "lvgl",        description: "Light and Versatile Embedded Graphics Library.", keywords: ["gui","display","graphics"] },
  { id: "ESP32 BLE Arduino",  name: "ESP32 BLE Arduino",   version: "2.0.0",  author: "nkolban",     description: "BLE library for ESP32.", keywords: ["bluetooth","ble","wireless"] },
  { id: "AsyncTCP",           name: "AsyncTCP",            version: "1.1.4",  author: "esphome",     description: "Asynchronous TCP library for ESP32.", keywords: ["tcp","async","networking"] },
  { id: "ESPAsyncWebServer",  name: "ESPAsyncWebServer",   version: "1.2.4",  author: "esphome",     description: "Asynchronous HTTP and WebSocket server for ESP32.", keywords: ["web","http","websocket"] },
];

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiGetDeps(projectId: string): Promise<string[]> {
  const r = await fetch(`${API_URL}/api/projects/${projectId}/libraries`);
  const d = await r.json() as { deps: string[] };
  return d.deps ?? [];
}

async function apiAddLib(projectId: string, name: string): Promise<string[]> {
  const r = await fetch(`${API_URL}/api/projects/${projectId}/libraries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const d = await r.json() as { deps: string[] };
  return d.deps ?? [];
}

async function apiRemoveLib(projectId: string, name: string): Promise<string[]> {
  const r = await fetch(`${API_URL}/api/projects/${projectId}/libraries`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const d = await r.json() as { deps: string[] };
  return d.deps ?? [];
}

async function apiSearch(q: string): Promise<{ items: LibResult[]; total: number; error?: string }> {
  const r = await fetch(`${API_URL}/api/libraries/search?q=${encodeURIComponent(q)}&limit=20`);
  return r.json() as Promise<{ items: LibResult[]; total: number; error?: string }>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function LibraryManager({
  projectId,
  isOpen: controlledOpen,
  onClose,
}: {
  projectId: string;
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const [_open, _setOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : _open;
  const setOpen = (v: boolean) => {
    if (controlledOpen !== undefined) { if (!v) onClose?.(); }
    else _setOpen(v);
  };

  const [tab, setTab]             = useState<"search" | "installed" | "custom">("search");
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<LibResult[]>(POPULAR);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  // Real installed deps from platformio.ini
  const [deps, setDeps]           = useState<string[]>([]);
  const [depsLoading, setDepsLoading] = useState(false);
  const [actionId, setActionId]   = useState<string | null>(null); // which lib is mid-action
  const [actionMsg, setActionMsg] = useState<string | null>(null); // success/error toast

  const [customUrl, setCustomUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Fetch real deps when opening ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setDepsLoading(true);
    apiGetDeps(projectId)
      .then(setDeps)
      .catch(() => {}) // backend offline — keep empty
      .finally(() => setDepsLoading(false));
  }, [open, projectId]);

  // Focus input on tab change
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open, tab]);

  // ── Live registry search ────────────────────────────────────────────────────
  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setResults(POPULAR); setSearchErr(null); return; }
    setSearching(true);
    setSearchErr(null);
    apiSearch(q)
      .then(d => {
        if (d.error && !d.items.length) {
          // Registry unreachable — fall back to filtering POPULAR
          const local = POPULAR.filter(l =>
            l.name.toLowerCase().includes(q.toLowerCase()) ||
            l.description.toLowerCase().includes(q.toLowerCase()) ||
            l.keywords.some(k => k.includes(q.toLowerCase()))
          );
          setResults(local.length ? local : POPULAR);
          setSearchErr("Registry offline — showing curated list");
        } else {
          setResults(d.items);
        }
      })
      .catch(() => {
        setResults(POPULAR);
        setSearchErr("Registry offline — showing curated list");
      })
      .finally(() => setSearching(false));
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(debounce.current);
  }, [query, doSearch]);

  // ── Toast helper ─────────────────────────────────────────────────────────────
  const toast = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3000);
  };

  // ── Add from registry ────────────────────────────────────────────────────────
  const addLib = async (lib: LibResult) => {
    const libName = lib.name;
    if (deps.includes(libName)) return;
    setActionId(lib.id);
    try {
      const updated = await apiAddLib(projectId, libName);
      setDeps(updated);
      toast(`✓ Added ${libName} to lib_deps`);
    } catch {
      // Backend offline — optimistically add to local state
      setDeps(prev => [...prev, libName]);
      toast(`Added ${libName} (offline — will sync on next build)`);
    } finally {
      setActionId(null);
    }
  };

  // ── Remove ────────────────────────────────────────────────────────────────────
  const removeLib = async (depName: string) => {
    setActionId(depName);
    try {
      const updated = await apiRemoveLib(projectId, depName);
      setDeps(updated);
      toast(`Removed ${depName}`);
    } catch {
      setDeps(prev => prev.filter(d => d !== depName));
      toast(`Removed ${depName} (offline)`);
    } finally {
      setActionId(null);
    }
  };

  // ── Add custom URL / Git ─────────────────────────────────────────────────────
  const addCustom = async () => {
    if (!customUrl.trim()) return;
    setActionId("custom");
    try {
      const updated = await apiAddLib(projectId, customUrl.trim());
      setDeps(updated);
      toast(`✓ Added ${customUrl.trim()}`);
    } catch {
      setDeps(prev => [...prev, customUrl.trim()]);
      toast("Added (offline)");
    } finally {
      setActionId(null);
      setCustomUrl("");
      setTab("installed");
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0 16px", height: 36, border: "none",
    borderBottom: active ? "2px solid var(--amber)" : "2px solid transparent",
    background: active ? "var(--amber-lo)" : "transparent",
    color: active ? "var(--amber)" : "var(--t3)",
    fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer",
    letterSpacing: "0.04em", whiteSpace: "nowrap", transition: "color 0.15s",
  });

  return (
    <>
      {/* Standalone trigger button */}
      {controlledOpen === undefined && (
        <button onClick={() => setOpen(true)} title="Library Manager"
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: "var(--r2)", border: "1px solid var(--b2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 11, cursor: "pointer", letterSpacing: "0.03em" }}>
          <BookOpen size={11} /> Libs
        </button>
      )}

      {/* Modal */}
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>

          <div style={{ width: 640, maxWidth: "95vw", maxHeight: "82vh", background: "var(--bg)", border: "1px solid var(--b2)", borderRadius: "var(--r3)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--b1)", gap: 10, flexShrink: 0 }}>
              <BookOpen size={16} color="var(--amber)" />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--t1)", letterSpacing: "0.04em", flex: 1 }}>
                LIBRARY MANAGER
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>via PlatformIO registry</span>
              {/* Toast */}
              {actionMsg && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: actionMsg.startsWith("✓") ? "var(--green)" : "var(--amber)", background: "var(--s1)", border: "1px solid var(--b2)", borderRadius: 6, padding: "3px 10px" }}>
                  {actionMsg}
                </span>
              )}
              <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", color: "var(--t3)", cursor: "pointer", display: "flex" }}>
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
              <button style={tabStyle(tab === "search")}    onClick={() => setTab("search")}>Search Registry</button>
              <button style={tabStyle(tab === "installed")} onClick={() => setTab("installed")}>
                lib_deps
                {deps.length > 0 && (
                  <span style={{ marginLeft: 6, background: "var(--amber)", color: "#0a0a0a", borderRadius: "var(--r1)", padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>{deps.length}</span>
                )}
                {depsLoading && <Loader2 size={10} style={{ marginLeft: 5, animation: "spin 1s linear infinite" }} />}
              </button>
              <button style={tabStyle(tab === "custom")}    onClick={() => setTab("custom")}>Git / URL</button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>

              {/* ── Search tab ── */}
              {tab === "search" && (
                <>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--b2)", borderRadius: 7, padding: "6px 12px", background: "var(--s1)" }}>
                      {searching
                        ? <Loader2 size={13} color="var(--amber)" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                        : <Search size={13} color="var(--t4)" style={{ flexShrink: 0 }} />}
                      <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search PlatformIO registry… e.g. DHT22, NeoPixel, MQTT"
                        style={{ flex: 1, border: "none", background: "transparent", color: "var(--t1)", fontFamily: "var(--font-mono)", fontSize: 12, outline: "none" }}
                      />
                      {query && (
                        <button onClick={() => setQuery("")} style={{ background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
                      )}
                    </div>
                    {searchErr && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--amber)" }}>
                        <AlertCircle size={10} /> {searchErr}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {results.length === 0 && !searching && (
                      <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t4)" }}>
                        No results for "{query}"
                      </div>
                    )}
                    {results.map((lib) => {
                      const isAdded   = deps.some(d => d === lib.name || d.endsWith(`/${lib.name}`) || d.includes(lib.name));
                      const isAdding  = actionId === lib.id;
                      return (
                        <div key={lib.id}
                          style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--b1)", transition: "background 0.1s", cursor: "default" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--s1)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--t1)" }}>{lib.name}</span>
                              {lib.version && (
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", background: "var(--s2)", padding: "1px 6px", borderRadius: 4 }}>v{lib.version}</span>
                              )}
                              {lib.keywords.slice(0, 2).map(k => (
                                <span key={k} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--amber)", background: "var(--amber-lo)", padding: "1px 5px", borderRadius: 4 }}>{k}</span>
                              ))}
                            </div>
                            <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--t3)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {lib.description}
                            </div>
                            {lib.author && (
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", marginTop: 2 }}>by {lib.author}</div>
                            )}
                          </div>
                          <button
                            onClick={() => addLib(lib)}
                            disabled={isAdded || isAdding}
                            style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)", border: isAdded ? "1px solid var(--b2)" : "1px solid rgba(245,158,11,0.4)", background: isAdded ? "transparent" : "rgba(245,158,11,0.08)", color: isAdded ? "var(--green)" : "var(--amber)", cursor: isAdded ? "default" : "pointer" }}
                          >
                            {isAdding ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> :
                             isAdded  ? <><CheckCircle2 size={10} /> Added</> :
                                        <><Plus size={10} /> Add</>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── lib_deps tab ── */}
              {tab === "installed" && (
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {depsLoading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 120, color: "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Loading platformio.ini…
                    </div>
                  ) : deps.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, height: 120, color: "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      <span>// lib_deps is empty</span>
                      <button onClick={() => setTab("search")} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amber)", background: "transparent", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>
                        Search registry →
                      </button>
                    </div>
                  ) : (
                    deps.map((dep) => (
                      <div key={dep} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--b1)" }}>
                        <CheckCircle2 size={13} style={{ color: "var(--green)", flexShrink: 0 }} />
                        <code style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {dep}
                        </code>
                        <button
                          onClick={() => removeLib(dep)}
                          disabled={actionId === dep}
                          title="Remove from lib_deps"
                          style={{ border: "none", background: "transparent", color: "var(--t4)", cursor: "pointer", display: "flex", padding: 4, borderRadius: 4 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--t4)"; }}
                        >
                          {actionId === dep
                            ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                            : <Trash2 size={13} />}
                        </button>
                      </div>
                    ))
                  )}
                  <div style={{ padding: "10px 16px", borderTop: "1px solid var(--b1)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", flex: 1 }}>
                      Written to <code>platformio.ini</code> — PlatformIO downloads on next build
                    </span>
                    <button
                      onClick={() => { setDepsLoading(true); apiGetDeps(projectId).then(setDeps).catch(() => {}).finally(() => setDepsLoading(false)); }}
                      title="Refresh from disk"
                      style={{ border: "none", background: "transparent", color: "var(--t4)", cursor: "pointer", display: "flex" }}
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* ── Git / URL tab ── */}
              {tab === "custom" && (
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--t1)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <GitBranch size={12} style={{ color: "var(--amber)" }} />
                      Add from Git / URL
                    </div>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--t3)", marginBottom: 12, lineHeight: 1.6 }}>
                      Paste any PlatformIO-compatible source: Git URL, archive URL, GitHub shorthand, or local path. Supports <code style={{ fontFamily: "var(--font-mono)", color: "var(--amber)" }}>#v1.2.3</code> version pins.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
                        placeholder="https://github.com/vendor/library.git#v1.2.0"
                        style={{ flex: 1, height: 32, border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "var(--s1)", color: "var(--t1)", padding: "0 10px", fontFamily: "var(--font-mono)", fontSize: 12, outline: "none" }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(245,158,11,0.45)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--b2)"; }}
                      />
                      <button
                        onClick={addCustom}
                        disabled={!customUrl.trim() || actionId === "custom"}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 14px", height: 32, borderRadius: "var(--r2)", border: "none", background: customUrl.trim() ? "var(--amber)" : "var(--s2)", color: customUrl.trim() ? "#0a0a0a" : "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, cursor: customUrl.trim() ? "pointer" : "not-allowed" }}
                      >
                        {actionId === "custom" ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={12} />}
                        Add
                      </button>
                    </div>
                  </div>
                  <div style={{ border: "1px solid var(--b2)", borderRadius: "var(--r2)", padding: 12, background: "var(--s1)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", letterSpacing: "0.08em", marginBottom: 8 }}>// EXAMPLES</div>
                    {[
                      { label: "GitHub (latest)",  ex: "https://github.com/me-no-dev/AsyncTCP.git" },
                      { label: "GitHub (pinned)",  ex: "https://github.com/knolleary/pubsubclient.git#v2.8" },
                      { label: "PIO shorthand",    ex: "knolleary/pubsubclient@^2.8" },
                      { label: "Local symlink",    ex: "symlink://../shared-lib" },
                    ].map(({ label, ex }) => (
                      <div key={ex} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", width: 100, flexShrink: 0 }}>{label}</span>
                        <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex}</code>
                        <button onClick={() => setCustomUrl(ex)} style={{ border: "1px solid var(--b2)", background: "transparent", color: "var(--t4)", cursor: "pointer", borderRadius: 4, padding: "2px 6px", fontFamily: "var(--font-mono)", fontSize: 10 }}>use</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
