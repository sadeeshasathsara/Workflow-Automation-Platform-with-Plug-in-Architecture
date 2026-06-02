import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.async_event_bus import AsyncEventBus
from core.plugin_manager import PluginManager
from core.flow_engine import FlowEngine
from core.credential_store import get_credential_store
from core.logging_utils import get_logger, setup_logging

setup_logging()
logger = get_logger("api")

# Shared instances used by all controllers
event_bus        = AsyncEventBus(use_queue=True)
plugin_manager   = PluginManager(event_bus)
plugin_manager.load_plugins()

flow_engine      = FlowEngine(plugin_manager)
credential_store = get_credential_store()

from core.reactive_manager import reactive_manager
reactive_manager.initialize(plugin_manager, event_bus)

