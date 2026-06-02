# Workflow Automation Platform with Plug-in Architecture

A modular, plugin-based workflow automation system using the mikrokernel architecture featuring a high-performance FastAPI backend, a dynamic React + Vite web-based flow editor canvas, and robust concurrent event dispatching.

<img width="1919" height="1004" alt="image" src="https://github.com/user-attachments/assets/a7202439-c9d3-4e87-9330-49339a5f0faa" />

---

## Table of Contents
1. [Core Features](#core-features)
2. [System Architecture](#system-architecture)
3. [Core Plugins](#core-plugins)
4. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Backend Setup](#backend-setup)
   - [Frontend Setup](#frontend-setup)
5. [Plugin Development Guide](#plugin-development-guide)
   - [Plugin Structure](#plugin-structure)
   - [Secrets & Configuration (.env)](#secrets--configuration-env)
   - [Deduplication & Polling](#deduplication--polling)
6. [API Reference](#api-reference)
   - [Plugin Management](#plugin-management)
   - [Flow Management](#flow-management)
   - [Secret Management](#secret-management)
7. [External Plugin Installation](#external-plugin-installation)

---

## Core Features

- **Visual Workflow Editor Canvas**: A React Flow-powered UI to drag, drop, configure, and connect triggers and actions in real-time.
- **Microkernel Plugin Architecture**: Decoupled, hot-pluggable system with automatic plugin discovery, loading, and registration.
- **Concurrent Async Event Bus**: Highly efficient `asyncio` event bus that processes events concurrently across all active plugins.
- **Secure Secret Management**: Seamless integration with plugin-level `.env` environments. User credentials inputted through the web configuration are saved in a local `.env` inside the plugin's folder and ignored by Git.
- **Gmail Deduplication & Filtering**: Built-in logic in the Gmail plugin to prevent duplicate processing by only polling emails received after the workflow start time.
- **Database-Backed Flow Execution**: Persistent flow states, execution tracking, and background job scheduling.

---

## System Architecture

```text
├── api/                   # FastAPI backend implementation
│   ├── controllers/       # Route controllers (flows, plugins, credentials, status)
│   ├── deps.py            # API dependencies
│   └── server.py          # Backend server entry point
├── core/                  # Core orchestration engine
│   ├── interfaces/        # Interfaces and base contracts
│   │   └── plugin.py      # Base Plugin class contract
│   ├── async_event_bus.py # Asynchronous concurrent event bus
│   ├── credential_store.py# Secure credentials storage
│   ├── event_bus.py       # Synchronous event bus
│   ├── flow_engine.py     # Flow execution and runtime state manager
│   ├── plugin_manager.py  # Dynamically loads and reloads plugins
│   ├── reactive_manager.py# Reactive trigger evaluator
│   └── scheduler.py       # Job and task scheduler
├── data/                  # SQLite storage, execution histories, and flows
├── config/                # Global YAML configuration files
├── plugins/               # Directory of modular system plugins
│   ├── file_logger_plugin/
│   ├── gemini_plugin/     # Summarizes input text and forwards to targets
│   ├── gmail_plugin/      # Deduplicated, timestamp-filtered Gmail trigger
│   ├── logger_plugin/
│   ├── notification_plugin/
│   ├── slack_plugin/
│   ├── telegram_plugin/   # Telegram notification action
│   └── whatsapp_plugin/   # WhatsApp notification action
└── www/                   # React + Vite web interface
    ├── src/
    │   ├── components/    # FlowEditor canvas, Sidebar, RightPanel, TopBar
    │   ├── lib/           # Typed api.ts communication client
    │   └── App.tsx        # Application root
```

---

## Core Plugins

The system discovers and exposes various plugins designed as triggers or actions:

| Plugin Name | Type | Description |
| :--- | :--- | :--- |
| `gmail` | Trigger | Polls messages from Gmail. Filters by starting timestamp and prevents repeat polling using a deduplication cache. |
| `gemini` | Action | Integrates Google Gemini API to summarize text/context and publish/forward results. |
| `telegram` | Action | Sends messages to designated Telegram chats using Telegram Bot API. |
| `whatsapp` | Action | Forwards automated alerts to WhatsApp chats using the WhatsApp Business Cloud API. |
| `slack` | Action | Dispatches simulated event updates to Slack channels via webhooks. |
| `notification`| Action | Triggers local desktop notifications. |
| `file_logger` | Action | Appends processed workflows and logs to `email_archive.log`. |
| `logger` | Action | Outputs active flow information to the standard console. |

---

## Getting Started

### Prerequisites
- **Python**: Version 3.10 or higher.
- **Node.js**: Version 18.0 or higher.
- **npm**: Package manager.

### Backend Setup

1. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the API server**:
   ```bash
   python api/server.py
   ```
   The backend server will spin up on `http://localhost:8000`. The OpenAPI Swagger documentation is available at `http://localhost:8000/docs`.

3. **Optional - Run the CLI versions**:
   - For synchronous sequential event testing:
     ```bash
     python main.py
     ```
   - For concurrent async event handling:
     ```bash
     python main_async.py
     ```

### Frontend Setup

1. **Navigate to the frontend folder**:
   ```bash
   cd www
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```
   Access the visual editor canvas at `http://localhost:5173`.

---

## Plugin Development Guide

### Plugin Structure
To add a new plugin, create a folder inside the `plugins/` directory (e.g. `plugins/my_custom_plugin/`) containing:
1. `plugin.py`: The entry class extending the abstract `Plugin` base class.
2. `settings.xml` or `plugin.yml`: Metadata detailing options, types, and configurable keys.

Example implementation for `plugin.py`:
```python
from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger

class PluginImpl(Plugin):
    def __init__(self):
        self.logger = get_logger("my_custom_plugin")

    def name(self):
        return "my_custom_plugin"

    def initialize(self, event_bus):
        # Register event handlers
        event_bus.subscribe("email.received", self.handle_email)
        self.logger.info("Custom plugin initialized successfully")

    async def handle_email(self, data):
        self.logger.info(f"Custom plugin processing event: {data}")
```

### Secrets & Configuration (.env)
To prevent committing sensitive API keys or credentials:
- Define fields as secrets inside your plugin's metadata configuration (`settings.xml` or `plugin.yml`).
- When a user inputs secrets from the Web UI, the backend stores them in a local `.env` file located directly in the plugin directory (e.g. `plugins/gemini_plugin/.env`).
- On initialization, the system automatically checks for the presence of the plugin's local `.env` and imports it into the execution environment.
- The `.gitignore` at the repository root ignores all `**/.env` matching criteria, ensuring credentials are never exposed to remote control repositories.

### Deduplication & Polling
When building triggers (like the Gmail plugin), use the following patterns to prevent infinite event loops and repetitive processing:
- Store the workflow start timestamp on flow activation.
- Filter out fetched events whose timestamps are older than the workflow's initialization time.
- Implement an in-memory or persisted unique ID cache (e.g. tracking `message-id`) to verify whether an event has already been handled during the active execution session.

---

## API Reference

### Plugin Management
- `GET /plugins` - Retrieve all registered, active, and loaded plugins.
- `POST /plugins/install` - Install an external plugin from a local directory path.
- `POST /plugins/install-zip` - Upload and extract a `.zip` archive containing an external plugin.
- `POST /plugins/reload` - Hot-reload all modules and refresh the plugin registry.

### Flow Management
- `GET /flows` - Fetch all configured workflow paths.
- `POST /flows` - Create or save a new workflow flow canvas layout.
- `POST /flows/{flow_id}/start` - Active the workflow flow execution.
- `POST /flows/{flow_id}/stop` - Deactivate the flow runner.

### Secret Management
- `POST /plugins/{plugin_name}/credentials` - Update/save credentials and populate the plugin's local `.env` file.
- `GET /plugins/{plugin_name}/credentials/status` - Query whether a plugin has its required secrets configured.

---

## External Plugin Installation

External plugins can be installed dynamically without restarting the server.

### Installing via Directory Path
Send a POST request referencing the path containing the unpacked external plugin:
```bash
curl -X POST http://localhost:8000/plugins/install \
    -H "Content-Type: application/json" \
    -d '{"source_path": "external_plugins/sample_external_plugin", "force": true}'
```

### Installing via ZIP Upload
Upload a packed plugin `.zip` archive:
```bash
curl -X POST http://localhost:8000/plugins/install-zip \
    -F "file=@external_plugins/whatsapp_plugin.zip" \
    -F "force=true"
```
The FastAPI server will extract, validate, register, and initialize the plugin automatically.
