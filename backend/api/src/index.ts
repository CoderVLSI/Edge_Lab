import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { upgradeWebSocket } from "@hono/node-server";
import { authRouter } from "./routes/auth";
import { projectsRouter } from "./routes/projects";
import { aiRouter } from "./routes/ai";
import { gitRouter } from "./routes/git";
import { agentRouter } from "./routes/agent";
import { createSerialRouter } from "./routes/serial";
import { searchRouter } from "./routes/search";
import { boardsRouter } from "./routes/boards";
import { librariesRouter } from "./routes/libraries";
import { authMiddleware } from "./middleware/auth";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow web app, Expo dev server, Tauri, and null (React Native fetch)
      const allowed = [
        process.env.WEB_URL ?? "http://localhost:3000",
        "http://localhost:8081",   // Expo Metro bundler
        "http://localhost:19006",  // Expo web
        "http://localhost:1420",   // Tauri desktop (Vite dev server)
        "http://localhost:1421",   // Tauri desktop (alternate port)
        "tauri://localhost",       // Tauri production (custom protocol)
        "https://tauri.localhost", // Tauri Windows production
      ];
      if (!origin || allowed.some((a) => origin.startsWith(a))) return origin ?? "*";
      return allowed[0];
    },
    allowHeaders: [
      "Content-Type", "Authorization",
      "X-ANTHROPIC_API_KEY", "X-OPENAI_API_KEY", "X-GEMINI_API_KEY",
      "X-OPENROUTER_API_KEY", "X-OLLAMA_BASE_URL",
      "X-SERPER_API_KEY", "X-BRAVE_SEARCH_API_KEY",
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
// Codebase search — no auth (project files are already sandboxed by projectId)
app.route("/api/projects", searchRouter);
// Board registry — public, no auth needed
app.route("/api/boards", boardsRouter);
// Library management + PIO registry proxy
app.route("/api", librariesRouter);

const port = Number(process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`API server running on http://localhost:${port}`);
});
