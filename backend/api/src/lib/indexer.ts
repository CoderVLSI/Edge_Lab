/**
 * Codebase indexer — free, fully local.
 *
 * Pipeline:
 *   1. Walk project directory, filter to code files
 *   2. Split each file into 40-line chunks (10-line overlap)
 *   3. Embed with Xenova/all-MiniLM-L6-v2 (384-dim, ~23 MB, cached on disk)
 *   4. Store chunks + embeddings in SQLite (BLOB for vectors, FTS5 for keywords)
 *   5. Skip files whose content hash hasn't changed (incremental)
 *
 * Search modes:
 *   - text:     SQLite FTS5 BM25 full-text search
 *   - semantic: cosine similarity over all project chunk embeddings
 *   - hybrid:   interleave both, deduplicate by file+line
 */

import { createHash, randomUUID } from "crypto";
import { readFile, readdir } from "fs/promises";
import { join, extname, relative } from "path";
import { sqlite } from "../db/sqlite.js";

// ── Embedding pipeline (lazy-loaded on first use) ──────────────────────────
type EmbedFn = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>;
let _embed: EmbedFn | null = null;
let _modelLoading = false;
let _modelReady = false;

async function getEmbedder(): Promise<EmbedFn> {
  if (_embed) return _embed;
  if (_modelLoading) {
    // Wait up to 60s for model to finish loading
    for (let i = 0; i < 600; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (_embed) return _embed;
    }
    throw new Error("Model load timed out");
  }
  _modelLoading = true;
  console.log("[indexer] Loading embedding model (first run downloads ~23 MB)…");
  const { pipeline } = await import("@xenova/transformers");
  const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { quantized: true });
  _embed = pipe as unknown as EmbedFn;
  _modelReady = true;
  _modelLoading = false;
  console.log("[indexer] Embedding model ready");
  return _embed;
}

export function isModelReady() { return _modelReady; }

async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const embedder = await getEmbedder();
  const results: Float32Array[] = [];
  for (const text of texts) {
    const out = await embedder(text.slice(0, 512), { pooling: "mean", normalize: true });
    // Create a clean copy so we don't hold a ref to the WASM heap
    results.push(Float32Array.from(out.data));
  }
  return results;
}

// ── File chunking ───────────────────────────────────────────────────────────
const CHUNK_LINES = 40;
const OVERLAP_LINES = 8;

interface Chunk { content: string; startLine: number; endLine: number; }

function chunkFile(content: string): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < lines.length) {
    const end = Math.min(i + CHUNK_LINES, lines.length);
    const slice = lines.slice(i, end);
    if (slice.some(l => l.trim().length > 0)) {
      chunks.push({ content: slice.join("\n"), startLine: i + 1, endLine: end });
    }
    i += CHUNK_LINES - OVERLAP_LINES;
    if (i >= lines.length) break;
  }
  return chunks;
}

// ── File collection ─────────────────────────────────────────────────────────
const CODE_EXTS = new Set([
  ".cpp", ".c", ".h", ".hpp", ".cc", ".cxx",
  ".py", ".ts", ".tsx", ".js", ".jsx", ".mjs",
  ".rs", ".go", ".java", ".kt",
  ".ini", ".toml", ".yaml", ".yml", ".json",
  ".md", ".txt", ".sch", ".kicad_sch", ".kicad_pcb",
]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".pio", "dist", ".next", "build", "__pycache__", ".cargo"]);

async function collectFiles(dir: string, files: string[] = []): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await collectFiles(full, files);
      else if (CODE_EXTS.has(extname(e.name).toLowerCase())) files.push(full);
    }
  } catch { /* ignore unreadable dirs */ }
  return files;
}

