"""
core/credential_store.py
────────────────────────
Simple encrypted-at-rest credential store.

Credentials are per-plugin dicts stored in data/credentials/<plugin>.json.
Each file is XOR-obfuscated with a key derived from a secret (sufficient
for local dev; swap the backend for Fernet / KMS in production).
"""

import base64
import json
import os
from core.logging_utils import get_logger

logger        = get_logger("credential_store")
CREDS_DIR     = os.environ.get("CREDENTIALS_DIR", "data/credentials")
_SECRET_KEY   = os.environ.get("CREDENTIAL_SECRET", "workflow-platform-secret-key-change-me")


def _obfuscate(data: str) -> str:
    key     = (_SECRET_KEY * ((len(data) // len(_SECRET_KEY)) + 1))[:len(data)]
    xored   = bytes(ord(c) ^ ord(k) for c, k in zip(data, key))
    return base64.b64encode(xored).decode()


def _deobfuscate(data: str) -> str:
    raw  = base64.b64decode(data.encode()).decode("latin-1")
    key  = (_SECRET_KEY * ((len(raw) // len(_SECRET_KEY)) + 1))[:len(raw)]
    return "".join(chr(ord(c) ^ ord(k)) for c, k in zip(raw, key))


class CredentialStore:

    def _get_env_path(self, plugin_name: str) -> str | None:
        if plugin_name not in ("gmail", "gemini"):
            return None
        paths = [
            f"plugins/{plugin_name}",
            f"plugins/{plugin_name}_plugin"
        ]
        for p in paths:
            if os.path.exists(p):
                return os.path.join(p, ".env")
        # Fallback to plugins/<plugin_name>
        return f"plugins/{plugin_name}/.env"

    def save(self, plugin_name: str, credentials: dict):
        """Persist credentials for a plugin."""
        env_path = self._get_env_path(plugin_name)
        if env_path:
            try:
                os.makedirs(os.path.dirname(env_path), exist_ok=True)
                with open(env_path, "w", encoding="utf-8") as f:
                    for k, v in credentials.items():
                        f.write(f"{k.upper()}={v}\n")
                logger.info("Credentials saved to .env for plugin: %s", plugin_name)
                return
            except Exception as exc:
                logger.exception("Failed to save .env credentials for %s: %s", plugin_name, exc)
                raise

        # Traditional fallback
        os.makedirs(CREDS_DIR, exist_ok=True)
        path = os.path.join(CREDS_DIR, f"{plugin_name}.json")
        try:
            raw = json.dumps(credentials)
            with open(path, "w") as f:
                json.dump({"data": _obfuscate(raw)}, f)
            logger.info("Credentials saved for plugin: %s", plugin_name)
        except Exception as exc:
            logger.exception("Failed to save credentials for %s: %s", plugin_name, exc)
            raise

    def load(self, plugin_name: str) -> dict:
        """Load credentials for a plugin. Returns {} if not found."""
        env_path = self._get_env_path(plugin_name)
        if env_path and os.path.exists(env_path):
            creds = {}
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip().lower()
                            v = v.strip()
                            if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                                v = v[1:-1]
                            creds[k] = v
                return creds
            except Exception as exc:
                logger.exception("Failed to load .env credentials for %s: %s", plugin_name, exc)
                return {}

        # Traditional fallback
        path = os.path.join(CREDS_DIR, f"{plugin_name}.json")
        if not os.path.exists(path):
            return {}
        try:
            with open(path, "r") as f:
                wrapper = json.load(f)
            raw = _deobfuscate(wrapper["data"])
            return json.loads(raw)
        except Exception as exc:
            logger.exception("Failed to load credentials for %s: %s", plugin_name, exc)
            return {}

    def delete(self, plugin_name: str):
        """Remove stored credentials for a plugin."""
        env_path = self._get_env_path(plugin_name)
        if env_path and os.path.exists(env_path):
            try:
                if os.path.exists(env_path):
                    os.remove(env_path)
                logger.info("Credentials deleted (.env) for plugin: %s", plugin_name)
                return
            except Exception as exc:
                logger.exception("Failed to delete .env credentials for %s: %s", plugin_name, exc)

        # Traditional fallback
        path = os.path.join(CREDS_DIR, f"{plugin_name}.json")
        if os.path.exists(path):
            os.remove(path)
            logger.info("Credentials deleted for plugin: %s", plugin_name)

    def list_plugins_with_credentials(self) -> list[str]:
        """Return plugin names that have stored credentials."""
        if not os.path.exists(CREDS_DIR):
            return []
        return [
            os.path.splitext(f)[0]
            for f in os.listdir(CREDS_DIR)
            if f.endswith(".json")
        ]


# Global singleton
_store: CredentialStore | None = None


def get_credential_store() -> CredentialStore:
    global _store
    if _store is None:
        _store = CredentialStore()
    return _store
