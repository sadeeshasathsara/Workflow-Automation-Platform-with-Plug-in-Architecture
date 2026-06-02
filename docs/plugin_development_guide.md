# Plugin Development Guide

This guide describes how to design, write, configure, and install custom plugins for the Workflow Automation Platform.

---

## 1. Overview of the Plugin System

The platform operates on a **microkernel architecture**. The core system handles orchestration, scheduling, and routing, while all external integrations (triggers and actions) are implemented as self-contained plugins.

At startup, the `PluginManager` dynamically discovers and loads all modules located under the `plugins/` directory.

### Key Concepts
* **Trigger**: A plugin that initiates events (e.g., polling Gmail for new emails, listening on a webhook) and publishes them to the Event Bus.
* **Action**: A plugin that subscribes to specific event types on the Event Bus and performs operations when triggered (e.g., posting a Slack alert, calling Gemini to summarize text).
* **Event Bus**: The message broker routing events between triggers and actions concurrently using asynchronous workflows.

---

## 2. Directory Structure

Every plugin must reside in its own folder under the `plugins/` directory. The folder name should follow the `snake_case` naming convention and end with `_plugin`.

### Minimal Directory Structure
```text
plugins/
└── my_custom_plugin/
    ├── plugin.py           # Core implementation logic (Mandatory)
    ├── settings.xml        # UI and field options configuration (Mandatory)
    └── plugin.yml          # Optional metadata configuration
```

---

## 3. Metadata Configuration

The platform reads the plugin's metadata and configuration fields using either a `settings.xml` file or a `plugin.yml` file. This configuration defines the fields displayed in the Web UI when setting up the plugin.

### Option A: `settings.xml` Configuration (Recommended)
Below is an example configuring a notification plugin with API Key secrets and customizable fields:

```xml
<plugin>
    <name>my_custom_plugin</name>
    <version>1.0.0</version>
    <description>Forwards alerts to a custom external API.</description>
    <settings>
        <!-- A secret field that will be stored securely in a local .env file -->
        <setting>
            <key>CUSTOM_API_KEY</key>
            <label>API Key</label>
            <type>password</type>
            <required>true</required>
            <secret>true</secret>
            <description>API token for authenticating with the external service</description>
        </setting>
        <setting>
            <key>DEFAULT_CHANNEL</key>
            <label>Default Channel</label>
            <type>text</type>
            <required>false</required>
            <default>#general</default>
            <description>Target room or channel for incoming notifications</description>
        </setting>
    </settings>
</plugin>
```

### Option B: `plugin.yml` Configuration
Alternatively, you can specify configurations using YAML format:

```yaml
name: "my_custom_plugin"
version: "1.0.0"
description: "Forwards alerts to a custom external API."
settings:
  - key: "CUSTOM_API_KEY"
    label: "API Key"
    type: "password"
    required: true
    secret: true
    description: "API token for authenticating with the external service"
  - key: "DEFAULT_CHANNEL"
    label: "Default Channel"
    type: "text"
    required: false
    default: "#general"
    description: "Target room or channel for incoming notifications"
```

---

## 4. Writing the Plugin Implementation (`plugin.py`)

Every plugin must expose a class named `PluginImpl` that implements the abstract `Plugin` contract defined in `core.interfaces.plugin.Plugin`.

### Core Class Contract

```python
from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger
import os

class PluginImpl(Plugin):
    def __init__(self):
        """
        Initialize the plugin instance. Do not perform complex I/O here;
        keep initialization light.
        """
        self.logger = get_logger("my_custom_plugin")
        self.name_str = "my_custom_plugin"

    def name(self) -> str:
        """
        Must return the exact identifier string matching the folder/config name.
        """
        return self.name_str

    def initialize(self, event_bus):
        """
        Called when the microkernel starts or reloads. 
        Use this method to register event subscribers or spin up background workers.
        """
        # Register a subscription to an event topic
        event_bus.subscribe("email.received", self.handle_email_event)
        self.logger.info("Custom plugin initialized successfully.")

    async def handle_email_event(self, data):
        """
        Action Event Handler. Processes incoming event data.
        """
        # Retrieve credentials stored securely in the local environment
        api_key = os.getenv("CUSTOM_API_KEY")
        channel = os.getenv("DEFAULT_CHANNEL", "#general")
        
        self.logger.info(f"Processing event on channel {channel} with key prefix {api_key[:4]}")
        # Perform action logic here
```

---

## 5. Event Handling: Triggers vs Actions

