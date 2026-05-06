import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider, ChatRequest, ModelInfo } from "./types";

const MODELS: ModelInfo[] = [
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1000000, notes: "Recommended" },
  { id: "gemini-2.5-pro-preview-05-06", name: "Gemini 2.5 Pro", contextWindow: 1000000, notes: "Most capable" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", contextWindow: 1000000, notes: "Fast" },
];

export const geminiProvider: AIProvider = {
  id: "gemini",
  name: "Google Gemini",
  models: MODELS,

  isAvailable() {
    return !!process.env.GEMINI_API_KEY;
  },

  async *stream({ messages, systemPrompt, model }: ChatRequest) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const geminiModel = genAI.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
    });

    // Convert to Gemini history format (all but last message)
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1].content;
    const chat = geminiModel.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  },
};
