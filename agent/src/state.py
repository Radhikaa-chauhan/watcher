from __future__ import annotations
from typing import TypedDict, Optional, Any
from langgraph.graph.message import add_messages
from typing import Annotated


class Signal(TypedDict):
    name: str
    score: int
    weight: float
    detail: str


class PRState(TypedDict):
    # ── PR metadata ────────────────────────────────────────────────
    id: str
    number: int
    title: str
    body: str
    author: str
    author_association: str
    repo_full_name: str
    repo_owner: str
    repo_name: str
    head_sha: str
    base_branch: str
    additions: int
    deletions: int
    changed_files: int
    created_at: str
    url: str

    # ── Detection results ─────────────────────────────────────────
    score: int
    signals: list[Signal]
    detected_at: str

    # ── Agent reasoning ───────────────────────────────────────────
    # LangGraph accumulates messages across turns
    messages: Annotated[list[Any], add_messages]
    agent_reasoning: Optional[str]
    iterations: int  # loop counter — prevents infinite loops

    # ── Decision ──────────────────────────────────────────────────
    decision: Optional[str]       # "close" | "approve" | "comment" | "escalate"
    comment_body: Optional[str]   # comment to post on the PR
    confidence: Optional[int]     # 0–100

    # ── Execution ─────────────────────────────────────────────────
    action_taken: Optional[str]
    action_result: Optional[str]
    error: Optional[str]
