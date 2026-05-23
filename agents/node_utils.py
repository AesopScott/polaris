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

    Two guarantees:
    - If state["status"] is already "failed" when this node is entered, pass
      through without executing — prevents later nodes on unconditional edges
      from overwriting the failed status.
    - LangGraph control-flow exceptions (interrupt()) are re-raised so that
      HITL suspension works correctly through the wrapper.
    """
    @functools.wraps(fn)
    def wrapper(state: Dict[str, Any]) -> Dict[str, Any]:
        # Short-circuit: once the graph is in failed state, all subsequent
        # nodes are no-ops so the final saved state keeps status=failed.
        if state.get("status") == "failed":
            return state
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
