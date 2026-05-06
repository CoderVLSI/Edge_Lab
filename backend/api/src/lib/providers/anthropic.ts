import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, ChatRequest, ModelInfo } from "./types";

const MODELS: ModelInfo[] = [
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", contextWindow: 200000, notes: "Recommended" },
  { id: "claude-opus-4-7", name: "Claude Opus 4.7", contextWindow: 200000, notes: "Most capable" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", contextWindow: 200000, notes: "Fastest" },
];

export const anthropicProvider: AIProvider = {
  id: "anthropic",
  name: "Anthropic",
  models: MODELS,

  isAvailable() {
    return !!process.env.ANTHROPIC_API_KEY;
  },

  async *stream({ messages, systemPrompt, model, maxTokens = 2048 }: ChatRequest) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        yield chunk.delta.text;
      }
    }
  },
};
