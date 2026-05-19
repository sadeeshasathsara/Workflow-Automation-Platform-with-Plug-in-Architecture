import asyncio
import json
from core.logging_utils import get_logger
from core.plugin_manager import PluginManager

logger = get_logger("rq_worker")


class NoopEventBus:
    def subscribe(self, *args, **kwargs):
        return None

    async def emit(self, *args, **kwargs):
        return None


# Initialize a local plugin manager for the worker process. This will load plugin
# classes so handlers can be invoked within the worker.
_plugin_manager = PluginManager(NoopEventBus())
_plugin_manager.load_plugins()


def _call_handler(plugin, method_name, event, data):
    handler = getattr(plugin, method_name, None)
    if handler is None or not callable(handler):
        raise AttributeError(f"Handler {method_name} not found on plugin {plugin}")

    # Support both sync and async handlers
    if asyncio.iscoroutinefunction(handler):
        asyncio.run(handler(data))
    else:
        handler(data)


def process_event(plugin_name: str, method_name: str, event: str, data: dict):
    """RQ worker job function to invoke a plugin handler.

    This function is called inside worker processes. It looks up the plugin
    instance by name and calls the requested handler with the provided data.
    """
    try:
        plugin = _plugin_manager.plugins.get(plugin_name)
        if plugin is None:
            raise LookupError(f"Plugin not loaded in worker: {plugin_name}")

        _call_handler(plugin, method_name, event, data)
    except Exception as exc:
        # Re-raise to allow RQ to perform retries according to job's Retry policy.
        logger.exception("Error processing event job for %s.%s: %s", plugin_name, method_name, exc)
        raise


def list_loaded_plugins():
    return list(_plugin_manager.plugins.keys())
