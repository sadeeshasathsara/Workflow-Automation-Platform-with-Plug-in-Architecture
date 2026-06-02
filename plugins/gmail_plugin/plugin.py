from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader
import datetime
import email.utils

def parse_iso_datetime(dt_str: str) -> datetime.datetime | None:
    if not dt_str:
        return None
    # Support older Python versions by replacing 'Z' with UTC offset
    if dt_str.endswith('Z'):
        dt_str = dt_str[:-1] + '+00:00'
    try:
        return datetime.datetime.fromisoformat(dt_str)
    except ValueError:
        try:
            return email.utils.parsedate_to_datetime(dt_str)
        except Exception:
            return None

def to_utc(dt: datetime.datetime | None) -> datetime.datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc)


class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("gmail")
        self.config = get_config_loader().get("gmail", default={})

    def name(self) -> str:
        return "gmail"

    def describe(self) -> dict:
        return {
            "name":         "gmail",
            "display_name": "Gmail Trigger",
            "description":  "Triggers a flow when a new email is received in a Gmail inbox.",
            "icon":         "📧",
            "category":     "communication",
            "type":         "trigger",
            "version":      "1.0.0",
        }

    def get_input_schema(self) -> list:
        return [
            {
                "name":         "gmail_credentials",
                "display_name": "Gmail OAuth2 Credentials",
                "type":         "credential",
                "credential_type": "gmail_oauth2",
                "required":     True,
                "description":  "Your Gmail OAuth2 credentials for inbox access.",
            },
            {
                "name":         "poll_interval",
                "display_name": "Poll Interval (seconds)",
                "type":         "number",
                "required":     False,
                "default":      30,
                "description":  "How often to check for new emails.",
            },
            {
                "name":         "label_filter",
                "display_name": "Label Filter",
                "type":         "string",
                "required":     False,
                "default":      "INBOX",
                "placeholder":  "INBOX, UNREAD, etc.",
                "description":  "Gmail label to filter emails by.",
            },
            {
                "name":         "simulate_email",
                "display_name": "Simulate (Demo Mode)",
                "type":         "boolean",
                "required":     False,
                "default":      False,
                "description":  "When enabled, emits a fake email without connecting to Gmail.",
            },
        ]

    def get_output_schema(self) -> dict:
        return {
            "from":     "string",
            "to":       "string",
            "subject":  "string",
            "body":     "string",
            "date":     "string",
            "message_id": "string",
        }

    def get_publisher_schema(self) -> dict:
        return self.get_output_schema()

    def get_subscriber_schema(self) -> dict:
        return {}


    def get_config_schema(self) -> list:
        return [
            {
                "name":         "client_id",
                "display_name": "OAuth2 Client ID",
                "type":         "string",
                "required":     True,
                "description":  "Google OAuth2 Client ID from Google Cloud Console.",
            },
            {
                "name":         "client_secret",
                "display_name": "OAuth2 Client Secret",
                "type":         "password",
                "required":     True,
                "description":  "Google OAuth2 Client Secret.",
            },
            {
                "name":         "refresh_token",
                "display_name": "Refresh Token",
                "type":         "password",
                "required":     True,
                "description":  "OAuth2 Refresh Token obtained during Gmail authorization.",
            },
            {
                "name":         "simulate_email",
                "display_name": "Demo Mode (Simulate Emails)",
                "type":         "boolean",
                "required":     True,
                "default":      False,
                "description":  "When enabled, the Gmail plugin will generate mock email payloads. If API credentials and OAuth tokens are set, they will override Demo Mode.",
            },
            {
                "name":         "poll_interval",
                "display_name": "Poll Interval (seconds)",
                "type":         "number",
                "required":     True,
                "default":      30,
                "description":  "Determines how frequently the workflow engine checks your Gmail inbox for new emails.",
            },
            {
                "name":         "label_filter",
                "display_name": "Label Filter",
                "type":         "string",
                "required":     True,
                "default":      "INBOX",
                "description":  "Specify the Gmail label (e.g. INBOX, UNREAD, STARRED) to watch for new emails.",
            },
            {
                "name":         "default_from",
                "display_name": "Simulated Sender Address",
                "type":         "string",
                "required":     False,
                "default":      "noreply@example.com",
                "description":  "The simulated sender's email address when Demo Mode is active.",
            },
            {
                "name":         "max_results",
                "display_name": "Max Emails per Poll",
                "type":         "number",
                "required":     True,
                "default":      1,
                "description":  "The maximum number of incoming emails to retrieve in a single polling check.",
            },
        ]

    def test_connection(self, config: dict) -> dict:
        client_id     = config.get("client_id")
        client_secret = config.get("client_secret")
        refresh_token = config.get("refresh_token")

        # ── Step 1: Check for client credentials ─────────────────────────
        if not client_id or not client_secret:
            return {
                "ok": False,
                "error": (
                    "Client ID and Client Secret are required. "
                    "Enter them above then click Save Config before testing."
                )
            }

        # ── Step 2: Check for refresh token ──────────────────────────────
        if not refresh_token:
            return {
                "ok": False,
                "error": (
                    "No OAuth2 refresh token found. "
                    "Click 'Link Google Account' below to authorize Gmail access — "
                    "a refresh token will be saved automatically."
                )
            }

        # ── Step 3: Try to use the refresh token ──────────────────────────
        try:
            import urllib.request, urllib.parse, json as _json
            data = urllib.parse.urlencode({
                "client_id":     client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type":    "refresh_token"
            }).encode()
            req = urllib.request.Request(
                "https://oauth2.googleapis.com/token", data=data, method="POST"
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status == 200:
                    return {"ok": True, "message": "Google OAuth2 connection verified — Gmail is ready!"}
                body_txt = resp.read().decode()
                return {"ok": False, "error": f"Google returned status {resp.status}: {body_txt}"}
        except Exception as exc:
            err_str = str(exc)
            if "401" in err_str or "invalid_client" in err_str:
                return {
                    "ok": False,
                    "error": (
                        "Google rejected the credentials (401 Unauthorized). "
                        "This usually means:\n"
                        "• Your Client ID or Client Secret is wrong — double-check them in Google Cloud Console.\n"
                        "• The OAuth app is not published or you are not a test user.\n"
                        "• The refresh token is revoked — click 'Link Google Account' to re-authorize."
                    )
                }
            if "invalid_grant" in err_str:
                return {
                    "ok": False,
                    "error": (
                        "The refresh token has expired or been revoked. "
                        "Click 'Link Google Account' to re-authorize and get a new token."
                    )
                }
            return {"ok": False, "error": f"OAuth2 verification failed: {err_str}"}

    def execute(self, input_data: dict, config: dict) -> dict:
        """For trigger plugins, execute() generates/fetches the trigger payload."""
        simulate     = config.get("simulate_email", self.config.get("simulate_email", True))
        if isinstance(simulate, str):
            simulate = simulate.lower() == "true"
            
        default_from = config.get("default_from", self.config.get("default_from", "noreply@example.com"))

        client_id = config.get("client_id")
        client_secret = config.get("client_secret")
        refresh_token = config.get("refresh_token")
        
        # If user explicitly configured refresh_token and client details, respect the simulate flag.
        # Otherwise, force simulation mode.
        if not (client_id and client_secret and refresh_token):
            simulate = True

        flow_activated_at_str = config.get("flow_activated_at")
        flow_activated_at = to_utc(parse_iso_datetime(flow_activated_at_str))

        if simulate:
            import os
            import json
            log_file = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "email_archive.log"))
            
            latest_email = None
            if os.path.exists(log_file):
                try:
                    with open(log_file, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                        if lines:
                            for line in reversed(lines):
                                try:
                                    record = json.loads(line)
                                    if record.get("event") == "email.logged" or "data" in record:
                                        data_sec = record.get("data", {})
                                        latest_email = {
                                            "from": data_sec.get("from", data_sec.get("sender", record.get("from", default_from))),
                                            "to": "user@example.com",
                                            "subject": data_sec.get("subject", record.get("subject", "Simulated Email")),
                                            "body": data_sec.get("body", data_sec.get("message", "No body")),
                                            "date": record.get("timestamp", ""),
                                            "message_id": "simulated-" + record.get("timestamp", "001")
                                        }
                                        break
                                except Exception:
                                    continue
                except Exception as e:
                    self.logger.warning("Failed to read simulated email from archive log: %s", e)
            
            if latest_email:
                if flow_activated_at:
                    email_dt = to_utc(parse_iso_datetime(latest_email.get("date")))
                    if email_dt and email_dt < flow_activated_at:
                        self.logger.info("Gmail plugin (simulated): skipping archived email because it arrived at %s, which is before workflow activation time %s", email_dt.isoformat(), flow_activated_at.isoformat())
                        return {}
                self.logger.info("Gmail plugin (simulated): returning latest archived email from %s", latest_email.get("from"))
                return latest_email

            payload = {
                "from":       default_from,
                "to":         "user@example.com",
                "subject":    "Simulated Email Trigger",
                "body":       "This is a simulated email from the Gmail trigger plugin.",
                "date":       "",
                "message_id": "simulated-001",
            }
            if flow_activated_at:
                self.logger.info("Gmail plugin (simulated): skipping default simulated email because workflow activation filtering is active")
                return {}
            self.logger.info("Gmail plugin (simulated): emitting default simulated email from %s", default_from)
            return payload

        try:
            self.logger.info("Gmail plugin: fetching latest email from Google API...")
            import urllib.request, urllib.parse, base64, json as _json, datetime
            
            # 1. Refresh OAuth2 Token
            token_url = "https://oauth2.googleapis.com/token"
            token_data = urllib.parse.urlencode({
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token"
            }).encode()
            
            token_req = urllib.request.Request(token_url, data=token_data, method="POST")
            with urllib.request.urlopen(token_req, timeout=5) as resp:
                tokens = _json.loads(resp.read().decode())
                access_token = tokens["access_token"]

            # 2. List newest message in inbox
            label = config.get("label_filter", "INBOX")
            max_results = config.get("max_results", 1)
            try:
                max_results = int(max_results)
            except (ValueError, TypeError):
                max_results = 1

            list_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages?q=label:{label}&maxResults={max_results}"
            list_req = urllib.request.Request(
                list_url,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            with urllib.request.urlopen(list_req, timeout=5) as resp:
                message_list = _json.loads(resp.read().decode())
                messages = message_list.get("messages", [])
                if not messages:
                    self.logger.info("Gmail plugin: no emails found in folder %s", label)
                    return {}
                latest_message_id = messages[0]["id"]

            # 3. Retrieve full message details
            detail_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{latest_message_id}"
            detail_req = urllib.request.Request(
                detail_url,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            with urllib.request.urlopen(detail_req, timeout=5) as resp:
                email_data = _json.loads(resp.read().decode())

            # 4. Parse Headers
            headers = email_data.get("payload", {}).get("headers", [])
            headers_dict = {h["name"].lower(): h["value"] for h in headers}

            if flow_activated_at:
                email_dt = None
                internal_date_ms = email_data.get("internalDate")
                if internal_date_ms:
                    email_dt = to_utc(datetime.datetime.fromtimestamp(int(internal_date_ms) / 1000.0, tz=datetime.timezone.utc))
                else:
                    email_dt = to_utc(parse_iso_datetime(headers_dict.get("date")))

                if email_dt and email_dt < flow_activated_at:
                    self.logger.info("Gmail plugin: skipping email as it was received at %s, which is before workflow activation time %s", email_dt.isoformat(), flow_activated_at.isoformat())
                    return {}

            # 5. Extract body (parse multipart or single)
            body = ""
            payload_data = email_data.get("payload", {})
            parts = payload_data.get("parts", [])
            
            if parts:
                for part in parts:
                    if part.get("mimeType") == "text/plain":
                        b_data = part.get("body", {}).get("data", "")
                        if b_data:
                            body = base64.urlsafe_b64decode(b_data.encode()).decode("utf-8")
                            break
            else:
                b_data = payload_data.get("body", {}).get("data", "")
                if b_data:
                    body = base64.urlsafe_b64decode(b_data.encode()).decode("utf-8")

            self.logger.info("Gmail plugin: successfully fetched real email from %s", headers_dict.get("from", ""))
            return {
                "from":       headers_dict.get("from", ""),
                "to":         headers_dict.get("to", ""),
                "subject":    headers_dict.get("subject", "(No Subject)"),
                "body":       body.strip(),
                "date":       headers_dict.get("date", ""),
                "message_id": latest_message_id
            }
        except Exception as exc:
            self.logger.exception("Gmail plugin execution failed: %s", exc)
            return {"error": str(exc)}

    def initialize(self, event_bus):
        try:
            self.event_bus = event_bus
            self.logger.info("Gmail plugin initialized (simulate=%s)", self.config.get("simulate_email", False))
        except Exception as exc:
            self.logger.exception("Gmail plugin initialization failed: %s", exc)

    def simulate_new_email(self):
        """Legacy helper used by main.py — emits to the event bus directly."""
        default_from = self.config.get("default_from", "admin@test.com")
        email_data   = {"from": default_from, "subject": "Microkernel Test"}
        try:
            self.event_bus.emit("email.received", email_data)
        except Exception as exc:
            self.logger.exception("Failed to emit email event: %s", exc)