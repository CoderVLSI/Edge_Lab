import OpenAI from "openai";
import type { AIProvider, ChatRequest, ModelInfo } from "./types";

// Static popular models; the /api/ai/providers endpoint fetches the live list
const DEFAULT_MODELS: ModelInfo[] = [
  { id: "llama3.2", name: "Llama 3.2 (3B)", notes: "Fast, local" },
  { id: "llama3.1:8b", name: "Llama 3.1 (8B)", notes: "Balanced" },
  { id: "codellama:13b", name: "Code Llama (13B)", notes: "Code-optimized" },
  { id: "deepseek-coder-v2", name: "DeepSeek Coder v2", notes: "Excellent for code" },
  { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B", notes: "Strong coder" },
  { id: "mistral:7b", name: "Mistral 7B", notes: "General purpose" },
  { id: "phi4", name: "Phi-4 (14B)", notes: "Microsoft, strong reasoning" },
];

async function fetchOllamaModels(baseUrl: string): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return DEFAULT_MODELS;
    const { models } = await res.json() as { models: Array<{ name: string; details?: { parameter_size?: string } }> };
    return models.map((m) => ({
      id: m.name,
      name: m.name,
      notes: m.details?.parameter_size ?? "local",
    }));
  } catch {
    return DEFAULT_MODELS;
  }
}

export function createOllamaProvider(): AIProvider {
  const baseURL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

  return {
    id: "ollama",
    name: "Ollama (Local)",
    models: DEFAULT_MODELS,

    isAvailable() {
      return true; // Always listed; connection errors surface at runtime
    },

    async *stream({ messages, systemPrompt, model, maxTokens = 2048 }: ChatRequest) {
      // Fetch live model list lazily
      this.models = await fetchOllamaModels(baseURL);

      const client = new OpenAI({
        apiKey: "ollama", // Ollama doesn't validate API keys
        baseURL: `${baseURL}/v1`,
      });

      const stream = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ],
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      }
    },
  };
}
