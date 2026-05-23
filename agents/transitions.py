"""Formal transition table for the LangGraph task state machine.

validate_transition() is the single authority on whether a status transition
is allowed given the current TaskState. All graph nodes call this before
mutating status.
"""

from typing import Any, Dict, List, Tuple


def validate_transition(
    from_status: str,
    to_status: str,
    state: Dict[str, Any],
) -> Tuple[bool, List[str]]:
    """Return (ok, failures) — ok is True only when all preconditions pass."""
    failures: List[str] = []

    # System-level transitions — always allowed from any state
    if to_status in ("failed", "stalled"):
        return True, []

    key = (from_status, to_status)
    checker = _TRANSITIONS.get(key)

    if checker is None:
        failures.append(
            f"No transition defined from '{from_status}' to '{to_status}'"
        )
        return False, failures

    checker(state, failures)
    return len(failures) == 0, failures


# ─────────────────────────────────────────────────────────────────────────────
# Precondition helpers
# ─────────────────────────────────────────────────────────────────────────────

def _require_proof_units_verified(state: Dict[str, Any], failures: List[str]) -> None:
    """All proof units must have a result; no unwaived failures allowed."""
    proof_units: List[Dict[str, Any]] = state.get("proof_units", [])
    proof_results: Dict[str, bool] = state.get("proof_results", {})

    for unit in proof_units:
        unit_num = str(unit.get("number", ""))
        waiver = unit.get("proofType") == "waiver" or unit.get("waiverGuidance") == "waived"
        if unit_num not in proof_results:
            if not waiver:
                failures.append(
                    f"Proof unit {unit_num} ({unit.get('title', '')!r}) "
                    "has no result and no waiver"
                )
        elif not proof_results[unit_num] and not waiver:
            failures.append(
                f"Proof unit {unit_num} ({unit.get('title', '')!r}) failed"
            )


def _require_review_evidence(state: Dict[str, Any], failures: List[str]) -> None:
    """review_evidence must be non-empty."""
    if not state.get("review_evidence"):
        failures.append("review_evidence is empty — /review-pr must run before cba-complete")


def _require_branch(state: Dict[str, Any], failures: List[str]) -> None:
    if not state.get("branch_name"):
        failures.append("branch_name is not set — /start-build must run first")


def _require_pr_url(state: Dict[str, Any], failures: List[str]) -> None:
    if not state.get("pr_url"):
        failures.append("pr_url is not set — /finish-build must open a PR first")


# ─────────────────────────────────────────────────────────────────────────────
# Transition table  {(from, to): precondition_fn | None}
# None means unconditionally allowed (no preconditions beyond being in from_status)
# ─────────────────────────────────────────────────────────────────────────────

def _check_build_started(state: Dict[str, Any], failures: List[str]) -> None:
    _require_branch(state, failures)


def _check_build_finished(state: Dict[str, Any], failures: List[str]) -> None:
    _require_proof_units_verified(state, failures)


def _check_cba_complete(state: Dict[str, Any], failures: List[str]) -> None:
    _require_review_evidence(state, failures)
    _require_pr_url(state, failures)


def _check_staged(state: Dict[str, Any], failures: List[str]) -> None:
    _require_pr_url(state, failures)


_TRANSITIONS: Dict[Tuple[str, str], Any] = {
    # Standard skill lifecycle
    ("planned",        "build-started"):  _check_build_started,
    ("build-started",  "build-finished"): _check_build_finished,
    ("build-finished", "cba-complete"):   _check_cba_complete,
    ("cba-complete",   "staged"):         _check_staged,
    ("staged",         "production"):     None,
    # Retry path: codex review sends task back to build
    ("cba-complete",   "build-started"):  _check_build_started,
    # Recovery: resume from stalled back to build
    ("stalled",        "build-started"):  _check_build_started,
    # Failed can be retried from build
    ("failed",         "build-started"):  _check_build_started,
}
