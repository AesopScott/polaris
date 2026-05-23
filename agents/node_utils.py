"""Shared decorator utilities for LangGraph task graph nodes.

Decoupled from task_executor.py to avoid circular imports — both
task_graph.py and task_executor.py can safely import from here.
"""
import functools
from typing import Any, Callable, Dict

# LangGraph raises GraphInterrupt (subclass of Exception) when interrupt() is
# called inside a node. safe_node must re-raise it so LangGraph's executor
# can handle the suspension — catching it would silently break HITL gates.
_LANGGRAPH_INTERRUPT_NAMES = frozenset({"GraphInterrupt", "NodeInterrupt"})


def safe_node(fn: Callable) -> Callable:
    """Wrap a graph node: on unhandled exception return failed state instead of raising.

    The returned failed state is picked up by advance_graph() which persists
    it and validates the implicit status=failed transition (always allowed).
    LangGraph control-flow exceptions (interrupt()) are re-raised unconditionally.
    """
    @functools.wraps(fn)
    def wrapper(state: Dict[str, Any]) -> Dict[str, Any]:
        try:
            return fn(state)
        except Exception as exc:
            if type(exc).__name__ in _LANGGRAPH_INTERRUPT_NAMES:
                raise
            error_log = list(state.get("error_log", []))
            error_log.append(f"{fn.__name__}: {type(exc).__name__}: {exc}")
            return {
                **state,
                "status":      "failed",
                "error_log":   error_log,
                "retry_count": state.get("retry_count", 0) + 1,
            }
    return wrapper
