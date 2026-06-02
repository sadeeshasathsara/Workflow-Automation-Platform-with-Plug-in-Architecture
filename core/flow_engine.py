"""
core/flow_engine.py
───────────────────
FlowEngine: walks a saved visual graph (nodes + edges) and executes
each plugin in topological order, passing each node's output as the
next node's input data.

Flow graph format (mirrors the React Flow JSON saved by the UI):
{
    "nodes": [
        {"id": "n1", "type": "trigger", "data": {"plugin": "gmail",  "config": {...}}},
        {"id": "n2", "type": "default", "data": {"plugin": "logger", "config": {...}}},
        {"id": "n3", "type": "default", "data": {"plugin": "slack",  "config": {...}}}
    ],
    "edges": [
        {"id": "e1", "source": "n1", "target": "n2"},
        {"id": "e2", "source": "n2", "target": "n3"}
    ]
}
"""

from __future__ import annotations

import json
import os
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict, deque
from datetime import datetime
from typing import Any

from core.logging_utils import get_logger

logger = get_logger("flow_engine")

from core.credential_store import get_credential_store
EXECUTIONS_DIR = os.environ.get("EXECUTIONS_DIR", "data/executions")


# ── Result model ────────────────────────────────────────────────────────────

class NodeResult:
    def __init__(self, node_id: str, plugin_name: str):
        self.node_id     = node_id
        self.plugin_name = plugin_name
        self.status      = "pending"   # pending | running | success | error
        self.output: dict            = {}
        self.error:  str | None      = None
        self.started_at: str | None  = None
        self.finished_at: str | None = None

    def to_dict(self) -> dict:
        return {
            "node_id":     self.node_id,
            "plugin_name": self.plugin_name,
            "status":      self.status,
            "output":      self.output,
            "error":       self.error,
            "started_at":  self.started_at,
            "finished_at": self.finished_at,
        }


class ExecutionResult:
    def __init__(self, execution_id: str, flow_id: str):
        self.execution_id = execution_id
        self.flow_id      = flow_id
        self.status       = "running"   # running | success | error
        self.started_at   = datetime.now().isoformat()
        self.finished_at: str | None = None
        self.node_results: list[NodeResult] = []
        self.error: str | None = None

    def to_dict(self) -> dict:
        return {
            "execution_id": self.execution_id,
            "flow_id":      self.flow_id,
            "status":       self.status,
            "started_at":   self.started_at,
            "finished_at":  self.finished_at,
            "node_results": [r.to_dict() for r in self.node_results],
            "error":        self.error,
        }


# ── Engine ──────────────────────────────────────────────────────────────────

