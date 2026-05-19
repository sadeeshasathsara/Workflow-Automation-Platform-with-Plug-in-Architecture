import asyncio
import inspect
from core.logging_utils import get_logger

logger = get_logger("async_event_bus")

try:
    from core.rq_client import get_queue
    from rq import Retry
    rq_available = True
except Exception:
    get_queue = None
    Retry = None
    rq_available = False

# Try to import the sqlite queue backend (internal durable queue)
try:
    from core.sqlite_queue import enqueue as sqlite_enqueue
    from core.sqlite_queue import claim_job as sqlite_claim_job
    sqlite_available = True
except Exception:
    sqlite_enqueue = None
    sqlite_claim_job = None
    sqlite_available = False


class AsyncEventBus:
    """Async pub/sub event bus for concurrent event handling.

    If RQ is available and a Redis queue can be created, events will be enqueued
    as background jobs so handlers are executed by worker processes. Otherwise
    handlers run in-process concurrently.
    """

    def __init__(self, use_queue=True, queue_name="events", backend_priority=None):
        # Each event name maps to a list of listener descriptors.
        # A descriptor is either a callable (for local execution) or a tuple
        # ('plugin', plugin_name, method_name) used for queuing jobs.
        self.listeners = {}
        self.queue_name = queue_name
        # backend_priority can be ['rq','sqlite'] to prefer one over the other.
        self.backend_priority = backend_priority or (["rq", "sqlite"])

        # Determine which backend to use based on availability and priority
        self._queue = None
        self.use_queue = False
        for backend in self.backend_priority:
            if backend == "rq" and rq_available and use_queue:
                try:
                    self._queue = get_queue(self.queue_name)
                    self.use_queue = True
                    self._backend = "rq"
                    break
                except Exception as exc:
                    logger.warning("RQ queue init failed: %s", exc)
            if backend == "sqlite" and sqlite_available and use_queue:
                self._backend = "sqlite"
                self.use_queue = True
                break


    def subscribe(self, event, callback):
        """Subscribe to an event with a callback.

        If RQ is active this method records the handler as a plugin-method tuple
        when possible so the worker can load and invoke it. Otherwise we keep
        the callable for in-process execution.
        """
        if event not in self.listeners:
            self.listeners[event] = []

        # If callback is a bound method from a plugin instance, try to store
        # a lightweight reference (plugin_name, method_name) which workers
        # can use to invoke the handler.
        try:
            if self.use_queue and hasattr(callback, "__self__") and hasattr(callback, "__func__"):
                instance = callback.__self__
                method_name = callback.__func__.__name__
                # Prefer plugin instance 'name' if available
                plugin_name = None
                if hasattr(instance, "name") and callable(instance.name):
                    try:
                        plugin_name = instance.name()
                    except Exception:
                        plugin_name = None

                if plugin_name:
                    self.listeners[event].append(("plugin", plugin_name, method_name))
                    return
        except Exception:
            # Fall back to storing the callable
            pass

        # Default: store the callable for local execution
        if not callable(callback):
            raise TypeError("callback must be callable")

        self.listeners[event].append(callback)

    async def emit(self, event, data):
        """Emit an event and either enqueue jobs or run handlers locally."""
        if event not in self.listeners:
            return

        jobs = []
        # Enqueue jobs when possible
        if self.use_queue:
            for listener in self.listeners[event]:
                if isinstance(listener, tuple) and listener[0] == "plugin":
                    _, plugin_name, method_name = listener
                    try:
                        if getattr(self, "_backend", None) == "rq":
                            retry = Retry(max=3, interval=[10, 30, 60]) if Retry is not None else None
                            job = self._queue.enqueue("core.rq_worker.process_event", plugin_name, method_name, event, data, retry=retry)
                            jobs.append(job)
                        elif getattr(self, "_backend", None) == "sqlite":
                            job_id = sqlite_enqueue(plugin_name, method_name, event, data, max_attempts=3)
                            jobs.append(job_id)
                    except Exception as exc:
                        logger.exception("Failed to enqueue job for %s.%s: %s", plugin_name, method_name, exc)
                else:
                    # Fallback: run callable in-process asynchronously
                    callback = listener
                    try:
                        if inspect.iscoroutinefunction(callback):
                            asyncio.create_task(callback(data))
                        else:
                            asyncio.create_task(self._run_sync_callback(callback, data))
                    except Exception as exc:
                        logger.exception("Error scheduling local handler for event '%s': %s", event, exc)

            return jobs

        # Local execution path
        tasks = []
        for callback in self.listeners[event]:
            try:
                if callable(callback):
                    if inspect.iscoroutinefunction(callback):
                        tasks.append(callback(data))
                    else:
                        tasks.append(self._run_sync_callback(callback, data))
                else:
                    logger.warning("Skipping non-callable listener for event %s: %s", event, callback)
            except Exception as exc:
                logger.exception("Error creating task for event '%s': %s", event, exc)

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, Exception):
                    logger.exception("Error while handling event '%s': %s", event, result)

    async def _run_sync_callback(self, callback, data):
        try:
            callback(data)
        except Exception as exc:
            raise exc


async def emit_event(event_bus, event, data):
    await event_bus.emit(event, data)
