import importlib
import os

from core.logging_utils import get_logger

class PluginManager:

    def __init__(self, event_bus):

        # Stores plugin instances by their declared name.
        self.plugins = {}
        self.event_bus = event_bus
        self.logger = get_logger("plugin_manager")

    def load_plugins(self):

        # Scan the plugins folder and load each plugin package dynamically.
        plugin_dir = "plugins"

        try:
            plugin_names = os.listdir(plugin_dir)
        except FileNotFoundError:
            self.logger.error("Plugin directory not found: %s", plugin_dir)
            return

        self.logger.info("Discovered plugin folders: %s", ", ".join(plugin_names) if plugin_names else "(none)")

        for plugin_name in plugin_names:

            # The convention is plugins/<plugin_name>/plugin.py with a PluginImpl class.
            module_path = f"plugins.{plugin_name}.plugin"

            try:
                module = importlib.import_module(module_path)
                plugin = module.PluginImpl()
                plugin.initialize(self.event_bus)
                plugin_name_key = plugin.name()
            except (ModuleNotFoundError, AttributeError) as exc:
                self.logger.warning("Skipping %s: %s", plugin_name, exc)
                continue
            except Exception as exc:
                self.logger.exception("Failed to load %s: %s", plugin_name, exc)
                continue

            # Give the plugin access to the shared bus so it can subscribe and emit events.
            self.plugins[plugin_name_key] = plugin

            self.logger.info("Loaded plugin: %s", plugin_name_key)