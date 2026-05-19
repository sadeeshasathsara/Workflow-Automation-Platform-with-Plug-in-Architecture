from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader
import json
from datetime import datetime

# Plugin that logs all email events to a file for archival.
class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("file_logger")
        self.config = get_config_loader().get("file_logger", default={})
        self.log_file = self.config.get("log_file", "email_archive.log")

    def name(self):
        return "file_logger"

    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus

            # Listen for emails to archive them to file.
            event_bus.subscribe(
                "email.received",
                self.log_to_file
            )

            self.logger.info("File logger plugin initialized (writing to %s)", self.log_file)
        except Exception as exc:
            self.logger.exception("File logger initialization failed: %s", exc)

    def log_to_file(self, data):
        try:
            timestamp = datetime.now().isoformat()
            record = {
                "timestamp": timestamp,
                "event": "email.received",
                "data": data
            }
            
            with open(self.log_file, "a") as f:
                f.write(json.dumps(record) + "\n")
            
            self.logger.info("Logged email event to %s", self.log_file)
        except Exception as exc:
            self.logger.exception("Failed to log email to file: %s", exc)
