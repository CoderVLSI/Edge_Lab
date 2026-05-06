import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getProvider, getAvailableProviders } from "../lib/providers/index";

export const aiRouter = new Hono<{ Variables: { userId: string } }>();

/** Inject any API keys from request headers into process env temporarily for this request.
 *  Keys sent as X-ANTHROPIC_API_KEY, X-OPENAI_API_KEY, etc. override missing env vars. */
function applyHeaderKeys(c: { req: { header: (h: string) => string | undefined } }) {
  const ENV_HEADERS = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "OPENROUTER_API_KEY",
    "OLLAMA_BASE_URL",
  ] as const;

  const original: Partial<Record<string, string>> = {};
  for (const key of ENV_HEADERS) {
    const val = c.req.header(`X-${key}`);
    if (val && !process.env[key]) {
      original[key] = process.env[key];
      process.env[key] = val;
    }
  }
  return () => {
    // Restore
    for (const [key, val] of Object.entries(original)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  };
}

/** List all providers and their models (available flag shows if API key is set) */
aiRouter.get("/providers", (c) => {
  const restore = applyHeaderKeys(c);
  const providers = getAvailableProviders();
  restore();
  return c.json(providers);
});

aiRouter.post(
  "/chat",
  zValidator(
    "json",
    z.object({
      provider: z.string().default("anthropic"),
      model: z.string().default("claude-sonnet-4-6"),
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      fileContext: z.string().optional(),
      boardType: z.string().optional(),
    })
  ),
  async (c) => {
    const restore = applyHeaderKeys(c);
    const { provider: providerId, model, messages, fileContext, boardType } = c.req.valid("json");

    const provider = getProvider(providerId);
    if (!provider) {
      restore();
      return c.json({ error: `Unknown provider: ${providerId}` }, 400);
    }
    if (!provider.isAvailable()) {
      restore();
      return c.json({
        error: `No API key for "${provider.name}". Click the ⚙ gear icon to add your key.`,
      }, 503);
    }

    const systemPrompt = [
      "You are an expert embedded systems engineer and IoT developer.",
      boardType ? `The user is working with: ${boardType}.` : "",
      "Help with code, debugging, hardware questions, and PlatformIO configuration.",
      "Be concise and include working code examples when helpful.",
      fileContext ? `\nCurrent file context:\n\`\`\`\n${fileContext.slice(0, 4000)}\n\`\`\`` : "",
    ].filter(Boolean).join(" ");

    const body = new ReadableStream({
      async start(controller) {
        const enqueue = (text: string) =>
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text })}\n\n`));

        try {
          for await (const chunk of provider.stream({ messages, systemPrompt, model })) {
            enqueue(chunk);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          enqueue(`\n\n⚠️ ${msg}`);
        } finally {
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
          restore();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
);
