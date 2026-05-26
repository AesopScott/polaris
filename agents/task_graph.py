"""
LangGraph StateGraph definition for task orchestration.

Graph topology:
  plan → start_build → build (HITL) → finish_build → review (HITL)
       → codex_review → stage_decision → promote_stage → promote_prod → END
                      ↘ build (retry on review rejection)
  finish_build can route to build (retry) if proof gate fails.
  failed_smoke is a dead-end node for post-promotion smoke failures.

HITL_NODES: set of node names where interrupt() suspends execution until
            /signal delivers a Command(resume=...) value.
"""

import json
import os
import urllib.request
from typing import Any, Dict, Optional, Set

from langgraph.graph import StateGraph, END
from langgraph.types import interrupt
from state import TaskState
from node_utils import safe_node
from transitions import validate_transition


# Nodes where the executor suspends and waits for a human signal
HITL_NODES: Set[str] = {"build", "review"}


# ─────────────────────────────────────────────────────────────────────────────
# Idempotent guard — skip dispatch_agent when checkpoint shows work is done
# ─────────────────────────────────────────────────────────────────────────────

def _already_done(state: Dict[str, Any], checkpoint_key: str) -> bool:
    """Return True when checkpoint_data[checkpoint_key] is truthy.

    Nodes use this to skip their dispatch_agent call on re-entry after a
    process restart.  MemorySaver is ephemeral, so after a restart the graph
    re-runs from the entry point; idempotent guards prevent re-firing
    expensive /dispatch-agent calls for work that SQLite already recorded.
    """
    return bool(state.get("checkpoint_data", {}).get(checkpoint_key))


# ─────────────────────────────────────────────────────────────────────────────
# dispatch_agent — send a prompt to a Polaris agent via /dispatch-agent
# ─────────────────────────────────────────────────────────────────────────────

def dispatch_agent(task_number: int, prompt: str, agent: str = "sonnet", timeout: int = 300) -> str:
    """Call server.js POST /dispatch-agent to run a real agent session.

    Returns the agent's text response.
    Raises RuntimeError if the HTTP request fails or the server returns an error.
    """
    server_port = int(os.environ.get("SERVER_PORT", "40000"))
    payload = json.dumps(
        {"agent": agent, "prompt": prompt, "task_number": task_number}
    ).encode()
    req = urllib.request.Request(
        f"http://localhost:{server_port}/dispatch-agent",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read())
    if not data.get("ok"):
        raise RuntimeError(f"/dispatch-agent failed: {data.get('error', 'unknown error')}")
    return data.get("response", "")


# ─────────────────────────────────────────────────────────────────────────────
# Node functions — each returns an updated TaskState slice
# ─────────────────────────────────────────────────────────────────────────────

@safe_node
def plan_node(state: TaskState) -> Dict[str, Any]:
    if _already_done(state, "plan_complete"):
        return {"current_node": "plan", "status": "planned",
                "checkpoint_data": state.get("checkpoint_data", {})}
    task_number = state["task_number"]
    response = dispatch_agent(task_number, f"/plan-task {task_number}", agent="sonnet")
    return {
        "current_node": "plan",
        "status": "planned",
        "checkpoint_data": {
            **state.get("checkpoint_data", {}),
            "plan_complete": True,
            "plan_response": response[:500],
        },
    }


@safe_node
def start_build_node(state: TaskState) -> Dict[str, Any]:
    if _already_done(state, "branch_created"):
        return {
            "current_node": "start_build",
            "status": "build-started",
            "branch_name": state.get("branch_name") or f"task/{state['task_number']}-orchestration",
            "checkpoint_data": state.get("checkpoint_data", {}),
        }
    task_number = state["task_number"]
    response = dispatch_agent(task_number, f"/start-build {task_number}", agent="sonnet")
    return {
        "current_node": "start_build",
        "status": "build-started",
        "branch_name": state.get("branch_name") or f"task/{task_number}-orchestration",
        "checkpoint_data": {
            **state.get("checkpoint_data", {}),
            "branch_created": True,
            "start_build_response": response[:500],
        },
    }


