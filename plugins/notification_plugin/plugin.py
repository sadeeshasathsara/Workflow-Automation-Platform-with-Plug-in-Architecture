from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader
import json
import os
import uuid
from datetime import datetime, timezone


class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("notification")
        self.config = get_config_loader().get("notification", default={})

    def name(self) -> str:
        return "notification"

    def describe(self) -> dict:
        return {
            "name":         "notification",
            "display_name": "System Notifier",
            "description":  "Sends a system-level notification when triggered by a workflow event.",
            "icon":         "🔔",
            "category":     "communication",
            "type":         "action",
            "version":      "1.0.0",
        }

    def get_input_schema(self) -> list:
        return [
            {
                "name":         "title",
                "display_name": "Title",
                "type":         "string",
                "required":     False,
                "default":      "New Event",
                "placeholder":  "Notification title",
                "description":  "Title shown in the system notifier.",
            },
            {
                "name":         "message",
                "display_name": "Message",
                "type":         "text",
                "required":     False,
                "default":      "",
                "placeholder":  "Notification body text",
                "description":  "Body text of the notification. Supports {{field}} from input_data.",
            },
        ]

    def get_output_schema(self) -> dict:
        return {
            "sent":    "boolean",
            "title":   "string",
            "message": "string",
            "level":   "string",
        }

    def get_publisher_schema(self) -> dict:
        return self.get_output_schema()

    def get_subscriber_schema(self) -> dict:
        return {
            "title":   "string",
            "message": "string",
            "icon":    "string",
            "level":   "string",
        }


    def get_config_schema(self) -> list:
        return [
            {
                "name":         "title",
                "display_name": "Default Title",
                "type":         "string",
                "required":     False,
                "default":      "New Event",
                "placeholder":  "e.g. New Event",
                "description":  "Default title shown in the notification popup.",
            },
            {
                "name":         "message",
                "display_name": "Default Message",
                "type":         "text",
                "required":     False,
                "default":      "",
                "placeholder":  "e.g. You have a new email from {{from}}",
                "description":  "Default body text. Use {{field}} placeholders (e.g. {{from}}, {{subject}}).",
            },
            {
                "name":         "icon",
                "display_name": "Notification Icon",
                "type":         "string",
                "required":     False,
                "default":      "🔔",
                "placeholder":  "e.g. 🔔",
                "description":  "Optional emoji or icon shown alongside the notification title.",
            },
            {
                "name":         "sound_enabled",
                "display_name": "Enable Sound",
                "type":         "boolean",
                "required":     False,
                "default":      False,
                "description":  "Play a system sound when a notification fires.",
            },
            {
                "name":         "log_notifications",
                "display_name": "Log to Console",
                "type":         "boolean",
                "required":     False,
                "default":      True,
                "description":  "Write notification events to the workflow log.",
            },
            {
                "name":         "max_message_length",
                "display_name": "Max Message Length",
                "type":         "number",
                "required":     False,
                "default":      200,
                "placeholder":  "e.g. 200",
                "description":  "Truncate long messages to this character limit.",
            },
            {
                "name":         "notification_level",
                "display_name": "Notification Level",
                "type":         "select",
                "required":     False,
                "default":      "info",
                "options":      ["info", "success", "warning", "error"],
                "description":  "Severity level controlling the visual style of the notification badge.",
            },
        ]

    # ── Browser notification queue ─────────────────────────────────────────
    _NOTIF_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "data", "notifications.json")

    def _enqueue_browser_notification(self, title: str, message: str, icon: str = "🔔", level: str = "info") -> None:
        """Append a notification event to the shared queue file for the frontend to pick up."""
        try:
            notif_path = os.path.normpath(self._NOTIF_FILE)
            os.makedirs(os.path.dirname(notif_path), exist_ok=True)

            # Read existing queue
            existing: list = []
            if os.path.exists(notif_path):
                try:
                    with open(notif_path, "r", encoding="utf-8") as f:
                        existing = json.load(f)
                    if not isinstance(existing, list):
                        existing = []
                except Exception:
                    existing = []

            # Append new event
            existing.append({
                "id":        str(uuid.uuid4()),
                "title":     title,
                "message":   message,
                "icon":      icon,
                "level":     level,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            # Write back atomically
            with open(notif_path, "w", encoding="utf-8") as f:
                json.dump(existing, f)
        except Exception as exc:
            self.logger.warning("System Notifier: could not enqueue browser notification: %s", exc)

    def test_connection(self, config: dict) -> dict:
        """Fire a test notification to validate the config is working."""
        try:
            title   = config.get("title", "System Notifier Test")
            icon    = config.get("icon", "🔔")
            level   = config.get("notification_level", "info")
            message = f"Test notification from System Notifier — level: {level}"
            self._enqueue_browser_notification(title, message, icon, level)
            self.logger.info("System Notifier test: %s — %s", title, message)
            return {
                "ok":      True,
                "message": f"Test notification sent — Title: '{title}', Level: '{level}'"
            }
        except Exception as exc:
            return {"ok": False, "error": f"Test failed: {exc}"}

    def execute(self, input_data: dict, config: dict) -> dict:
        try:
            # Resolve title: config override → default config → fallback
            title   = config.get("title") or self.config.get("title", "New Event")
            icon    = config.get("icon")  or self.config.get("icon", "")
            level   = config.get("notification_level") or self.config.get("notification_level", "info")
            log_it  = config.get("log_notifications", self.config.get("log_notifications", True))
            max_len = int(config.get("max_message_length") or self.config.get("max_message_length", 200))

            # Resolve message: config override → auto-build from input_data
            message = config.get("message") or self.config.get("message", "")
            if not message:
                from_addr = input_data.get("from", "unknown")
                subject   = input_data.get("subject", "no subject")
                message   = f"From: {from_addr} | Subject: {subject}"

            # Substitute {{field}} placeholders from input_data
            for key, val in input_data.items():
                message = message.replace(f"{{{{{key}}}}}", str(val))
                title   = title.replace(f"{{{{{key}}}}}", str(val))

            # Truncate if needed
            if len(message) > max_len:
                message = message[:max_len].rstrip() + "…"

            display_title = f"{icon} {title}".strip() if icon else title

            if log_it:
                self.logger.info("System Notifier [%s]: %s — %s", level.upper(), display_title, message)

            # Push to browser notification queue
            self._enqueue_browser_notification(display_title, message, icon or "🔔", level)

            return {
                "sent":    True,
                "title":   display_title,
                "message": message,
                "level":   level,
            }
        except Exception as exc:
            self.logger.exception("System Notifier execute failed: %s", exc)
            return {"sent": False, "title": "", "message": str(exc), "level": "error"}

    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus
            event_bus.subscribe("email.received", self.send_notification)
            self.logger.info("System Notifier plugin initialized")
        except Exception as exc:
            self.logger.exception("System Notifier initialization failed: %s", exc)

    def send_notification(self, data):
        self.execute(data, self.config)
