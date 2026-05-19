import asyncio
from core.logging_utils import get_logger

logger = get_logger("async_event_bus")


class AsyncEventBus:
    """Async pub/sub event bus for concurrent event handling."""
    
    def __init__(self):
        # Each event name maps to a list of async callbacks
        self.listeners = {}
    
    def subscribe(self, event, callback):
        """Subscribe to an event with an async callback."""
        if not callable(callback):
            raise TypeError("callback must be callable")
        
        if event not in self.listeners:
            self.listeners[event] = []
        
        self.listeners[event].append(callback)
    
    async def emit(self, event, data):
        """Emit an event and wait for all handlers to complete concurrently."""
        if event not in self.listeners:
            return
        
        # Create tasks for all listeners to run concurrently
        tasks = []
        for callback in self.listeners[event]:
            try:
                # Check if callback is a coroutine function
                if asyncio.iscoroutinefunction(callback):
                    tasks.append(callback(data))
                else:
                    # Wrap sync callbacks in a coroutine
                    tasks.append(self._run_sync_callback(callback, data))
            except Exception as exc:
                logger.exception("Error creating task for event '%s': %s", event, exc)
        
        # Run all tasks concurrently and wait for completion
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Log any exceptions from tasks
            for result in results:
                if isinstance(result, Exception):
                    logger.exception("Error while handling event '%s': %s", event, result)
    
    async def _run_sync_callback(self, callback, data):
        """Run a synchronous callback in a way that doesn't block the event loop."""
        try:
            callback(data)
        except Exception as exc:
            raise exc


async def emit_event(event_bus, event, data):
    """Helper function to emit events asynchronously."""
    await event_bus.emit(event, data)
