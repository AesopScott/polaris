"""
Sync canonical task status to backlog.json via the Polaris server /sync-state endpoint.

Called by task_executor.py after every successful node transition so the UI
stays in sync with executor state without requiring the executor to write
backlog.json directly.
"""

import os
import urllib.request
import urllib.error
import json
from typing import Optional

_SERVER_PORT = int(os.environ.get("SERVER_PORT", "40000"))
_SYNC_URL = f"http://localhost:{_SERVER_PORT}/sync-state"


def sync_status(task_number: int, status: str, current_node: str) -> None:
    """POST /sync-state. Raises on HTTP error; caller decides whether to retry."""
    payload = json.dumps({
        "task_number":  task_number,
        "status":       status,
        "current_node": current_node,
    }).encode()
    req = urllib.request.Request(
        _SYNC_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status != 200:
                raise RuntimeError(f"/sync-state returned HTTP {resp.status}")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"/sync-state unreachable: {exc}") from exc
