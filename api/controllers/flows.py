from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import os, json, queue, threading
from core.logging_utils import get_logger
from api.deps import flow_engine

router = APIRouter()
logger = get_logger("api.flows")

FLOWS_PATH = os.environ.get("FLOWS_STORE", "data/flows.json")
FLOWS_DIR = os.environ.get("FLOWS_DIR", "data/flows")


@router.get("/flows")
async def list_flows():
    """List all saved workflows with metadata."""
    try:
        os.makedirs(FLOWS_DIR, exist_ok=True)
        flows = []
        for fname in os.listdir(FLOWS_DIR):
            if fname.endswith(".json"):
                path = os.path.join(FLOWS_DIR, fname)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        flow_data = json.load(f)
                    
                    flow_id = fname[:-5]
                    name = flow_data.get("name", flow_id.replace("_", " ").title())
                    nodes = flow_data.get("nodes", [])
                    edges = flow_data.get("edges", [])
                    
                    flows.append({
                        "id": flow_id,
                        "name": name,
                        "nodes_count": len(nodes),
                        "edges_count": len(edges),
                        "updated_at": os.path.getmtime(path)
                    })
                except Exception:
                    continue
        
        flows.sort(key=lambda x: x["updated_at"], reverse=True)
        return {"flows": flows}
    except Exception as exc:
        logger.exception("Failed to list flows: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/flows/save")
async def save_flow(payload: dict):
    try:
        name = payload.get("name", "Untitled Flow")
        flow_id = payload.get("id")
        if not flow_id:
            import re
            flow_id = re.sub(r'[^\w\s-]', '', name).strip().lower().replace(" ", "_")
            if not flow_id:
                flow_id = "untitled_flow"
        
        os.makedirs(FLOWS_DIR, exist_ok=True)
        path = os.path.join(FLOWS_DIR, f"{flow_id}.json")
        
        # Read old flow to check previous active status and activated_at
        old_active = False
        old_activated_at = None
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    old_flow = json.load(f)
                    old_active = old_flow.get("active", False)
                    old_activated_at = old_flow.get("activated_at")
            except Exception:
                pass

        active = payload.get("active")
        if active is None:
            active = old_active
        else:
            active = bool(active)

        if active:
            if not old_active or not old_activated_at:
                import datetime
                activated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
            else:
                activated_at = old_activated_at
        else:
            activated_at = None

        flow_to_save = {
            "id": flow_id,
            "name": name,
            "nodes": payload.get("nodes", []),
            "edges": payload.get("edges", []),
            "active": active,
            "activated_at": activated_at
        }
        
        from core.reactive_manager import reactive_manager
        try:
            if active:
                reactive_manager.register_flow(flow_id, flow_to_save)
            else:
                reactive_manager.unregister_flow(flow_id)
        except ValueError as exc:
            logger.error("Flow registration failed for '%s': %s", flow_id, exc)
            raise HTTPException(status_code=422, detail=str(exc))

        with open(path, "w", encoding="utf-8") as f:
            json.dump(flow_to_save, f, indent=2)
            
        os.makedirs(os.path.dirname(FLOWS_PATH), exist_ok=True)
        with open(FLOWS_PATH, "w", encoding="utf-8") as f:
            json.dump(flow_to_save, f, indent=2)
            
        return {"status": "ok", "message": "flow saved", "id": flow_id, "flow": flow_to_save}

    except Exception as exc:
        logger.exception("Failed to save flow: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/flows/load")
async def load_flow(id: str = None):
    try:
        if id:
            path = os.path.join(FLOWS_DIR, f"{id}.json")
            if not os.path.exists(path):
                raise HTTPException(status_code=404, detail=f"Flow '{id}' not found")
        else:
            path = FLOWS_PATH
            if not os.path.exists(path):
                os.makedirs(FLOWS_DIR, exist_ok=True)
                files = [f for f in os.listdir(FLOWS_DIR) if f.endswith(".json")]
                if files:
                    path = os.path.join(FLOWS_DIR, files[0])
                else:
                    return {"flow": None}
                    
        with open(path, "r", encoding="utf-8") as f:
            return {"flow": json.load(f)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to load flow: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/flows/{flow_id}")
async def delete_flow(flow_id: str):
    try:
        path = os.path.join(FLOWS_DIR, f"{flow_id}.json")
        if os.path.exists(path):
            from core.reactive_manager import reactive_manager
            reactive_manager.unregister_flow(flow_id)
            os.remove(path)
            return {"status": "ok", "message": f"Flow '{flow_id}' deleted"}

        raise HTTPException(status_code=404, detail=f"Flow '{flow_id}' not found")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to delete flow: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/flows/execute")
async def execute_flow(body: dict):
    """Execute the provided flow graph or the currently saved flow."""
    try:
        flow    = body.get("flow")
        flow_id = body.get("flow_id", "default")

        # If no flow provided in body, load from disk
        if not flow:
            if not os.path.exists(FLOWS_PATH):
                raise HTTPException(status_code=404, detail="No saved flow found. Save a flow first.")
            with open(FLOWS_PATH, "r", encoding="utf-8") as f:
                flow = json.load(f)

        result = flow_engine.execute_flow(flow, flow_id=flow_id)
        return result.to_dict()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Flow execute failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/flows/execute/stream")
async def execute_flow_stream(body: dict):
    """Execute a flow and stream node status events as Server-Sent Events (SSE)."""
    flow    = body.get("flow")
    flow_id = body.get("flow_id", "default")

    if not flow:
        if not os.path.exists(FLOWS_PATH):
            raise HTTPException(status_code=404, detail="No saved flow found. Save a flow first.")
        with open(FLOWS_PATH, "r", encoding="utf-8") as f:
            flow = json.load(f)

    event_queue: queue.Queue = queue.Queue()

    def _on_event(event: dict):
        event_queue.put(event)

    def _run():
        try:
            flow_engine.execute_flow_streaming(flow, flow_id=flow_id, on_event=_on_event)
        except Exception as exc:
            event_queue.put({"type": "execution_error", "error": str(exc)})
        finally:
            event_queue.put(None)  # sentinel → generator exits

    threading.Thread(target=_run, daemon=True).start()

    def _sse_generator():
        yield "retry: 1000\n\n"
        while True:
            try:
                event = event_queue.get(timeout=30)
            except queue.Empty:
                yield ": heartbeat\n\n"
                continue
            if event is None:
                yield "event: done\ndata: {}\n\n"
                break
            event_type = event.get("type", "message")
            yield f"event: {event_type}\ndata: {json.dumps(event)}\n\n"

    return StreamingResponse(
        _sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/flows/executions")
async def list_executions(limit: int = 20):
    """Return recent execution results."""
    try:
        return {"executions": flow_engine.list_executions(limit=limit)}
    except Exception as exc:
        logger.exception("Failed to list executions: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/flows/executions/{execution_id}")
async def get_execution(execution_id: str):
    """Return a specific execution result by ID."""
    result = flow_engine.get_execution(execution_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' not found")
    return result
