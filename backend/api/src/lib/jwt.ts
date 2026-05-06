import { createHmac } from "crypto";

const SECRET = process.env.JWT_SECRET ?? "change-me-in-production";

function base64url(buf: Buffer) {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function sign(payload: Record<string, unknown>): Promise<string> {
  const header = base64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64url(Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 })));
  const sig = base64url(createHmac("sha256", SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export async function verify(token: string): Promise<{ sub: string } | null> {
  try {
    const [header, body, sig] = token.split(".");
    const expected = base64url(createHmac("sha256", SECRET).update(`${header}.${body}`).digest());
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload as { sub: string };
  } catch {
    return null;
  }
}
