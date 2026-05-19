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
    logger.info("Starting API server on http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