@safe_node
def build_node(state: TaskState) -> Dict[str, Any]:
    """HITL gate — suspends here via interrupt() until human signals code_done."""
    signal = interrupt({"node": "build", "awaiting": "code_done"})
    return {
        "current_node": "build",
        "human_gate_signal": signal,
        "checkpoint_data": {**state.get("checkpoint_data", {}), "code_done": True},
    }


@safe_node
def finish_build_node(state: TaskState) -> Dict[str, Any]:
    """Proof gate — verifies all proof units before advancing."""
    # Idempotent: skip all checks if finish-build already ran (restart safety).
    # Placed before the proof gate and precondition so a desynchronised status
    # field after restart cannot block replay through completed work.
    if _already_done(state, "pr_opened"):
        clean_checkpoint = {
            k: v for k, v in state.get("checkpoint_data", {}).items()
            if k not in ("proof_gate_failed", "unverified_units")
        }
        return {
            "current_node": "finish_build",
            "status": "build-finished",
            "pr_url": state.get("pr_url"),
            "checkpoint_data": clean_checkpoint,
        }

    proof_units = state.get("proof_units", [])
    proof_results = state.get("proof_results", {})

    unverified = []
    for unit in proof_units:
        num = str(unit.get("number", ""))
        waived = unit.get("proofType") == "waiver" or unit.get("waiverGuidance") == "waived"
        if (num not in proof_results or not proof_results[num]) and not waived:
            unverified.append(num)

    if unverified:
        return {
            "current_node": "build",
            "checkpoint_data": {
                **state.get("checkpoint_data", {}),
                "proof_gate_failed": True,
                "unverified_units": unverified,
            },
        }

    # Enforce precondition before setting status (catches multi-hop paths too)
    ok, failures = validate_transition(state.get("status", ""), "build-finished", state)
    if not ok:
        raise ValueError(f"Precondition failed for build-finished: {failures}")

    task_number = state["task_number"]
    response = dispatch_agent(task_number, "/finish-build", agent="sonnet")

    # Clear stale proof-gate flags so _route_finish_build won't re-route on re-check
    clean_checkpoint = {
        k: v for k, v in state.get("checkpoint_data", {}).items()
        if k not in ("proof_gate_failed", "unverified_units")
    }
    return {
        "current_node": "finish_build",
        "status": "build-finished",
        "pr_url": state.get("pr_url"),
        "checkpoint_data": {
            **clean_checkpoint,
            "pr_opened": True,
            "finish_build_response": response[:500],
        },
    }


@safe_node
def review_node(state: TaskState) -> Dict[str, Any]:
    """HITL gate — suspends here via interrupt() until human signals approved/request_changes."""
    signal = interrupt({"node": "review", "awaiting": "approved or request_changes"})
    return {
        "current_node": "review",
        "human_gate_signal": signal,
        "review_evidence": {**state.get("review_evidence", {}), "review_started": True},
        "checkpoint_data": {**state.get("checkpoint_data", {}), "review_complete": True},
    }


@safe_node
def codex_review_node(state: TaskState) -> Dict[str, Any]:
    if _already_done(state, "codex_reviewed"):
        return {
            "current_node": "codex_review",
            "status": "cba-complete",
            "review_evidence": state.get("review_evidence", {}),
            "checkpoint_data": state.get("checkpoint_data", {}),
        }
    ok, failures = validate_transition(state.get("status", ""), "cba-complete", state)
    if not ok:
        raise ValueError(f"Precondition failed for cba-complete: {failures}")
    task_number = state["task_number"]
    response = dispatch_agent(task_number, "/codex-review", agent="codex")
    return {
        "current_node": "codex_review",
        "status": "cba-complete",
        "review_evidence": {
            **state.get("review_evidence", {}),
            "codex_reviewed": True,
            "codex_response": response[:500],
        },
        "checkpoint_data": {
            **state.get("checkpoint_data", {}),
            "codex_reviewed": True,
        },
    }


@safe_node
def stage_decision_node(state: TaskState) -> Dict[str, Any]:
    """Routing node — no state mutation; conditional edges handle routing."""
    return {"current_node": "stage_decision"}


