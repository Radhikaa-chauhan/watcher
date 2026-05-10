import Redis from "ioredis";
import { Octokit } from "@octokit/rest";

const redis = new Redis(process.env.REDIS_URL);
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const STREAM = "events:decisions";
const RESULTS_STREAM = "events:actions";
const GROUP = "github-action-group";
const CONSUMER = "github-action-1";

// ─── Ensure consumer group exists ────────────────────────────────────────────
async function ensureGroup() {
  try {
    await redis.xgroup("CREATE", STREAM, GROUP, "0", "MKSTREAM");
    console.log(`[github-action] Created consumer group '${GROUP}'`);
  } catch (e) {
    if (!e.message.includes("BUSYGROUP")) throw e;
  }
}

// ─── Action Handlers ─────────────────────────────────────────────────────────

async function postComment(owner, repo, prNumber, body) {
  await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body });
  console.log(`[github-action] Posted comment on PR #${prNumber}`);
}

async function closePR(owner, repo, prNumber, comment) {
  await postComment(owner, repo, prNumber, comment);
  await octokit.pulls.update({ owner, repo, pull_number: prNumber, state: "closed" });
  console.log(`[github-action] Closed PR #${prNumber}`);
}

async function handleDecision(payload) {
  const { repoOwner: owner, repoName: repo, number: prNumber, decision, commentBody, actionResult } = payload;

  if (!owner || !repo || !prNumber) {
    console.warn("[github-action] Missing owner/repo/prNumber — skipping");
    return { skipped: true };
  }

  let parsed = {};
  try { parsed = JSON.parse(actionResult ?? "{}"); } catch (_) {}

  switch (decision) {
    case "close_pr": {
      const comment = commentBody || parsed.comment ||
        "This PR has been automatically closed due to quality checks. Please review our contribution guidelines and resubmit.";
      await closePR(owner, repo, prNumber, comment);
      return { executed: "close_pr" };
    }

    case "approve_pr": {
      const note = commentBody || parsed.note ||
        "Thanks for your contribution! Your PR looks good and has passed our initial checks. A maintainer will review it shortly. 🎉";
      await postComment(owner, repo, prNumber, note);
      return { executed: "approve_pr" };
    }

    case "post_comment": {
      const comment = commentBody || parsed.comment || "Your PR has been flagged for review.";
      await postComment(owner, repo, prNumber, comment);
      return { executed: "post_comment" };
    }

    case "escalate": {
      const reason = parsed.reason || "Requires human review";
      const body = `> 🚨 **Escalated to maintainers**\n\nThis PR has been flagged for human review by the automated system.\n\n**Reason:** ${reason}`;
      await postComment(owner, repo, prNumber, body);
      return { executed: "escalate" };
    }

    default:
      console.warn(`[github-action] Unknown decision '${decision}' for PR #${prNumber}`);
      return { skipped: true, reason: `unknown decision: ${decision}` };
  }
}

// ─── Main consumer loop ───────────────────────────────────────────────────────
async function main() {
  await ensureGroup();
  console.log("[github-action] Waiting for agent.decided events...");

  while (true) {
    try {
      const results = await redis.xreadgroup(
        "GROUP", GROUP, CONSUMER,
        "COUNT", "1",
        "BLOCK", "5000",
        "STREAMS", STREAM, ">"
      );

      if (!results) continue;

      for (const [, messages] of results) {
        for (const [msgId, fields] of messages) {
          const type = fields[fields.indexOf("type") + 1];
          const data = fields[fields.indexOf("data") + 1];

          if (type !== "agent.decided") {
            await redis.xack(STREAM, GROUP, msgId);
            continue;
          }

          let payload;
          try {
            payload = JSON.parse(data);
          } catch (e) {
            console.error("[github-action] Failed to parse payload:", e);
            await redis.xack(STREAM, GROUP, msgId);
            continue;
          }

          console.log(`[github-action] Executing '${payload.decision}' on PR #${payload.number} in ${payload.repo}`);

          try {
            const result = await handleDecision(payload);

            // Broadcast result for dashboard
            await redis.xadd(RESULTS_STREAM, "*",
              "type", "action.executed",
              "data", JSON.stringify({
                prId: payload.prId,
                number: payload.number,
                repo: payload.repo,
                decision: payload.decision,
                result,
                executedAt: new Date().toISOString(),
              })
            );
          } catch (err) {
            console.error(`[github-action] GitHub API error on PR #${payload.number}:`, err.message);
            await redis.xadd(RESULTS_STREAM, "*",
              "type", "action.error",
              "data", JSON.stringify({ prId: payload.prId, error: err.message })
            );
          }

          await redis.xack(STREAM, GROUP, msgId);
        }
      }
    } catch (err) {
      console.error("[github-action] Stream read error:", err.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
