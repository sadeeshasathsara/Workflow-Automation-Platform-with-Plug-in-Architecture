"""API controllers package."""

from .plugins import router as plugins_router
from .email import router as email_router
from .status import router as status_router
from .flows import router as flows_router

__all__ = ["plugins_router", "email_router", "status_router", "flows_router"]