### Developing an Action
An **Action** waits for notifications to arrive from other modules. To build an action:
1. Subscribe to an event topic inside the `initialize` method:
   ```python
   def initialize(self, event_bus):
       event_bus.subscribe("data.summary", self.on_summary_received)
   ```
2. Implement the callback method. If it performs I/O or network requests, declare it as `async` to keep execution non-blocking:
   ```python
   async def on_summary_received(self, event_payload):
       await self.send_http_request(event_payload)
   ```

### Developing a Trigger (Polling / Webhooks)
A **Trigger** polls or listens for external events and sends them into the event loop. Triggers require a continuous execution loop:

```python
import asyncio
from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger

class PluginImpl(Plugin):
    def __init__(self):
        self.logger = get_logger("my_polling_trigger")
        self.polling_task = None
        self.is_running = False

    def name(self) -> str:
        return "my_polling_trigger"

    def initialize(self, event_bus):
        self.event_bus = event_bus
        self.is_running = True
        # Schedule the background polling routine on the asyncio event loop
        self.polling_task = asyncio.create_task(self.start_polling())

    async def start_polling(self):
        self.logger.info("Background polling loop started.")
        while self.is_running:
            try:
                new_data = await self.fetch_external_data()
                if new_data:
                    # Publish the event to the platform
                    await self.event_bus.publish("external.data.received", new_data)
            except Exception as e:
                self.logger.error(f"Error during polling: {e}")
            
            # Wait before polling again
            await asyncio.sleep(60)

    async def fetch_external_data(self):
        # Simulate network request
        await asyncio.sleep(0.5)
        return {"id": "123", "value": "triggered event payload"}

    def shutdown(self):
        """
        Optional: Handle clean shutdown when the flow is stopped.
        """
        self.is_running = False
        if self.polling_task:
            self.polling_task.cancel()
```

---

## 6. Secrets & Configurations (.env)

The platform includes a dedicated **Credential Store** that processes credentials submitted from the frontend UI.
1. When a user configures your plugin's parameters on the web app, those secrets are validated against your plugin's `settings.xml`/`plugin.yml`.
2. The platform creates or updates a local `.env` file within your plugin folder:
   ```text
   plugins/my_custom_plugin/.env
   ```
3. When the microkernel starts, the core loads these environment configurations.
4. Access these values within your plugin implementation utilizing standard environment getters:
   ```python
   import os
   secret_value = os.getenv("CUSTOM_API_KEY")
   ```

> [!IMPORTANT]
> Never hardcode secrets or access keys inside your plugin directory. Always expose them as settings with the `secret="true"` flag in `settings.xml`, and read them using `os.getenv()`.

---

## 7. Best Practices & Guidelines

- **Asynchronous Execution**: Always prefer `async`/`await` patterns for database queries, disk operations, and HTTP requests to maximize system performance.
- **Event Deduplication**: Triggers must track processed item IDs to avoid triggering redundant workflows. Implement an in-memory `set` or persistent cache to evaluate incoming payloads:
  ```python
  class PluginImpl(Plugin):
      def __init__(self):
          self.processed_ids = set()

      async def handle_polling(self):
          items = await self.fetch_items()
          for item in items:
              if item["id"] not in self.processed_ids:
                  self.processed_ids.add(item["id"])
                  await self.event_bus.publish("new.item", item)
  ```
- **Scoped Logging**: Always use `core.logging_utils.get_logger(plugin_name)` to initialize your logger. This ensures logs are formatted with correct scopes for easy debugging:
  ```python
  self.logger = get_logger("my_custom_plugin")
  self.logger.info("Message")
  ```
- **Error Boundaries**: Wrap your handlers and callbacks inside try/except blocks to prevent unhandled exceptions in a single plugin from impacting the event bus or shutting down other active plugins.

---

## 8. Installing Custom Plugins

Custom plugins can be loaded into the platform dynamically using two methods:

### Method A: Local Folder Installation
Deploy your unpacked plugin folder directly to the `plugins/` directory or run a `POST` request referencing the absolute local directory path:
```bash
curl -X POST http://localhost:8000/plugins/install \
    -H "Content-Type: application/json" \
    -d '{"source_path": "/absolute/path/to/my_custom_plugin", "force": true}'
```

### Method B: Uploading ZIP Archive
Package your plugin folder into a `.zip` archive (containing `plugin.py` and `settings.xml`) and upload it via the API endpoint:
```bash
curl -X POST http://localhost:8000/plugins/install-zip \
    -F "file=@/path/to/my_custom_plugin.zip" \
    -F "force=true"
```

The system will unpack, register, load, and hot-reload the plugin automatically without requiring a backend server restart.
