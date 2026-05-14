import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { anthropicAgentLoop, openaiAgentLoop, type AgentEvent } from "../lib/agent/loop";
import { TOOL_DEFS } from "../lib/agent/tools";

export const agentRouter = new Hono<{ Variables: { userId: string } }>();

// ── Tool sets per chat mode ──────────────────────────────────────────────────
const PLAN_TOOLS = new Set([
  "web_search", "web_fetch", "todo", "read_file", "write_file",
  "list_files", "search_files", "search_codebase",
]);

// ── System prompts per chat mode ─────────────────────────────────────────────
function askSystemPrompt(boardType?: string) {
  return `You are an expert embedded systems engineer and educator inside Edge Lab IDE.
Answer questions clearly, explain concepts, debug ideas, and give practical guidance.
Use code blocks for examples. Keep answers focused and complete.
${boardType ? `The user is working with: ${boardType}.` : ""}
You are in ASK mode — conversational only, no tools.`.trim();
}

function planSystemPrompt(boardType?: string, fileContext?: string) {
  const fileCtx = fileContext ? `\nCurrent project file:\n\`\`\`\n${fileContext.slice(0, 2000)}\n\`\`\`` : "";
  return `You are an expert embedded systems architect inside Edge Lab IDE.
You are in PLAN mode — research and design a clear, actionable plan.
${boardType ? `Target hardware: ${boardType}.` : ""}

Workflow:
1. Use web_search + web_fetch to research components, datasheets, libraries
2. Use list_files + read_file to understand existing project structure
3. Use todo to build a structured step-by-step plan
4. Optionally write_file a PLAN.md with the full plan

Return a clean plan with: overview, components needed, wiring/pinout, phases, and implementation steps.
Do NOT write production code or run builds — plan and research only.${fileCtx}`.trim();
}

const SYSTEM_PROMPT = (boardType?: string, fileContext?: string, mode?: string) => {
  const base = `You are an expert embedded systems engineer AI agent built into the Edge Lab IDE.
You can READ files, WRITE code, EDIT files, SEARCH the codebase, RUN bash commands,
FLASH firmware to boards, READ serial output, SEND serial commands, and check GIT status.
You can also SPAWN specialist sub-agents: web researcher, serial debugger, PCB designer, code engineer.
${boardType ? `The user is developing for: ${boardType}.` : ""}

Workflow for verify-after-flash:
1. read_file the source to understand the code
2. flash_board to compile and upload
3. read_serial (5-10s) to capture live board output
4. Compare expected vs actual output — fix code if needed and repeat

Always read a file before editing it. Make targeted edits with edit_file when possible.
After writing code, run the build to verify it compiles. Be proactive.`;

  const schematicCtx = `
You are currently in SCHEMATICS mode. The schematic is in schematic.kicad_sch (KiCad 7 S-expression format).
KiCad S-expression files are plain text — you can read_file, edit them with edit_file or write_file, and the viewer will auto-refresh.
To add a component: use the (symbol ...) syntax inside lib_symbols and add a (symbol_instance ...) in the schematic body.
Use kicad_export_netlist to extract the netlist, kicad_drc to check the design (requires KiCad CLI installed).
When writing KiCad S-expressions, be precise with parentheses — malformed files won't render.`;

  const boardCtx = `
You are currently in BOARD mode. The PCB layout is in board.kicad_pcb (KiCad 7 S-expression format).
KiCad PCB files are plain text — you can read_file, edit them with edit_file or write_file, and the viewer will auto-refresh.
Use kicad_drc to run design rule checks, kicad_export_svg to export layers for inspection.
Component footprints follow (footprint "LibName:FootprintName" ...) syntax.
Traces use (segment (start X Y) (end X Y) (width W) (layer "F.Cu") (net N)) syntax.`;

  const modeCtx = mode === "schematics" ? schematicCtx : mode === "board" ? boardCtx : "";
  const fileCtx = fileContext ? `\nCurrently open file:\n\`\`\`\n${fileContext.slice(0, 3000)}\n\`\`\`` : "";

  return [base, modeCtx, fileCtx].filter(Boolean).join("\n").trim();
};

/** Resolve an API key — env var takes priority, then request header fallback. */
function resolveKey(envKey: string | undefined, headerKey: string | undefined): string | undefined {
  return envKey || headerKey || undefined;
}

