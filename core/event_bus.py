from core.logging_utils import get_logger

class EventBus:

    def __init__(self):
        # Each event name maps to a list of callbacks that want to hear about it.
        self.listeners = {}
        self.logger = get_logger("event_bus")

    def subscribe(self, event, callback):
        if not callable(callback):
            raise TypeError("callback must be callable")

        # Create the listener list on demand so new event types work automatically.
        if event not in self.listeners:
            self.listeners[event] = []

        self.listeners[event].append(callback)
    
    def emit(self, event, data):

        # Notify every subscriber with the payload attached to this event.
        if event in self.listeners:
            for callback in self.listeners[event]:
                try:
                    callback(data)
                except Exception as exc:
                    self.logger.exception("Error while handling event '%s': %s", event, exc)