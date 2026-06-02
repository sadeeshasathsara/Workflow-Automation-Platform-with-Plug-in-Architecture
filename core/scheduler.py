import os
import json
import time
import threading
from core.logging_utils import get_logger

logger = get_logger("scheduler")

class TriggerScheduler:
    def __init__(self, plugin_manager, flow_engine):
        self.plugin_manager = plugin_manager
        self.flow_engine = flow_engine
        self.state_file = "data/trigger_states.json"
        self.states = {}
        self._load_states()
        self.running = False
        self.thread = None

    def _load_states(self):
        try:
            if os.path.exists(self.state_file):
                with open(self.state_file, "r", encoding="utf-8") as f:
                    self.states = json.load(f)
        except Exception as exc:
            logger.warning("Failed to load trigger states: %s", exc)

    def _save_states(self):
        try:
            os.makedirs(os.path.dirname(self.state_file), exist_ok=True)
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(self.states, f, indent=2)
        except Exception as exc:
            logger.warning("Failed to save trigger states: %s", exc)

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()
        logger.info("Trigger scheduler started in background thread.")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)
            logger.info("Trigger scheduler stopped.")

    def _loop(self):
        flows_dir = "data/flows"
        flow_last_run = {}
        
        # On start, initialize trigger states so we only trigger on NEW events arriving after start
        self._initialize_current_states(flows_dir)

        # Register active flows in the reactive manager on startup
        from core.reactive_manager import reactive_manager
        if os.path.exists(flows_dir):
            for fname in os.listdir(flows_dir):
                if fname.endswith(".json"):
                    flow_id = fname[:-5]
                    flow_path = os.path.join(flows_dir, fname)
                    try:
                        with open(flow_path, "r", encoding="utf-8") as f:
                            flow = json.load(f)
                        if flow.get("active", False):
                            reactive_manager.register_flow(flow_id, flow)
                    except Exception as exc:
                        logger.error("Failed to register flow '%s' on startup: %s", flow_id, exc)


        while self.running:
            try:
                if not os.path.exists(flows_dir):
                    time.sleep(3)
                    continue

                for fname in os.listdir(flows_dir):
                    if not fname.endswith(".json"):
                        continue
                    
                    flow_id = fname[:-5]
                    flow_path = os.path.join(flows_dir, fname)
                    
                    try:
                        with open(flow_path, "r", encoding="utf-8") as f:
                            flow = json.load(f)
                    except Exception:
                        continue

                    if not flow.get("active", False):
                        continue

                    # Find trigger node
                    trigger_node = None
                    for node in flow.get("nodes", []):
                        plugin_name = node.get("data", {}).get("plugin")
                        if node.get("type") == "input" or plugin_name == "gmail":
                            trigger_node = node
                            break

                    if not trigger_node:
                        continue

                    plugin_name = trigger_node.get("data", {}).get("plugin")
                    plugin = self.plugin_manager.plugins.get(plugin_name)
                    if not plugin:
                        continue

                    # Load merged credentials & configuration
                    from core.credential_store import get_credential_store
                    try:
                        stored_creds = get_credential_store().load(plugin_name)
                    except Exception:
                        stored_creds = {}
                    
                    node_config = trigger_node.get("data", {}).get("config", {})
                    merged_config = {**stored_creds, **node_config, "flow_activated_at": flow.get("activated_at")}

                    # Determine poll interval
                    poll_interval = merged_config.get("poll_interval")
                    try:
                        poll_interval = float(poll_interval)
                    except (ValueError, TypeError):
                        poll_interval = 30.0

                    now = time.time()
                    last_run = flow_last_run.get(flow_id, 0)
                    if now - last_run >= poll_interval:
                        flow_last_run[flow_id] = now
                        logger.debug("Polling trigger for flow '%s' (plugin=%s)", flow_id, plugin_name)
                        
                        try:
                            # Execute trigger locally to fetch the latest payload
                            payload = plugin.execute(input_data={}, config=merged_config)
                            if not payload or "error" in payload or not isinstance(payload, dict):
                                continue

                            # Extract unique event signature
                            sig = payload.get("message_id") or payload.get("id") or str(payload)
                            
                            # Check against the last processed signature
                            state_key = f"{flow_id}_{trigger_node['id']}"
                            last_sig = self.states.get(state_key)
                            
                            if last_sig == sig:
                                continue
                            
                            # New email/trigger event detected! Save signature and trigger workflow run.
                            logger.info("Scheduler: New trigger event detected for flow '%s'! Initiating run...", flow_id)
                            self.states[state_key] = sig
                            self._save_states()
                            
                            # Run the workflow reactively via event callbacks
                            import uuid
                            import asyncio
                            trigger_run_id = uuid.uuid4().hex[:8]
                            
                            def emit_trigger_event():
                                coro = self.plugin_manager.event_bus.emit(
                                    f"flow:{flow_id}:node:{trigger_node['id']}:output",
                                    {
                                        "trigger_run_id": trigger_run_id,
                                        "payload": payload,
                                        "trigger_node": {
                                            "node_id": trigger_node["id"],
                                            "plugin_name": plugin_name,
                                            "output": payload
                                        }
                                    }
                                )
                                asyncio.run(coro)

                            threading.Thread(
                                target=emit_trigger_event,
                                daemon=True
                            ).start()

                            
                        except Exception as exc:
                            logger.error("Failed to poll trigger for flow '%s': %s", flow_id, exc)

            except Exception as exc:
                logger.error("Error in scheduler loop: %s", exc)

            time.sleep(2)

    def _initialize_current_states(self, flows_dir):
        """Pre-populate the states for current newest emails so we don't trigger retroactively on startup."""
        if not os.path.exists(flows_dir):
            return
        logger.info("Pre-populating trigger states on startup to prevent retroactive executions...")
        for fname in os.listdir(flows_dir):
            if not fname.endswith(".json"):
                continue
            flow_id = fname[:-5]
            flow_path = os.path.join(flows_dir, fname)
            try:
                with open(flow_path, "r", encoding="utf-8") as f:
                    flow = json.load(f)
                
                if not flow.get("active", False):
                    continue

                for node in flow.get("nodes", []):
                    plugin_name = node.get("data", {}).get("plugin")
                    if node.get("type") == "input" or plugin_name == "gmail":
                        plugin = self.plugin_manager.plugins.get(plugin_name)
                        if plugin:
                            from core.credential_store import get_credential_store
                            stored_creds = get_credential_store().load(plugin_name)
                            node_config = node.get("data", {}).get("config", {})
                            merged_config = {**stored_creds, **node_config, "flow_activated_at": flow.get("activated_at")}
                            
                            payload = plugin.execute(input_data={}, config=merged_config)
                            if payload and "error" not in payload:
                                sig = payload.get("message_id") or payload.get("id") or str(payload)
                                state_key = f"{flow_id}_{node['id']}"
                                if state_key not in self.states:
                                    self.states[state_key] = sig
                                    logger.info("Initialized trigger state signature: %s -> %s", state_key, sig)
            except Exception as exc:
                logger.debug("Failed to initialize trigger signature for flow '%s': %s", flow_id, exc)
        self._save_states()
