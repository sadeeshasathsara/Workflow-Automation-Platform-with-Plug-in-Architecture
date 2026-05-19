from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import json
from api.deps import event_bus, logger

router = APIRouter()


class EmailPayload(BaseModel):
    from_addr: str
    subject: str


@router.post("/email/send")
async def send_email(payload: EmailPayload):
    """Trigger an email event through the plugin system asynchronously."""
    try:
        email_data = {
            "from": payload.from_addr,
            "subject": payload.subject
        }

        # Emit the event asynchronously - all plugins process concurrently
        await event_bus.emit("email.received", email_data)

        logger.info("Email event triggered via API (async): from=%s, subject=%s", payload.from_addr, payload.subject)
        return {
            "status": "success",
            "message": "Email event sent to all listeners (processed concurrently)",
            "data": email_data
        }
    except Exception as exc:
        logger.exception("Failed to send email event: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/email/logs")
async def get_email_logs():
    """Retrieve archived email logs from file_logger plugin."""
    try:
        log_file = "email_archive.log"
        if not os.path.exists(log_file):
            return {"logs": [], "message": "No email logs found"}

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
