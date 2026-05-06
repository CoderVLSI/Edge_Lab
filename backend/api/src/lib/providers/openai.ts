import OpenAI from "openai";
import type { AIProvider, ChatRequest, ModelInfo } from "./types";

const MODELS: ModelInfo[] = [
  { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, notes: "Recommended" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, notes: "Fastest & cheapest" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", contextWindow: 128000 },
  { id: "o3-mini", name: "o3-mini", contextWindow: 200000, notes: "Reasoning model" },
];

export const openaiProvider: AIProvider = {
  id: "openai",
  name: "OpenAI",
  models: MODELS,

  isAvailable() {
    return !!process.env.OPENAI_API_KEY;
  },

  async *stream({ messages, systemPrompt, model, maxTokens = 2048 }: ChatRequest) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
