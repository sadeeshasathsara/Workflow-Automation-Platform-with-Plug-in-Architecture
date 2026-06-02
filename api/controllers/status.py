from fastapi import APIRouter, HTTPException
from api.deps import plugin_manager, event_bus, logger
import os, json, time

router = APIRouter()


@router.get("/status")
async def get_status():
    """Get overall system status including loaded plugins and event listeners."""
    try:
        plugins_summary = []
        for name, plugin in plugin_manager.plugins.items():
            try:
                desc = plugin.describe()
                ptype = desc.get("type", "action")
            except Exception:
                ptype = "action"
            plugins_summary.append({"name": name, "type": ptype})

        return {
            "status":          "ok",
            "plugins_loaded":  len(plugin_manager.plugins),
            "plugins":         plugins_summary,
            "event_listeners": {
                event: len(listeners)
                for event, listeners in event_bus.listeners.items()
            },
        }
    except Exception as exc:
        logger.exception("Failed to get status: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/status/scheduler")
async def get_scheduler_status():
    """Return the current live status of the background TriggerScheduler."""
    try:
        # Import the global scheduler from server module
        import api.server as _server
        sched = getattr(_server, "scheduler", None)

        states_file = "data/trigger_states.json"
        trigger_states = {}
        if os.path.exists(states_file):
            try:
                with open(states_file, "r", encoding="utf-8") as f:
                    trigger_states = json.load(f)
            except Exception:
                trigger_states = {}

        flows_dir = "data/flows"
        active_flows = []
        if os.path.exists(flows_dir):
            for fname in os.listdir(flows_dir):
                if fname.endswith(".json"):
                    flow_id = fname[:-5]
                    state_keys = [k for k in trigger_states if k.startswith(flow_id + "_")]
                    active_flows.append({
                        "flow_id": flow_id,
                        "has_trigger_state": bool(state_keys),
                        "last_signature": trigger_states.get(state_keys[0], "") if state_keys else None,
                    })

        return {
            "scheduler_running": sched.running if sched else False,
            "active_flows":      active_flows,
            "trigger_states":    trigger_states,
        }
    except Exception as exc:
        logger.exception("Failed to get scheduler status: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

