from fastapi import APIRouter, HTTPException
from api.deps import plugin_manager, event_bus, logger

router = APIRouter()


@router.get("/status")
async def get_status():
    """Get overall system status."""
    try:
        return {
            "status": "running",
            "plugins_loaded": len(plugin_manager.plugins),
            "event_listeners": {event: len(listeners) for event, listeners in event_bus.listeners.items()}
        }
    except Exception as exc:
        logger.exception("Failed to get status: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
