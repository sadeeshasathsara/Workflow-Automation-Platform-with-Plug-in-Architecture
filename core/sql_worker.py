import time
import asyncio
from core.logging_utils import get_logger
from core.sqlite_queue import claim_job, mark_done, mark_failed
from core.plugin_manager import PluginManager

logger = get_logger("sql_worker")


class NoopEventBus:
    def subscribe(self, *args, **kwargs):
        return None

    async def emit(self, *args, **kwargs):
        return None


# Load plugins for the worker process
_plugin_manager = PluginManager(NoopEventBus())
_plugin_manager.load_plugins()


def _call_handler(plugin, method_name, data):
    handler = getattr(plugin, method_name, None)
    if handler is None or not callable(handler):
        raise AttributeError(f"Handler {method_name} not found on plugin {plugin}")

    if asyncio.iscoroutinefunction(handler):
        asyncio.run(handler(data))
    else:
        handler(data)


def worker_loop(poll_interval: float = 2.0):
    logger.info("Starting SQLite queue worker loop, poll interval=%s", poll_interval)
    while True:
        job = claim_job()
        if not job:
            time.sleep(poll_interval)
            continue

        job_id = job["id"]
        try:
            plugin_name = job["plugin_name"]
            method_name = job["method_name"]
            plugin = _plugin_manager.plugins.get(plugin_name)
            if plugin is None:
                raise LookupError(f"Plugin not loaded in worker: {plugin_name}")

            _call_handler(plugin, method_name, job["data"])
            mark_done(job_id)
        except Exception as exc:
            logger.exception("Job %s failed: %s", job_id, exc)
            mark_failed(job_id, str(exc))


def run_worker():
    try:
        worker_loop()
    except KeyboardInterrupt:
        logger.info("Worker stopped by user")
