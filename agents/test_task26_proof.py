#!/usr/bin/env python
"""Offline proof units for Task #26 — Make task orchestration an explicit state machine.

Covers: PU3 (transition validation), PU5 (stall timeout), PU6 (proof gate), PU7 (safe_node).
These run without the FastAPI server or Polaris server — pure Python only.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("STALL_TIMEOUT_SECONDS", "2")

PASSED = 0
FAILED = 0


def check(name: str, assertion: bool, message: str = "") -> None:
    global PASSED, FAILED
    if assertion:
        print(f"  PASS: {name}")
        PASSED += 1
    else:
        print(f"  FAIL: {name}: {message}")
        FAILED += 1


# ─────────────────────────────────────────────────────────────────────────────
# PU3 — Transition table rejects invalid preconditions
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== PU3: Transition table rejects invalid preconditions ===")
print("Expected: validate_transition returns (False, [...]) for unmet preconditions")
from transitions import validate_transition

ok, failures = validate_transition(
    "build-started", "build-finished",
    {"proof_units": [{"number": 1, "title": "test"}], "proof_results": {}},
)
check("PU3a: unverified proof unit blocks build-finished", not ok, f"Expected False, got {ok}")
check("PU3b: failure message is populated", len(failures) > 0, f"No failures: {failures}")

ok2, _ = validate_transition("planned", "build-started", {"branch_name": "task/26-test"})
check("PU3c: valid transition with branch passes", ok2, "Expected True")

ok3, _ = validate_transition("any-status", "stalled", {})
check("PU3d: stalled always allowed", ok3, "Expected True for stalled")


# ─────────────────────────────────────────────────────────────────────────────
# PU5 — Stall timeout sets status to stalled
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== PU5: Stall timeout sets status to stalled ===")
print("Expected: _stall_watchdog marks task stalled after timeout (STALL_TIMEOUT_SECONDS=2)")
from task_executor import init_db, save_state, load_state, _stall_watchdog, HITL_NODES

init_db()

_STALL_TASK = 8800  # isolated task number for this test

stall_state = {
    "task_number":       _STALL_TASK,
    "current_node":      "build",      # must be in HITL_NODES
    "status":            "build-started",
    "branch_name":       "task/8800-test",
    "pr_url":            None,
    "proof_units":       [],
    "proof_results":     {},
    "human_gate_signal": None,         # must be None for watchdog to fire
    "retry_count":       0,
    "error_log":         [],
    "review_evidence":   {},
    "checkpoint_data":   {},
}
save_state(stall_state)
check("PU5a: build is in HITL_NODES", "build" in HITL_NODES, f"HITL_NODES: {HITL_NODES}")

asyncio.run(_stall_watchdog(_STALL_TASK, timeout=2))
after = load_state(_STALL_TASK)
check("PU5b: status set to stalled after timeout", after["status"] == "stalled",
      f"Got: {after['status']}")
check("PU5c: current_node unchanged (still build)", after["current_node"] == "build",
      f"Got: {after['current_node']}")


# ─────────────────────────────────────────────────────────────────────────────
# PU6 — Proof gate blocks finish_build when proof units unverified
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== PU6: Proof gate blocks finish_build when proof units unverified ===")
print("Expected: finish_build_node routes back to build when units are unverified")
from task_graph import finish_build_node

pgu_state = {
    "task_number":       77,
    "current_node":      "finish_build",
    "status":            "build-started",
    "branch_name":       "task/77",
    "pr_url":            None,
    "proof_units":       [{"number": 1, "title": "test unit"}],
    "proof_results":     {},
    "human_gate_signal": None,
    "retry_count":       0,
    "error_log":         [],
    "review_evidence":   {},
    "checkpoint_data":   {},
}
result = finish_build_node(pgu_state)
check("PU6a: routed back to build on unverified proof", result.get("current_node") == "build",
      f"Got: {result.get('current_node')}")
check("PU6b: proof_gate_failed set in checkpoint", result.get("checkpoint_data", {}).get("proof_gate_failed"),
      "proof_gate_failed not set")

# Verify stale flag is cleared on re-pass
pgu_pass_state = {**pgu_state, "proof_results": {"1": True},
                  "checkpoint_data": {"proof_gate_failed": True, "unverified_units": ["1"]}}
result2 = finish_build_node(pgu_pass_state)
check("PU6c: routed to finish_build when proof passes", result2.get("current_node") == "finish_build",
      f"Got: {result2.get('current_node')}")
check("PU6d: proof_gate_failed cleared on re-pass",
      not result2.get("checkpoint_data", {}).get("proof_gate_failed"),
      f"proof_gate_failed still set: {result2.get('checkpoint_data')}")
check("PU6e: unverified_units cleared on re-pass",
      "unverified_units" not in result2.get("checkpoint_data", {}),
      f"unverified_units still present: {result2.get('checkpoint_data')}")


# ─────────────────────────────────────────────────────────────────────────────
# PU7 — @safe_node returns status=failed on exception
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== PU7: @safe_node returns status=failed on unhandled exception ===")
print("Expected: safe_node catches exception, returns {status: failed, error_log: [...]}")
from node_utils import safe_node

@safe_node
def exploding_node(state):
    raise RuntimeError("deliberate test failure")

sn_state = {
    "task_number": 55, "current_node": "test", "status": "build-started",
    "branch_name": "", "pr_url": None, "proof_units": [], "proof_results": {},
    "human_gate_signal": None, "retry_count": 0, "error_log": [],
    "review_evidence": {}, "checkpoint_data": {},
}
result3 = exploding_node(sn_state)
check("PU7a: status set to failed", result3["status"] == "failed", f"Got: {result3['status']}")
check("PU7b: error appended to error_log", len(result3["error_log"]) > 0,
      f"error_log: {result3['error_log']}")
check("PU7c: error_log contains node name", "exploding_node" in result3["error_log"][0],
      f"entry: {result3['error_log']}")
check("PU7d: retry_count incremented", result3["retry_count"] == 1,
      f"retry_count: {result3['retry_count']}")

# failed-state pass-through
@safe_node
def overwriting_node(state):
    return {**state, "status": "production"}

result4 = overwriting_node({**sn_state, "status": "failed"})
check("PU7e: failed-state pass-through prevents overwrite", result4["status"] == "failed",
      f"Got: {result4['status']}")


# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{'=' * 50}")
print(f"Results: {PASSED} passed, {FAILED} failed")
if FAILED > 0:
    sys.exit(1)
print("PASS: All task #26 offline proof units validated!")
