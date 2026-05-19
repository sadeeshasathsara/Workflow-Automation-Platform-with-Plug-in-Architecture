from fastapi import APIRouter, HTTPException
import os
import json
from core.logging_utils import get_logger

router = APIRouter()
logger = get_logger("api.flows")

FLOWS_PATH = os.environ.get("FLOWS_STORE", "data/flows.json")


@router.post("/flows/save")
async def save_flow(payload: dict):
    try:
        os.makedirs(os.path.dirname(FLOWS_PATH), exist_ok=True)
        with open(FLOWS_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        return {"status": "ok", "message": "flow saved"}
    except Exception as exc:
        logger.exception("Failed to save flow: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/flows/load")
async def load_flow():
    try:
        if not os.path.exists(FLOWS_PATH):
            return {"flow": None}
        with open(FLOWS_PATH, "r", encoding="utf-8") as f:
            payload = json.load(f)
        return {"flow": payload}
    except Exception as exc:
        logger.exception("Failed to load flow: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
