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
  | { type: "error"; message: string }
  | { type: "done" };

const MAX_ITERATIONS = 15;

/** Exponential-backoff retry for transient API errors (429, 500, 502, 503). */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 800
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || attempt === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** Friendly error message from an API error object. */
function friendlyError(err: unknown, provider: string): string {
  const e = err as { status?: number; message?: string; error?: { message?: string } };
  const msg = e?.error?.message ?? e?.message ?? String(err);
  if (e?.status === 401) return `❌ Invalid ${provider} API key. Check your key in Settings.`;
  if (e?.status === 403) return `❌ ${provider} API key doesn't have permission for this model.`;
  if (e?.status === 429) return `❌ ${provider} rate limit hit. Try again in a moment.`;
  if (e?.status === 529 || e?.status === 503) return `❌ ${provider} is overloaded. Try again shortly.`;
  return `❌ ${provider} error: ${msg}`;
}

// ── Anthropic agent loop ─────────────────────────────────────────────────────
export async function* anthropicAgentLoop(
  messages: ChatMessage[],
  systemPrompt: string,
  model: string,
  projectId: string,
  apiKey?: string
): AsyncGenerator<AgentEvent> {
  const resolvedKey = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!resolvedKey) {
    yield { type: "error", message: "❌ No Anthropic API key. Set ANTHROPIC_API_KEY in .env or paste it in Settings." };
    yield { type: "done" };
    return;
  }
  const client = new Anthropic({ apiKey: resolvedKey });

  // Convert to Anthropic message format (with optional vision)
  let history: Anthropic.MessageParam[] = messages.map(toAnthropicMsg);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: Anthropic.Message;
    try {
      response = await withRetry(() => client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOL_DEFS as Anthropic.Tool[],
        messages: history,
      }));
    } catch (err) {
      yield { type: "error", message: friendlyError(err, "Anthropic") };
      yield { type: "done" };
      return;
    }

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

  if (!apiKey) {
    yield { type: "error", message: "❌ No OpenAI API key. Paste it in Settings → OpenAI Key." };
    yield { type: "done" };
    return;
  }

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response: OpenAI.Chat.ChatCompletion;
    try {
      response = await withRetry(() => client.chat.completions.create({
        model,
        tools,
        tool_choice: "auto",
        messages: history,
      }));
    } catch (err) {
      yield { type: "error", message: friendlyError(err, "OpenAI") };
      yield { type: "done" };
      return;
    }

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
