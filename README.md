# Workflow Automation Platform with FastAPI

A modular plugin-based workflow automation system with a REST API built with FastAPI.

## Quick Start

### 1. Run the CLI version (all plugins respond to sample email)

```bash
python main.py
```

### 1b. Run the async CLI version (concurrent event handling)

```bash
python main_async.py
```

Demonstrates all plugins processing events concurrently using `asyncio`.

### 2. Run the REST API server

```bash
python api/server.py
```

The server runs on `http://localhost:8000`

### 3. Explore API endpoints

#### Health check
```bash
curl http://localhost:8000
```

#### List all plugins
```bash
curl http://localhost:8000/plugins
```

#### Trigger an email event
```bash
curl -X POST http://localhost:8000/email/send \
  -H "Content-Type: application/json" \
  -d '{"from_addr":"user@example.com","subject":"Test Email"}'
```

#### Get system status
```bash
curl http://localhost:8000/status
```

#### View archived email logs
```bash
curl http://localhost:8000/email/logs
```

## Plugins

The system automatically discovers and loads plugins from the `plugins/` folder:

- **gmail** — Simulates email reception
- **logger** — Prints email events to console
- **slack** — Simulates sending notifications to Slack
- **file_logger** — Archives emails to `email_archive.log`
- **notification** — Sends system notifications

## Installing External Plugins

You can install plugins from outside the repository by copying a plugin folder into `plugins/`.

### Requirements for an external plugin

Your plugin folder should include:

- `plugin.py` with a `PluginImpl` class
- optional `plugin.yml` or `plugin.yaml` metadata file

### Example: install a plugin from disk

If you have a plugin folder like:

```text
external_plugins/sample_external_plugin/
    ├── plugin.py
    └── plugin.yml
```

Install it via the API:

```bash
curl -X POST http://localhost:8000/plugins/install \
    -H "Content-Type: application/json" \
    -d '{"source_path":"external_plugins/sample_external_plugin"}'
```

If the plugin is already installed, pass `force: true` to replace the existing copy:

```bash
curl -X POST http://localhost:8000/plugins/install \
    -H "Content-Type: application/json" \
    -d '{"source_path":"external_plugins/sample_external_plugin","force":true}'
```

The API copies the folder into `plugins/`, reloads the plugin manager, and loads it into the microkernel.

### Example: install a plugin from a zip file

If you have a zip archive like `external_plugins/whatsapp_plugin.zip`, upload it directly:

```bash
curl -X POST http://localhost:8000/plugins/install-zip \
    -F "file=@external_plugins/whatsapp_plugin.zip" \
    -F "force=true"
```

The server extracts the archive safely, finds the plugin folder, installs it into `plugins/`, and reloads the plugin manager.

### Example plugin contract

```python
from core.interfaces.plugin import Plugin

class PluginImpl(Plugin):
        def name(self):
                return "my_external_plugin"

        def initialize(self, event_bus):
                event_bus.subscribe("email.received", self.handle_email)

        def handle_email(self, data):
                print("external plugin received:", data)
```

## Architecture

```
main.py                 # CLI entry point
api/server.py          # FastAPI REST server
core/
  ├── event_bus.py     # Pub/Sub event system
  ├── plugin_manager.py # Plugin discovery & loading
  ├── logging_utils.py # Centralized logging
  └── interfaces/
      └── plugin.py    # Plugin base contract
plugins/
  ├── gmail_plugin/
  ├── logger_plugin/
  ├── slack_plugin/
  ├── file_logger_plugin/
  └── notification_plugin/
```

## Running tests

Test the API with the included plugins:

```bash
# Terminal 1: Start server
python api/server.py

# Terminal 2: Send test email
curl -X POST http://localhost:8000/email/send \
  -H "Content-Type: application/json" \
  -d '{"from_addr":"admin@test.com","subject":"Microkernel Test"}'

# Terminal 2: Check logs
curl http://localhost:8000/email/logs | python -m json.tool
```

## Adding new plugins

Create a new folder under `plugins/` with a `plugin.py` containing a `PluginImpl` class:

```python
from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
from core.config import get_config_loader

class PluginImpl(Plugin):
    def __init__(self):
        self.logger = get_logger("my_plugin")
        self.config = get_config_loader().get("my_plugin", default={})

    def name(self):
        return "my_plugin"

    def initialize(self, event_bus):
        enabled = self.config.get("enabled", True)
        if enabled:
            event_bus.subscribe("email.received", self.handle_email)
            self.logger.info("My plugin initialized")

    def handle_email(self, data):
        self.logger.info("Email received: %s", data)
```

The plugin will be auto-discovered on startup!

## Plugin Configuration

Plugins can be configured via YAML files in the `config/` directory. Each plugin reads its own config file.

### Config file structure

Create `config/<plugin_name>.yml`:

```yaml
# config/my_plugin.yml
enabled: true
api_key: "your-api-key"
timeout: 30
debug_mode: false
```

### Accessing config in plugins

```python
from core.config import get_config_loader

class PluginImpl(Plugin):
    def __init__(self):
        self.config = get_config_loader().get("my_plugin", default={})
    
    def initialize(self, event_bus):
        api_key = self.config.get("api_key", "default-key")
        timeout = self.config.get("timeout", 10)
        enabled = self.config.get("enabled", True)
```

### Available plugin configs

- `config/gmail.yml` — Email settings (sender, polling interval)
- `config/slack.yml` — Slack webhook URL, channel
- `config/logger.yml` — Log level and formatting
- `config/file_logger.yml` — Log file path, rotation settings
- `config/notification.yml` — Notification preferences

## Dependencies

- `fastapi` — REST framework
- `uvicorn` — ASGI server
- `pydantic` — Data validation
- `PyYAML` — Config file parsing

Install with:
```bash
pip install -r requirements.txt
```

## Async Event Handling

The system includes two event bus implementations:

### Synchronous Event Bus (`core/event_bus.py`)
- Default in `main.py` and `api/server.py` (original)
- Plugins process events sequentially

### Asynchronous Event Bus (`core/async_event_bus.py`)
- Used in `main_async.py` and new API server
- All plugins process events **concurrently** using `asyncio`
- Better performance for I/O-bound operations
- Automatic sync-to-async wrapping for plugins using sync handlers

**Example: Async plugin handler**

```python
import asyncio

class PluginImpl(Plugin):
    def initialize(self, event_bus):
        # Register async handler
        event_bus.subscribe("email.received", self.handle_email_async)
    
    async def handle_email_async(self, data):
        # This handler runs concurrently with other handlers
        await asyncio.sleep(1)  # Simulate I/O
        self.logger.info("Processing complete")
```

The async event bus automatically handles:
- Running multiple handlers concurrently
- Mixing sync and async handlers
- Exception handling across all concurrent tasks
