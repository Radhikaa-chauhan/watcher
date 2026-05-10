from __future__ import annotations
import json
import os
from typing import Literal


from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import StateGraph, END

from .state import PRState
from .tools import TOOLS, TOOL_NAMES

# ─── Model setup ──────────────────────────────────────────────────────────────
MODEL = os.environ.get("AGENT_MODEL", "llama-3.3-70b-versatile")
SPAM_THRESHOLD = int(os.environ.get("SPAM_SCORE_THRESHOLD", "70"))
UNSURE_LOW = int(os.environ.get("UNSURE_SCORE_LOW", "50"))
UNSURE_HIGH = int(os.environ.get("UNSURE_SCORE_HIGH", "70"))
MAX_ITERATIONS = 3

llm = ChatGroq(model=MODEL, max_tokens=1024).bind_tools(TOOLS)

SYSTEM_PROMPT = """You are a PR review agent for an open-source repository.
Your job is to evaluate pull requests and decide what action to take.

You have access to these tools:
- post_comment: post a comment on the PR
- close_pr: close the PR (use only when clearly spam)
- approve_pr: mark as legitimate (use when clearly genuine)
- request_more_info: ask the author specific questions
- escalate_to_maintainer: flag for human review

Decision guidelines:
- Score > 75 AND multiple strong signals → close_pr
- Score 50–75 AND ambiguous signals → request_more_info or post_comment
- Score < 50 AND no red flags → approve_pr
- When genuinely unsure after 2 rounds → escalate_to_maintainer

Always be polite and constructive. Explain your reasoning.
Never close a PR without a comment explaining why.
"""

# ─── Node: classify ───────────────────────────────────────────────────────────
def classify(state: PRState) -> PRState:
    """
    Fast rule-based pre-classifier. If the score is extreme, skip the LLM.
    Only sends borderline PRs to the expensive agent_decide node.
    """
    score = state["score"]
    return {
        **state,
        "iterations": 0,
        "messages": [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=_build_pr_summary(state)),
        ],
    }


def route_after_classify(state: PRState) -> Literal["agent_decide", "auto_approve"]:
    score = state["score"]
    if score < 30:
        return "auto_approve"
    return "agent_decide"


# ─── Node: auto_approve ───────────────────────────────────────────────────────
def auto_approve(state: PRState) -> PRState:
    """Skip LLM for clearly clean PRs (score < 30)."""
    return {
        **state,
        "decision": "approve",
        "comment_body": None,
        "agent_reasoning": f"Auto-approved: score {state['score']} is below threshold",
        "confidence": 95,
    }


# ─── Node: agent_decide ───────────────────────────────────────────────────────
def agent_decide(state: PRState) -> PRState:
    """Call the Groq-hosted model to reason about the PR and pick a tool."""
    response = llm.invoke(state["messages"])
    iterations = state.get("iterations", 0) + 1

    return {
        **state,
        "messages": state["messages"] + [response],
        "iterations": iterations,
        "agent_reasoning": response.content if isinstance(response.content, str) else str(response.content),
    }


def route_after_decide(state: PRState) -> Literal["execute_action", "agent_decide", "force_escalate"]:
    """Check if the LLM called a tool or needs to loop."""
    last_msg = state["messages"][-1]
    iterations = state.get("iterations", 0)

    # Model called a tool → execute it
    if hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
        return "execute_action"

    # No tool call but not at limit → loop
    if iterations < MAX_ITERATIONS:
        return "agent_decide"

    # Exceeded iteration limit → force escalation
    return "force_escalate"


# ─── Node: execute_action ─────────────────────────────────────────────────────
def execute_action(state: PRState) -> PRState:
    """Execute the tool the LLM chose and record the result."""
    last_msg = state["messages"][-1]
    tool_call = last_msg.tool_calls[0]  # we always take the first tool call

    tool_fn = TOOL_NAMES.get(tool_call["name"])
    if not tool_fn:
        result = {"error": f"Unknown tool: {tool_call['name']}"}
        decision = "error"
    else:
        result = tool_fn.invoke(tool_call["args"])
        decision = result.get("action", "unknown")

    # Add ToolMessage so the conversation stays valid
    tool_message = ToolMessage(
        content=json.dumps(result),
        tool_call_id=tool_call["id"],
    )

    return {
        **state,
        "messages": state["messages"] + [tool_message],
        "decision": decision,
        "action_taken": tool_call["name"],
        "action_result": json.dumps(result),
        "comment_body": result.get("comment") or result.get("note"),
    }


# ─── Node: force_escalate ─────────────────────────────────────────────────────
def force_escalate(state: PRState) -> PRState:
    return {
        **state,
        "decision": "escalate",
        "action_taken": "escalate_to_maintainer",
        "action_result": json.dumps({"reason": "Agent exceeded max iterations without deciding"}),
        "comment_body": "This PR has been flagged for human review.",
    }


# ─── Node: broadcast ──────────────────────────────────────────────────────────
# (Actual Redis publish happens in main.py after the graph finishes)
def broadcast(state: PRState) -> PRState:
    return state


# ─── Build graph ──────────────────────────────────────────────────────────────
def build_graph() -> StateGraph:
    g = StateGraph(PRState)

    g.add_node("classify", classify)
    g.add_node("auto_approve", auto_approve)
    g.add_node("agent_decide", agent_decide)
    g.add_node("execute_action", execute_action)
    g.add_node("force_escalate", force_escalate)
    g.add_node("broadcast", broadcast)

    g.set_entry_point("classify")

    g.add_conditional_edges("classify", route_after_classify, {
        "auto_approve": "auto_approve",
        "agent_decide": "agent_decide",
    })

    g.add_edge("auto_approve", "broadcast")

    g.add_conditional_edges("agent_decide", route_after_decide, {
        "execute_action": "execute_action",
        "agent_decide": "agent_decide",  # loop
        "force_escalate": "force_escalate",
    })

    g.add_edge("execute_action", "broadcast")
    g.add_edge("force_escalate", "broadcast")
    g.add_edge("broadcast", END)

    return g.compile()


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _build_pr_summary(state: PRState) -> str:
    signals_text = "\n".join(
        f"  • {s['name']}: score={s['score']} weight={s['weight']} — {s['detail']}"
        for s in state.get("signals", [])
    )
    return f"""
PR #{state['number']} in {state['repo_full_name']}
URL: {state['url']}

Title: {state['title']}
Author: {state['author']} ({state['author_association']})
Body: {state['body'][:1000] or '(empty)'}

Diff: +{state['additions']} -{state['deletions']} across {state['changed_files']} files

Detection score: {state['score']}/100  (higher = more suspicious)
Detector signals:
{signals_text}

Decide what action to take. Use exactly one tool.
""".strip()
