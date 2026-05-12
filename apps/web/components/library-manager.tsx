"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, X, Search, Plus, Trash2, GitBranch, Loader2, ExternalLink } from "lucide-react";

// ── Popular curated libraries shown on first open ─────────────────────────────
const POPULAR: LibResult[] = [
  { id: "adafruit-neopixel", name: "Adafruit NeoPixel", version: "1.12.3", author: "Adafruit", description: "Arduino library for controlling NeoPixel RGB LEDs.", category: "Display" },
  { id: "fastled",            name: "FastLED",          version: "3.7.0",  author: "FastLED",  description: "Multi-platform library for controlling LEDs.", category: "Display" },
  { id: "dht-sensor-library", name: "DHT sensor library", version: "1.4.6", author: "Adafruit", description: "Arduino library for DHT11, DHT22 temperature/humidity sensors.", category: "Sensors" },
  { id: "adafruit-bme280",   name: "Adafruit BME280",  version: "2.2.4",  author: "Adafruit", description: "Arduino library for BME280 humidity, temperature and pressure sensor.", category: "Sensors" },
  { id: "pubsubclient",      name: "PubSubClient",     version: "2.8.0",  author: "Nick O'Leary", description: "MQTT messaging library for Arduino.", category: "Communications" },
  { id: "arduinojson",       name: "ArduinoJson",      version: "7.1.0",  author: "Benoît Blanchon", description: "JSON library for embedded C++. Efficient parsing and serialization.", category: "Data" },
  { id: "wire",              name: "Wire",              version: "1.0.0",  author: "Arduino", description: "I2C/TWI library for Arduino boards.", category: "Communications" },
  { id: "spi",               name: "SPI",              version: "1.0.0",  author: "Arduino", description: "SPI library for Arduino boards.", category: "Communications" },
  { id: "esp32-ble-arduino", name: "ESP32 BLE Arduino", version: "2.0.0", author: "Neil Kolban", description: "BLE library for ESP32.", category: "Wireless" },
  { id: "tft-espi",          name: "TFT_eSPI",         version: "2.5.43", author: "Bodmer", description: "TFT graphics library for Arduino compatible processors.", category: "Display" },
  { id: "u8g2",              name: "U8g2",             version: "2.35.9", author: "olikraus", description: "Monochrome LCD, OLED graphics library.", category: "Display" },
  { id: "lvgl",              name: "LVGL",             version: "9.1.0",  author: "LVGL", description: "Embedded graphics library. Light and versatile.", category: "Display" },
];

interface LibResult {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: string;
}

// ── Simulated installed deps ──────────────────────────────────────────────────
const DEFAULT_INSTALLED = [
  { id: "arduinojson", name: "ArduinoJson", version: "7.1.0" },
  { id: "pubsubclient", name: "PubSubClient", version: "2.8.0" },
];

