from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader


class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("slack")
        self.config = get_config_loader().get("slack", default={})

    def name(self) -> str:
        return "slack"

    def describe(self) -> dict:
        return {
            "name":         "slack",
            "display_name": "Slack",
            "description":  "Send messages to a Slack channel via Incoming Webhook.",
            "icon":         "💬",
            "category":     "communication",
            "type":         "action",
            "version":      "1.0.0",
        }

    def get_input_schema(self) -> list:
        return [
            {
                "name":         "webhook_url",
                "display_name": "Webhook URL",
                "type":         "credential",
                "credential_type": "slack_webhook",
                "required":     True,
                "description":  "Slack Incoming Webhook URL from your Slack app settings.",
            },
            {
                "name":         "channel",
                "display_name": "Channel",
                "type":         "string",
                "required":     False,
                "default":      "#alerts",
                "placeholder":  "#channel-name",
                "description":  "Target Slack channel (overrides webhook default).",
            },
            {
                "name":         "message",
                "display_name": "Message",
                "type":         "text",
                "required":     True,
                "default":      "New event: {{subject}}",
                "placeholder":  "Message text. Use {{field}} to reference input data.",
                "description":  "The message text to post. Supports {{field}} templating from input_data.",
            },
        ]

    def get_output_schema(self) -> dict:
        return {
            "sent":    "boolean",
            "channel": "string",
            "message": "string",
        }

    def get_publisher_schema(self) -> dict:
        return self.get_output_schema()

    def get_subscriber_schema(self) -> dict:
        return {
            "channel": "string",
            "message": "string",
        }


    def get_config_schema(self) -> list:
        return [
            {
                "name":         "webhook_url",
                "display_name": "Slack Webhook URL",
                "type":         "string",
                "required":     True,
                "placeholder":  "https://hooks.slack.com/services/...",
                "description":  "Incoming Webhook URL from Slack API settings.",
            },
        ]

    def test_connection(self, config: dict) -> dict:
        webhook_url = config.get("webhook_url", "")
        if not webhook_url.startswith("https://hooks.slack.com/"):
            return {"ok": False, "error": "Invalid Slack webhook URL format."}
        
        simulate = config.get("simulate_webhook", self.config.get("simulate_webhook", True))
        if webhook_url:
            simulate = False
            
        if simulate:
            self.logger.info("Slack test_connection (simulated): OK")
            return {"ok": True}
        try:
            import urllib.request, json as _json
            req = urllib.request.Request(
                webhook_url,
                data=_json.dumps({"text": "Connection test from Workflow Platform"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                return {"ok": resp.status == 200}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def execute(self, input_data: dict, config: dict) -> dict:
        try:
            channel     = config.get("channel", self.config.get("channel", "#alerts"))
            template    = config.get("message", "New event: {{subject}}")
            message     = self._render_template(template, input_data)
            webhook_url = config.get("webhook_url", self.config.get("webhook_url", ""))
            
            simulate    = config.get("simulate_webhook", self.config.get("simulate_webhook", True))
            if webhook_url and webhook_url.startswith("https://hooks.slack.com/"):
                simulate = False

            if simulate or not webhook_url.startswith("https://"):
                self.logger.info("Slack [%s] (simulated): %s", channel, message)
            else:
                import urllib.request, json as _json
                payload = {"text": message, "channel": channel}
                req = urllib.request.Request(
                    webhook_url,
                    data=_json.dumps(payload).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                urllib.request.urlopen(req, timeout=5)
                self.logger.info("Slack message sent to %s", channel)

            return {"sent": True, "channel": channel, "message": message}
        except Exception as exc:
            self.logger.exception("Slack execute failed: %s", exc)
            return {"sent": False, "channel": "", "message": str(exc)}

    def _render_template(self, template: str, data: dict) -> str:
        """Replace {{key}} placeholders with values from data."""
        result = template
        for key, value in data.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))
        return result

    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus
            if self.config.get("enabled", True):
                event_bus.subscribe("email.received", self.send_to_slack)
                self.logger.info("Slack plugin initialized (channel=%s)", self.config.get("channel", "#alerts"))
            else:
                self.logger.info("Slack plugin disabled in config")
        except Exception as exc:
            self.logger.exception("Slack plugin initialization failed: %s", exc)

    def send_to_slack(self, data):
        self.execute(data, self.config)
