# Workflow Automation Platform with FastAPI

A modular plugin-based workflow automation system with a REST API built with FastAPI.

## Quick Start

### 1. Run the CLI version (all plugins respond to sample email)

```bash
python main.py
```

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

class PluginImpl(Plugin):
    def __init__(self):
        self.logger = get_logger("my_plugin")

    def name(self):
        return "my_plugin"

    def initialize(self, event_bus):
        event_bus.subscribe("email.received", self.handle_email)
        self.logger.info("My plugin initialized")

    def handle_email(self, data):
        self.logger.info("Email received: %s", data)
```

The plugin will be auto-discovered on startup!

## Dependencies

- `fastapi` — REST framework
- `uvicorn` — ASGI server
- `pydantic` — Data validation

Install with:
```bash
pip install -r requirements.txt
```
