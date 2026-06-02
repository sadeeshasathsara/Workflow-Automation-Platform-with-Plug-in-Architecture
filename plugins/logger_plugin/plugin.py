from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader
import json


class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("logger")
        self.config = get_config_loader().get("logger", default={})

    def name(self) -> str:
        return "logger"

    def describe(self) -> dict:
        return {
            "name":         "logger",
            "display_name": "Logger",
            "description":  "Logs incoming data to the console for debugging.",
            "icon":         "📋",
            "category":     "utility",
            "type":         "action",
            "version":      "1.0.0",
        }

    def get_input_schema(self) -> list:
        return [
            {
                "name":         "log_level",
                "display_name": "Log Level",
                "type":         "select",
                "required":     False,
                "default":      "INFO",
                "options":      ["DEBUG", "INFO", "WARNING", "ERROR"],
                "description":  "Severity level for the log entry.",
            },
            {
                "name":         "log_format",
                "display_name": "Log Format",
                "type":         "select",
                "required":     False,
                "default":      "JSON",
                "options":      ["JSON", "PLAIN"],
                "description":  "Format used to represent the output log.",
            },
            {
                "name":         "prefix",
                "display_name": "Log Prefix",
                "type":         "string",
                "required":     False,
                "default":      "",
                "placeholder":  "[LOG] ",
                "description":  "Optional string prefix to append before the log entry.",
            },
            {
                "name":         "include_timestamp",
                "display_name": "Include Timestamp",
                "type":         "boolean",
                "required":     False,
                "default":      False,
                "description":  "Prepend or include timestamp in log.",
            },
        ]

    def get_output_schema(self) -> dict:
        return {
            "logged":    "boolean",
            "log_level": "string",
            "message":   "string",
        }

    def get_publisher_schema(self) -> dict:
        return self.get_output_schema()

    def get_subscriber_schema(self) -> dict:
        return {
            "from":     "string",
            "to":       "string",
            "subject":  "string",
            "body":     "string",
            "date":     "string",
            "message_id": "string",
        }


    def execute(self, input_data: dict, config: dict) -> dict:
        try:
            level = config.get("log_level", "INFO")
            log_format = config.get("log_format", "JSON")
            prefix = config.get("prefix", "")
            
            include_ts = config.get("include_timestamp", False)
            if isinstance(include_ts, str):
                include_ts = include_ts.lower() == "true"
                
            from datetime import datetime
            ts_str = f"[{datetime.now().isoformat()}] " if include_ts else ""
            
            if log_format == "JSON":
                payload = {
                    "data": input_data
                }
                if include_ts:
                    payload["timestamp"] = datetime.now().isoformat()
                if prefix:
                    payload["prefix"] = prefix
                formatted = json.dumps(payload, indent=2, sort_keys=True)
            else:
                # PLAIN text format
                items_str = ", ".join(f"{k}: {v}" for k, v in input_data.items())
                formatted = f"{ts_str}{prefix}{items_str}"
                
            msg = f"Logger plugin output:\n{formatted}"
            if level == "DEBUG":
                self.logger.debug(msg)
            elif level == "WARNING":
                self.logger.warning(msg)
            elif level == "ERROR":
                self.logger.error(msg)
            else:
                self.logger.info(msg)
                
            # Archive to email_archive.log so incoming mails are saved
            import os
            log_file = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "email_archive.log"))
            archive_record = {
                "timestamp": datetime.now().isoformat(),
                "event": "email.logged",
                "from": input_data.get("from", input_data.get("sender", "")),
                "subject": input_data.get("subject", ""),
                "data": input_data,
                "level": level,
                "prefix": prefix
            }
            try:
                with open(log_file, "a", encoding="utf-8") as f:
                    f.write(json.dumps(archive_record) + "\n")
            except Exception as e:
                self.logger.warning("Failed to save log to email_archive.log: %s", e)

            return {"logged": True, "log_level": level, "message": formatted}
        except Exception as exc:
            self.logger.exception("Logger execute failed: %s", exc)
            return {"logged": False, "log_level": "ERROR", "message": str(exc)}

    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus
            event_bus.subscribe("email.received", self.handle_email)
            self.logger.info("Logger plugin initialized")
        except Exception as exc:
            self.logger.exception("Logger initialization failed: %s", exc)

    def handle_email(self, data):
        self.execute(data, self.config)