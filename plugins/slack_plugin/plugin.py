from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger

# Demo plugin that simulates sending email events to Slack.
class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("slack")

    def name(self):
        return "slack"

    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus

            # Listen for emails so they can be forwarded to Slack.
            event_bus.subscribe(
                "email.received",
                self.send_to_slack
            )

            self.logger.info("Slack plugin initialized")
        except Exception as exc:
            self.logger.exception("Slack plugin initialization failed: %s", exc)

    def send_to_slack(self, data):
        try:
            from_addr = data.get("from", "unknown")
            subject = data.get("subject", "no subject")
            
            # Simulate sending to Slack webhook.
            message = f"Email from {from_addr}: {subject}"
            self.logger.info("Slack notification: %s", message)
        except Exception as exc:
            self.logger.exception("Failed to send Slack notification: %s", exc)
