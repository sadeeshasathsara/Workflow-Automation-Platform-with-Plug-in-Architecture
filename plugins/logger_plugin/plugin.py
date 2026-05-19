from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader
import json

class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("logger")
        self.config = get_config_loader().get("logger", default={})

    def name(self):
        return "logger"
    
    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus

            # Listen for emails published by other plugins through the shared event bus.
            event_bus.subscribe(
                "email.received",
                self.handle_email
            )

            self.logger.info("Logger plugin initialized")
        except Exception as exc:
            self.logger.exception("Logger initialization failed: %s", exc)

    def handle_email(self, data):
        try:
            # Keep the output simple so this plugin can be used as a debug listener.
            formatted_data = json.dumps(data, indent=2, sort_keys=True)
            self.logger.info("Email received:\n%s", formatted_data)
        except Exception as exc:
            self.logger.exception("Logger failed to print email data: %s", exc)