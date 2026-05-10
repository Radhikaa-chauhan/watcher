from __future__ import annotations
import asyncio
import json
import os
import traceback
from datetime import datetime

import redis.asyncio as aioredis

from src.graph import build_graph
from src.state import PRState

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
CONSUMER_GROUP = "agent-group"
CONSUMER_NAME = "agent-1"
STREAM = "events:pr"
DECISIONS_STREAM = "events:decisions"

graph = build_graph()


async def ensure_consumer_group(r: aioredis.Redis):
    try:
        await r.xgroup_create(STREAM, CONSUMER_GROUP, id="0", mkstream=True)
        print(f"[agent] Created consumer group '{CONSUMER_GROUP}'")
    except Exception as e:
        if "BUSYGROUP" in str(e):
            print(f"[agent] Consumer group '{CONSUMER_GROUP}' already exists")
        else:
            raise


async def process_event(r: aioredis.Redis, message_id: str, fields: dict):
    event_type = fields.get("type")
    if event_type != "pr.scored":
        await r.xack(STREAM, CONSUMER_GROUP, message_id)
        return

    raw = fields.get("data", "{}")
    pr_data = json.loads(raw)
    pr_number = pr_data.get("number", "?")
    repo = pr_data.get("repoFullName", "?")

    print(f"[agent] Processing PR #{pr_number} in {repo} (score={pr_data.get('score')})")

    # Broadcast "agent.thinking" to dashboard
    await r.xadd("events:decisions", {
        "type": "agent.thinking",
        "data": json.dumps({"prId": pr_data.get("id"), "number": pr_number, "repo": repo}),
    })

    # Build initial state from detection result
    state: PRState = {
        "id": pr_data.get("id", ""),
        "number": pr_data.get("number", 0),
        "title": pr_data.get("title", ""),
        "body": pr_data.get("body", ""),
        "author": pr_data.get("author", ""),
        "author_association": pr_data.get("authorAssociation", "NONE"),
        "repo_full_name": pr_data.get("repoFullName", ""),
        "repo_owner": pr_data.get("repoOwner", ""),
        "repo_name": pr_data.get("repoName", ""),
        "head_sha": pr_data.get("headSha", ""),
        "base_branch": pr_data.get("baseBranch", "main"),
        "additions": pr_data.get("additions", 0),
        "deletions": pr_data.get("deletions", 0),
        "changed_files": pr_data.get("changedFiles", 0),
        "created_at": pr_data.get("createdAt", ""),
        "url": pr_data.get("url", ""),
        "score": pr_data.get("score", 0),
        "signals": pr_data.get("signals", []),
        "detected_at": pr_data.get("detectedAt", datetime.utcnow().isoformat()),
        "messages": [],
        "agent_reasoning": None,
        "iterations": 0,
        "decision": None,
        "comment_body": None,
        "confidence": None,
        "action_taken": None,
        "action_result": None,
        "error": None,
    }

    try:
        final_state = await asyncio.to_thread(graph.invoke, state)
        decision_payload = {
            "prId": final_state["id"],
            "number": final_state["number"],
            "repo": final_state["repo_full_name"],
            "repoOwner": final_state["repo_owner"],
            "repoName": final_state["repo_name"],
            "decision": final_state["decision"],
            "actionTaken": final_state["action_taken"],
            "actionResult": final_state.get("action_result"),
            "commentBody": final_state.get("comment_body"),
            "agentReasoning": final_state.get("agent_reasoning"),
            "score": final_state["score"],
            "decidedAt": datetime.utcnow().isoformat(),
        }

        await r.xadd(DECISIONS_STREAM, {
            "type": "agent.decided",
            "data": json.dumps(decision_payload),
        })

        print(f"[agent] PR #{pr_number} → decision: {final_state['decision']} | action: {final_state['action_taken']}")

    except Exception as e:
        print(f"[agent] ERROR processing PR #{pr_number}: {e}")
        traceback.print_exc()
        await r.xadd(DECISIONS_STREAM, {
            "type": "agent.error",
            "data": json.dumps({"prId": pr_data.get("id"), "error": str(e)}),
        })
    finally:
        await r.xack(STREAM, CONSUMER_GROUP, message_id)


async def main():
    print(f"[agent] Connecting to Redis at {REDIS_URL}")
    r = await aioredis.from_url(REDIS_URL, decode_responses=True)
    await ensure_consumer_group(r)
    print("[agent] Waiting for pr.scored events...")

    while True:
        try:
            results = await r.xreadgroup(
                CONSUMER_GROUP, CONSUMER_NAME,
                {STREAM: ">"},
                count=1,
                block=5000,  # block for 5s then loop
            )
            if not results:
                continue

            for _stream, messages in results:
                for message_id, fields in messages:
                    await process_event(r, message_id, fields)

        except Exception as e:
            print(f"[agent] Stream read error: {e}")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
