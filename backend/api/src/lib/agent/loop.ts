/**
 * Agentic loop: send messages → get tool calls → execute → repeat until final text.
 * Supports Anthropic (native tool use) and OpenAI (function calling).
 * Streams events via an async generator so the HTTP handler can SSE them out.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { TOOL_DEFS, executeTool } from "./tools";
import type { ChatMessage, ImagePart } from "../providers/types";

/** Convert a ChatMessage to Anthropic MessageParam, supporting vision */
function toAnthropicMsg(m: ChatMessage): Anthropic.MessageParam {
  if (m.role === "assistant" || !m.images?.length) {
    return { role: m.role, content: m.content };
  }
  // User message with images — build multi-part content
  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: m.content },
    ...m.images.map((img): Anthropic.ImageBlockParam => ({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    })),
  ];
  return { role: "user", content };
}

/** Convert ChatMessage images to OpenAI vision content parts */
function toOpenAIMsg(m: ChatMessage): OpenAI.Chat.ChatCompletionMessageParam {
  if (m.role === "assistant" || !m.images?.length) {
    return { role: m.role as "user" | "assistant", content: m.content };
  }
  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text: m.content },
    ...m.images.map((img): OpenAI.Chat.ChatCompletionContentPartImage => ({
      type: "image_url",
      image_url: { url: `data:${img.mediaType};base64,${img.data}` },
    })),
  ];
  return { role: "user", content };
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; id: string; name: string; input: Record<string, string> }
  | { type: "tool_result"; id: string; name: string; content: string; isError: boolean }
  | { type: "done" };

const MAX_ITERATIONS = 15;

// ── Anthropic agent loop ─────────────────────────────────────────────────────
export async function* anthropicAgentLoop(
  messages: ChatMessage[],
  systemPrompt: string,
  model: string,
  projectId: string,
  apiKey?: string
): AsyncGenerator<AgentEvent> {
  const client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });

  // Convert to Anthropic message format (with optional vision)
  let history: Anthropic.MessageParam[] = messages.map(toAnthropicMsg);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOL_DEFS as Anthropic.Tool[],
      messages: history,
    });

    // Collect text and tool_use blocks from this response
    const assistantContent: Anthropic.ContentBlock[] = [];
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      assistantContent.push(block);

      if (block.type === "text") {
        yield { type: "text", text: block.text };
      }

      if (block.type === "tool_use") {
        const input = block.input as Record<string, string>;
        yield { type: "tool_start", id: block.id, name: block.name, input };

        const result = await executeTool(block.name, input, projectId);
        yield { type: "tool_result", id: block.id, name: block.name, content: result.content, isError: !!result.isError };

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.content,
        });
      }
    }

    // Add assistant turn to history
    history.push({ role: "assistant", content: assistantContent });

    // If there were tool calls, add results and continue loop
    if (toolResults.length > 0) {
      history.push({ role: "user", content: toolResults });
    }

    // Stop if no more tool calls
    if (response.stop_reason === "end_turn" || toolResults.length === 0) break;
  }

  yield { type: "done" };
}

// ── OpenAI agent loop ────────────────────────────────────────────────────────
export async function* openaiAgentLoop(
  messages: ChatMessage[],
  systemPrompt: string,
  model: string,
  projectId: string,
  apiKey: string,
  baseURL?: string,
  extraHeaders?: Record<string, string>
): AsyncGenerator<AgentEvent> {
  const client = new OpenAI({ apiKey, baseURL, defaultHeaders: extraHeaders });

  // Convert TOOL_DEFS to OpenAI function format
  const tools: OpenAI.Chat.ChatCompletionTool[] = TOOL_DEFS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  let history: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map(toOpenAIMsg),
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.chat.completions.create({
      model,
      tools,
      tool_choice: "auto",
      messages: history,
    });

    const msg = response.choices[0]?.message;
    if (!msg) break;

    history.push(msg);

    if (msg.content) {
      yield { type: "text", text: msg.content };
    }

    if (!msg.tool_calls?.length) break;

    const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

    for (const call of msg.tool_calls) {
      const input = JSON.parse(call.function.arguments || "{}") as Record<string, string>;
      yield { type: "tool_start", id: call.id, name: call.function.name, input };

      const result = await executeTool(call.function.name, input, projectId);
      yield { type: "tool_result", id: call.id, name: call.function.name, content: result.content, isError: !!result.isError };

      toolResults.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.content,
      });
    }

    history.push(...toolResults);
  }

  yield { type: "done" };
}
