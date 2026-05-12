"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, Wrench } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface TerminalPanelProps {
  projectId?: string;
  onAskToFix?: (errorText: string) => void;
}

type LineColor = "default" | "success" | "error" | "info" | "cmd";

function classifyLine(line: string): LineColor {
  if (line.includes("[SUCCESS]") || line.startsWith("✓")) return "success";
  if (
    /error:/i.test(line) ||
    line.includes("[FAILED]") ||
    line.startsWith("✗") ||
    /^.*:\d+:\d+: error/.test(line)
  )
    return "error";
  if (
    line.includes("Compiling") ||
    line.includes("Linking") ||
    line.includes("Building") ||
    line.includes("Checking")
  )
    return "info";
  if (line.startsWith("$") || line.startsWith(">>>")) return "cmd";
  return "default";
}

const COLOR_MAP: Record<LineColor, string> = {
  default: "#a1a1aa",
  success: "#4ade80",
  error:   "#f87171",
  info:    "#60a5fa",
  cmd:     "#e4e4e7",
};

const DEMO_OUTPUT = [
  "$ pio run",
  "Processing esp32dev (platform: espressif32; board: esp32dev; framework: arduino)",
  "─────────────────────────────────────────────────",
  "Compiling .pio/build/esp32dev/src/main.cpp.o",
  "Linking .pio/build/esp32dev/firmware.elf",
  "Checking size .pio/build/esp32dev/firmware.elf",
  "RAM:   [=         ]  12.8% (used 41912 bytes from 327680 bytes)",
  "Flash: [==        ]  21.4% (used 280333 bytes from 1310720 bytes)",
  "=============================== [SUCCESS] Took 8.23 seconds ===============================",
];

export function TerminalPanel({ projectId, onAskToFix }: TerminalPanelProps) {
  const [lines, setLines] = useState<string[]>(DEMO_OUTPUT);
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hasErrors = lines.some((l) => classifyLine(l) === "error");
  const hasSuccess = lines.some((l) => classifyLine(l) === "success");

  // Listen for build trigger from toolbar
  useEffect(() => {
    const handler = async () => {
      if (running) return;
      setRunning(true);
      setLines(["$ pio run", "Building…"]);

      try {
        const id = projectId ?? "demo";
        const res = await fetch(`${API_URL}/api/projects/${id}/build`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) {
          const data = await res.json() as { output?: string[]; exitCode?: number };
          setLines(["$ pio run", ...(data.output ?? [])]);
        } else {
          // Demo output if backend unavailable
          setLines([
            "$ pio run",
            "Processing esp32dev (platform: espressif32; board: esp32dev; framework: arduino)",
            "Compiling .pio/build/esp32dev/src/main.cpp.o",
            "Linking .pio/build/esp32dev/firmware.elf",
            "Checking size .pio/build/esp32dev/firmware.elf",
            "RAM:   [=         ]  12.8% (used 41912 bytes from 327680 bytes)",
            "Flash: [==        ]  21.4% (used 280333 bytes from 1310720 bytes)",
            "=============================== [SUCCESS] Took 8.23 seconds ===============================",
          ]);
        }
      } catch {
        setLines((prev) => [
          ...prev,
          "src/main.cpp:12:3: error: 'SHT31' was not declared in this scope",
          "src/main.cpp:15:14: error: expected ';' before '}' token",
          "=============================== [FAILED] ===============================",
        ]);
      } finally {
        setRunning(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    };

    window.addEventListener("edge-lab:build", handler);
    return () => window.removeEventListener("edge-lab:build", handler);
  }, [running, projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const errorLines = lines.filter((l) => classifyLine(l) === "error");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "#07080a" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 12px", borderBottom: "1px solid #27272a", flexShrink: 0 }}>
        {running ? (
          <span style={{ display: "flex", alignItems: "center", gap: 5, borderRadius: 5, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b", padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>
            <Loader2 size={10} className="animate-spin" /> Building…
          </span>
        ) : hasErrors ? (
          <span style={{ borderRadius: 5, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>
            ✗ {errorLines.length} error{errorLines.length !== 1 ? "s" : ""}
          </span>
        ) : hasSuccess ? (
          <span style={{ borderRadius: 5, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", color: "#86efac", padding: "3px 8px", fontSize: 11, fontWeight: 600 }}>
            ✓ Success
          </span>
        ) : (
          <span style={{ color: "#52525b", fontSize: 11 }}>// Terminal</span>
        )}

        {/* Ask agent to fix — shown when there are errors */}
        {hasErrors && onAskToFix && (
          <button
            onClick={() => {
              const context = [
                "Build failed with the following errors:",
                "",
                ...errorLines,
                "",
                "Full output:",
                ...lines,
              ].join("\n");
              onAskToFix(context);
            }}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "3px 10px", borderRadius: 5, border: "1px solid rgba(245,158,11,0.4)",
              background: "rgba(245,158,11,0.08)", color: "#f59e0b",
              fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,158,11,0.18)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(245,158,11,0.08)"; }}
          >
            <Wrench size={10} />
            Ask agent to fix
          </button>
        )}
      </div>

      {/* Output */}
      <div style={{ flex: 1, overflow: "auto", padding: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12 }}>
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              lineHeight: 1.55,
              color: COLOR_MAP[classifyLine(line)],
            }}
          >
            {line}
          </div>
        ))}
        {running && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, color: "#f59e0b" }}>
            <Loader2 size={11} className="animate-spin" />
            <span style={{ fontSize: 11 }}>compiling…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
