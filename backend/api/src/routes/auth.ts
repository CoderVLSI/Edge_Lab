import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { sign, verify } from "../lib/jwt";
import { db as sqliteDb } from "../db/sqlite";

// ── SQLite-backed auth (no Postgres needed) ─────────────────────────────────
function hashPassword(password: string, salt: string) {
  return createHash("sha256").update(password + salt).digest("hex");
}

function newId() {
  return randomBytes(8).toString("hex");
}

export const authRouter = new Hono();

authRouter.post(
  "/register",
  zValidator("json", z.object({ email: z.string().email(), password: z.string().min(8) })),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const salt = randomBytes(16).toString("hex");
    const passwordHash = `${salt}:${hashPassword(password, salt)}`;
    try {
      const id = newId();
      sqliteDb.createUser.run({ id, email, password_hash: passwordHash });
      const token = await sign({ sub: id });
      return c.json({ user: { id, email }, token }, 201);
    } catch {
      return c.json({ error: "Email already registered" }, 409);
    }
  }
);

authRouter.post(
  "/login",
  zValidator("json", z.object({ email: z.string().email(), password: z.string() })),
  async (c) => {
    const { email, password } = c.req.valid("json");
    const user = sqliteDb.getUserByEmail.get({ email });
    if (!user) return c.json({ error: "Invalid credentials" }, 401);

    const [salt, hash] = user.password_hash.split(":");
    const expected = hashPassword(password, salt);
    if (!timingSafeEqual(Buffer.from(hash), Buffer.from(expected)))
      return c.json({ error: "Invalid credentials" }, 401);

    const token = await sign({ sub: user.id });
    return c.json({ user: { id: user.id, email: user.email }, token });
  }
);

authRouter.get("/me", async (c) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const payload = await verify(header.slice(7));
  if (!payload) return c.json({ error: "Unauthorized" }, 401);
  const user = sqliteDb.getUserById.get({ id: payload.sub });
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json(user);
});