agentRouter.post(
  "/run",
  zValidator(
    "json",
    z.object({
      provider: z.string().default("anthropic"),
      model: z.string().default("claude-sonnet-4-6"),
      projectId: z.string(),
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        images: z.array(z.object({
          type: z.literal("image"),
          mediaType: z.enum(["image/png", "image/jpeg", "image/gif", "image/webp"]),
          data: z.string(), // base64
        })).optional(),
      })),
      boardType: z.string().optional(),
      fileContext: z.string().optional(),
      mode: z.enum(["firmware", "schematics", "board"]).optional(),
      chatMode: z.enum(["ask", "plan", "code"]).default("code"),
    })
  ),
  async (c) => {
    const { provider, model, projectId, messages, boardType, fileContext, mode, chatMode } = c.req.valid("json");

    // Pick system prompt + allowed tools based on chat mode
    const systemPrompt = chatMode === "ask"
      ? askSystemPrompt(boardType)
      : chatMode === "plan"
        ? planSystemPrompt(boardType, fileContext)
        : SYSTEM_PROMPT(boardType, fileContext, mode);

    const toolDefs = chatMode === "ask"
      ? []                                                          // no tools in Ask
      : chatMode === "plan"
        ? TOOL_DEFS.filter(t => PLAN_TOOLS.has(t.name))           // research + todo only
        : undefined;                                                // all tools in Code

    // Keys can come from env vars OR from request headers (set by the in-app settings modal)
    const anthropicKey  = resolveKey(process.env.ANTHROPIC_API_KEY,  c.req.header("X-ANTHROPIC_API_KEY"));
    const openaiKey     = resolveKey(process.env.OPENAI_API_KEY,     c.req.header("X-OPENAI_API_KEY"));
    const geminiKey     = resolveKey(process.env.GEMINI_API_KEY,     c.req.header("X-GEMINI_API_KEY"));
    const openrouterKey = resolveKey(process.env.OPENROUTER_API_KEY, c.req.header("X-OPENROUTER_API_KEY"));
    const ollamaBase    = resolveKey(process.env.OLLAMA_BASE_URL,    c.req.header("X-OLLAMA_BASE_URL"))
                          ?? "http://localhost:11434";

    // Tool keys — search keys + all provider keys so sub-agents can inherit
    const toolKeys = {
      serperKey:    resolveKey(process.env.SERPER_API_KEY,       c.req.header("X-SERPER_API_KEY")),
      braveKey:     resolveKey(process.env.BRAVE_SEARCH_API_KEY, c.req.header("X-BRAVE_SEARCH_API_KEY")),
      anthropicKey: anthropicKey,
      openaiKey:    openaiKey,
      geminiKey:    geminiKey,
      openrouterKey:openrouterKey,
      ollamaBase:   ollamaBase,
      provider,
      model,
    };

    const body = new ReadableStream({
      async start(controller) {
        const send = (event: object) =>
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));

        try {
          let loop: AsyncGenerator<AgentEvent>;

          if (provider === "anthropic") {
            if (!anthropicKey) throw new Error("No Anthropic API key — add it in Settings (⚙ gear icon).");
            loop = anthropicAgentLoop(messages, systemPrompt, model, projectId, anthropicKey, toolKeys, toolDefs);
          } else if (provider === "openai") {
            if (!openaiKey) throw new Error("No OpenAI API key — add it in Settings (⚙ gear icon).");
            loop = openaiAgentLoop(messages, systemPrompt, model, projectId, openaiKey, undefined, undefined, toolKeys, toolDefs);
          } else if (provider === "gemini") {
            if (!geminiKey) throw new Error("No Gemini API key — add it in Settings (⚙ gear icon).");
            loop = openaiAgentLoop(
              messages, systemPrompt, model, projectId, geminiKey,
              "https://generativelanguage.googleapis.com/v1beta/openai/",
              undefined, toolKeys, toolDefs
            );
          } else if (provider === "openrouter") {
            if (!openrouterKey) throw new Error("No OpenRouter API key — add it in Settings (⚙ gear icon).");
            loop = openaiAgentLoop(messages, systemPrompt, model, projectId, openrouterKey, "https://openrouter.ai/api/v1", {
              "HTTP-Referer": process.env.WEB_URL ?? "http://localhost:3000",
              "X-Title": "Edge Lab IDE",
            }, toolKeys, toolDefs);
          } else {
            loop = openaiAgentLoop(messages, systemPrompt, model, projectId, "ollama", ollamaBase + "/v1", undefined, toolKeys, toolDefs);
          }

          for await (const event of loop) {
            send(event);
          }
        } catch (err) {
          send({ type: "error", message: err instanceof Error ? err.message : String(err) });
        } finally {
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
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