class FlowEngine:
    """Execute a saved flow graph by walking it topologically."""

    def __init__(self, plugin_manager):
        self.plugin_manager = plugin_manager

    # ── Public entry point ───────────────────────────────────────────────

    def execute_flow(self, flow: dict, flow_id: str = "default") -> ExecutionResult:
        """Execute a complete flow graph synchronously in parallel."""
        return self._execute_graph(flow, flow_id, emit_cb=None)

    def execute_flow_streaming(
        self,
        flow: dict,
        flow_id: str = "default",
        on_event=None,
    ) -> ExecutionResult:
        """Execute a flow graph and emit real-time status events with parallel branches."""
        return self._execute_graph(flow, flow_id, emit_cb=on_event)

    def _execute_graph(self, flow: dict, flow_id: str, emit_cb=None) -> ExecutionResult:
        """Core orchestrator executing the visual flow graph concurrently using ThreadPoolExecutor."""
        execution_id = str(uuid.uuid4())[:8]
        result = ExecutionResult(execution_id, flow_id)

        def emit(event: dict):
            if emit_cb:
                try:
                    emit_cb(event)
                except Exception:
                    pass

        logger.info("Starting parallel flow execution %s for flow '%s'", execution_id, flow_id)

        try:
            nodes = flow.get("nodes", [])
            edges = flow.get("edges", [])

            if not nodes:
                result.status = "error"
                result.error = "Flow has no nodes."
                result.finished_at = datetime.now().isoformat()
                self._save_execution(result)
                emit({"type": "execution_done", "status": "error", "execution_id": execution_id, "error": result.error})
                return result

            # Kahn's topological sort determines all executable nodes & filters cycles
            order = self._topological_sort(nodes, edges)
            runnable_node_ids = set(order)

            # Emit pending for all valid nodes upfront
            for nid in order:
                node = self._find_node(nodes, nid)
                plugin_name = self._resolve_plugin_name(node)
                emit({"type": "node_status", "node_id": nid, "status": "pending", "plugin": plugin_name})

            lock = threading.Lock()
            cv = threading.Condition()

            outputs = {}
            node_results_map = {}
            in_degree = {nid: 0 for nid in runnable_node_ids}
            adj = defaultdict(list)

            # Build in-degrees only within valid runnable nodes
            for edge in edges:
                src = edge.get("source")
                tgt = edge.get("target")
                if src in runnable_node_ids and tgt in runnable_node_ids:
                    adj[src].append(tgt)
                    in_degree[tgt] += 1

            ready_nodes = [nid for nid in runnable_node_ids if in_degree[nid] == 0]
            remaining_nodes = len(runnable_node_ids)
            has_error = False
            error_message = None

            # Concurrency limit based on flow size
            max_workers = max(1, min(remaining_nodes, 8))

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                def execute_node(node_id: str):
                    nonlocal has_error, error_message

                    with lock:
                        if has_error:
                            return

                    node = self._find_node(nodes, node_id)
                    plugin_name = self._resolve_plugin_name(node)
                    node_result = NodeResult(node_id, plugin_name)

                    with lock:
                        result.node_results.append(node_result)
                        node_results_map[node_id] = node_result

                    plugin = self.plugin_manager.plugins.get(plugin_name)
                    if not plugin:
                        err_msg = f"Plugin '{plugin_name}' is not loaded."
                        node_result.status = "error"
                        node_result.error = err_msg
                        emit({"type": "node_status", "node_id": node_id, "status": "error", "plugin": plugin_name, "error": err_msg})
                        with lock:
                            has_error = True
                            error_message = err_msg
                            result.status = "error"
                            result.error = err_msg
                        return

                    with lock:
                        input_data = self._gather_inputs(node_id, edges, outputs)

                    node_config = node.get("data", {}).get("config", {})
                    try:
                        stored_creds = get_credential_store().load(plugin_name)
                        merged_config = {**stored_creds, **node_config}
                    except Exception:
                        merged_config = node_config

                    node_result.status = "running"
                    node_result.started_at = datetime.now().isoformat()
                    emit({"type": "node_status", "node_id": node_id, "status": "running", "plugin": plugin_name, "started_at": node_result.started_at})

                    try:
                        logger.info("Executing node %s (plugin=%s)", node_id, plugin_name)
                        output = plugin.execute(input_data, merged_config)
                        node_result.output = output or {}
                        node_result.status = "success"
                        node_result.finished_at = datetime.now().isoformat()

                        with lock:
                            outputs[node_id] = output or {}

                        emit({"type": "node_status", "node_id": node_id, "status": "success", "plugin": plugin_name, "finished_at": node_result.finished_at, "output": node_result.output})
                        logger.info("Node %s succeeded", node_id)

                        # Submit downstream neighbors whose dependencies are now fully satisfied
                        new_ready = []
                        with lock:
                            for neighbor in adj[node_id]:
                                in_degree[neighbor] -= 1
                                if in_degree[neighbor] == 0:
                                    new_ready.append(neighbor)

                        for neighbor in new_ready:
                            executor.submit(execute_node, neighbor)

                    except Exception as exc:
                        err_msg = str(exc)
                        node_result.status = "error"
                        node_result.error = err_msg
                        node_result.finished_at = datetime.now().isoformat()
                        emit({"type": "node_status", "node_id": node_id, "status": "error", "plugin": plugin_name, "error": err_msg, "finished_at": node_result.finished_at})

                        with lock:
                            has_error = True
                            error_message = f"Node {node_id} failed: {exc}"
                            result.status = "error"
                            result.error = error_message
                        logger.exception("Node %s failed: %s", node_id, exc)
                    finally:
                        with cv:
                            nonlocal remaining_nodes
                            remaining_nodes -= 1
                            cv.notify_all()

                # Submit initial starting nodes (triggers)
                for nid in ready_nodes:
                    executor.submit(execute_node, nid)

                # Wait on condition variable until all nodes are done or a failure halts the process
                with cv:
                    while remaining_nodes > 0 and not has_error:
                        cv.wait()

            if result.status == "running":
                result.status = "success"

        except Exception as exc:
            result.status = "error"
            result.error = str(exc)
            logger.exception("Flow execution failed: %s", exc)
        finally:
            result.finished_at = datetime.now().isoformat()
            try:
                result.node_results.sort(key=lambda x: x.started_at or "")
            except Exception:
                pass
            self._save_execution(result)

        emit({"type": "execution_done", "status": result.status, "execution_id": execution_id, "finished_at": result.finished_at, "error": result.error})
        logger.info("Flow execution %s finished with status: %s", execution_id, result.status)
        return result

    # ── Graph utilities ──────────────────────────────────────────────────

    def _topological_sort(self, nodes: list, edges: list) -> list[str]:
        """Return node IDs in topological order (Kahn's algorithm)."""
        node_ids   = {n["id"] for n in nodes}
        in_degree  = defaultdict(int)
        adj        = defaultdict(list)

        for edge in edges:
            src, tgt = edge.get("source"), edge.get("target")
            if src in node_ids and tgt in node_ids:
                adj[src].append(tgt)
                in_degree[tgt] += 1

        # Nodes with no incoming edges are starting points
        queue = deque(n for n in node_ids if in_degree[n] == 0)
        order = []

        while queue:
            current = queue.popleft()
            order.append(current)
            for neighbor in adj[current]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(order) != len(node_ids):
            logger.warning("Cycle detected in flow graph — executing reachable nodes only")

        return order

    def _find_node(self, nodes: list, node_id: str) -> dict:
        for node in nodes:
            if node["id"] == node_id:
                return node
        return {}

    def _resolve_plugin_name(self, node: dict) -> str:
        """Extract plugin name from node data.
        
        The UI stores plugin name in node.data.plugin.
        Falls back to node.data.label (legacy nodes).
        """
        data = node.get("data", {})
        name = data.get("plugin") or data.get("label", "")
        if not name:
            return ""
        
        import re
        clean_name = re.sub(r'[^\w\s-]', '', name)
        resolved = clean_name.strip().lower().replace(" ", "_").replace("plugin", "").strip("_")
        
        alias_map = {
            "email_trigger": "gmail",
            "email": "gmail",
            "notify_action": "notification",
            "notify": "notification",
            "notification_action": "notification",
            "logger": "logger",
            "file_logger": "file_logger",
        }
        
        return alias_map.get(resolved, resolved)


    def _gather_inputs(self, node_id: str, edges: list, outputs: dict) -> dict:
        """Merge outputs from all upstream nodes as input for this node."""
        merged: dict[str, Any] = {}
        for edge in edges:
            if edge.get("target") == node_id:
                src = edge.get("source")
                if src in outputs:
                    merged.update(outputs[src])
        return merged

    # ── Persistence ──────────────────────────────────────────────────────

    def _save_execution(self, result: ExecutionResult):
        try:
            os.makedirs(EXECUTIONS_DIR, exist_ok=True)
            path = os.path.join(EXECUTIONS_DIR, f"{result.execution_id}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(result.to_dict(), f, indent=2)
        except Exception as exc:
            logger.exception("Failed to save execution result: %s", exc)

    def list_executions(self, limit: int = 20) -> list[dict]:
        """Return the most recent execution results."""
        if not os.path.exists(EXECUTIONS_DIR):
            return []
        files = sorted(
            [f for f in os.listdir(EXECUTIONS_DIR) if f.endswith(".json")],
            reverse=True
        )[:limit]
        results = []
        for fname in files:
            try:
                with open(os.path.join(EXECUTIONS_DIR, fname), "r") as f:
                    results.append(json.load(f))
            except Exception:
                continue
        return results

    def get_execution(self, execution_id: str) -> dict | None:
        path = os.path.join(EXECUTIONS_DIR, f"{execution_id}.json")
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception:
            return None
