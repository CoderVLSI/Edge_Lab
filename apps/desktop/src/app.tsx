"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { load } from "@tauri-apps/plugin-store";
import { FileTree, type FileTreeNode } from "@edge-lab/ui";
import { SerialMonitor, BoardSelector, BOARDS, type Board } from "@edge-lab/hardware";
import {
  FolderOpen, Upload, Play, ChevronRight, Wifi, GitBranch, GitMerge,
  Bot, Send, Loader2, Plus, Zap, Mic, MicOff, X as XIcon, Image, LogIn, LogOut, User,
} from "lucide-react";
import * as Y from "yjs";
import { CodeEditor } from "@edge-lab/editor";

// ── Auth helpers ─────────────────────────────────────────────────────────────

const AUTH_STORE_KEY = "edge-lab-auth";

async function getStoredToken(): Promise<string | null> {
  try {
    const store = await load(AUTH_STORE_KEY);
    return (await store.get<string>("jwt")) ?? null;
  } catch { return null; }
}

async function setStoredToken(token: string | null): Promise<void> {
  try {
    const store = await load(AUTH_STORE_KEY);
    if (token) await store.set("jwt", token);
    else await store.delete("jwt");
    await store.save();
  } catch { /* ignore */ }
}

// ── Login Modal ───────────────────────────────────────────────────────────────
function LoginModal({ onLogin, onClose }: { onLogin: (token: string, email: string) => void; onClose: () => void }) {
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode]       = useState<"login" | "register">("login");

  const submit = async () => {
    if (!email.trim() || !password.trim()) { setError("Email and password required"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json() as { token?: string; error?: string };
      if (!res.ok || !data.token) { setError(data.error ?? "Authentication failed"); return; }
      await setStoredToken(data.token);
      onLogin(data.token, email.trim());
    } catch (e) {
      setError(`Cannot reach backend (${String(e)}). Start it with: cd backend/api && pnpm dev`);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: "var(--r3)", padding: 28, width: 340, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--amber)" }}>
            <Zap size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />
            {mode === "login" ? "Sign In" : "Create Account"}
          </span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer" }}><XIcon size={14} /></button>
        </div>

        {error && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--red)", padding: "6px 8px", background: "var(--red-lo)", borderRadius: "var(--r1)" }}>{error}</div>}

        {[
          { label: "Email", value: email, set: setEmail, type: "email" },
          { label: "Password", value: password, set: setPassword, type: "password" },
        ].map(f => (
          <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)" }}>{f.label}</label>
            <input
              type={f.type} value={f.value} onChange={e => f.set(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              autoComplete={f.type === "password" ? "current-password" : "email"}
              style={{ height: 32, border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "var(--s3)", color: "var(--t1)", padding: "0 10px", fontFamily: "var(--font-mono)", fontSize: 12, outline: "none" }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--amber)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "var(--b2)"; }}
            />
          </div>
        ))}

        <button onClick={submit} disabled={loading}
          style={{ height: 34, border: "none", borderRadius: "var(--r2)", background: loading ? "var(--s3)" : "var(--amber)", color: loading ? "var(--t4)" : "#0a0a0a", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {loading ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
          {loading ? "Signing in…" : mode === "login" ? "Sign In" : "Create Account"}
        </button>

        <button onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }}
          style={{ background: "transparent", border: "none", color: "var(--t3)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer", textAlign: "center" }}>
          {mode === "login" ? "No account? Register →" : "Already have an account? Sign in →"}
        </button>
      </div>
    </div>
  );
}

// ── Agent Chat (inline, no import from web) ─────────────────────────────────

const API = "http://localhost:4000";

// ── May 2026 model catalogue ──────────────────────────────────────────────────
const MODELS: Record<string, Array<{ id: string; label: string }>> = {
  anthropic: [
    { id: "claude-opus-4-7",      label: "Claude Opus 4.7 ★"      },
    { id: "claude-sonnet-4-5",    label: "Claude Sonnet 4.5"       },
    { id: "claude-haiku-4-5",     label: "Claude Haiku 4.5"        },
  ],
  openai: [
    { id: "gpt-5.5",              label: "GPT-5.5 ★"              },
    { id: "gpt-5.5-instant",      label: "GPT-5.5 Instant"        },
    { id: "gpt-5.4",              label: "GPT-5.4"                },
    { id: "o3",                   label: "o3 (reasoning)"         },
    { id: "o4-mini",              label: "o4-mini (reasoning)"    },
  ],
  gemini: [
    { id: "gemini-3.1-pro",          label: "Gemini 3.1 Pro ★"       },
    { id: "gemini-3-pro-preview",    label: "Gemini 3 Pro Preview"   },
    { id: "gemini-3.1-flash-lite",   label: "Gemini 3.1 Flash Lite"  },
    { id: "gemini-3-flash",          label: "Gemini 3 Flash"         },
  ],
  ollama: [
    { id: "llama4:scout",         label: "Llama 4 Scout (10M ctx)" },
    { id: "llama4:maverick",      label: "Llama 4 Maverick"        },
    { id: "qwen2.5-coder",        label: "Qwen 2.5 Coder"         },
    { id: "codestral",            label: "Codestral (code)"        },
    { id: "mistral-small-4",      label: "Mistral Small 4"         },
    { id: "phi4",                 label: "Phi-4"                   },
  ],
};

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-sonnet-4-5",
  openai:    "gpt-5.5",
  gemini:    "gemini-3.1-flash-lite",
  ollama:    "llama4:scout",
};

