import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getStatus, initRepo, getBranches, getDiff, getLog, git,
} from "../lib/git-service";

export const gitRouter = new Hono<{ Variables: { userId: string } }>();

/** GET /api/git/:projectId/status */
gitRouter.get("/:id/status", async (c) => {
  try {
    return c.json(await getStatus(c.req.param("id")));
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

/** POST /api/git/:projectId/init */
gitRouter.post("/:id/init", async (c) => {
  try {
    await initRepo(c.req.param("id"));
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

/** POST /api/git/:projectId/stage  body: { paths: string[] } */
gitRouter.post(
  "/:id/stage",
  zValidator("json", z.object({ paths: z.array(z.string()) })),
  async (c) => {
    const { paths } = c.req.valid("json");
    await git(c.req.param("id")).add(paths);
    return c.json({ ok: true });
  }
);

/** POST /api/git/:projectId/unstage  body: { paths: string[] } */
gitRouter.post(
  "/:id/unstage",
  zValidator("json", z.object({ paths: z.array(z.string()) })),
  async (c) => {
    const { paths } = c.req.valid("json");
    await git(c.req.param("id")).reset(["HEAD", "--", ...paths]);
    return c.json({ ok: true });
  }
);

/** POST /api/git/:projectId/stage-all */
gitRouter.post("/:id/stage-all", async (c) => {
  await git(c.req.param("id")).add(".");
  return c.json({ ok: true });
});

/** POST /api/git/:projectId/commit  body: { message: string } */
gitRouter.post(
  "/:id/commit",
  zValidator("json", z.object({ message: z.string().min(1) })),
  async (c) => {
    const { message } = c.req.valid("json");
    const result = await git(c.req.param("id")).commit(message);
    return c.json({ ok: true, commit: result.commit });
  }
);

/** POST /api/git/:projectId/push  body: { remote?, branch? } */
gitRouter.post(
  "/:id/push",
  zValidator("json", z.object({ remote: z.string().default("origin"), branch: z.string().optional() })),
  async (c) => {
    const { remote, branch } = c.req.valid("json");
    try {
      const g = git(c.req.param("id"));
      const status = await g.status();
      const br = branch ?? status.current ?? "main";
      await g.push(remote, br);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: String(e) }, 400);
    }
  }
);

/** POST /api/git/:projectId/pull  body: { remote?, branch? } */
gitRouter.post(
  "/:id/pull",
  zValidator("json", z.object({ remote: z.string().default("origin"), branch: z.string().optional() })),
  async (c) => {
    const { remote, branch } = c.req.valid("json");
    try {
      const g = git(c.req.param("id"));
      const status = await g.status();
      const br = branch ?? status.current ?? "main";
      const result = await g.pull(remote, br);
      return c.json({ ok: true, summary: result.summary });
    } catch (e) {
      return c.json({ error: String(e) }, 400);
    }
  }
);

/** GET /api/git/:projectId/branches */
gitRouter.get("/:id/branches", async (c) => {
  try {
    return c.json(await getBranches(c.req.param("id")));
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

/** POST /api/git/:projectId/branch  body: { name, from? } — create & switch */
gitRouter.post(
  "/:id/branch",
  zValidator("json", z.object({ name: z.string().min(1), from: z.string().optional() })),
  async (c) => {
    const { name, from } = c.req.valid("json");
    const g = git(c.req.param("id"));
    if (from) await g.checkoutBranch(name, from);
    else await g.checkoutLocalBranch(name);
    return c.json({ ok: true });
  }
);

/** POST /api/git/:projectId/checkout  body: { branch } */
gitRouter.post(
  "/:id/checkout",
  zValidator("json", z.object({ branch: z.string() })),
  async (c) => {
    await git(c.req.param("id")).checkout(c.req.valid("json").branch);
    return c.json({ ok: true });
  }
);

/** GET /api/git/:projectId/diff?file=path&staged=true */
gitRouter.get("/:id/diff", async (c) => {
  const file = c.req.query("file") ?? "";
  const staged = c.req.query("staged") === "true";
  try {
    const diff = await getDiff(c.req.param("id"), file, staged);
    return c.json({ diff });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

/** GET /api/git/:projectId/log?limit=20 */
gitRouter.get("/:id/log", async (c) => {
  const limit = Number(c.req.query("limit") ?? 20);
  try {
    return c.json(await getLog(c.req.param("id"), limit));
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

/** POST /api/git/:projectId/remote  body: { url } — add origin */
gitRouter.post(
  "/:id/remote",
  zValidator("json", z.object({ url: z.string().url(), name: z.string().default("origin") })),
  async (c) => {
    const { url, name } = c.req.valid("json");
    try {
      await git(c.req.param("id")).addRemote(name, url);
    } catch {
      await git(c.req.param("id")).remote(["set-url", name, url]);
    }
    return c.json({ ok: true });
  }
);