export function LibraryManager({ projectId, isOpen: controlledOpen, onClose }: { projectId: string; isOpen?: boolean; onClose?: () => void }) {
  const [_open, _setOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : _open;
  const setOpen = (v: boolean) => {
    if (controlledOpen !== undefined) { if (!v) onClose?.(); }
    else _setOpen(v);
  };
  const [tab, setTab] = useState<"search" | "installed" | "custom">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibResult[]>(POPULAR);
  const [searching, setSearching] = useState(false);
  const [installed, setInstalled] = useState<typeof DEFAULT_INSTALLED>(DEFAULT_INSTALLED);
  const [customUrl, setCustomUrl] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter popular list by query (local, instant)
  const doSearch = useCallback((q: string) => {
    setSearching(true);
    const filtered = POPULAR.filter(
      (l) =>
        l.name.toLowerCase().includes(q.toLowerCase()) ||
        l.description.toLowerCase().includes(q.toLowerCase()) ||
        l.category.toLowerCase().includes(q.toLowerCase()) ||
        l.author.toLowerCase().includes(q.toLowerCase())
    );
    setResults(filtered.length ? filtered : POPULAR);
    setSearching(false);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults(POPULAR); return; }
    const t = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, doSearch]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open, tab]);

  const addLib = async (lib: LibResult) => {
    if (installed.some((i) => i.id === lib.id)) return;
    setAddingId(lib.id);
    // Simulate install delay
    await new Promise((r) => setTimeout(r, 600));
    setInstalled((prev) => [...prev, { id: lib.id, name: lib.name, version: lib.version }]);
    setAddingId(null);
  };

  const removeLib = (id: string) => {
    setInstalled((prev) => prev.filter((i) => i.id !== id));
  };

  const addCustom = async () => {
    if (!customUrl.trim()) return;
    const name = customUrl.split("/").pop()?.replace(".git", "") ?? customUrl;
    setAddingId("custom");
    await new Promise((r) => setTimeout(r, 400));
    setInstalled((prev) => [...prev, { id: name, name, version: "git" }]);
    setCustomUrl("");
    setAddingId(null);
    setTab("installed");
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "0 16px", height: 36, border: "none",
    borderBottom: active ? "2px solid var(--amber)" : "2px solid transparent",
    background: active ? "var(--amber-lo)" : "transparent",
    color: active ? "var(--amber)" : "var(--t3)",
    fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer",
    letterSpacing: "0.04em", whiteSpace: "nowrap",
    transition: "color 0.15s",
  });

  return (
    <>
      {/* Toolbar button — only rendered when NOT controlled externally */}
      {controlledOpen === undefined && (
        <button
          onClick={() => setOpen(true)}
          title="Library Manager"
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 5, border: "1px solid var(--b2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12, cursor: "pointer", letterSpacing: "0.03em" }}
        >
          <BookOpen size={11} /> Libs
        </button>
      )}

      {/* Modal overlay */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{ width: 620, maxWidth: "95vw", maxHeight: "80vh", background: "var(--bg)", border: "1px solid var(--b2)", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--b1)", gap: 10, flexShrink: 0 }}>
              <BookOpen size={16} color="var(--amber)" />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 800, color: "var(--t1)", letterSpacing: "0.04em", flex: 1 }}>
                LIBRARY <span style={{ color: "var(--amber)" }}>MANAGER</span>
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>via PlatformIO</span>
              <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", color: "var(--t3)", cursor: "pointer", display: "flex" }}>
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
              <button style={tabStyle(tab === "search")}   onClick={() => setTab("search")}>Search Registry</button>
              <button style={tabStyle(tab === "installed")} onClick={() => setTab("installed")}>
                Project Deps {installed.length > 0 && <span style={{ marginLeft: 5, background: "var(--amber)", color: "#07080f", borderRadius: 10, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>{installed.length}</span>}
              </button>
              <button style={tabStyle(tab === "custom")}   onClick={() => setTab("custom")}>Custom Sources</button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>

              {/* ── Search tab ── */}
              {tab === "search" && (
                <>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--b2)", borderRadius: 7, padding: "6px 12px", background: "var(--s1)" }}>
                      <Search size={13} color="var(--t4)" />
                      <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search libraries… e.g. DHT22, NeoPixel, MQTT"
                        style={{ flex: 1, border: "none", background: "transparent", color: "var(--t1)", fontFamily: "var(--font-mono)", fontSize: 12, outline: "none" }}
                      />
                      {searching && <Loader2 size={12} className="animate-spin" color="var(--t4)" />}
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                    {results.map((lib) => {
                      const isInstalled = installed.some((i) => i.id === lib.id);
                      const isAdding = addingId === lib.id;
                      return (
                        <div key={lib.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--b1)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--s1)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                              <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{lib.name}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", background: "var(--s2)", padding: "1px 6px", borderRadius: 4 }}>v{lib.version}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--amber)", background: "var(--amber-lo)", padding: "1px 6px", borderRadius: 4 }}>{lib.category}</span>
                            </div>
                            <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--t3)", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {lib.description}
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", marginTop: 2 }}>by {lib.author}</div>
                          </div>
                          <button
                            onClick={() => addLib(lib)}
                            disabled={isInstalled || isAdding}
                            style={{
                              display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
                              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)",
                              border: isInstalled ? "1px solid var(--b2)" : "1px solid rgba(245,158,11,0.4)",
                              background: isInstalled ? "transparent" : "rgba(245,158,11,0.08)",
                              color: isInstalled ? "var(--t4)" : "var(--amber)",
                              cursor: isInstalled ? "default" : "pointer",
                            }}
                          >
                            {isAdding ? <Loader2 size={10} className="animate-spin" /> : isInstalled ? "✓ Added" : <><Plus size={10} /> Add</>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── Installed tab ── */}
              {tab === "installed" && (
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {installed.length === 0 ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t4)" }}>
                      // No libraries added yet
                    </div>
                  ) : (
                    installed.map((lib) => (
                      <div key={lib.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--b1)" }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{lib.name}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", marginLeft: 8 }}>v{lib.version}</span>
                        </div>
                        <button
                          onClick={() => removeLib(lib.id)}
                          title="Remove"
                          style={{ border: "none", background: "transparent", color: "var(--t4)", cursor: "pointer", display: "flex", padding: 4, borderRadius: 4 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--t4)"; }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))
                  )}
                  <div style={{ padding: "12px 16px", borderTop: "1px solid var(--b1)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)" }}>
                    // Stored in lib_deps in platformio.ini
                  </div>
                </div>
              )}

              {/* ── Custom sources tab ── */}
              {tab === "custom" && (
                <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 6 }}>
                      <GitBranch size={13} style={{ display: "inline", marginRight: 6, color: "var(--amber)" }} />
                      Add from Git / URL
                    </div>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--t3)", marginBottom: 12, lineHeight: 1.6 }}>
                      Paste a Git URL, archive URL, or GitHub shorthand. Supports versioned tags and branches.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
                        placeholder="https://github.com/vendor/library.git#v1.2.0"
                        style={{ flex: 1, height: 36, border: "1px solid var(--b2)", borderRadius: 7, background: "var(--s1)", color: "var(--t1)", padding: "0 12px", fontFamily: "var(--font-mono)", fontSize: 12, outline: "none" }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(245,158,11,0.45)"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--b2)"; }}
                      />
                      <button
                        onClick={addCustom}
                        disabled={!customUrl.trim() || addingId === "custom"}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 16px", height: 36, borderRadius: 7, border: "none", background: customUrl.trim() ? "var(--amber)" : "var(--s2)", color: customUrl.trim() ? "#07080f" : "var(--t4)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, cursor: customUrl.trim() ? "pointer" : "not-allowed" }}
                      >
                        {addingId === "custom" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        Add
                      </button>
                    </div>
                  </div>
                  <div style={{ border: "1px solid var(--b2)", borderRadius: 8, padding: 12, background: "var(--s1)" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", letterSpacing: "0.08em", marginBottom: 8 }}>// EXAMPLES</div>
                    {[
                      "https://github.com/me-no-dev/AsyncTCP.git",
                      "https://github.com/knolleary/pubsubclient.git#v2.8",
                      "symlink://../shared-lib",
                    ].map((ex) => (
                      <div key={ex} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                        <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t2)", flex: 1 }}>{ex}</code>
                        <button
                          onClick={() => setCustomUrl(ex)}
                          style={{ border: "none", background: "transparent", color: "var(--t4)", cursor: "pointer", display: "flex" }}
                          title="Use this"
                        >
                          <ExternalLink size={11} />
                        </button>
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