interface PendingImage { base64: string; mimeType: string; preview: string; }

interface AgentMsg {
  role: "user" | "assistant";
  text: string;
  images?: string[];   // preview URLs for display
  streaming?: boolean;
}

// Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

function AgentChatPanel({ projectPath, authToken }: { projectPath: string | null; authToken: string | null }) {
  const [messages, setMessages]       = useState<AgentMsg[]>([]);
  const [input, setInput]             = useState("");
  const [running, setRunning]         = useState(false);
  const [provider, setProvider]       = useState("anthropic");
  const [model, setModel]             = useState(DEFAULT_MODEL.anthropic);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [listening, setListening]     = useState(false);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  const recogRef   = useRef<SpeechRecognition | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Sync model when provider changes
  useEffect(() => {
    setModel(DEFAULT_MODEL[provider] ?? MODELS[provider]?.[0]?.id ?? "");
  }, [provider]);

  // ── Image helpers ─────────────────────────────────────────────────────────
  const fileToImage = (file: File): Promise<PendingImage> =>
    new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) { reject(new Error("not an image")); return; }
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target?.result as string;
        const base64  = dataUrl.split(",")[1];
        resolve({ base64, mimeType: file.type, preview: dataUrl });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const imgs = await Promise.all(Array.from(files).map(fileToImage).map(p => p.catch(() => null)));
    setPendingImages(prev => [...prev, ...imgs.filter(Boolean) as PendingImage[]]);
  };

  // Paste images from clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageItems = Array.from(items).filter(it => it.type.startsWith("image/"));
      if (!imageItems.length) return;
      const files = imageItems.map(it => it.getAsFile()).filter(Boolean) as File[];
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      addImages(dt.files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // ── Mic / Speech Recognition ──────────────────────────────────────────────
  const toggleMic = () => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not available in this WebView."); return; }

    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }

    const recog = new SR();
    recog.lang = "en-US";
    recog.continuous = true;
    recog.interimResults = true;

    let finalTranscript = input;

    recog.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interim = e.results[i][0].transcript;
      }
      setInput(finalTranscript + interim);
    };
    recog.onerror = () => setListening(false);
    recog.onend   = () => setListening(false);

    recogRef.current = recog;
    recog.start();
    setListening(true);
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImages.length) || running) return;
    setInput("");
    const imgs = [...pendingImages];
    setPendingImages([]);
    setRunning(true);

    const userMsg: AgentMsg = {
      role: "user", text,
      images: imgs.map(i => i.preview),
    };
    const assistantMsg: AgentMsg = { role: "assistant", text: "", streaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      const apiKey = localStorage.getItem(`${provider}-api-key`) ?? "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
      if (provider === "anthropic" && apiKey) headers["X-ANTHROPIC_API_KEY"]  = apiKey;
      if (provider === "openai"    && apiKey) headers["X-OPENAI_API_KEY"]     = apiKey;
      if (provider === "gemini"    && apiKey) headers["X-GEMINI_API_KEY"]     = apiKey;

      // Build content blocks (text + images)
      type ContentBlock =
        | { type: "text"; text: string }
        | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

      const content: ContentBlock[] = [];
      imgs.forEach(img => content.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.base64 },
      }));
      if (text) content.push({ type: "text", text });

      const body = {
        messages: [
          ...messages.map(m => ({ role: m.role, content: m.text })),
          { role: "user", content: content.length === 1 && content[0].type === "text"
              ? text
              : content },
        ],
        provider,
        model,
        projectPath,
      };

      const res = await fetch(`${API}/api/agent/run`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const raw = part.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === "text") {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") last.text += ev.text;
                return next;
              });
            }
            if (ev.type === "error") {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") { last.text = ev.message; last.streaming = false; }
                return next;
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") { last.text = `Error: ${String(e)}`; last.streaming = false; }
        return next;
      });
    } finally {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") last.streaming = false;
        return next;
      });
      setRunning(false);
    }
  };

  const canSend = !running && (!!input.trim() || pendingImages.length > 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", borderLeft: "1px solid var(--b1)", background: "var(--s1)" }}>

      {/* ── Header ── */}
      <div style={{ height: 38, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", borderBottom: "1px solid var(--b1)", background: "var(--s2)", flexShrink: 0 }}>
        <Bot size={13} style={{ color: "var(--amber)", flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t3)", flexShrink: 0 }}>AGENT</span>

        {/* Provider */}
        <select
          value={provider}
          onChange={e => setProvider(e.target.value)}
          style={{ background: "var(--s3)", border: "1px solid var(--b2)", borderRadius: "var(--r1)", color: "var(--t2)", fontFamily: "var(--font-mono)", fontSize: 10, padding: "1px 4px", cursor: "pointer", outline: "none" }}
        >
          <option value="anthropic">Claude</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="ollama">Ollama</option>
        </select>

        {/* Model */}
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          style={{ flex: 1, minWidth: 0, background: "var(--s3)", border: "1px solid var(--b2)", borderRadius: "var(--r1)", color: "var(--amber)", fontFamily: "var(--font-mono)", fontSize: 10, padding: "1px 4px", cursor: "pointer", outline: "none" }}
        >
          {(MODELS[provider] ?? []).map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        <button onClick={() => setMessages([])} title="New chat" style={{ background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer", display: "flex", alignItems: "center", padding: 2 }}>
          <Plus size={12} />
        </button>
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
        {messages.length === 0 ? (
          <div style={{ padding: "10px", border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "var(--bg)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t3)", marginBottom: 2 }}>
              Edit code · run builds · explain errors
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t4)" }}>
              Attach an image • paste a circuit photo • dictate with mic
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
              {["bash", "files", "git", "pio", "serial"].map(t => (
                <span key={t} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--amber)", border: "1px solid rgba(224,160,32,0.25)", borderRadius: "var(--r1)", padding: "1px 5px", background: "var(--amber-lo)" }}>{t}</span>
              ))}
            </div>
            {projectPath && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t4)", marginTop: 4, borderTop: "1px solid var(--b1)", paddingTop: 4 }}>
                cwd: {projectPath.split(/[/\\]/).slice(-2).join("/")}
              </div>
            )}
          </div>
        ) : messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: 5, alignItems: "flex-start" }}>
            {msg.role === "assistant" && (
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--amber-lo)", border: "1px solid rgba(224,160,32,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                <Bot size={10} style={{ color: "var(--amber)" }} />
              </div>
            )}
            <div style={{ maxWidth: "88%", display: "flex", flexDirection: "column", gap: 3, alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {/* Image previews */}
              {msg.images && msg.images.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.images.map((src, j) => (
                    <img key={j} src={src} alt="" style={{ height: 60, width: 60, objectFit: "cover", borderRadius: "var(--r2)", border: "1px solid var(--b2)" }} />
                  ))}
                </div>
              )}
              {/* Text bubble */}
              {(msg.text || msg.streaming) && (
                <div style={{ background: msg.role === "user" ? "var(--amber)" : "var(--bg)", border: msg.role === "user" ? "none" : "1px solid var(--b2)", borderRadius: "var(--r2)", padding: "6px 9px", fontFamily: "var(--font-mono)", fontSize: 11, color: msg.role === "user" ? "#0a0a0a" : "var(--t2)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {msg.text || (msg.streaming ? "▋" : "")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Image previews row ── */}
      {pendingImages.length > 0 && (
        <div style={{ padding: "6px 10px", borderTop: "1px solid var(--b1)", display: "flex", gap: 6, flexWrap: "wrap", background: "var(--bg)", flexShrink: 0 }}>
          {pendingImages.map((img, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={img.preview} alt="" style={{ height: 48, width: 48, objectFit: "cover", borderRadius: "var(--r2)", border: "1px solid var(--b2)", display: "block" }} />
              <button
                onClick={() => setPendingImages(prev => prev.filter((_, j) => j !== i))}
                style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: "50%", background: "var(--red)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
              >
                <XIcon size={8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Input area ── */}
      <div style={{ padding: "8px 10px", borderTop: "1px solid var(--b1)", display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={e => addImages(e.target.files)}
        />

        {/* Textarea + controls */}
        <div style={{ display: "flex", gap: 5, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={listening ? "Listening…" : "Ask the agent… (Shift+Enter = newline)"}
            disabled={running}
            rows={3}
            style={{
              flex: 1, resize: "none",
              border: `1px solid ${listening ? "var(--green)" : "var(--b2)"}`,
              borderRadius: "var(--r2)",
              background: "var(--s2)", color: "var(--t1)",
              padding: "7px 9px", fontFamily: "var(--font-mono)", fontSize: 11,
              lineHeight: 1.5, outline: "none", transition: "border-color 0.15s",
            }}
            onFocus={e => { if (!listening) e.currentTarget.style.borderColor = "var(--amber)"; }}
            onBlur={e => { if (!listening) e.currentTarget.style.borderColor = "var(--b2)"; }}
          />

          {/* Right button column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {/* Image attach */}
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach image (or Ctrl+V to paste)"
              style={{ width: 28, height: 28, border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "transparent", color: "var(--t3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--t1)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--t3)"; }}
            >
              <Image size={12} />
            </button>

            {/* Mic */}
            <button
              onClick={toggleMic}
              title={listening ? "Stop recording" : "Dictate (Web Speech API)"}
              style={{ width: 28, height: 28, border: `1px solid ${listening ? "var(--green)" : "var(--b2)"}`, borderRadius: "var(--r2)", background: listening ? "var(--green-lo)" : "transparent", color: listening ? "var(--green)" : "var(--t3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              {listening ? <MicOff size={12} /> : <Mic size={12} />}
            </button>

            {/* Send */}
            <button
              onClick={send}
              disabled={!canSend}
              title="Send (Enter)"
              style={{ width: 28, height: 28, border: "none", borderRadius: "var(--r2)", background: canSend ? "var(--amber)" : "var(--s3)", color: canSend ? "#0a0a0a" : "var(--t4)", display: "flex", alignItems: "center", justifyContent: "center", cursor: canSend ? "pointer" : "not-allowed" }}
            >
              {running ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            </button>
          </div>
        </div>

        {/* Status bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t4)" }}>
          {listening && <span style={{ color: "var(--green)", animation: "pulse-dot 1.4s ease-in-out infinite" }}>● recording</span>}
          {pendingImages.length > 0 && <span style={{ color: "var(--amber)" }}>{pendingImages.length} image{pendingImages.length > 1 ? "s" : ""} attached</span>}
          <span style={{ marginLeft: "auto" }}>Enter to send · Shift+Enter newline · Ctrl+V paste image</span>
        </div>
      </div>
    </div>
  );
}

// ── Desktop App ──────────────────────────────────────────────────────────────

type BottomTab = "terminal" | "serial" | "ports" | "git";

// ── Context menu state ───────────────────────────────────────────────────────
interface CtxMenu { x: number; y: number; node: FileTreeNode | null; }

export function DesktopApp() {
  const [rootPath, setRootPath]       = useState<string | null>(null);
  const [files, setFiles]             = useState<FileTreeNode[]>([]);
  const [openFiles, setOpenFiles]       = useState<FileTreeNode[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [board, setBoard]             = useState<Board>(BOARDS[0]);
  const [buildOutput, setBuildOutput] = useState<string[]>([]);
  const [bottomTab, setBottomTab]     = useState<BottomTab>("terminal");
  const [serialPorts, setSerialPorts] = useState<string[]>([]);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [agentWidth, setAgentWidth]   = useState(380);
  const [bottomHeight] = useState(200);
  const [commitMsg, setCommitMsg]     = useState("");
  const [gitLog, setGitLog]           = useState<string[]>([]);
  const [gitRunning, setGitRunning]   = useState(false);
  const [shellRunning, setShellRunning] = useState(false);
  // Context menu
  const [ctxMenu, setCtxMenu]         = useState<CtxMenu | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileTreeNode | null>(null);
  const [renameValue, setRenameValue]  = useState("");
  // Auth
  const [authToken, setAuthToken]     = useState<string | null>(null);
  const [authEmail, setAuthEmail]     = useState<string | null>(null);
  const [showLogin, setShowLogin]     = useState(false);
  // Per-file Yjs docs: Record<fileId, { doc, text }>
  const yDocsRef = useRef<Record<string, { doc: Y.Doc; text: Y.Text }>>({});
  const [, forceUpdate] = useState(0);
  const activeFile  = openFiles.find(f => f.id === activeFileId) ?? null;
  const activeYText = activeFileId ? (yDocsRef.current[activeFileId]?.text ?? null) : null;
  const buildScrollRef = useRef<HTMLDivElement>(null);

  // ── Load stored auth token on mount ──
  useEffect(() => {
    getStoredToken().then(token => { if (token) setAuthToken(token); });
  }, []);

  // ── Scroll build output to bottom ──
  useEffect(() => {
    if (buildScrollRef.current)
      buildScrollRef.current.scrollTop = buildScrollRef.current.scrollHeight;
  }, [buildOutput]);

  // ── Listen to Rust shell events ──
  useEffect(() => {
    const unlistenLine = listen<string>("shell-line", ev => {
      setBuildOutput(o => [...o, ev.payload]);
      setGitLog(o => [...o, ev.payload]);
    });
    const unlistenDone = listen<number>("shell-done", ev => {
      const code = ev.payload;
      setBuildOutput(o => [...o, code === 0 ? "✓ Done (exit 0)" : `✗ Exit code ${code}`]);
      setGitLog(o => [...o, code === 0 ? "✓ Done" : `✗ Exit ${code}`]);
      setShellRunning(false);
      setGitRunning(false);
    });
    return () => { unlistenLine.then(f => f()); unlistenDone.then(f => f()); };
  }, []);

  const refreshPorts = async () => {
    try {
      const ports = await invoke<string[]>("list_serial_ports");
      setSerialPorts(ports);
    } catch { setSerialPorts([]); }
  };

  useEffect(() => { refreshPorts(); }, []);

  // ── Run shell via Rust ──
  const runShell = useCallback(async (
    program: string,
    args: string[],
    tab: BottomTab = "terminal",
    isGit = false,
  ) => {
    setBottomTab(tab);
    setShellRunning(true);
    if (isGit) { setGitRunning(true); setGitLog(o => [...o, `$ ${program} ${args.join(" ")}`]); }
    else        { setBuildOutput(o => [...o, `$ ${program} ${args.join(" ")}`]); }
    try {
      await invoke("run_shell", { program, args, cwd: rootPath ?? undefined });
    } catch (e) {
      setBuildOutput(o => [...o, `Error: ${String(e)}`]);
      setShellRunning(false);
      setGitRunning(false);
    }
  }, [rootPath]);

  // ── File operations ──
  const openFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    setRootPath(selected);
    await refreshFiles(selected);
  };

  const openFile = async (node: FileTreeNode) => {
    if (node.type !== "file" || !rootPath) return;
    // Add to tab list if not already open
    setOpenFiles(prev => prev.find(f => f.id === node.id) ? prev : [...prev, node]);
    setActiveFileId(node.id);
    // Load content only once
    if (!yDocsRef.current[node.id]) {
      try {
        const content = await readTextFile(`${rootPath}/${node.name}`);
        const doc  = new Y.Doc();
        const text = doc.getText("file");
        doc.transact(() => { text.delete(0, text.length); text.insert(0, content); });
        yDocsRef.current[node.id] = { doc, text };
        forceUpdate(n => n + 1);
      } catch (e) {
        setBuildOutput([`Error reading file: ${String(e)}`]);
      }
    }
  };

  const closeFile = (fileId: string) => {
    setOpenFiles(prev => {
      const next = prev.filter(f => f.id !== fileId);
      setActiveFileId(cur => {
        if (cur !== fileId) return cur;
        return next.length > 0 ? next[next.length - 1].id : null;
      });
      return next;
    });
    delete yDocsRef.current[fileId];
  };

  const saveFile = async () => {
    if (!activeFile || !rootPath) return;
    const yText = yDocsRef.current[activeFile.id]?.text;
    if (!yText) return;
    try {
      await writeTextFile(`${rootPath}/${activeFile.name}`, yText.toString());
      setBuildOutput(o => [...o, `Saved ${activeFile.name}`]);
    } catch (e) {
      setBuildOutput(o => [...o, `Save error: ${String(e)}`]);
    }
  };

  // ── File management ──
  const refreshFiles = async (dir?: string) => {
    const target = dir ?? rootPath;
    if (!target) return;
    try {
      const entries = await readDir(target);
      const nodes: FileTreeNode[] = entries.map(e => ({
        id: e.name ?? "", name: e.name ?? "",
        type: e.isDirectory ? "directory" : "file",
      }));
      setFiles(nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      }));
    } catch { /* ignore */ }
  };

  const newFile = async () => {
    if (!rootPath) return;
    const name = prompt("New file name:");
    if (!name?.trim()) return;
    try {
      await writeTextFile(`${rootPath}/${name.trim()}`, "");
      await refreshFiles();
    } catch (e) { setBuildOutput(o => [...o, `Error: ${String(e)}`]); }
    setCtxMenu(null);
  };

  const deleteFile = async (node: FileTreeNode) => {
    if (!rootPath) return;
    const { remove } = await import("@tauri-apps/plugin-fs");
    try {
      await remove(`${rootPath}/${node.name}`);
      closeFile(node.id);
      await refreshFiles();
    } catch (e) { setBuildOutput(o => [...o, `Delete error: ${String(e)}`]); }
    setCtxMenu(null);
  };

  const startRename = (node: FileTreeNode) => {
    setRenameTarget(node);
    setRenameValue(node.name);
    setCtxMenu(null);
  };

  const commitRename = async () => {
    if (!rootPath || !renameTarget || !renameValue.trim()) { setRenameTarget(null); return; }
    const { rename } = await import("@tauri-apps/plugin-fs");
    try {
      await rename(`${rootPath}/${renameTarget.name}`, `${rootPath}/${renameValue.trim()}`);
      closeFile(renameTarget.id);
      await refreshFiles();
    } catch (e) { setBuildOutput(o => [...o, `Rename error: ${String(e)}`]); }
    setRenameTarget(null);
  };

  // ── Build / Flash ──
  const runBuild = async () => {
    if (activeFile && rootPath) await saveFile();
    setBuildOutput(["$ pio run", "Compiling…"]);
    await runShell("pio", ["run"], "terminal");
  };

  const runFlash = async () => {
    setBuildOutput(["$ pio run --target upload", "Uploading…"]);
    await runShell("pio", ["run", "--target", "upload"], "terminal");
  };

  // ── Git ──
  const gitCmd = useCallback(async (args: string[]) => {
    if (!rootPath) { setGitLog(o => [...o, "✗ Open a folder first"]); return; }
    await runShell("git", args, "git", true);
  }, [rootPath, runShell]);

  const gitCommit = async () => {
    if (!commitMsg.trim()) return;
    await gitCmd(["add", "."]);
    await gitCmd(["commit", "-m", commitMsg]);
    setCommitMsg("");
  };

  const bottomTabStyle = (t: BottomTab): React.CSSProperties => ({
    padding: "0 14px", height: "100%", border: "none",
    borderBottom: bottomTab === t ? "2px solid var(--amber)" : "2px solid transparent",
    background: bottomTab === t ? "var(--amber-lo)" : "transparent",
    color: bottomTab === t ? "var(--amber)" : "var(--t3)",
    fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: "0.08em",
    cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--t1)", overflow: "hidden" }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", height: 38, borderBottom: "1px solid var(--b1)", background: "var(--s1)", padding: "0 12px", gap: 8, flexShrink: 0 }}>
        {/* Logo */}
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 12, letterSpacing: "0.04em", color: "var(--amber)", marginRight: 4 }}>
          <Zap size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />edgelab
        </span>
        <div style={{ width: 1, height: 16, background: "var(--b2)" }} />

        {/* Open folder */}
        <button
          onClick={openFolder}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-ui)", fontSize: 11, cursor: "pointer" }}
        >
          <FolderOpen size={12} /> Open Folder
        </button>

        {rootPath && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
            {rootPath}
          </span>
        )}

        <BoardSelector value={board.id} onChange={setBoard} />

        <div style={{ flex: 1 }} />

        {/* Save */}
        {activeFile && (
          <button onClick={saveFile} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-ui)", fontSize: 11, cursor: "pointer" }}>
            Save
          </button>
        )}

        {/* Build */}
        <button
          onClick={runBuild}
          disabled={shellRunning}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-ui)", fontSize: 11, cursor: shellRunning ? "not-allowed" : "pointer", opacity: shellRunning ? 0.5 : 1 }}
        >
          <Play size={11} style={{ color: "var(--green)" }} /> Build
        </button>

        {/* Flash */}
        <button
          onClick={runFlash}
          disabled={shellRunning}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", border: "none", borderRadius: "var(--r2)", background: shellRunning ? "var(--s3)" : "var(--amber)", color: shellRunning ? "var(--t4)" : "#0a0a0a", fontWeight: 600, fontFamily: "var(--font-ui)", fontSize: 11, cursor: shellRunning ? "not-allowed" : "pointer" }}
        >
          <Upload size={11} /> Flash
        </button>

        <div style={{ width: 1, height: 16, background: "var(--b2)" }} />

        <button onClick={() => gitCmd(["push"])} disabled={gitRunning} title="git push" style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-ui)", fontSize: 11, cursor: "pointer", opacity: gitRunning ? 0.45 : 1 }}>
          <GitBranch size={11} /> Push
        </button>
        <button onClick={() => gitCmd(["pull"])} disabled={gitRunning} title="git pull" style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "transparent", color: "var(--t2)", fontFamily: "var(--font-ui)", fontSize: 11, cursor: "pointer", opacity: gitRunning ? 0.45 : 1 }}>
          <GitMerge size={11} /> Pull
        </button>

        <div style={{ width: 1, height: 16, background: "var(--b2)" }} />

        {/* Auth button */}
        {authToken ? (
          <button
            onClick={() => { setStoredToken(null); setAuthToken(null); setAuthEmail(null); }}
            title={`Signed in as ${authEmail ?? "user"} — click to sign out`}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "transparent", color: "var(--green)", fontFamily: "var(--font-ui)", fontSize: 11, cursor: "pointer" }}
          >
            <User size={11} /> {authEmail?.split("@")[0] ?? "me"}
            <LogOut size={10} style={{ color: "var(--t4)" }} />
          </button>
        ) : (
          <button
            onClick={() => setShowLogin(true)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 9px", border: "1px solid rgba(224,160,32,0.4)", borderRadius: "var(--r2)", background: "var(--amber-lo)", color: "var(--amber)", fontFamily: "var(--font-ui)", fontSize: 11, cursor: "pointer" }}
          >
            <LogIn size={11} /> Sign In
          </button>
        )}
      </div>

      {/* Auth modal */}
      {showLogin && (
        <LoginModal
          onLogin={(token, email) => { setAuthToken(token); setAuthEmail(email); setShowLogin(false); }}
          onClose={() => setShowLogin(false)}
        />
      )}

      {/* ── Main area ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* ── File Sidebar ── */}
        <div
          style={{ width: sidebarWidth, flexShrink: 0, borderRight: "1px solid var(--b1)", display: "flex", flexDirection: "column", background: "var(--s1)", overflow: "hidden", position: "relative" }}
          onContextMenu={e => { e.preventDefault(); if (files.length > 0) setCtxMenu({ x: e.clientX, y: e.clientY, node: null }); }}
        >
          {/* Explorer header */}
          <div style={{ padding: "5px 12px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--t4)", letterSpacing: "0.1em", borderBottom: "1px solid var(--b1)", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>// Explorer</span>
            {rootPath && (
              <button onClick={newFile} title="New file" style={{ background: "transparent", border: "none", color: "var(--t4)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--amber)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--t4)"; }}>+</button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {renameTarget ? (
              /* Inline rename input */
              <div style={{ padding: "8px 12px" }}>
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenameTarget(null); }}
                  onBlur={commitRename}
                  style={{ width: "100%", background: "var(--s3)", border: "1px solid var(--amber)", borderRadius: "var(--r1)", color: "var(--t1)", fontFamily: "var(--font-mono)", fontSize: 11, padding: "3px 6px", outline: "none" }}
                />
              </div>
            ) : files.length > 0 ? (
              <div onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
                {files.map(node => (
                  <div
                    key={node.id}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, node }); }}
                    style={{ display: "contents" }}
                  >
                    {/* We render each node as a row so right-click works per-file */}
                    <div
                      onClick={() => openFile(node)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "3px 12px",
                        cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 11,
                        color: node.id === activeFileId ? "var(--t1)" : "var(--t2)",
                        background: node.id === activeFileId ? "var(--s3)" : "transparent",
                        userSelect: "none",
                      }}
                      onMouseEnter={e => { if (node.id !== activeFileId) (e.currentTarget as HTMLElement).style.background = "var(--s2)"; }}
                      onMouseLeave={e => { if (node.id !== activeFileId) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <span style={{ color: node.type === "directory" ? "var(--amber)" : "var(--t3)", fontSize: 10 }}>
                        {node.type === "directory" ? "▸" : "·"}
                      </span>
                      {node.name}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 16, textAlign: "center", color: "var(--t4)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                Open a folder to start
              </div>
            )}
          </div>

          {/* ── Context menu ── */}
          {ctxMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setCtxMenu(null)} />
              <div style={{ position: "fixed", top: ctxMenu.y, left: ctxMenu.x, zIndex: 50, background: "var(--s3)", border: "1px solid var(--b2)", borderRadius: "var(--r2)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: 160, padding: "4px 0", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                {[
                  { label: "+ New File", action: newFile },
                  ...(ctxMenu.node?.type === "file" ? [
                    { label: "✎ Rename", action: () => { startRename(ctxMenu.node!); } },
                    { label: "✕ Delete", action: () => deleteFile(ctxMenu.node!) },
                  ] : []),
                ].map(item => (
                  <div key={item.label} onClick={item.action}
                    style={{ padding: "5px 14px", cursor: "pointer", color: item.label.startsWith("✕") ? "var(--red)" : "var(--t2)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--b2)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >{item.label}</div>
                ))}
              </div>
            </>
          )}
          {/* Sidebar resize handle */}
          <div
            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, cursor: "col-resize", zIndex: 10 }}
            onMouseDown={e => {
              const start = e.clientX; const startW = sidebarWidth;
              const move = (ev: MouseEvent) => setSidebarWidth(Math.max(140, Math.min(350, startW + ev.clientX - start)));
              const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
          />
        </div>
        </div>

        {/* ── Editor + bottom ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* ── Multi-file tab bar ── */}
          <div style={{ height: 32, display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0, overflowX: "auto" }}>
            {openFiles.length === 0 ? (
              <div style={{ padding: "0 14px", display: "flex", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>
                No file open
              </div>
            ) : openFiles.map(file => {
              const active = file.id === activeFileId;
              return (
                <div
                  key={file.id}
                  onClick={() => setActiveFileId(file.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "0 10px 0 14px", cursor: "pointer",
                    whiteSpace: "nowrap", flexShrink: 0,
                    fontFamily: "var(--font-mono)", fontSize: 11,
                    color: active ? "var(--t1)" : "var(--t3)",
                    borderBottom: `2px solid ${active ? "var(--amber)" : "transparent"}`,
                    background: active ? "var(--bg)" : "transparent",
                    borderRight: "1px solid var(--b1)",
                    userSelect: "none",
                  }}
                >
                  <ChevronRight size={9} style={{ color: active ? "var(--amber)" : "var(--t4)", flexShrink: 0 }} />
                  <span>{file.name}</span>
                  <span
                    onClick={e => { e.stopPropagation(); closeFile(file.id); }}
                    style={{ marginLeft: 6, color: "var(--t4)", fontSize: 15, lineHeight: 1, cursor: "pointer", padding: "0 1px" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--t1)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--t4)"; }}
                  >×</span>
                </div>
              );
            })}
          </div>

          {/* CodeMirror editor */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
            <div style={{ position: "absolute", inset: 0 }}>
              {activeFile && activeYText
                ? <CodeEditor key={activeFileId!} filename={activeFile.name} yText={activeYText} />
                : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>
                    Open a folder · click a file to edit
                  </div>
              }
            </div>
          </div>

          {/* Bottom panel */}
          <div style={{ height: bottomHeight, borderTop: "1px solid var(--b1)", flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
            {/* Tab row */}
            <div style={{ height: 30, display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0 }}>
              <button style={bottomTabStyle("terminal")} onClick={() => setBottomTab("terminal")}>TERMINAL</button>
              <button style={bottomTabStyle("serial")}   onClick={() => setBottomTab("serial")}>SERIAL</button>
              <button style={bottomTabStyle("ports")}    onClick={() => { setBottomTab("ports"); refreshPorts(); }}>PORTS</button>
              <button style={bottomTabStyle("git")}      onClick={() => { setBottomTab("git"); gitCmd(["status", "--short"]); }}>GIT</button>
              {shellRunning && (
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "0 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--amber)" }}>
                  <Loader2 size={10} className="animate-spin" /> running…
                </span>
              )}
            </div>

            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              {/* Terminal */}
              <div ref={buildScrollRef} style={{ position: "absolute", inset: 0, display: bottomTab === "terminal" ? "flex" : "none", flexDirection: "column", overflowY: "auto", padding: "8px 12px", gap: 1 }}>
                {buildOutput.length === 0
                  ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>// Build output will appear here</span>
                  : buildOutput.map((l, i) => (
                    <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6, color: l.startsWith("✓") ? "var(--green)" : l.startsWith("✗") || l.startsWith("Error") ? "var(--red)" : "var(--t2)" }}>
                      {l}
                    </div>
                  ))}
              </div>

              {/* Serial monitor */}
              <div style={{ position: "absolute", inset: 0, display: bottomTab === "serial" ? "flex" : "none", flexDirection: "column" }}>
                <SerialMonitor />
              </div>

              {/* Git panel */}
              <div style={{ position: "absolute", inset: 0, display: bottomTab === "git" ? "flex" : "none", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid var(--b1)", flexShrink: 0, background: "var(--s1)" }}>
                  {[
                    { label: "+ Stage All", args: ["add", "."] },
                    { label: "↻ Status",    args: ["status", "--short"] },
                    { label: "↑ Push",      args: ["push"] },
                    { label: "↓ Pull",      args: ["pull"] },
                  ].map(({ label, args }) => (
                    <button key={label} onClick={() => gitCmd(args)} disabled={gitRunning}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", border: "1px solid var(--b2)", borderRadius: "var(--r1)", background: "transparent", color: label.startsWith("+") ? "var(--amber)" : "var(--t3)", fontSize: 10, cursor: "pointer", fontFamily: "var(--font-mono)", opacity: gitRunning ? 0.45 : 1 }}>
                      {label}
                    </button>
                  ))}
                  <button onClick={() => setGitLog([])} style={{ marginLeft: "auto", padding: "3px 8px", border: "1px solid var(--b2)", borderRadius: "var(--r1)", background: "transparent", color: "var(--t4)", fontSize: 10, cursor: "pointer", fontFamily: "var(--font-mono)" }}>
                    Clear
                  </button>
                </div>
                {/* Commit row */}
                <div style={{ display: "flex", gap: 6, padding: "6px 10px", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
                  <input value={commitMsg} onChange={e => setCommitMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && gitCommit()}
                    placeholder="Commit message…"
                    style={{ flex: 1, height: 26, border: "1px solid var(--b2)", borderRadius: "var(--r2)", background: "var(--s1)", color: "var(--t1)", padding: "0 8px", fontFamily: "var(--font-mono)", fontSize: 11, outline: "none" }}
                  />
                  <button onClick={gitCommit} disabled={!commitMsg.trim() || gitRunning}
                    style={{ padding: "0 10px", height: 26, border: "none", borderRadius: "var(--r2)", background: commitMsg.trim() ? "var(--amber)" : "var(--b2)", color: commitMsg.trim() ? "#0a0a0a" : "var(--t4)", fontSize: 11, fontWeight: 600, cursor: commitMsg.trim() ? "pointer" : "default", fontFamily: "var(--font-mono)" }}>
                    ✓ Commit
                  </button>
                </div>
                {/* Log */}
                <div style={{ flex: 1, overflowY: "auto", padding: "6px 12px" }}>
                  {gitLog.length === 0
                    ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>// Git output will appear here</span>
                    : gitLog.map((l, i) => (
                      <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6, color: l.startsWith("✓") ? "var(--green)" : l.startsWith("✗") ? "var(--red)" : l.startsWith("$") ? "var(--amber)" : "var(--t2)" }}>
                        {l}
                      </div>
                    ))}
                </div>
              </div>

              {/* Ports */}
              <div style={{ position: "absolute", inset: 0, display: bottomTab === "ports" ? "block" : "none", overflowY: "auto", padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--t4)", letterSpacing: "0.08em" }}>// SERIAL PORTS</span>
                  <button onClick={refreshPorts} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--amber)", border: "1px solid rgba(224,160,32,0.3)", background: "var(--amber-lo)", borderRadius: "var(--r1)", padding: "2px 8px", cursor: "pointer" }}>
                    Refresh
                  </button>
                </div>
                {serialPorts.length === 0
                  ? <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--t4)" }}>No serial ports detected</div>
                  : serialPorts.map(p => (
                    <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--b1)" }}>
                      <Wifi size={11} style={{ color: "var(--green)" }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--t2)" }}>{p}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Agent Chat Panel ── */}
        <div style={{ width: agentWidth, flexShrink: 0, position: "relative", display: "flex" }}>
          {/* Resize handle */}
          <div
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, cursor: "col-resize", zIndex: 10 }}
            onMouseDown={e => {
              const start = e.clientX; const startW = agentWidth;
              const move = (ev: MouseEvent) => setAgentWidth(Math.max(240, Math.min(760, startW - (ev.clientX - start))));
              const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <AgentChatPanel projectPath={rootPath} authToken={authToken} />
          </div>
        </div>
      </div>
    </div>
  );
}
