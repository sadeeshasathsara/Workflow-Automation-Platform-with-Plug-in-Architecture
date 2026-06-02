from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader

class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("gemini")
        self.config = get_config_loader().get("gemini", default={})

    def name(self) -> str:
        return "gemini"

    def describe(self) -> dict:
        return {
            "name":         "gemini",
            "display_name": "Gemini AI",
            "description":  "Summarizes input text and generates content using the Google Gemini AI API.",
            "icon":         "♊",
            "category":     "ai",
            "type":         "action",
            "version":      "1.0.0",
        }

    def get_input_schema(self) -> list:
        return [
            {
                "name":         "api_key",
                "display_name": "Gemini API Key",
                "type":         "credential",
                "credential_type": "gemini_api_key",
                "required":     True,
                "description":  "Your Google Gemini API key from Google AI Studio.",
            },
            {
                "name":         "prompt",
                "display_name": "AI Prompt",
                "type":         "text",
                "required":     True,
                "default":      "Summarize the following email:\nSubject: {{subject}}\nFrom: {{from}}\nBody: {{body}}",
                "placeholder":  "Instructions for the AI. Use {{field}} to reference inputs.",
                "description":  "AI instructions. Supports templating like {{subject}}, {{body}}, etc.",
            },
        ]

    def get_output_schema(self) -> dict:
        return {
            "summary": "string",
            "raw_response": "string",
            "status": "string",
        }

    def get_publisher_schema(self) -> dict:
        return self.get_output_schema()

    def get_subscriber_schema(self) -> dict:
        return {
            "summary": "string",
            "status": "string",
        }

    def get_config_schema(self) -> list:
        return [
            {
                "name":         "api_key",
                "display_name": "Gemini API Key",
                "type":         "password",
                "required":     True,
                "description":  "Your Google Gemini API key from Google AI Studio.",
            },
            {
                "name":         "model",
                "display_name": "Gemini Model",
                "type":         "select",
                "required":     True,
                "default":      "gemini-2.5-flash",
                "options":      ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-flash-latest", "gemini-pro-latest"],
                "description":  "Google Gemini model used for generation.",
            },
        ]

    def test_connection(self, config: dict) -> dict:
        api_key = config.get("api_key", "")
        if not api_key:
            return {"ok": False, "error": "Gemini API Key is required."}
        
        model = config.get("model", "gemini-2.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        
        try:
            import urllib.request, json as _json
            payload = {
                "contents": [{"parts": [{"text": "Hello"}]}]
            }
            req = urllib.request.Request(
                url,
                data=_json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status == 200:
                    return {"ok": True, "message": "Successfully connected to Google Gemini API!"}
                body_txt = resp.read().decode()
                return {"ok": False, "error": f"Gemini returned status {resp.status}: {body_txt}"}
        except Exception as exc:
            return {"ok": False, "error": f"Gemini API connection failed: {exc}"}

    def execute(self, input_data: dict, config: dict) -> dict:
        try:
            api_key = config.get("api_key", self.config.get("api_key", ""))
            model = config.get("model", self.config.get("model", "gemini-2.5-flash"))
            template = config.get("prompt", "Summarize the following email:\nSubject: {{subject}}\nFrom: {{from}}\nBody: {{body}}")
            prompt = self._render_template(template, input_data)

            if not api_key:
                raise ValueError("Gemini API Key is missing. Configure it in plugin settings first.")

            self.logger.info("Gemini plugin: Generating using model %s...", model)
            
            import urllib.request, json as _json
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}]
            }
            req = urllib.request.Request(
                url,
                data=_json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                res_data = _json.loads(resp.read().decode())
                
            # Parse output
            candidates = res_data.get("candidates", [])
            if not candidates:
                raise ValueError("No response candidates returned by Gemini.")
                
            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if not text:
                raise ValueError("Gemini returned an empty text response.")

            self.logger.info("Gemini plugin execution succeeded.")
            return {
                "summary": text.strip(),
                "raw_response": _json.dumps(res_data),
                "status": "success"
            }
        except Exception as exc:
            self.logger.exception("Gemini execute failed: %s", exc)
            return {
                "summary": "",
                "raw_response": str(exc),
                "status": "error"
            }

    def _render_template(self, template: str, data: dict) -> str:
        """Replace {{key}} placeholders with values from data."""
        result = template
        for key, value in data.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))
        return result

    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus
            self.logger.info("Gemini plugin initialized")
        except Exception as exc:
            self.logger.exception("Gemini plugin initialization failed: %s", exc)
