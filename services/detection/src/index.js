import express from "express";
import { createHmac, timingSafeEqual } from "crypto";
import Redis from "ioredis";
import { ulid } from "ulid";
import { runDetectors } from "./detectors/index.js";

const app = express();
const redis = new Redis(process.env.REDIS_URL);

// ─── HMAC Verification Middleware ─────────────────────────────────────────────
function verifyGitHubSignature(req, res, next) {
  const sig = req.headers["x-hub-signature-256"];
  if (!sig) return res.status(403).json({ error: "Missing signature" });

  const expected = "sha256=" + createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET)
    .update(req.body)
    .digest("hex");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);

  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    console.warn("[detection] Invalid HMAC signature — rejecting webhook");
    return res.status(403).json({ error: "Invalid signature" });
  }
  next();
}

// ─── Webhook Handler ──────────────────────────────────────────────────────────
app.post("/webhook/github", express.raw({ type: "application/json" }), verifyGitHubSignature, async (req, res) => {
  const event = req.headers["x-github-event"];
  const payload = JSON.parse(req.body.toString("utf8"));

  // Only care about pull_request events with action: opened or synchronize
  if (event !== "pull_request") {
    return res.status(200).json({ skipped: true, reason: "not a PR event" });
  }

  const { action, pull_request: pr, repository } = payload;
  if (!["opened", "synchronize", "reopened"].includes(action)) {
    return res.status(200).json({ skipped: true, reason: `action ${action} not relevant` });
  }

  const prId = ulid();
  const prData = {
    id: prId,
    number: pr.number,
    title: pr.title,
    body: pr.body ?? "",
    author: pr.user.login,
    authorAssociation: pr.author_association,
    repoFullName: repository.full_name,
    repoOwner: repository.owner.login,
    repoName: repository.name,
    headSha: pr.head.sha,
    baseBranch: pr.base.ref,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    changedFiles: pr.changed_files ?? 0,
    createdAt: pr.created_at,
    url: pr.html_url,
    action,
  };

  // Publish "pr.received" event to Redis Streams
  await redis.xadd("events:pr", "*", "type", "pr.received", "data", JSON.stringify(prData));

  // Run all detectors synchronously (fast — all in-process)
  console.log(`[detection] Running detectors for PR #${pr.number} in ${repository.full_name}`);
  const result = await runDetectors(prData);

  const detectionResult = {
    ...prData,
    score: result.score,
    signals: result.signals,
    detectedAt: new Date().toISOString(),
  };

  // Publish "pr.scored" event — agent and broadcaster both consume this
  await redis.xadd("events:pr", "*", "type", "pr.scored", "data", JSON.stringify(detectionResult));
  console.log(`[detection] PR #${pr.number} scored ${result.score} | signals: ${result.signals.map(s => s.name).join(", ")}`);

  res.status(202).json({ received: true, prId, score: result.score });
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`[detection] Listening on :${PORT}`));
