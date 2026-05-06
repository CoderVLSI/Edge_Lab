"use client";

import React, { useState, useEffect } from "react";
import { Settings, X, Eye, EyeOff, CheckCircle2, ExternalLink } from "lucide-react";

interface KeyField {
  id: string;
  label: string;
  placeholder: string;
  link: string;
  linkLabel: string;
  envVar: string;
}

const KEY_FIELDS: KeyField[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    placeholder: "sk-ant-...",
    link: "https://console.anthropic.com/",
    linkLabel: "Get key →",
    envVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai",
    label: "OpenAI (GPT-4o)",
    placeholder: "sk-...",
    link: "https://platform.openai.com/api-keys",
    linkLabel: "Get key →",
    envVar: "OPENAI_API_KEY",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    placeholder: "AIza...",
    link: "https://aistudio.google.com/app/apikey",
    linkLabel: "Get key →",
    envVar: "GEMINI_API_KEY",
  },
  {
    id: "openrouter",
    label: "OpenRouter (300+ models)",
    placeholder: "sk-or-...",
    link: "https://openrouter.ai/keys",
    linkLabel: "Get key →",
    envVar: "OPENROUTER_API_KEY",
  },
  {
    id: "ollama",
    label: "Ollama Base URL (local)",
    placeholder: "http://localhost:11434",
    link: "https://ollama.ai",
    linkLabel: "Install Ollama →",
    envVar: "OLLAMA_BASE_URL",
  },
];

export function getStoredKey(provider: string): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(`edge-lab-key-${provider}`) ?? "";
}

export function getApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const f of KEY_FIELDS) {
    const val = getStoredKey(f.id);
    if (val) headers[`X-${f.envVar}`] = val;
  }
  return headers;
}

function KeyRow({ field }: { field: KeyField }) {
  const [value, setValue] = useState(() => getStoredKey(field.id));
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  function save() {
    if (value.trim()) {
      localStorage.setItem(`edge-lab-key-${field.id}`, value.trim());
    } else {
      localStorage.removeItem(`edge-lab-key-${field.id}`);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-300">{field.label}</label>
        <a
          href={field.link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          {field.linkLabel} <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder={field.placeholder}
            className="w-full rounded bg-zinc-900 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 pr-8"
          />
          <button
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <button
          onClick={save}
          className={`flex items-center gap-1 rounded px-3 py-1.5 text-xs transition-all ${
            saved
              ? "bg-green-700 text-green-100"
              : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
          }`}
        >
          {saved ? <><CheckCircle2 className="h-3 w-3" /> Saved</> : "Save"}
        </button>
      </div>
    </div>
  );
}

export function SettingsModal() {
  const [open, setOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Settings — API Keys"
        className="rounded p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
      >
        <Settings className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">API Keys</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Stored locally in your browser. Never sent to our servers.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Key fields */}
            <div className="px-5 py-4 space-y-4">
              {KEY_FIELDS.map((f) => (
                <KeyRow key={f.id} field={f} />
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-800 px-5 py-3">
              <p className="text-[10px] text-zinc-600">
                Keys are saved in localStorage and sent directly to AI providers via the backend.
                You only need one key to use the AI Agent.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
