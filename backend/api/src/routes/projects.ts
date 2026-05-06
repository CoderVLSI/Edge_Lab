import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db as sqliteDb } from "../db/sqlite";
import { existsSync, mkdirSync } from "fs";
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

    // Also create the project directory on disk
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

projectsRouter.get("/:id/files", (c) => {
  const files = sqliteDb.getFiles.all({ project_id: c.req.param("id") });
  return c.json(files);
});

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
