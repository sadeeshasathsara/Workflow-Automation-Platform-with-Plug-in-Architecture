from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sys
import os

# Make project root importable for core modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.logging_utils import setup_logging
from api.deps import logger
from api.controllers.plugins import router as plugins_router
from api.controllers.email import router as email_router
from api.controllers.status import router as status_router
from api.controllers.flows import router as flows_router

setup_logging()

app = FastAPI(
    title="Workflow Automation Platform API",
    description="REST API for plugin-based workflow automation",
    version="1.0.0"
)

scheduler = None

@app.on_event("startup")
async def startup_event():
    global scheduler
    logger.info("FastAPI starting up — initializing TriggerScheduler...")
    from api.deps import plugin_manager, flow_engine
    from core.scheduler import TriggerScheduler
    scheduler = TriggerScheduler(plugin_manager, flow_engine)
    scheduler.start()

@app.on_event("shutdown")
async def shutdown_event():
    global scheduler
    logger.info("FastAPI shutting down — stopping TriggerScheduler...")
    if scheduler:
        scheduler.stop()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers from separated controller modules
app.include_router(plugins_router)
app.include_router(email_router)
app.include_router(status_router)
app.include_router(flows_router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Workflow Automation API is running"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    logger.info("Starting API server on http://0.0.0.0:%d", port)
    uvicorn.run(app, host="0.0.0.0", port=port)
