import os
import json
import uuid
import threading
from datetime import datetime
from collections import defaultdict
from core.logging_utils import get_logger

logger = get_logger("reactive_manager")
EXECUTIONS_DIR = os.environ.get("EXECUTIONS_DIR", "data/executions")

def detect_cycle(nodes: list, edges: list) -> list[str] | None:
    """DFS-based cycle detection. Returns the list of node IDs forming a cycle if found, else None."""
    adj = defaultdict(list)
    node_map = {n["id"]: n for n in nodes}
    
    for edge in edges:
        src = edge.get("source")
        tgt = edge.get("target")
        if src in node_map and tgt in node_map:
            adj[src].append(tgt)

    visited = {}  # ID -> state: 0=unvisited, 1=visiting, 2=visited
    path = []

    def dfs(node_id):
        visited[node_id] = 1
        path.append(node_id)
        for neighbor in adj[node_id]:
            if visited.get(neighbor) == 1:
                idx = path.index(neighbor)
                return path[idx:] + [neighbor]
            elif visited.get(neighbor, 0) == 0:
                cycle = dfs(neighbor)
                if cycle:
                    return cycle
        path.pop()
        visited[node_id] = 2
        return None

    for node in nodes:
        nid = node["id"]
        if visited.get(nid, 0) == 0:
            cycle = dfs(nid)
            if cycle:
                return cycle
    return None

