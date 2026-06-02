from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader
import json
from datetime import datetime


class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("file_logger")
        self.config = get_config_loader().get("file_logger", default={})
        self.log_file = self.config.get("log_file", "email_archive.log")

    def name(self) -> str:
        return "file_logger"

    def describe(self) -> dict:
        return {
            "name":         "file_logger",
            "display_name": "File Logger",
            "description":  "Appends incoming data as JSON lines to a log file for archival.",
            "icon":         "📁",
            "category":     "utility",
            "type":         "action",
            "version":      "1.0.0",
        }

    def get_input_schema(self) -> list:
        return [
            {
                "name":         "log_file",
                "display_name": "Log File Path",
                "type":         "string",
                "required":     False,
                "default":      "email_archive.log",
                "placeholder":  "email_archive.log",
                "description":  "Path to the file where events will be appended.",
            },
        ]

    def get_output_schema(self) -> dict:
        return {
            "written":   "boolean",
            "file_path": "string",
            "timestamp": "string",
        }

    def execute(self, input_data: dict, config: dict) -> dict:
        log_file  = config.get("log_file", self.log_file)
        timestamp = datetime.now().isoformat()
        record    = {"timestamp": timestamp, "event": "data.received", "data": input_data}
        try:
            with open(log_file, "a") as f:
                f.write(json.dumps(record) + "\n")
            self.logger.info("File logger wrote to %s", log_file)
            return {"written": True, "file_path": log_file, "timestamp": timestamp}
        except Exception as exc:
            self.logger.exception("File logger execute failed: %s", exc)
            return {"written": False, "file_path": log_file, "timestamp": timestamp}

    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus
            event_bus.subscribe("email.received", self.log_to_file)
            self.logger.info("File logger plugin initialized (writing to %s)", self.log_file)
        except Exception as exc:
            self.logger.exception("File logger initialization failed: %s", exc)

    def log_to_file(self, data):
        self.execute(data, {"log_file": self.log_file})
