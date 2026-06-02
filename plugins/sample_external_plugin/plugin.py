from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger


class PluginImpl(Plugin):
    """Sample external plugin — use this as a template when building your own plugins."""

    def __init__(self):
        self.logger = get_logger("sample_external")

    def name(self) -> str:
        return "sample_external"

    def describe(self) -> dict:
        return {
            "name":         "sample_external",
            "display_name": "Sample Plugin",
            "description":  "A minimal example plugin. Copy this to build your own.",
            "icon":         "🧩",
            "category":     "utility",
            "type":         "action",
            "version":      "1.0.0",
        }

    def get_input_schema(self) -> list:
        return [
            {
                "name":         "message",
                "display_name": "Message",
                "type":         "text",
                "required":     False,
                "default":      "Hello from sample plugin!",
                "description":  "A message to echo in the logs.",
            },
        ]

    def get_output_schema(self) -> dict:
        return {
            "echoed":  "boolean",
            "message": "string",
        }

    def execute(self, input_data: dict, config: dict) -> dict:
        message = config.get("message", "Hello from sample plugin!")
        self.logger.info("Sample plugin executed: %s | input=%s", message, input_data)
        return {"echoed": True, "message": message}

    def initialize(self, event_bus):
        self.event_bus = event_bus
        event_bus.subscribe("email.received", self.handle_email)
        self.logger.info("Sample external plugin initialized")

    def handle_email(self, data):
        self.execute(data, {})
