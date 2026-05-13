import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db as sqliteDb } from "../db/sqlite";
import { existsSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { getProjectPath } from "../lib/git-service";

function newId() {
  return randomBytes(8).toString("hex");
}

export const projectsRouter = new Hono<{ Variables: { userId: string } }>();

projectsRouter.get("/", (c) => {
  const userId = c.get("userId");
  const rows = sqliteDb.getProjects.all({ user_id: userId });
  return c.json(rows);
});

projectsRouter.post(
  "/",
  zValidator("json", z.object({ name: z.string().min(1), boardType: z.string().default("esp32") })),
  (c) => {
    const userId = c.get("userId");
    const { name, boardType } = c.req.valid("json");
    const id = newId();
    sqliteDb.createProject.run({ id, user_id: userId, name, board_type: boardType });

    const projectDir = getProjectPath(id);
    if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });

    return c.json({ id, user_id: userId, name, board_type: boardType }, 201);
  }
);

projectsRouter.get("/:id", (c) => {
  const userId = c.get("userId");
  const project = sqliteDb.getProject.get({ id: c.req.param("id"), user_id: userId });
  if (!project) return c.json({ error: "Not found" }, 404);
  return c.json(project);
});

projectsRouter.delete("/:id", (c) => {
  const userId = c.get("userId");
  sqliteDb.deleteProject.run({ id: c.req.param("id"), user_id: userId });
  return c.json({ ok: true });
});

// List all files in a project (metadata only — no content)
projectsRouter.get("/:id/files", (c) => {
  const files = sqliteDb.getFiles.all({ project_id: c.req.param("id") });
  return c.json(files);
});

// Get a single file's content  (?path=src/main.cpp)
projectsRouter.get("/:id/file", (c) => {
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "Missing ?path query" }, 400);
  const file = sqliteDb.getFile.get({ project_id: c.req.param("id"), path: filePath });
  if (!file) return c.json({ error: "File not found" }, 404);
  return c.json(file);
});

// Create or update a file
projectsRouter.post(
  "/:id/files",
  zValidator("json", z.object({ path: z.string(), content: z.string().default("") })),
  (c) => {
    const { path, content } = c.req.valid("json");
    const id = newId();
    sqliteDb.upsertFile.run({ id, project_id: c.req.param("id"), path, content });
    return c.json({ id, path, content }, 201);
  }
);

// Update file content  (?path=src/main.cpp)
projectsRouter.put(
  "/:id/file",
  zValidator("json", z.object({ content: z.string() })),
  (c) => {
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "Missing ?path query" }, 400);
    const { content } = c.req.valid("json");
    const id = newId();
    sqliteDb.upsertFile.run({ id, project_id: c.req.param("id"), path: filePath, content });
    return c.json({ path: filePath, content });
  }
);

// Rename a file  (?path=old.cpp&newPath=new.cpp)
projectsRouter.patch("/:id/file", (c) => {
  const oldPath = c.req.query("path");
  const newPath = c.req.query("newPath");
  if (!oldPath || !newPath) return c.json({ error: "Missing ?path or ?newPath" }, 400);
  sqliteDb.renameFile.run({ project_id: c.req.param("id"), old_path: oldPath, new_path: newPath });
  return c.json({ ok: true, path: newPath });
});

// Delete a file  (?path=src/main.cpp)
projectsRouter.delete("/:id/file", (c) => {
  const filePath = c.req.query("path");
  if (!filePath) return c.json({ error: "Missing ?path query" }, 400);
  sqliteDb.deleteFile.run({ project_id: c.req.param("id"), path: filePath });
  return c.json({ ok: true });
});

// ── Build & Flash (PlatformIO) ────────────────────────────────────────────────

function runPio(
  args: string[],
  cwd: string
): Promise<{ output: string[]; exitCode: number }> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    const proc = spawn("pio", args, { cwd });
    proc.stdout.on("data", (d: Buffer) =>
      lines.push(...String(d).split("\n").filter(Boolean))
    );
    proc.stderr.on("data", (d: Buffer) =>
      lines.push(...String(d).split("\n").filter(Boolean))
    );
    proc.on("close", (code) => resolve({ output: lines, exitCode: code ?? 1 }));
    proc.on("error", (e) =>
      resolve({ output: [`Error: ${e.message}`], exitCode: -1 })
    );
  });
}

projectsRouter.post("/:id/build", async (c) => {
  const projectDir = getProjectPath(c.req.param("id"));
  if (!existsSync(projectDir))
    return c.json({ error: "Project directory not found" }, 404);
  const result = await runPio(["run"], projectDir);
  return c.json(result);
});

projectsRouter.post("/:id/flash", async (c) => {
  const projectDir = getProjectPath(c.req.param("id"));
  if (!existsSync(projectDir))
    return c.json({ error: "Project directory not found" }, 404);
  const result = await runPio(["run", "--target", "upload"], projectDir);
  return c.json(result);
});