// ── Prepared statements ─────────────────────────────────────────────────────
const stmts = {
  getHash: sqlite.prepare<[string, string], { content_hash: string }>(
    "SELECT content_hash FROM file_chunks WHERE project_id = ? AND file_path = ? LIMIT 1"
  ),
  deleteFile: sqlite.prepare<[string, string]>(
    "DELETE FROM file_chunks WHERE project_id = ? AND file_path = ?"
  ),
  deleteFts: sqlite.prepare<[string, string]>(
    "DELETE FROM file_chunks_fts WHERE project_id = ? AND file_path = ?"
  ),
  insertChunk: sqlite.prepare<[string, string, string, number, string, number, number, string, Buffer]>(
    `INSERT INTO file_chunks (id, project_id, file_path, chunk_index, content, start_line, end_line, content_hash, embedding)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  insertFts: sqlite.prepare<[string, string, string, number, number]>(
    "INSERT INTO file_chunks_fts (content, file_path, project_id, start_line, end_line) VALUES (?, ?, ?, ?, ?)"
  ),
  getChunks: sqlite.prepare<[string], { file_path: string; start_line: number; end_line: number; content: string; embedding: Buffer }>(
    "SELECT file_path, start_line, end_line, content, embedding FROM file_chunks WHERE project_id = ?"
  ),
  getChunkCount: sqlite.prepare<[string], { n: number }>(
    "SELECT COUNT(*) as n FROM file_chunks WHERE project_id = ?"
  ),
  deleteProject: sqlite.prepare<[string]>(
    "DELETE FROM file_chunks WHERE project_id = ?"
  ),
  deleteProjectFts: sqlite.prepare<[string]>(
    "DELETE FROM file_chunks_fts WHERE project_id = ?"
  ),
};

// ── Public API ──────────────────────────────────────────────────────────────

export interface IndexStats { indexed: number; skipped: number; chunks: number; }

export async function indexProject(projectId: string, projectPath: string): Promise<IndexStats> {
  let indexed = 0, skipped = 0, totalChunks = 0;

  const files = await collectFiles(projectPath);

  for (const absPath of files) {
    const relPath = relative(projectPath, absPath).replace(/\\/g, "/");
    try {
      const content = await readFile(absPath, "utf-8");
      if (content.length > 500_000) { skipped++; continue; } // skip huge files

      const hash = createHash("md5").update(content).digest("hex");
      const existing = stmts.getHash.get(projectId, relPath);
      if (existing?.content_hash === hash) { skipped++; continue; }

      const chunks = chunkFile(content);
      if (!chunks.length) { skipped++; continue; }

      const embeddings = await embedBatch(chunks.map(c => `${relPath}\n${c.content}`));

      sqlite.transaction(() => {
        stmts.deleteFile.run(projectId, relPath);
        stmts.deleteFts.run(projectId, relPath);
        for (let i = 0; i < chunks.length; i++) {
          const embBuf = Buffer.from(embeddings[i].buffer);
          stmts.insertChunk.run(randomUUID(), projectId, relPath, i, chunks[i].content, chunks[i].startLine, chunks[i].endLine, hash, embBuf);
          stmts.insertFts.run(chunks[i].content, relPath, projectId, chunks[i].startLine, chunks[i].endLine);
        }
      })();

      indexed++;
      totalChunks += chunks.length;
    } catch (e) {
      console.warn(`[indexer] Skipping ${relPath}:`, e instanceof Error ? e.message : e);
      skipped++;
    }
  }

  return { indexed, skipped, chunks: totalChunks };
}

export async function indexSingleFile(projectId: string, filePath: string, content: string): Promise<void> {
  const hash = createHash("md5").update(content).digest("hex");
  const existing = stmts.getHash.get(projectId, filePath);
  if (existing?.content_hash === hash) return; // unchanged

  const chunks = chunkFile(content);
  if (!chunks.length) return;
  const embeddings = await embedBatch(chunks.map(c => `${filePath}\n${c.content}`));

  sqlite.transaction(() => {
    stmts.deleteFile.run(projectId, filePath);
    stmts.deleteFts.run(projectId, filePath);
    for (let i = 0; i < chunks.length; i++) {
      const embBuf = Buffer.from(embeddings[i].buffer);
      stmts.insertChunk.run(randomUUID(), projectId, filePath, i, chunks[i].content, chunks[i].startLine, chunks[i].endLine, hash, embBuf);
      stmts.insertFts.run(chunks[i].content, filePath, projectId, chunks[i].startLine, chunks[i].endLine);
    }
  })();
}

// ── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
  mode: "text" | "semantic";
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export async function searchSemantic(projectId: string, query: string, topK = 8): Promise<SearchResult[]> {
  const [queryEmb] = await embedBatch([query]);
  const rows = stmts.getChunks.all(projectId);

  const scored = rows.map(r => {
    const arr = new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4);
    return { ...r, score: cosine(queryEmb, arr) };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(r => ({
    filePath: r.file_path,
    startLine: r.start_line,
    endLine: r.end_line,
    content: r.content,
    score: Math.round(r.score * 1000) / 1000,
    mode: "semantic" as const,
  }));
}

export function searchText(projectId: string, query: string, topK = 8): SearchResult[] {
  try {
    // FTS5 BM25 — returns best matches ranked by relevance
    const rows = sqlite.prepare<[string, string, number], { content: string; file_path: string; start_line: number; end_line: number; rank: number }>(
      `SELECT content, file_path, start_line, end_line, rank
       FROM file_chunks_fts
       WHERE project_id = ? AND file_chunks_fts MATCH ?
       ORDER BY rank LIMIT ?`
    ).all(projectId, query.replace(/[^a-zA-Z0-9_ ]/g, " "), topK);

    return rows.map(r => ({
      filePath: r.file_path,
      startLine: r.start_line,
      endLine: r.end_line,
      content: r.content,
      score: Math.abs(r.rank),
      mode: "text" as const,
    }));
  } catch {
    // Fallback: LIKE search if FTS5 query is malformed
    const rows = sqlite.prepare<[string, string, number], { content: string; file_path: string; start_line: number; end_line: number }>(
      `SELECT content, file_path, start_line, end_line
       FROM file_chunks WHERE project_id = ? AND content LIKE ? LIMIT ?`
    ).all(projectId, `%${query}%`, topK);

    return rows.map(r => ({
      filePath: r.file_path,
      startLine: r.start_line,
      endLine: r.end_line,
      content: r.content,
      score: 1,
      mode: "text" as const,
    }));
  }
}

export async function searchHybrid(projectId: string, query: string, topK = 8): Promise<SearchResult[]> {
  const [textResults, semanticResults] = await Promise.all([
    Promise.resolve(searchText(projectId, query, topK)),
    searchSemantic(projectId, query, topK),
  ]);

  // Reciprocal rank fusion
  const scores = new Map<string, { result: SearchResult; score: number }>();
  const k = 60; // RRF constant

  const rank = (results: SearchResult[], weight: number) => {
    results.forEach((r, i) => {
      const key = `${r.filePath}:${r.startLine}`;
      const prev = scores.get(key);
      const rrfScore = weight / (k + i + 1);
      if (prev) prev.score += rrfScore;
      else scores.set(key, { result: { ...r, mode: "semantic" }, score: rrfScore });
    });
  };

  rank(textResults, 1.0);
  rank(semanticResults, 1.2); // slight semantic boost

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(v => ({ ...v.result, score: Math.round(v.score * 1000) / 1000 }));
}

export function getChunkCount(projectId: string): number {
  return stmts.getChunkCount.get(projectId)?.n ?? 0;
}

export function clearIndex(projectId: string): void {
  sqlite.transaction(() => {
    stmts.deleteProject.run(projectId);
    stmts.deleteProjectFts.run(projectId);
  })();
}
