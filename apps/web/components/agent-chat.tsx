"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Bot, User, ChevronDown, ChevronRight, Loader2,
  FileText, FilePen, Search, Terminal, Zap, GitBranch,
  CheckCircle2, XCircle, Cpu,
} from "lucide-react";
import { getApiHeaders, getStoredKey } from "./settings-modal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; id: string; name: string; input: Record<string, string> }
  | { type: "tool_result"; id: string; name: string; content: string; isError: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, string>;
  result?: string;
  isError?: boolean;
  status: "running" | "done" | "error";
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls: ToolCall[];
  streaming: boolean;
}

interface ProviderConfig {
  id: string;
  name: string;
  available: boolean;
  models: Array<{ id: string; name: string; notes?: string }>;
}

// â”€â”€ Tool metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TOOL_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  read_file:    { icon: <FileText className="h-3 w-3" />,   label: "Read",    color: "text-blue-400" },
  write_file:   { icon: <FilePen className="h-3 w-3" />,    label: "Write",   color: "text-green-400" },
  edit_file:    { icon: <FilePen className="h-3 w-3" />,    label: "Edit",    color: "text-yellow-400" },
  list_files:   { icon: <FileText className="h-3 w-3" />,   label: "List",    color: "text-zinc-400" },
  search_files: { icon: <Search className="h-3 w-3" />,     label: "Search",  color: "text-purple-400" },
  run_bash:     { icon: <Terminal className="h-3 w-3" />,   label: "Bash",    color: "text-orange-400" },
  flash_board:  { icon: <Zap className="h-3 w-3" />,        label: "Flash",    color: "text-cyan-400" },
  git_status:   { icon: <GitBranch className="h-3 w-3" />,  label: "Git",      color: "text-pink-400" },
  git_commit:   { icon: <GitBranch className="h-3 w-3" />,  label: "Commit",   color: "text-pink-400" },
  read_serial:  { icon: <Cpu className="h-3 w-3" />,        label: "Serial ▶", color: "text-teal-400" },
  serial_send:  { icon: <Cpu className="h-3 w-3" />,        label: "Serial ↑", color: "text-teal-400" },
  kicad_drc:         { icon: <Terminal className="h-3 w-3" />, label: "DRC",     color: "text-yellow-400" },
  kicad_export_netlist: { icon: <FileText className="h-3 w-3" />, label: "Netlist", color: "text-zinc-400" },
  kicad_export_svg:  { icon: <FileText className="h-3 w-3" />, label: "SVG",     color: "text-zinc-400" },
};

function toolSummary(name: string, input: Record<string, string>): string {
  switch (name) {
    case "read_file":    return input.path ?? "";
    case "write_file":   return input.path ?? "";
    case "edit_file":    return input.path ?? "";
    case "list_files":   return input.dir ?? "/";
    case "search_files": return `"${input.pattern}"${input.dir ? ` in ${input.dir}` : ""}`;
    case "run_bash":     return input.command ?? "";
    case "flash_board":  return input.env ? `env: ${input.env}` : "upload";
    case "git_status":   return "status";
    case "git_commit":   return `"${input.message}"`;
    case "serial_send":  return `"${input.data}"`;
    default:             return JSON.stringify(input).slice(0, 60);
  }
}

