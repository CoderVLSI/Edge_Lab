import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-server/ws";
import { authRouter } from "./routes/auth";
import { projectsRouter } from "./routes/projects";
import { aiRouter } from "./routes/ai";
import { gitRouter } from "./routes/git";
import { agentRouter } from "./routes/agent";
import { createSerialRouter } from "./routes/serial";
import { authMiddleware } from "./middleware/auth";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [process.env.WEB_URL ?? "http://localhost:3000"],
    allowHeaders: [
      "Content-Type", "Authorization",
      "X-ANTHROPIC_API_KEY", "X-OPENAI_API_KEY", "X-GEMINI_API_KEY",
      "X-OPENROUTER_API_KEY", "X-OLLAMA_BASE_URL",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRouter);
app.use("/api/projects/*", authMiddleware);
app.route("/api/projects", projectsRouter);
// /api/ai/providers is public (just lists models); chat/agent require auth
app.use("/api/ai/chat", authMiddleware);
app.route("/api/ai", aiRouter);
app.use("/api/git/*", authMiddleware);
app.route("/api/git", gitRouter);
// Agent runs without auth — key is validated per-request via env or header
app.route("/api/agent", agentRouter);
// Serial bridge — no auth, secured by local network access
app.route("/api/serial", createSerialRouter(upgradeWebSocket));

const port = Number(process.env.PORT ?? 4000);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`API server running on http://localhost:${port}`);
});

injectWebSocket(server);
