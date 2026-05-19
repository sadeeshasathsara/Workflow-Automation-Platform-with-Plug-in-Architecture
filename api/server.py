from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import sys
import os

# Add project root to path so we can import core modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.plugin_manager import PluginManager
from core.event_bus import EventBus
from core.logging_utils import get_logger, setup_logging

setup_logging()
logger = get_logger("api")

# Initialize the plugin system
event_bus = EventBus()
plugin_manager = PluginManager(event_bus)
plugin_manager.load_plugins()

app = FastAPI(
    title="Workflow Automation Platform API",
    description="REST API for plugin-based workflow automation",
    version="1.0.0"
)


class EmailPayload(BaseModel):
    from_addr: str
    subject: str


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Workflow Automation API is running"}


@app.get("/plugins")
async def list_plugins():
    """List all loaded plugins."""
    try:
        plugins_list = []
        for name, plugin in plugin_manager.plugins.items():
            plugins_list.append({
                "name": name,
                "class": plugin.__class__.__name__
            })
        return {"plugins": plugins_list, "count": len(plugins_list)}
    except Exception as exc:
        logger.exception("Failed to list plugins: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/email/send")
async def send_email(payload: EmailPayload):
    """Trigger an email event through the plugin system."""
    try:
        email_data = {
            "from": payload.from_addr,
            "subject": payload.subject
        }
        
        # Emit the event through the bus
        event_bus.emit("email.received", email_data)
        
        logger.info("Email event triggered via API: from=%s, subject=%s", payload.from_addr, payload.subject)
        return {
            "status": "success",
            "message": "Email event sent to all listeners",
            "data": email_data
        }
    except Exception as exc:
        logger.exception("Failed to send email event: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/email/logs")
async def get_email_logs():
    """Retrieve archived email logs from file_logger plugin."""
    try:
        log_file = "email_archive.log"
        if not os.path.exists(log_file):
            return {"logs": [], "message": "No email logs found"}
        
        import json
        logs = []
        with open(log_file, "r") as f:
            for line in f:
                try:
                    logs.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        
        return {"logs": logs, "count": len(logs)}
    except Exception as exc:
        logger.exception("Failed to read email logs: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/status")
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


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting API server on http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
