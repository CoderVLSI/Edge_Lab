import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";
import { geminiProvider } from "./gemini";
import { openrouterProvider } from "./openrouter";
import { createOllamaProvider } from "./ollama";
import type { AIProvider } from "./types";

export type { AIProvider, ChatRequest, ChatMessage, ModelInfo, ProviderConfig } from "./types";

const ollamaProvider = createOllamaProvider();

export const PROVIDERS: AIProvider[] = [
  anthropicProvider,
  openaiProvider,
  geminiProvider,
  openrouterProvider,
  ollamaProvider,
];

export function getProvider(id: string): AIProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function getAvailableProviders() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    available: p.isAvailable(),
    models: p.models,
  }));
}
