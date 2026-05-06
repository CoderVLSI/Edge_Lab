import OpenAI from "openai";
import type { AIProvider, ChatRequest, ModelInfo } from "./types";

const MODELS: ModelInfo[] = [
  { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", notes: "Via OpenRouter" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", notes: "Via OpenRouter" },
  { id: "openai/gpt-4o", name: "GPT-4o", notes: "Via OpenRouter" },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", notes: "Free tier available" },
  { id: "deepseek/deepseek-r2", name: "DeepSeek R2", notes: "Cost-efficient" },
  { id: "mistralai/mistral-small-3.2-24b", name: "Mistral Small 3.2", notes: "Fast & cheap" },
  { id: "qwen/qwen3-235b-a22b", name: "Qwen3 235B", notes: "Large MoE" },
];

export const openrouterProvider: AIProvider = {
  id: "openrouter",
  name: "OpenRouter",
  models: MODELS,

  isAvailable() {
    return !!process.env.OPENROUTER_API_KEY;
  },

  async *stream({ messages, systemPrompt, model, maxTokens = 2048 }: ChatRequest) {
    const client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.WEB_URL ?? "http://localhost:3000",
        "X-Title": "Edge Lab IDE",
      },
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
