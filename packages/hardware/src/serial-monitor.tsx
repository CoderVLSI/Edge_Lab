"use client";

import React, { useRef, useEffect, useState } from "react";
import { useSerialPort } from "./use-serial-port";

export interface SerialMonitorProps {
  className?: string;
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

export function SerialMonitor({ className }: SerialMonitorProps) {
  const { status, output, connect, disconnect, send, clear, isSupported } = useSerialPort();
  const [baudRate, setBaudRate] = useState(115200);
  const [input, setInput] = useState("");
  const [mounted, setMounted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Defer isSupported check to client — avoids SSR/client hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [output]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      send(input);
      setInput("");
    }
  };

  // Render a consistent placeholder until client hydration is complete
  if (!mounted) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#71717a", fontSize: 12 }}>
        Serial Monitor
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#71717a", fontSize: 12, textAlign: "center", padding: "0 16px" }}>
        Web Serial API not supported. Use Chrome or Edge, or the desktop app.
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-zinc-950 ${className ?? ""}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5 shrink-0">
        <select
          value={baudRate}
          onChange={(e) => setBaudRate(Number(e.target.value))}
          className="h-6 rounded border border-zinc-700 bg-zinc-900 px-1 text-xs text-zinc-300"
          disabled={status === "connected"}
        >
          {BAUD_RATES.map((r) => (
            <option key={r} value={r}>{r} baud</option>
          ))}
        </select>

        {status === "connected" ? (
          <button
            onClick={disconnect}
            className="h-6 px-2 rounded bg-red-700 text-xs text-white hover:bg-red-600"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={() => connect(baudRate)}
            className="h-6 px-2 rounded bg-green-700 text-xs text-white hover:bg-green-600"
            disabled={status === "connecting"}
          >
            {status === "connecting" ? "Connecting…" : "Connect"}
          </button>
        )}

        <button
          onClick={clear}
          className="h-6 px-2 rounded border border-zinc-700 text-xs text-zinc-400 hover:text-white"
        >
          Clear
        </button>

        <span
          className={`ml-auto text-xs ${
            status === "connected"
              ? "text-green-400"
              : status === "error"
              ? "text-red-400"
              : "text-zinc-500"
          }`}
        >
          {status}
        </span>
      </div>

      {/* Output */}
      <div className="flex-1 overflow-auto p-2 font-mono text-xs text-green-300 whitespace-pre-wrap">
        {output.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 border-t border-zinc-800 p-2 shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send message…"
          disabled={status !== "connected"}
          className="flex-1 h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 placeholder:text-zinc-600 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={status !== "connected"}
          className="h-7 px-3 rounded bg-blue-600 text-xs text-white hover:bg-blue-500 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
