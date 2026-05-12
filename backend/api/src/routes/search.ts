/**
 * /api/projects/:id/index  — trigger full project indexing
 * /api/projects/:id/search — BM25 / semantic / hybrid search
 * /api/projects/:id/index/status — check model + chunk count
 */

import { Hono } from "hono";
import { getProjectPath } from "../lib/git-service.js";
import {
  indexProject,
  indexSingleFile,
  searchText,
  searchSemantic,
  searchHybrid,
  getChunkCount,
  clearIndex,
  isModelReady,
} from "../lib/indexer.js";

export const searchRouter = new Hono();

// ── GET /api/projects/:id/index/status ─────────────────────────────────────
searchRouter.get("/:id/index/status", (c) => {
  const { id } = c.req.param();
  const chunks = getChunkCount(id);
  return c.json({
    indexed: chunks > 0,
    chunkCount: chunks,
    modelReady: isModelReady(),
  });
});

// ── POST /api/projects/:id/index ───────────────────────────────────────────
// Kick off (or re-run) full indexing. Returns immediately; streams progress via SSE
// For simplicity this version is synchronous — fine for projects < ~500 files.
searchRouter.post("/:id/index", async (c) => {
  const { id } = c.req.param();
  const projectPath = getProjectPath(id);

  try {
    const stats = await indexProject(id, projectPath);
    return c.json({ ok: true, ...stats });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: message }, 500);
  }
});

// ── POST /api/projects/:id/index/file ──────────────────────────────────────
// Index a single file (called on save)
searchRouter.post("/:id/index/file", async (c) => {
  const { id } = c.req.param();
  const { path, content } = await c.req.json<{ path: string; content: string }>();
  if (!path || content === undefined) return c.json({ ok: false, error: "path and content required" }, 400);

  try {
    await indexSingleFile(id, path, content);
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ ok: false, error: message }, 500);
  }
});

// ── DELETE /api/projects/:id/index ─────────────────────────────────────────
searchRouter.delete("/:id/index", (c) => {
  const { id } = c.req.param();
  clearIndex(id);
  return c.json({ ok: true });
});

// ── GET /api/projects/:id/search ───────────────────────────────────────────
// ?q=<query>&mode=text|semantic|hybrid&k=<topK>
searchRouter.get("/:id/search", async (c) => {
  const { id } = c.req.param();
  const q      = c.req.query("q")?.trim() ?? "";
  const mode   = (c.req.query("mode") ?? "hybrid") as "text" | "semantic" | "hybrid";
  const topK   = Math.min(parseInt(c.req.query("k") ?? "8"), 20);

  if (!q) return c.json({ results: [], query: "", mode });

  try {
    let results;
    if (mode === "text") {
      results = searchText(id, q, topK);
    } else if (mode === "semantic") {
      results = await searchSemantic(id, q, topK);
    } else {
      results = await searchHybrid(id, q, topK);
    }
    return c.json({ results, query: q, mode, count: results.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // If model isn't loaded yet, return helpful message
    if (message.includes("model") || message.includes("pipeline")) {
      return c.json({ results: [], query: q, mode, error: "Embedding model is loading, try again in a moment" });
    }
    return c.json({ results: [], query: q, mode, error: message }, 500);
  }
});
