from __future__ import annotations
from langchain_core.tools import tool


@tool
def post_comment(comment: str) -> dict:
    """
    Post a comment on the pull request.

    Use this when you want to explain why you're flagging the PR,
    ask the author for more information, or provide feedback.

    Args:
        comment: The markdown comment body to post. Be specific,
                 constructive, and explain what needs to be fixed.

    Returns a dict with the action details for the executor.
    """
    return {"action": "post_comment", "comment": comment}


@tool
def close_pr(reason: str, comment: str) -> dict:
    """
    Close the pull request as spam or low quality.

    Only use this when you're highly confident (score > 75) the PR
    is spam, a duplicate, or fundamentally unusable.

    Args:
        reason: Short internal reason code, e.g. "spam", "empty_body",
                "test_commit", "duplicate"
        comment: The comment to post BEFORE closing. Must be polite
                 and explain exactly why the PR is being closed.

    Returns a dict with the action details for the executor.
    """
    return {"action": "close_pr", "reason": reason, "comment": comment}


@tool
def approve_pr(note: str) -> dict:
    """
    Mark the PR as cleared (not spam) and leave a welcoming comment.

    Use when the PR looks legitimate despite a moderate score,
    e.g. a first-time contributor with a short but genuine change.

    Args:
        note: A short welcoming comment for the author.

    Returns a dict with the action details for the executor.
    """
    return {"action": "approve_pr", "note": note}


@tool
def request_more_info(questions: list[str]) -> dict:
    """
    Post a comment asking the author for more information.

    Use when you're unsure and need clarification before deciding.
    This keeps the PR open but asks the author to respond.

    Args:
        questions: List of specific questions to ask the author.
                   Be concrete — 'what does this fix?' not 'explain yourself'.

    Returns a dict with the action details for the executor.
    """
    formatted = "\n".join(f"- {q}" for q in questions)
    comment = f"Thanks for the PR! Before we can review it, could you help us with:\n\n{formatted}"
    return {"action": "post_comment", "comment": comment}


@tool
def escalate_to_maintainer(reason: str) -> dict:
    """
    Flag this PR for human maintainer review.

    Use when you genuinely cannot decide — the signals are ambiguous
    and a human should make the call. Do not use as a lazy fallback.

    Args:
        reason: Specific reason why this needs human review.

    Returns a dict that will broadcast an escalation event to the dashboard.
    """
    return {"action": "escalate", "reason": reason}


# Registry exported to the graph
TOOLS = [post_comment, close_pr, approve_pr, request_more_info, escalate_to_maintainer]
TOOL_NAMES = {t.name: t for t in TOOLS}
