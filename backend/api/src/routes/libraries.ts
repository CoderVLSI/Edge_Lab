/**
 * Library management — reads/writes lib_deps in platformio.ini.
 *
 * GET  /api/projects/:id/libraries          — list current lib_deps
 * POST /api/projects/:id/libraries          — add a library
 * DELETE /api/projects/:id/libraries        — remove a library
 * GET  /api/libraries/search?q=             — proxy PlatformIO registry search
 */

import { Hono } from "hono";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { getProjectPath } from "../lib/git-service.js";

export const librariesRouter = new Hono();

// ── platformio.ini helpers ───────────────────────────────────────────────────

const DEFAULT_INI = (board = "esp32dev") => `[env:${board}]
platform = espressif32
board = ${board}
framework = arduino
monitor_speed = 115200
`;

async function readIni(projectId: string): Promise<string> {
  const path = join(getProjectPath(projectId), "platformio.ini");
  if (!existsSync(path)) return DEFAULT_INI();
  return readFile(path, "utf-8");
}

async function writeIni(projectId: string, content: string): Promise<void> {
  const path = join(getProjectPath(projectId), "platformio.ini");
  await writeFile(path, content, "utf-8");
}

/**
 * Parse all lib_deps entries from platformio.ini.
 * Handles both inline (`lib_deps = a, b`) and multi-line formats.
 */
function parseLibDeps(ini: string): string[] {
  const lines = ini.split("\n");
  const deps: string[] = [];
  let inLibDeps = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (inLibDeps) {
      // Continuation: leading whitespace = still in lib_deps block
      if (/^\s+\S/.test(line)) {
        deps.push(line.trim());
        continue;
      }
      // Inline comma-separated (shouldn't appear after first line, but handle it)
      inLibDeps = false;
    }

    const m = line.match(/^lib_deps\s*=\s*(.*)$/);
    if (m) {
      inLibDeps = true;
      // Inline values on the same line (e.g. `lib_deps = ArduinoJson`)
      const inline = m[1].trim();
      if (inline) {
        // Could be comma-separated
        inline.split(",").map(s => s.trim()).filter(Boolean).forEach(d => deps.push(d));
        // If inline had values, check if next line continues
      }
    }
  }

  return deps.filter(Boolean);
}

/**
 * Rewrite lib_deps section with the new deps list.
 * Creates the key if it doesn't exist (appends to first [env:*] section).
 */
function setLibDeps(ini: string, deps: string[]): string {
  const lines = ini.split("\n");
  const out: string[] = [];
  let replaced = false;
  let skipUntilNext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (skipUntilNext) {
      // Skip continuation lines of old lib_deps block
      if (/^\s+\S/.test(line)) continue;
      skipUntilNext = false;
    }

    const m = line.match(/^(lib_deps\s*=\s*)(.*)$/);
    if (m) {
      // Replace lib_deps block
      if (deps.length === 0) {
        // Remove the key entirely
        skipUntilNext = true;
        replaced = true;
        continue;
      }
      out.push("lib_deps =");
      deps.forEach(d => out.push(`    ${d}`));
      replaced = true;
      skipUntilNext = true; // skip old continuation lines
      continue;
    }

    out.push(line);

    // If we just finished writing the first [env:*] header and haven't placed lib_deps yet, add it
    if (!replaced && /^\[env:/.test(line) && deps.length > 0) {
      // Don't add here — wait to replace existing or add at end of section
    }
  }

  // No lib_deps key existed — append to the file
  if (!replaced && deps.length > 0) {
    out.push("lib_deps =");
    deps.forEach(d => out.push(`    ${d}`));
  }

  return out.join("\n");
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/projects/:id/libraries
librariesRouter.get("/projects/:id/libraries", async (c) => {
  const { id } = c.req.param();
  try {
    const ini = await readIni(id);
    const deps = parseLibDeps(ini);
    return c.json({ deps });
  } catch (e) {
    return c.json({ deps: [], error: String(e) });
  }
});

// POST /api/projects/:id/libraries  { name: "ArduinoJson" }
librariesRouter.post("/projects/:id/libraries", async (c) => {
  const { id } = c.req.param();
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ ok: false, error: "name required" }, 400);

  try {
    const ini = await readIni(id);
    const deps = parseLibDeps(ini);
    const trimmed = name.trim();
    if (!deps.includes(trimmed)) {
      deps.push(trimmed);
      await writeIni(id, setLibDeps(ini, deps));
    }
    return c.json({ ok: true, deps });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 500);
  }
});

// DELETE /api/projects/:id/libraries  { name: "ArduinoJson" }
librariesRouter.delete("/projects/:id/libraries", async (c) => {
  const { id } = c.req.param();
  const { name } = await c.req.json<{ name: string }>();
  if (!name?.trim()) return c.json({ ok: false, error: "name required" }, 400);

  try {
    const ini = await readIni(id);
    const deps = parseLibDeps(ini).filter(d => d !== name.trim());
    await writeIni(id, setLibDeps(ini, deps));
    return c.json({ ok: true, deps });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 500);
  }
});

// GET /api/libraries/search?q=DHT&page=1
librariesRouter.get("/libraries/search", async (c) => {
  const q    = c.req.query("q")?.trim() ?? "";
  const page = parseInt(c.req.query("page") ?? "1");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "15"), 30);

  if (!q) return c.json({ items: [], total: 0, query: "" });

  try {
    const url = new URL("https://api.registry.platformio.org/v3/packages/search");
    url.searchParams.set("query", q);
    url.searchParams.set("type", "library");
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      headers: { "Accept": "application/json", "User-Agent": "EdgeLab/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`Registry responded ${res.status}`);
    const data = await res.json() as {
      items?: Array<{
        name: string;
        description: string;
        version?: { name: string };
        keywords?: string[];
        owner?: { username: string };
        examplesNum?: number;
      }>;
      total?: number;
    };

    // Normalize to a flat list
    const items = (data.items ?? []).map(p => ({
      id:          p.name,
      name:        p.name,
      version:     p.version?.name ?? "latest",
      author:      p.owner?.username ?? "",
      description: p.description ?? "",
      keywords:    p.keywords ?? [],
    }));

    return c.json({ items, total: data.total ?? items.length, query: q });
  } catch (e) {
    // Registry unreachable — return empty with error flag
    return c.json({ items: [], total: 0, query: q, error: String(e) });
  }
});
