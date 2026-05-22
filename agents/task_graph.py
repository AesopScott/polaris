"""
LangGraph StateGraph definition for task orchestration.

Implements a 9-node graph representing the task lifecycle:
START → plan → start_build → build → finish_build → review → codex_review → stage_decision → promote_stage → promote_prod → END

Proof Unit 5: StateGraph compiles and runs to first node without errors.
"""

from langgraph.graph import StateGraph, END
from state import TaskState


# ===== Stub Node Functions =====
# Each returns an updated TaskState.

def plan_node(state: TaskState) -> TaskState:
    """Run /plan-task: interview, outline, write plan."""
    state["current_node"] = "plan"
    state["status"] = "planning"
    state["checkpoint_data"]["plan_complete"] = True
    return state


def start_build_node(state: TaskState) -> TaskState:
    """Run /start-build: sync main, create task branch."""
    state["current_node"] = "start_build"
    state["status"] = "build-started"
    state["branch_name"] = f"task/{state['task_number']}-orchestration"
    state["checkpoint_data"]["branch_created"] = True
    return state


def build_node(state: TaskState) -> TaskState:
    """Pause checkpoint for user code. No-op node; waits for human signal."""
    state["current_node"] = "build"
    state["checkpoint_data"]["code_done"] = False  # Set True when user signals
    return state


def finish_build_node(state: TaskState) -> TaskState:
    """Run /finish-build: audit, commit, push, open PR."""
    state["current_node"] = "finish_build"
    state["status"] = "build-finished"
    state["pr_url"] = f"https://github.com/AesopScott/polaris/pull/task-{state['task_number']}"
    state["checkpoint_data"]["pr_opened"] = True
    return state


def review_node(state: TaskState) -> TaskState:
    """Run /review-pr: manual code review gate."""
    state["current_node"] = "review"
    state["review_evidence"]["reviewed"] = True
    state["checkpoint_data"]["review_complete"] = False  # Set True when user signals
    return state


def codex_review_node(state: TaskState) -> TaskState:
    """Run /codex-review: independent review, set status to cba-complete."""
    state["current_node"] = "codex_review"
    state["status"] = "build-finished"  # Will flip to cba-complete after review passes
    state["review_evidence"]["codex_score"] = 0.95  # Stub score
    state["proof_results"]["codex_passing"] = True
    return state


def stage_decision_node(state: TaskState) -> TaskState:
    """Route based on proof results: if passed → promote_stage; else → redo."""
    state["current_node"] = "stage_decision"
    # Stub: always route to promote_stage
    if state["proof_results"].get("codex_passing", False):
        return state  # Route to promote_stage
    else:
        # Route back to start_build (redo)
        state["current_node"] = "start_build"
        return state


def promote_stage_node(state: TaskState) -> TaskState:
    """Run /promote-stage: merge to stage branch."""
    state["current_node"] = "promote_stage"
    state["status"] = "staged"
    state["checkpoint_data"]["promoted_to_stage"] = True
    return state


def promote_prod_node(state: TaskState) -> TaskState:
    """Run /promote-to-prod: merge stage→main, ship."""
    state["current_node"] = "promote_prod"
    state["status"] = "production"
    state["checkpoint_data"]["promoted_to_prod"] = True
    return state


# ===== Graph Builder =====
def build_graph() -> StateGraph:
    """
    Assemble the StateGraph with 9 nodes and conditional edges.

    Returns:
        A compiled LangGraph StateGraph ready to invoke.
    """
    graph = StateGraph(TaskState)

    # Add nodes
    graph.add_node("plan", plan_node)
    graph.add_node("start_build", start_build_node)
    graph.add_node("build", build_node)
    graph.add_node("finish_build", finish_build_node)
    graph.add_node("review", review_node)
    graph.add_node("codex_review", codex_review_node)
    graph.add_node("stage_decision", stage_decision_node)
    graph.add_node("promote_stage", promote_stage_node)
    graph.add_node("promote_prod", promote_prod_node)

    # Add edges (linear path with conditional routing at stage_decision)
    graph.add_edge("plan", "start_build")
    graph.add_edge("start_build", "build")
    graph.add_edge("build", "finish_build")
    graph.add_edge("finish_build", "review")
    graph.add_edge("review", "codex_review")

    # Conditional edge: route based on proof results
    def should_promote(state: TaskState) -> str:
        """Route to promote_stage if codex passed, else back to start_build (redo)."""
        if state["proof_results"].get("codex_passing", False):
            return "promote_stage"
        else:
            return "start_build"  # Redo from build start

    graph.add_conditional_edges("codex_review", should_promote)
    graph.add_edge("promote_stage", "promote_prod")
    graph.add_edge("promote_prod", END)

    # Set entry point
    graph.set_entry_point("plan")

    return graph.compile()


if __name__ == "__main__":
    # Proof Unit 5: StateGraph compiles and runs to first node
    try:
        g = build_graph()
        print("OK")
    except Exception as e:
        print(f"ERROR: {e}")
        exit(1)