@safe_node
def promote_stage_node(state: TaskState) -> Dict[str, Any]:
    if _already_done(state, "promoted_to_stage"):
        return {"current_node": "promote_stage", "status": "staged",
                "checkpoint_data": state.get("checkpoint_data", {})}
    ok, failures = validate_transition(state.get("status", ""), "staged", state)
    if not ok:
        raise ValueError(f"Precondition failed for staged: {failures}")
    task_number = state["task_number"]
    response = dispatch_agent(task_number, "/promote-stage", agent="sonnet")
    return {
        "current_node": "promote_stage",
        "status": "staged",
        "checkpoint_data": {
            **state.get("checkpoint_data", {}),
            "promoted_to_stage": True,
            "promote_stage_response": response[:500],
        },
    }


@safe_node
def promote_prod_node(state: TaskState) -> Dict[str, Any]:
    if _already_done(state, "promoted_to_prod"):
        return {"current_node": "promote_prod", "status": "production",
                "checkpoint_data": state.get("checkpoint_data", {})}
    task_number = state["task_number"]
    response = dispatch_agent(task_number, "/promote-to-prod", agent="sonnet")
    return {
        "current_node": "promote_prod",
        "status": "production",
        "checkpoint_data": {
            **state.get("checkpoint_data", {}),
            "promoted_to_prod": True,
            "promote_prod_response": response[:500],
        },
    }


@safe_node
def failed_smoke_node(state: TaskState) -> Dict[str, Any]:
    """Dead-end node for post-promotion smoke test failures."""
    return {
        "current_node": "failed_smoke",
        "checkpoint_data": {**state.get("checkpoint_data", {}), "smoke_failed": True},
    }


# ─────────────────────────────────────────────────────────────────────────────
# Routing functions
# ─────────────────────────────────────────────────────────────────────────────

def _route_finish_build(state: TaskState) -> str:
    """If proof gate failed, go back to build; otherwise continue."""
    if state.get("checkpoint_data", {}).get("proof_gate_failed"):
        return "build"
    return "review"


def _route_stage_decision(state: TaskState) -> str:
    """Route based on codex review outcome."""
    evidence = state.get("review_evidence", {})
    if evidence.get("request_changes"):
        return "build"
    if evidence.get("smoke_failed"):
        return "failed_smoke"
    return "promote_stage"


# ─────────────────────────────────────────────────────────────────────────────
# Graph builder
# ─────────────────────────────────────────────────────────────────────────────

def build_graph(checkpointer=None) -> StateGraph:
    """Compile the StateGraph with all nodes, edges, and conditional routing.

    Pass a MemorySaver (or compatible) checkpointer to enable interrupt() support.
    Without a checkpointer, interrupt() will raise at runtime.
    """
    graph = StateGraph(TaskState)

    graph.add_node("plan",           plan_node)
    graph.add_node("start_build",    start_build_node)
    graph.add_node("build",          build_node)
    graph.add_node("finish_build",   finish_build_node)
    graph.add_node("review",         review_node)
    graph.add_node("codex_review",   codex_review_node)
    graph.add_node("stage_decision", stage_decision_node)
    graph.add_node("promote_stage",  promote_stage_node)
    graph.add_node("promote_prod",   promote_prod_node)
    graph.add_node("failed_smoke",   failed_smoke_node)

    graph.set_entry_point("plan")

    graph.add_edge("plan",          "start_build")
    graph.add_edge("start_build",   "build")
    graph.add_edge("build",         "finish_build")
    graph.add_conditional_edges("finish_build", _route_finish_build,
                                {"build": "build", "review": "review"})
    graph.add_edge("review",        "codex_review")
    graph.add_edge("codex_review",  "stage_decision")
    graph.add_conditional_edges("stage_decision", _route_stage_decision,
                                {"build": "build", "failed_smoke": "failed_smoke",
                                 "promote_stage": "promote_stage"})
    graph.add_edge("promote_stage", "promote_prod")
    graph.add_edge("promote_prod",  END)
    graph.add_edge("failed_smoke",  END)

    return graph.compile(checkpointer=checkpointer)


if __name__ == "__main__":
    try:
        g = build_graph()
        print("OK")
    except Exception as e:
        print(f"ERROR: {e}")
        exit(1)
