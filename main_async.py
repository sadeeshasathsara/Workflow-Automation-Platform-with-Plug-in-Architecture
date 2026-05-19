#!/usr/bin/env python3
"""
Async CLI entry point for the Workflow Automation Platform.
Demonstrates concurrent event handling with async plugins.
"""

import asyncio
from core.plugin_manager import PluginManager
from core.async_event_bus import AsyncEventBus
from core.logging_utils import get_logger, setup_logging

setup_logging()
logger = get_logger("main_async")


async def main():
    """Main async entry point."""
    # Build the shared async event bus
    event_bus = AsyncEventBus()
    plugin_manager = PluginManager(event_bus)
    
    try:
        plugin_manager.load_plugins()
    except Exception as exc:
        logger.exception("Plugin loading failed: %s", exc)
        return
    
    # Grab the Gmail plugin and trigger a sample email event
    try:
        logger.info("Running sample email simulation (async)")
        gmail_plugin = plugin_manager.plugins["gmail"]
        
        # Create test email data
        email_data = {
            "from": "admin@test.com",
            "subject": "Async Microkernel Test"
        }
        
        # Emit the event asynchronously - all plugins process it concurrently
        logger.info("Emitting email event asynchronously")
        await event_bus.emit("email.received", email_data)
        
        logger.info("All event handlers completed")
    except KeyError:
        logger.error("Gmail plugin was not loaded")
    except Exception as exc:
        logger.exception("Application failed: %s", exc)


if __name__ == "__main__":
    asyncio.run(main())
