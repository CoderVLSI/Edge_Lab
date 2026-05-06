"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, ChevronDown, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ModelInfo {
  id: string;
  name: string;
  notes?: string;
}

interface ProviderConfig {
  id: string;
  name: string;
  available: boolean;
  models: ModelInfo[];
}

interface AiChatProps {
  projectId: string;
  boardType?: string;
  fileContext?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "text-orange-400",
  openai: "text-green-400",
  gemini: "text-blue-400",
  openrouter: "text-purple-400",
  ollama: "text-cyan-400",
};

const PROVIDER_ICONS: Record<string, string> = {
  anthropic: "🟠",
  openai: "🟢",
  gemini: "🔵",
  openrouter: "🟣",
  ollama: "🐋",
};

function ProviderBadge({ providerId }: { providerId: string }) {
  return (
    <span className={`text-xs font-mono ${PROVIDER_COLORS[providerId] ?? "text-zinc-400"}`}>
      {PROVIDER_ICONS[providerId] ?? "🤖"}
    </span>
  );
}

export function AiChat({ projectId: _projectId, boardType, fileContext }: AiChatProps) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>(() =>
    typeof localStorage !== "undefined" ? (localStorage.getItem("ai-provider") ?? "anthropic") : "anthropic"
  );
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    typeof localStorage !== "undefined" ? (localStorage.getItem("ai-model") ?? "claude-sonnet-4-6") : "claude-sonnet-4-6"
  );
  const [showPicker, setShowPicker] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hi! I'm your embedded systems assistant. I can help you with ${boardType ?? "your board"} code, debugging, and hardware questions. Select a provider above, then ask away!`,
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch available providers from backend
  useEffect(() => {
    fetch(`${API_URL}/api/ai/providers`)
      .then((r) => r.json())
      .then((data: ProviderConfig[]) => {
        setProviders(data);
        // Auto-select first available provider if current isn't available
        const current = data.find((p) => p.id === selectedProvider);
        if (!current?.available) {
          const first = data.find((p) => p.available);
          if (first) {
            setSelectedProvider(first.id);
            setSelectedModel(first.models[0]?.id ?? "");
          }
        }
      })
      .catch(() => {
        // Backend offline — use defaults
        setProviders([
          { id: "anthropic", name: "Anthropic", available: true, models: [{ id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }] },
          { id: "openai", name: "OpenAI", available: false, models: [{ id: "gpt-4o", name: "GPT-4o" }] },
          { id: "gemini", name: "Google Gemini", available: false, models: [{ id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" }] },
          { id: "openrouter", name: "OpenRouter", available: false, models: [{ id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6" }] },
          { id: "ollama", name: "Ollama (Local)", available: true, models: [{ id: "llama3.2", name: "Llama 3.2" }] },
        ]);
      })
      .finally(() => setLoadingProviders(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectProvider = (p: ProviderConfig) => {
    setSelectedProvider(p.id);
    const firstModel = p.models[0]?.id ?? "";
    setSelectedModel(firstModel);
    localStorage.setItem("ai-provider", p.id);
    localStorage.setItem("ai-model", firstModel);
    setShowPicker(false);
  };

  const selectModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    localStorage.setItem("ai-model", modelId);
  }, []);

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const currentModel = currentProvider?.models.find((m) => m.id === selectedModel);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          messages: newMessages,
          boardType,
          fileContext,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const { text: t } = JSON.parse(data);
            setMessages((msgs) => {
              const updated = [...msgs];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: updated[updated.length - 1].content + t,
              };
              return updated;
            });
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setMessages((msgs) => {
        const updated = [...msgs];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `⚠️ ${err instanceof Error ? err.message : "Request failed"}. Check the backend is running and your API key is set.`,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header with provider picker */}
      <div className="border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <Bot className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="text-xs font-medium text-zinc-300">AI Assistant</span>
          {boardType && <span className="ml-auto text-xs text-zinc-600 truncate">{boardType}</span>}
        </div>

        {/* Provider + model selector */}
        <div className="flex items-center gap-1 px-2 pb-2" ref={pickerRef}>
          {/* Provider button */}
          <div className="relative flex-1">
            <button
              onClick={() => setShowPicker((v) => !v)}
              disabled={loadingProviders}
              className="w-full flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs hover:border-zinc-600 disabled:opacity-50"
            >
              {loadingProviders ? (
                <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
              ) : (
                <ProviderBadge providerId={selectedProvider} />
              )}
              <span className="flex-1 text-left text-zinc-300 truncate">
                {currentProvider?.name ?? selectedProvider}
              </span>
              <ChevronDown className="h-3 w-3 text-zinc-500 shrink-0" />
            </button>

            {showPicker && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => p.available && selectProvider(p)}
                    disabled={!p.available}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                      p.id === selectedProvider
                        ? "bg-zinc-800 text-white"
                        : p.available
                        ? "text-zinc-300 hover:bg-zinc-800"
                        : "text-zinc-600 cursor-not-allowed"
                    }`}
                  >
                    <ProviderBadge providerId={p.id} />
                    <span className="flex-1">{p.name}</span>
                    {!p.available && (
                      <span className="text-zinc-600 text-[10px]">no key</span>
                    )}
                    {p.id === selectedProvider && (
                      <span className="text-blue-400 text-[10px]">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Model selector */}
          <select
            value={selectedModel}
            onChange={(e) => selectModel(e.target.value)}
            disabled={!currentProvider}
            className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 max-w-[130px]"
          >
            {(currentProvider?.models ?? []).map((m) => (
              <option key={m.id} value={m.id} title={m.notes}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Current selection indicator */}
        {currentModel && (
          <div className="px-3 pb-1.5 flex items-center gap-1">
            <ProviderBadge providerId={selectedProvider} />
            <span className="text-[10px] text-zinc-600">
              {currentModel.name}
              {currentModel.notes ? ` · ${currentModel.notes}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div
              className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-xs ${
                msg.role === "assistant" ? "bg-blue-500/20" : "bg-zinc-700"
              }`}
            >
              {msg.role === "assistant" ? (
                <ProviderBadge providerId={selectedProvider} />
              ) : (
                <User className="h-3.5 w-3.5 text-zinc-300" />
              )}
            </div>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                msg.role === "assistant"
                  ? "bg-zinc-900 text-zinc-200 border border-zinc-800"
                  : "bg-blue-600 text-white"
              }`}
            >
              {msg.content || (streaming && i === messages.length - 1 ? "▋" : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex gap-2 border-t border-zinc-800 p-3 shrink-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask ${currentProvider?.name ?? "AI"}…`}
          disabled={streaming}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-lg bg-blue-600 p-1.5 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </form>
    </div>
  );
}
