from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader


class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("whatsapp")
        self.config = get_config_loader().get("whatsapp", default={})

    def name(self) -> str:
        return "whatsapp"

    def describe(self) -> dict:
        return {
            "name":         "whatsapp",
            "display_name": "WhatsApp",
            "description":  "Send WhatsApp messages via the WhatsApp Business API.",
            "icon":         "📱",
            "category":     "communication",
            "type":         "action",
            "version":      "1.0.0",
        }

    def get_input_schema(self) -> list:
        return [
            {
                "name":         "phone_number",
                "display_name": "Recipient Phone Number",
                "type":         "string",
                "required":     True,
                "default":      "+10000000000",
                "placeholder":  "+1234567890",
                "description":  "Phone number to send the WhatsApp message to (E.164 format).",
            },
            {
                "name":         "message",
                "display_name": "Message",
                "type":         "text",
                "required":     True,
                "default":      "New email from {{from}}: {{subject}}",
                "placeholder":  "Message text. Use {{field}} to reference input data.",
                "description":  "WhatsApp message body. Supports {{field}} templating.",
            },
        ]

    def get_output_schema(self) -> dict:
        return {
            "sent":         "boolean",
            "phone_number": "string",
            "message":      "string",
        }

    def get_publisher_schema(self) -> dict:
        return self.get_output_schema()

    def get_subscriber_schema(self) -> dict:
        return {
            "phone_number": "string",
            "message":      "string",
        }


    def get_config_schema(self) -> list:
        return [
            {
                "name":         "api_token",
                "display_name": "WhatsApp API Token",
                "type":         "password",
                "required":     True,
                "description":  "Access token from the WhatsApp Business API.",
            },
            {
                "name":         "phone_number_id",
                "display_name": "Phone Number ID",
                "type":         "string",
                "required":     True,
                "description":  "The WhatsApp Business phone number ID from Meta Developer Portal.",
            },
        ]

    def test_connection(self, config: dict) -> dict:
        if not config.get("api_token"):
            return {"ok": False, "error": "API token is required."}
        if not config.get("phone_number_id"):
            return {"ok": False, "error": "Phone Number ID is required."}
        return {"ok": True}

    def execute(self, input_data: dict, config: dict) -> dict:
        try:
            phone_number = config.get("phone_number", self.config.get("phone_number", "+10000000000"))
            template     = config.get("message", "New email from {{from}}: {{subject}}")
            message      = self._render_template(template, input_data)

            api_token = config.get("api_token") or self.config.get("api_token")
            phone_number_id = config.get("phone_number_id") or self.config.get("phone_number_id")
            
            if api_token and phone_number_id:
                import urllib.request, json as _json
                url = f"https://graph.facebook.com/v17.0/{phone_number_id}/messages"
                payload = {
                    "messaging_product": "whatsapp",
                    "to": phone_number,
                    "type": "text",
                    "text": {
                        "body": message
                    }
                }
                req = urllib.request.Request(
                    url,
                    data=_json.dumps(payload).encode(),
                    headers={
                        "Authorization": f"Bearer {api_token}",
                        "Content-Type": "application/json"
                    },
                    method="POST"
                )
                urllib.request.urlopen(req, timeout=5)
                self.logger.info("WhatsApp real message sent to %s via Business API", phone_number)
            else:
                self.logger.info("WhatsApp message to %s (simulated): %s", phone_number, message)
                
            return {"sent": True, "phone_number": phone_number, "message": message}
        except Exception as exc:
            self.logger.exception("WhatsApp execute failed: %s", exc)
            return {"sent": False, "phone_number": "", "message": str(exc)}

    def _render_template(self, template: str, data: dict) -> str:
        result = template
        for key, value in data.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))
        return result

    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus
            if self.config.get("enabled", True):
                event_bus.subscribe("email.received", self.send_whatsapp_message)
                self.logger.info("WhatsApp plugin initialized (phone=%s)", self.config.get("phone_number", "+10000000000"))
            else:
                self.logger.info("WhatsApp plugin disabled in config")
        except Exception as exc:
            self.logger.exception("WhatsApp plugin initialization failed: %s", exc)

    def send_whatsapp_message(self, data):
        self.execute(data, self.config)
