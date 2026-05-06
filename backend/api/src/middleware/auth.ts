import { createMiddleware } from "hono/factory";
import { verify } from "../lib/jwt";

export const authMiddleware = createMiddleware<{ Variables: { userId: string } }>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const payload = await verify(header.slice(7));
  if (!payload) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", payload.sub);
  await next();
});