class ReactiveFlowManager:
    def __init__(self):
        self.plugin_manager = None
        self.event_bus = None
        self._callbacks = defaultdict(list)  # flow_id -> list of (event_name, callback)
        self._runs = {}  # trigger_run_id -> run_info dict
        self._lock = threading.Lock()

    def initialize(self, plugin_manager, event_bus):
        self.plugin_manager = plugin_manager
        self.event_bus = event_bus
        logger.info("ReactiveFlowManager initialized.")

    def _resolve_plugin_name(self, node: dict) -> str:
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

    def register_flow(self, flow_id: str, flow: dict):
        """Register persistent callbacks for all active nodes/edges in a flow."""
        logger.info("Registering reactive flow '%s'", flow_id)
        nodes = flow.get("nodes", [])
        edges = flow.get("edges", [])

        # 1. Cycle detection
        cycle = detect_cycle(nodes, edges)
        if cycle:
            cycle_desc = " -> ".join(cycle)
            logger.error("Failed to register flow '%s' due to cycle: %s", flow_id, cycle_desc)
            raise ValueError(f"Cycle detected in active flow: {cycle_desc}")

        # 2. Cleanup existing callbacks
        self.unregister_flow(flow_id)

        # 3. For each edge, bind a callback
        node_map = {n["id"]: n for n in nodes}
        
        # Build adjacency maps to calculate expected callback counts per run
        outgoing_edges = defaultdict(list)
        incoming_edges = defaultdict(list)
        for edge in edges:
            src = edge.get("source")
            tgt = edge.get("target")
            if src in node_map and tgt in node_map:
                outgoing_edges[src].append(edge)
                incoming_edges[tgt].append(edge)

        # A node is a trigger if it has no incoming edges (e.g. Gmail)
        for edge in edges:
            src_id = edge.get("source")
            tgt_id = edge.get("target")
            if src_id not in node_map or tgt_id not in node_map:
                continue

            node_A = node_map[src_id]
            node_B = node_map[tgt_id]

            # Register callback from node_A output to node_B input
            event_name = f"flow:{flow_id}:node:{src_id}:output"
            
            def make_callback(edge_obj, source_node, target_node):
                def callback(event_data: dict):
                    # Run callback logic
                    self._execute_reactive_step(flow_id, flow, edge_obj, source_node, target_node, event_data, incoming_edges, outgoing_edges)
                return callback

            cb = make_callback(edge, node_A, node_B)
            self.event_bus.subscribe(event_name, cb)
            
            with self._lock:
                self._callbacks[flow_id].append((event_name, cb))

        logger.info("Successfully registered %d reactive connection callbacks for flow '%s'", 
                    len(self._callbacks[flow_id]), flow_id)

    def unregister_flow(self, flow_id: str):
        """Unsubscribe all callbacks for a flow."""
        with self._lock:
            cbs = self._callbacks.pop(flow_id, [])
        
        if cbs:
            logger.info("Unregistering reactive flow '%s' (%d callbacks)", flow_id, len(cbs))
            for event_name, cb in cbs:
                self.event_bus.unsubscribe(event_name, cb)

    def _execute_reactive_step(self, flow_id: str, flow: dict, edge: dict, source_node: dict, target_node: dict, event_data: dict, incoming_edges: dict, outgoing_edges: dict):
        try:
            trigger_run_id = event_data.get("trigger_run_id")
            publisher_output = event_data.get("payload", {})

            target_id = target_node["id"]
            target_plugin = self._resolve_plugin_name(target_node)

            # Check toggles
            source_data = source_node.get("data", {})
            target_data = target_node.get("data", {})

            # default both toggles to True for migration safety
            source_pub_enabled = source_data.get("publisher_enabled", True)
            target_sub_enabled = target_data.get("subscriber_enabled", True)

            if not source_pub_enabled:
                logger.info("Step skipped: Publisher capability is disabled on source node '%s'", source_node["id"])
                return

            if not target_sub_enabled:
                logger.info("Step skipped: Subscriber capability is disabled on target node '%s'", target_node["id"])
                return

            # Initialize run tracking if not present
            with self._lock:
                if trigger_run_id not in self._runs:
                    trigger_node_info = event_data.get("trigger_node", {})
                    node_results = {}
                    if trigger_node_info:
                        node_results[trigger_node_info["node_id"]] = {
                            "node_id": trigger_node_info["node_id"],
                            "plugin_name": trigger_node_info["plugin_name"],
                            "status": "success",
                            "output": trigger_node_info["output"],
                            "error": None,
                            "started_at": datetime.now().isoformat(),
                            "finished_at": datetime.now().isoformat()
                        }
                    
                    self._runs[trigger_run_id] = {
                        "execution_id": trigger_run_id,
                        "flow_id": flow_id,
                        "status": "running",
                        "started_at": datetime.now().isoformat(),
                        "finished_at": None,
                        "node_results": node_results,
                        "expected_nodes": self._calculate_reachable_nodes(flow, source_node["id"]),
                        "error": None
                    }
                run_rec = self._runs[trigger_run_id]

            # 1. Resolve Mapping
            node_config = target_data.get("config", {})
            try:
                from core.credential_store import get_credential_store
                stored_creds = get_credential_store().load(target_plugin)
                merged_config = {**stored_creds, **node_config}
            except Exception:
                merged_config = dict(node_config)

            # Apply mapping overrides
            # Canonical format: edge.data.mapping = { targetField: sourceField }
            mapping = edge.get("data", {}).get("mapping", {})
            resolved_config = dict(merged_config)
            for target_field, source_field in mapping.items():
                if source_field.startswith("@lit:"):
                    resolved_config[target_field] = source_field[5:]
                elif source_field in publisher_output:
                    resolved_config[target_field] = publisher_output[source_field]

            # Prepare node result
            node_res = {
                "node_id": target_id,
                "plugin_name": target_plugin,
                "status": "running",
                "output": {},
                "error": None,
                "started_at": datetime.now().isoformat(),
                "finished_at": None
            }
            with self._lock:
                run_rec["node_results"][target_id] = node_res

            plugin = self.plugin_manager.plugins.get(target_plugin)
            if not plugin:
                raise ValueError(f"Plugin '{target_plugin}' is not loaded.")

            # 2. Execute target node
            logger.info("Reactive Step: Executing node %s (plugin=%s)", target_id, target_plugin)
            output = plugin.execute(input_data=publisher_output, config=resolved_config) or {}

            # Update node result
            node_res["status"] = "success"
            node_res["output"] = output
            node_res["finished_at"] = datetime.now().isoformat()

            # 3. Propagate if target publisher is enabled
            target_pub_enabled = target_data.get("publisher_enabled", True)
            if target_pub_enabled:
                next_event_name = f"flow:{flow_id}:node:{target_id}:output"
                
                # We want to emit asynchronously to allow concurrency and thread pool advantages
                def emit_task():
                    if hasattr(self.event_bus, "emit"):
                        import asyncio
                        # Since emit is an async method on AsyncEventBus, we must run it in an event loop or use asyncio.run
                        try:
                            loop = asyncio.get_event_loop()
                        except RuntimeError:
                            loop = asyncio.new_event_loop()
                            asyncio.set_event_loop(loop)
                        
                        if loop.is_running():
                            asyncio.run_coroutine_threadable(self.event_bus.emit(next_event_name, {
                                "trigger_run_id": trigger_run_id,
                                "payload": output
                            }))
                        else:
                            loop.run_until_complete(self.event_bus.emit(next_event_name, {
                                "trigger_run_id": trigger_run_id,
                                "payload": output
                            }))

                threading.Thread(target=emit_task, daemon=True).start()

            # Check if this flow execution is fully completed
            self._check_and_finalize_run(trigger_run_id)

        except Exception as exc:
            logger.exception("Reactive Step failed on node %s: %s", target_node.get("id"), exc)
            with self._lock:
                if trigger_run_id in self._runs:
                    run_rec = self._runs[trigger_run_id]
                    run_rec["status"] = "error"
                    run_rec["error"] = str(exc)
                    target_id = target_node.get("id")
                    if target_id in run_rec["node_results"]:
                        node_res = run_rec["node_results"][target_id]
                        node_res["status"] = "error"
                        node_res["error"] = str(exc)
                        node_res["finished_at"] = datetime.now().isoformat()
            self._check_and_finalize_run(trigger_run_id)

    def _calculate_reachable_nodes(self, flow: dict, start_node_id: str) -> set:
        """Find all node IDs reachable from a given node ID."""
        nodes = flow.get("nodes", [])
        edges = flow.get("edges", [])
        node_ids = {n["id"] for n in nodes}
        
        adj = defaultdict(list)
        for edge in edges:
            src = edge.get("source")
            tgt = edge.get("target")
            if src in node_ids and tgt in node_ids:
                adj[src].append(tgt)

        reachable = set()
        queue = [start_node_id]
        while queue:
            curr = queue.pop(0)
            for neighbor in adj[curr]:
                if neighbor not in reachable:
                    reachable.add(neighbor)
                    queue.append(neighbor)
        return reachable

    def _check_and_finalize_run(self, trigger_run_id: str):
        """Check if all expected nodes for this run have finished. If so, persist to data/executions/."""
        with self._lock:
            if trigger_run_id not in self._runs:
                return
            run_rec = self._runs[trigger_run_id]

        expected = run_rec["expected_nodes"]
        completed = {nid for nid, res in run_rec["node_results"].items() if res["status"] in ("success", "error")}

        # If all reachable nodes are completed, finalize and persist
        if expected.issubset(completed):
            with self._lock:
                # Remove from active in-memory runs
                self._runs.pop(trigger_run_id, None)

            run_rec["finished_at"] = datetime.now().isoformat()
            if run_rec["status"] == "running":
                # Check if any node failed
                if any(res["status"] == "error" for res in run_rec["node_results"].values()):
                    run_rec["status"] = "error"
                else:
                    run_rec["status"] = "success"

            # Transform node results map into list format expected by ExecutionResult
            run_rec["node_results"] = list(run_rec["node_results"].values())

            # Save execution to file system
            try:
                os.makedirs(EXECUTIONS_DIR, exist_ok=True)
                path = os.path.join(EXECUTIONS_DIR, f"{trigger_run_id}.json")
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(run_rec, f, indent=2)
                logger.info("Persisted execution result for reactive run %s", trigger_run_id)
            except Exception as exc:
                logger.error("Failed to save reactive run execution %s: %s", trigger_run_id, exc)

# Expose global singleton instance
reactive_manager = ReactiveFlowManager()
