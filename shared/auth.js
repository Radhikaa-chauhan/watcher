import { createHmac, timingSafeEqual } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith("#"))
    .forEach(line => {
      const [key, ...valueParts] = line.split("=");
      const value = valueParts.join("=").trim();
      if (key && process.env[key.trim()] == null) {
        process.env[key.trim()] = value;
      }
    });
}

loadDotEnv();

const JWT_SECRET = process.env.JWT_SECRET ?? "changeme";

// ─── Minimal JWT (HS256) without external dependencies ───────────────────────

function base64url(str) {
  return Buffer.from(str).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function signJWT(payload, expiresInSeconds = 86400) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }));
  const sig = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyJWT(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const [header, body, sig] = parts;

  const expectedSig = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid JWT signature");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("JWT expired");
  }
  return payload;
}

// ─── HMAC webhook verification ────────────────────────────────────────────────
export function verifyGitHubWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── CLI: generate a dashboard token ─────────────────────────────────────────
if (process.argv[1]?.endsWith("auth.js")) {
  const token = signJWT({ role: "dashboard", sub: "maintainer" });
  console.log("\nDashboard JWT (valid 24h):\n");
  console.log(token);
  console.log("\nConnect to WebSocket:\n");
  console.log(`  ws://localhost:8080/ws?token=${token}\n`);
}
