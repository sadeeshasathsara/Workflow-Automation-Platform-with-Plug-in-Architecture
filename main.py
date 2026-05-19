from core.plugin_manager import PluginManager
from core.event_bus import EventBus
from core.logging_utils import get_logger, setup_logging

setup_logging()
logger = get_logger("main")

# Build the shared event bus first so every plugin talks through the same channel.
event_bus = EventBus()
# The plugin manager discovers and initializes all plugins under the plugins folder.
plugin_manager = PluginManager(event_bus)

try:
	plugin_manager.load_plugins()
except Exception as exc:
	logger.exception("Plugin loading failed: %s", exc)

# Grab the Gmail plugin and trigger a sample email event for the logger plugin to observe.
try:
	logger.info("Running sample email simulation")
	gmail_plugin = plugin_manager.plugins["gmail"]
	gmail_plugin.simulate_new_email()
except KeyError:
	logger.error("Gmail plugin was not loaded, so the sample email could not be sent.")
except Exception as exc:
	logger.exception("Application failed while sending sample email: %s", exc)