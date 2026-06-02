from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader


class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("telegram")
        self.config = get_config_loader().get("telegram", default={})

    def name(self) -> str:
        return "telegram"

    def describe(self) -> dict:
        return {
            "name":         "telegram",
            "display_name": "Telegram",
            "description":  "Send notifications and updates using a Telegram Bot.",
            "icon":         "✈️",
            "category":     "communication",
            "type":         "action",
            "version":      "1.0.0",
        }

    def get_input_schema(self) -> list:
        return [
            {
                "name":         "chat_id",
                "display_name": "Chat ID",
                "type":         "string",
                "required":     False,
                "placeholder":  "e.g. 123456789 or @channelusername",
                "description":  "Target Chat ID or Channel username. If omitted, uses the Default Chat ID from plugin configuration.",
            },
            {
                "name":         "message",
                "display_name": "Message",
                "type":         "text",
                "required":     True,
                "default":      "New event: {{subject}}",
                "placeholder":  "Message text. Supports {{field}} templating.",
                "description":  "The message text to send. Supports {{field}} templating from input data.",
            },
            {
                "name":         "parse_mode",
                "display_name": "Parse Mode",
                "type":         "select",
                "required":     False,
                "default":      "None",
                "options":      ["None", "Markdown", "HTML"],
                "description":  "Format styling to apply to the message text.",
            },
        ]

    def get_output_schema(self) -> dict:
        return {
            "sent":    "boolean",
            "chat_id": "string",
            "message": "string",
        }

    def get_publisher_schema(self) -> dict:
        return self.get_output_schema()

    def get_subscriber_schema(self) -> dict:
        return {
            "chat_id":    "string",
            "message":    "string",
            "parse_mode": "string",
        }


    def get_config_schema(self) -> list:
        return [
            {
                "name":         "bot_token",
                "display_name": "Telegram Bot Token",
                "type":         "password",
                "required":     True,
                "description":  "The API token for your Telegram Bot from @BotFather.",
            },
            {
                "name":         "default_chat_id",
                "display_name": "Default Chat ID",
                "type":         "string",
                "required":     False,
                "description":  "Default Chat ID or Channel username to use when not specified in the workflow node.",
            },
        ]

    def test_connection(self, config: dict) -> dict:
        bot_token = config.get("bot_token", "").strip()
        if not bot_token:
            return {"ok": False, "error": "Telegram Bot Token is required."}

        # Determine if it's a dummy token
        simulate = config.get("simulate", self.config.get("simulate", True))
        if ":" in bot_token and not bot_token.startswith("dummy"):
            simulate = False

        if simulate:
            self.logger.info("Telegram test_connection (simulated): OK")
            return {"ok": True}

        try:
            import urllib.request, json as _json
            url = f"https://api.telegram.org/bot{bot_token}/getMe"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = _json.loads(resp.read().decode())
                if data.get("ok"):
                    return {"ok": True}
                else:
                    return {"ok": False, "error": data.get("description", "Unknown API error")}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def execute(self, input_data: dict, config: dict) -> dict:
        try:
            bot_token = config.get("bot_token") or self.config.get("bot_token", "")
            default_chat_id = config.get("default_chat_id") or self.config.get("default_chat_id", "")
            chat_id = config.get("chat_id") or default_chat_id
            
            if not chat_id:
                raise ValueError("Chat ID is required but was not provided.")

            template = config.get("message", "New event: {{subject}}")
            message = self._render_template(template, input_data)
            parse_mode = config.get("parse_mode", "None")

            simulate = config.get("simulate", self.config.get("simulate", True))
            if bot_token and ":" in bot_token and not bot_token.startswith("dummy"):
                simulate = False

            if simulate:
                self.logger.info("Telegram [%s] (simulated): %s (parse_mode=%s)", chat_id, message, parse_mode)
            else:
                import urllib.request, json as _json
                url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
                payload = {
                    "chat_id": chat_id,
                    "text": message
                }
                if parse_mode != "None":
                    payload["parse_mode"] = parse_mode

                req = urllib.request.Request(
                    url,
                    data=_json.dumps(payload).encode(),
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    resp_data = _json.loads(resp.read().decode())
                    if not resp_data.get("ok"):
                        raise ValueError(resp_data.get("description", "Unknown Telegram API error"))
                self.logger.info("Telegram message sent successfully to %s", chat_id)

            return {"sent": True, "chat_id": chat_id, "message": message}
        except Exception as exc:
            self.logger.exception("Telegram execute failed: %s", exc)
            return {"sent": False, "chat_id": "", "message": str(exc)}

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
                event_bus.subscribe("email.received", self.send_telegram_notification)
                self.logger.info("Telegram plugin initialized (default_chat_id=%s)", self.config.get("default_chat_id", "None"))
            else:
                self.logger.info("Telegram plugin disabled in config")
        except Exception as exc:
            self.logger.exception("Telegram plugin initialization failed: %s", exc)

    def send_telegram_notification(self, data):
        self.execute(data, self.config)
