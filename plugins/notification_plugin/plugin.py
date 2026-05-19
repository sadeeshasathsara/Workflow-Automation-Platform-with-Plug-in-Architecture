from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader

# Plugin that sends system notifications for important email events.
class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("notification")
        self.config = get_config_loader().get("notification", default={})

    def name(self):
        return "notification"

    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus

            # Listen for emails to trigger notifications.
            event_bus.subscribe(
                "email.received",
                self.send_notification
            )

            self.logger.info("Notification plugin initialized")
        except Exception as exc:
            self.logger.exception("Notification plugin initialization failed: %s", exc)

    def send_notification(self, data):
        try:
            from_addr = data.get("from", "unknown")
            subject = data.get("subject", "no subject")
            
            # Simulate a system notification (in real app, use desktop notification library).
            notification = f"New email from {from_addr}"
            self.logger.info("System notification: %s (subject: %s)", notification, subject)
        except Exception as exc:
            self.logger.exception("Failed to send notification: %s", exc)