// â”€â”€ Tool call block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ToolBlock({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[call.name] ?? { icon: <Terminal className="h-3 w-3" />, label: call.name, color: "text-zinc-400" };

  return (
    <div style={{ border: "1px solid var(--b2)", background: "var(--bg)", borderRadius: 6, overflow: "hidden", margin: "3px 0" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}
      >
        {call.status === "running" ? (
          <Loader2 size={11} className="animate-spin" style={{ color: "var(--amber)", flexShrink: 0 }} />
        ) : call.status === "error" ? (
          <XCircle size={11} style={{ color: "var(--red)", flexShrink: 0 }} />
        ) : (
          <CheckCircle2 size={11} style={{ color: "var(--green)", flexShrink: 0, opacity: 0.8 }} />
        )}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--amber)", flexShrink: 0, letterSpacing: "0.04em" }}>
          {meta.label}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {toolSummary(call.name, call.input)}
        </span>
        {open ? (
          <ChevronDown size={11} style={{ color: "var(--t4)", flexShrink: 0 }} />
        ) : (
          <ChevronRight size={11} style={{ color: "var(--t4)", flexShrink: 0 }} />
        )}
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--b1)" }}>
          <div style={{ padding: "8px 10px", background: "var(--s1)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t4)", letterSpacing: "0.1em", marginBottom: 4 }}>// INPUT</div>
            <pre style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t2)", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>
          {call.result !== undefined && (
            <div style={{ padding: "8px 10px", borderTop: "1px solid var(--b1)" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", marginBottom: 4, color: call.isError ? "var(--red)" : "var(--t4)" }}>
                {call.isError ? "// ERROR" : "// RESULT"}
              </div>
              <pre style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: call.isError ? "var(--red)" : "var(--t2)", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, maxHeight: 160, overflow: "auto" }}>
                {call.result.slice(0, 3000)}{call.result.length > 3000 ? "\n…truncated" : ""}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Message bubble â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MessageBubble({ msg }: { msg: DisplayMessage }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", gap: 8, flexDirection: "row-reverse" }}>
        <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: "var(--b3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <User size={13} color="var(--t2)" />
        </div>
        <div style={{ maxWidth: "82%", background: "var(--amber)", color: "#07080f", borderRadius: 8, padding: "8px 12px", fontFamily: "var(--font-ui)", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", fontWeight: 500 }}>
          {msg.text}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: "50%", background: "var(--amber-lo)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
        <Bot size={12} color="var(--amber)" />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {msg.toolCalls.map((call) => (
          <ToolBlock key={call.id} call={call} />
        ))}
        {(msg.text || msg.streaming) && (
          <div style={{ background: "var(--bg)", border: "1px solid var(--b2)", borderRadius: 8, padding: "10px 12px", fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--t2)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {msg.text || (msg.streaming ? "▋" : "")}
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€ Main AgentChat component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function AgentChat({
  projectId,
  boardType,
  fileContext,
  mode = "firmware",
}: {
  projectId: string;
  boardType?: string;
  fileContext?: string;
  mode?: "firmware" | "schematics" | "board";
}) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProvider, setSelectedProvider] = useState(() =>
    typeof localStorage !== "undefined" ? (localStorage.getItem("agent-provider") ?? "anthropic") : "anthropic"
  );
  const [selectedModel, setSelectedModel] = useState(() =>
    typeof localStorage !== "undefined" ? (localStorage.getItem("agent-model") ?? "claude-sonnet-4-6") : "claude-sonnet-4-6"
  );
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch providers (public endpoint â€” no auth needed)
  useEffect(() => {
    fetch(`${API_URL}/api/ai/providers`, { headers: getApiHeaders() })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setProviders(data as ProviderConfig[]);
      })
      .catch(() => {});
  }, []);

  const currentProvider = providers.find?.((p) => p.id === selectedProvider);
  const hasUserMessages = messages.some((m) => m.role === "user");

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || running) return;
    setInput("");
    setRunning(true);

    const userMsg: DisplayMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      toolCalls: [],
      streaming: false,
    };

    const assistantMsgId = `a-${Date.now()}`;
    const assistantMsg: DisplayMessage = {
      id: assistantMsgId,
      role: "assistant",
      text: "",
      toolCalls: [],
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    // Build history for the API (text messages only)
    const history = messages
      .filter((m) => m.text)
      .map((m) => ({ role: m.role, content: m.text }));
    history.push({ role: "user", content: text });

    try {
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("auth-token") ?? "" : "";
      const res = await fetch(`${API_URL}/api/agent/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...getApiHeaders(),
        },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          projectId,
          messages: history,
          boardType,
          fileContext,
          mode,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      const updateAssistant = (fn: (msg: DisplayMessage) => DisplayMessage) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? fn(m) : m))
        );
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") break;

          let event: AgentEvent;
          try { event = JSON.parse(raw); } catch { continue; }

          switch (event.type) {
            case "text":
              updateAssistant((m) => ({ ...m, text: m.text + event.text }));
              break;

            case "tool_start":
              updateAssistant((m) => ({
                ...m,
                toolCalls: [...m.toolCalls, {
                  id: event.id,
                  name: event.name,
                  input: event.input,
                  status: "running",
                }],
              }));
              break;

            case "tool_result":
              updateAssistant((m) => ({
                ...m,
                toolCalls: m.toolCalls.map((tc) =>
                  tc.id === event.id
                    ? { ...tc, result: event.content, isError: event.isError, status: event.isError ? "error" : "done" }
                    : tc
                ),
              }));
              break;

            case "error":
              updateAssistant((m) => ({
                ...m,
                text: m.text + `\n\nâš ï¸ ${event.message}`,
              }));
              break;
          }
        }
      }

      updateAssistant((m) => ({ ...m, streaming: false }));
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, text: `âš ï¸ ${err instanceof Error ? err.message : "Request failed"}`, streaming: false }
            : m
        )
      );
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  }, [input, running, messages, selectedProvider, selectedModel, projectId, boardType, fileContext]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    height: 30,
    minWidth: 0,
    border: "1px solid var(--b2)",
    borderRadius: 6,
    background: "var(--bg)",
    color: "var(--t2)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    padding: "0 8px",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, overflow: "hidden", background: "var(--s1)", color: "var(--t1)" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--b1)", background: "var(--bg)", padding: "12px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, minWidth: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(245,158,11,0.3)", background: "var(--amber-lo)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Bot size={15} color="var(--amber)" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 800, color: "var(--t1)", letterSpacing: "0.04em", lineHeight: 1.2 }}>
              AI <span style={{ color: "var(--amber)" }}>AGENT</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", marginTop: 2 }}>
              reads · writes · runs · flashes
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMessages([])}
            title="New chat"
            style={{ border: "1px solid var(--b2)", background: "transparent", color: "var(--t3)", borderRadius: 6, height: 28, padding: "0 10px", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", cursor: "pointer", flexShrink: 0 }}
          >
            NEW
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
          <label style={{ minWidth: 0 }}>
            <span style={{ display: "block", marginBottom: 4, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--t4)" }}>// Provider</span>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                localStorage.setItem("agent-provider", e.target.value);
                const p = providers.find((x) => x.id === e.target.value);
                const m = p?.models[0]?.id ?? "";
                setSelectedModel(m);
                localStorage.setItem("agent-model", m);
              }}
              style={selectStyle}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {p.available ? "" : "⚠ "}{p.name}
                </option>
              ))}
              {providers.length === 0 && <option value="anthropic">Anthropic</option>}
            </select>
          </label>

          <label style={{ minWidth: 0 }}>
            <span style={{ display: "block", marginBottom: 4, fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--t4)" }}>// Model</span>
            <select
              value={selectedModel}
              onChange={(e) => { setSelectedModel(e.target.value); localStorage.setItem("agent-model", e.target.value); }}
              style={selectStyle}
            >
              {(currentProvider?.models ?? [{ id: selectedModel, name: selectedModel }]).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 ? (
          <div style={{ border: "1px solid var(--b2)", background: "var(--bg)", borderRadius: 8, padding: "14px 14px" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 6 }}>
              Ready when you are
            </div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, lineHeight: 1.6, color: "var(--t3)" }}>
              Ask for a code change, a build check, or help wiring the current board.
            </div>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* API key warning */}
      {!hasUserMessages && !getStoredKey(selectedProvider) && (
        <div style={{ margin: "0 14px 10px", border: "1px solid rgba(245,158,11,0.25)", background: "var(--amber-lo)", color: "var(--amber)", borderRadius: 7, padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.5 }}>
          ⚙ Add an API key in settings to enable agent.
        </div>
      )}

      {/* Suggested prompts */}
      {!hasUserMessages && (
        <div style={{ display: "grid", gap: 6, padding: "0 14px 14px" }}>
          {(mode === "schematics"
            ? ["Create an ESP32 schematic with LED and button", "Add a DHT22 sensor to the schematic", "Read schematic.kicad_sch and explain it"]
            : mode === "board"
            ? ["Create a PCB layout from the schematic", "Run DRC and show violations", "Export the netlist"]
            : ["Explain main.cpp", "Add button debounce", "Run build and fix errors"]
          ).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setInput(p); inputRef.current?.focus(); }}
              style={{ minHeight: 32, border: "1px solid var(--b2)", background: "var(--bg)", color: "var(--t3)", borderRadius: 6, padding: "0 10px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "border-color 0.15s, color 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(245,158,11,0.4)"; e.currentTarget.style.color = "var(--amber)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--b2)"; e.currentTarget.style.color = "var(--t3)"; }}
            >
              › {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ borderTop: "1px solid var(--b1)", background: "var(--bg)", padding: 14, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", minWidth: 0 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask to edit, build, flash, or explain…"
            disabled={running}
            rows={3}
            style={{ minHeight: 76, flex: 1, minWidth: 0, resize: "none", border: "1px solid var(--b2)", borderRadius: 8, background: "var(--s1)", color: "var(--t1)", padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.5, outline: "none", transition: "border-color 0.15s" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(245,158,11,0.45)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--b2)"; }}
          />
          <button
            onClick={send}
            disabled={running || !input.trim()}
            title="Send (Enter)"
            style={{ width: 38, height: 38, border: "none", borderRadius: 8, background: running || !input.trim() ? "var(--s2)" : "var(--amber)", color: running || !input.trim() ? "var(--t4)" : "#07080f", display: "flex", alignItems: "center", justifyContent: "center", cursor: running || !input.trim() ? "not-allowed" : "pointer", flexShrink: 0, transition: "background 0.15s" }}
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        {running && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--amber)", letterSpacing: "0.06em" }}>
            <Loader2 size={10} className="animate-spin" />
            AGENT RUNNING…
          </div>
        )}
      </div>
    </div>
  );
}
