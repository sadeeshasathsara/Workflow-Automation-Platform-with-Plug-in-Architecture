import sys
import os

# Ensure project root on path for core imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.async_event_bus import AsyncEventBus
from core.plugin_manager import PluginManager
from core.logging_utils import get_logger, setup_logging

setup_logging()
logger = get_logger("api")

# Shared instances for controllers
event_bus = AsyncEventBus(use_queue=True)
plugin_manager = PluginManager(event_bus)
plugin_manager.load_plugins()
