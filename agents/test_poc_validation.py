"""
test_poc_validation.py — Task #34 POC validation smoke tests.

Cases:
  --case idempotent-guard   PU2: all 6 guarded nodes skip dispatch_agent when checkpoint key set
  --case restart-survival   PU3: cold /advance after executor restart returns paused at build gate

Usage:
  python test_poc_validation.py --case idempotent-guard
  python test_poc_validation.py --case restart-survival

The restart-survival case requires the task executor to be running on port 4001.
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
from typing import Optional
from unittest.mock import patch

EXECUTOR_PORT = 4001
TEST_TASK = 9901   # synthetic task number; must not exist in backlog.json


# ─────────────────────────────────────────────────────────────────────────────
# Case: idempotent-guard (PU2)
# ─────────────────────────────────────────────────────────────────────────────

def case_idempotent_guard() -> bool:
    """Verify all 6 guarded nodes skip dispatch_agent when their checkpoint key is set:
    plan_node, start_build_node, finish_build_node, codex_review_node,
    promote_stage_node, promote_prod_node.
    """
    from task_graph import (
        plan_node, start_build_node, finish_build_node,
        codex_review_node, promote_stage_node, promote_prod_node,
    )

    def _base_state(**checkpoint_overrides):
        return {
            "task_number": TEST_TASK,
            "current_node": "START",
            "status": "planned",
            "branch_name": f"task/{TEST_TASK}-test",
            "pr_url": None,
            "proof_units": [],
            "proof_results": {},
            "human_gate_signal": None,
            "retry_count": 0,
            "error_log": [],
            "review_evidence": {"codex_reviewed": True},   # for codex guard check
            "checkpoint_data": checkpoint_overrides,
        }

    failures = []

    # --- plan_node ---
    called = []
    with patch("task_graph.dispatch_agent", side_effect=lambda *a, **kw: called.append(a) or "MOCK"):
        state = _base_state(plan_complete=True)
        result = plan_node(state)
    if called:
        failures.append("plan_node: dispatch_agent was called despite plan_complete=True")
    elif result.get("status") != "planned":
        failures.append(f"plan_node: expected status='planned', got '{result.get('status')}'")
    else:
        print("  OK plan_node: skipped dispatch_agent [OK]")

    # --- start_build_node ---
    called.clear()
    with patch("task_graph.dispatch_agent", side_effect=lambda *a, **kw: called.append(a) or "MOCK"):
        state = _base_state(branch_created=True)
        result = start_build_node(state)
    if called:
        failures.append("start_build_node: dispatch_agent called despite branch_created=True")
    elif result.get("status") != "build-started":
        failures.append(f"start_build_node: expected 'build-started', got '{result.get('status')}'")
    else:
        print("  OK start_build_node: skipped dispatch_agent [OK]")

    # --- finish_build_node ---
    called.clear()
    with patch("task_graph.dispatch_agent", side_effect=lambda *a, **kw: called.append(a) or "MOCK"):
        # Guard fires at top of function (before proof gate), so proof_units/results irrelevant
        state = _base_state(pr_opened=True)
        state["status"] = "build-started"
        result = finish_build_node(state)
    if called:
        failures.append("finish_build_node: dispatch_agent called despite pr_opened=True")
    elif result.get("status") != "build-finished":
        failures.append(f"finish_build_node: expected 'build-finished', got '{result.get('status')}'")
    else:
        print("  OK finish_build_node: skipped dispatch_agent [OK]")

    # --- codex_review_node ---
    called.clear()
    with patch("task_graph.dispatch_agent", side_effect=lambda *a, **kw: called.append(a) or "MOCK"):
        state = _base_state(codex_reviewed=True)
        # Also need review_evidence.codex_reviewed so guard fires
        state["status"] = "build-finished"
        result = codex_review_node(state)
    if called:
        failures.append("codex_review_node: dispatch_agent called despite codex_reviewed=True")
    elif result.get("status") != "cba-complete":
        failures.append(f"codex_review_node: expected 'cba-complete', got '{result.get('status')}'")
    else:
        print("  OK codex_review_node: skipped dispatch_agent [OK]")

    # --- promote_stage_node ---
    called.clear()
    with patch("task_graph.dispatch_agent", side_effect=lambda *a, **kw: called.append(a) or "MOCK"):
        state = _base_state(promoted_to_stage=True)
        state["status"] = "cba-complete"
        result = promote_stage_node(state)
    if called:
        failures.append("promote_stage_node: dispatch_agent called despite promoted_to_stage=True")
    elif result.get("status") != "staged":
        failures.append(f"promote_stage_node: expected 'staged', got '{result.get('status')}'")
    else:
        print("  OK promote_stage_node: skipped dispatch_agent [OK]")

    # --- promote_prod_node ---
    called.clear()
    with patch("task_graph.dispatch_agent", side_effect=lambda *a, **kw: called.append(a) or "MOCK"):
        state = _base_state(promoted_to_prod=True)
        state["status"] = "staged"
        result = promote_prod_node(state)
    if called:
        failures.append("promote_prod_node: dispatch_agent called despite promoted_to_prod=True")
    elif result.get("status") != "production":
        failures.append(f"promote_prod_node: expected 'production', got '{result.get('status')}'")
    else:
        print("  OK promote_prod_node: skipped dispatch_agent [OK]")

    if failures:
        for f in failures:
            print(f"  FAIL: {f}")
        return False
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Case: restart-survival (PU3)
# ─────────────────────────────────────────────────────────────────────────────

def _post(path: str, body: Optional[dict] = None, method: str = "POST") -> dict:
    data = json.dumps(body or {}).encode() if body is not None else None
    url = f"http://127.0.0.1:{EXECUTOR_PORT}{path}"
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"} if data else {},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def _get(path: str) -> dict:
    url = f"http://127.0.0.1:{EXECUTOR_PORT}{path}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


def case_restart_survival() -> bool:
    """Automated pre-check for PU3 restart-survival (requires live executor on port 4001).

    This case verifies that task #{TEST_TASK} reaches and PAUSES at the build gate
    after a first /advance call.  That paused state is the precondition for the
    manual restart procedure below.

    PASS requires: status == "paused" AND current_node == "build".
    Any other outcome (precondition_failed, ok, error) is a FAIL — do not mask
    setup errors as passes.

    Prerequisites:
      - Task executor running: cd agents && python task_executor.py
      - Task #{TEST_TASK} must exist in backlog.json in 'planned' or 'build-started' status.
        Use a real task number if 9901 does not exist.

    For the full restart test, after this case passes run the manual procedure:
      1. Confirm task is paused at build gate (this case shows paused)
      2. Kill the executor (Ctrl+C or kill process)
      3. Restart: cd agents && python task_executor.py
      4. POST /advance task_number={TEST_TASK}
      5. Expected: {{"status": "paused", "current_node": "build"}}
    """
    print("  Checking executor health...")
    try:
        health = _get("/health")
    except Exception as e:
        print(f"  FAIL: executor not reachable on port {EXECUTOR_PORT}: {e}")
        print("  Start the executor with: cd agents && python task_executor.py")
        return False
    print(f"  OK health: {health}")

    # Advance the test task — should run plan → start_build (both idempotent via
    # checkpoint guards if state exists) → build interrupt
    print(f"  Advancing task #{TEST_TASK} (first advance — may run plan+start_build)...")
    try:
        r = _post("/advance", {"task_number": TEST_TASK})
    except Exception as e:
        print(f"  FAIL: /advance failed: {e}")
        return False

    status = r.get("status")
    node = r.get("current_node")
    print(f"  /advance → status={status}, current_node={node}")

    if status == "paused" and node == "build":
        print("  OK: task paused at build gate after first advance [OK]")
    elif status == "precondition_failed":
        print(f"  FAIL: precondition_failed — task #{TEST_TASK} is not in a runnable state: {r}")
        print(f"  Ensure task #{TEST_TASK} exists in backlog.json with status 'planned' or")
        print("  'build-started', then retry.")
        return False
    elif status == "ok":
        print(f"  FAIL: graph completed without pausing at build gate — task #{TEST_TASK}")
        print(f"  may have reached a terminal state. Check backlog.json status: {r}")
        return False
    else:
        print(f"  FAIL: unexpected /advance result: {r}")
        return False

    # Verify state endpoint shows build gate
    print(f"  Checking /state for task #{TEST_TASK}...")
    try:
        state = _get(f"/state?task_number={TEST_TASK}")
    except Exception as e:
        print(f"  FAIL: /state failed: {e}")
        return False

    if state.get("current_node") == "build":
        print(f"  OK: SQLite persists current_node='build' [OK]")
    else:
        print(f"  NOTE: current_node={state.get('current_node')} (may vary by task state)")

    print()
    print("  MANUAL RESTART PROCEDURE (next step to fully validate PU3):")
    print("  1. Task is paused at build gate (confirmed above)")
    print("  2. Kill the executor (Ctrl+C or kill process)")
    print(f"  3. Restart: cd agents && python task_executor.py")
    print(f"  4. POST /advance task_number={TEST_TASK}")
    print("  5. Expected: {\"status\": \"paused\", \"current_node\": \"build\"}")
    print("  6. Mechanism: plan_node and start_build_node have idempotent guards")
    print("     (checkpoint_data[plan_complete/branch_created] in SQLite) so the graph")
    print("     replays past them instantly on cold start and re-suspends at build_node.")

    return True


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Task #34 POC validation tests")
    parser.add_argument("--case", required=True, choices=["idempotent-guard", "restart-survival"],
                        help="Test case to run")
    args = parser.parse_args()

    print(f"\n[test_poc_validation] running case: {args.case}\n")

    if args.case == "idempotent-guard":
        ok = case_idempotent_guard()
    elif args.case == "restart-survival":
        ok = case_restart_survival()
    else:
        print(f"Unknown case: {args.case}")
        sys.exit(1)

    if ok:
        print(f"\nPASS {args.case}")
        sys.exit(0)
    else:
        print(f"\nFAIL {args.case}")
        sys.exit(1)


if __name__ == "__main__":
    main()
