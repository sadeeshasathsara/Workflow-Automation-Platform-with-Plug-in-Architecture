from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader

# Demo plugin that simulates receiving an email and publishes it to the bus.
class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("gmail")
        self.config = get_config_loader().get("gmail", default={})

    def name(self):
        return "gmail"

    def initialize(self, event_bus):

        # Save the shared bus so this plugin can publish events later.
        try:
            self.event_bus = event_bus
            self.logger.info("Gmail plugin initialized (simulate_email=%s)", self.config.get("simulate_email", True))
        except Exception as exc:
            self.logger.exception("Gmail plugin initialization failed: %s", exc)

    def simulate_new_email(self):

        # This represents the email payload that other plugins will receive.
        default_from = self.config.get("default_from", "admin@test.com")
        email_data = {
            "from": default_from,
            "subject": "Microkernel Test"
        }

        # Publish the event so listeners like the logger plugin can react.
        try:
            self.event_bus.emit(
                "email.received",
                email_data
            )
        except Exception as exc:
            self.logger.exception("Failed to emit email event: %s", exc)