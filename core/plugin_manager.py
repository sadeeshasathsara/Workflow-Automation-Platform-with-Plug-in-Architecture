import importlib
import os

from core.logging_utils import get_logger
from core.plugin_installer import PluginInstaller

class PluginManager:

    def __init__(self, event_bus):

        # Stores plugin instances by their declared name.
        self.plugins = {}
        self.event_bus = event_bus
        self.logger = get_logger("plugin_manager")
        self.installer = PluginInstaller()

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

    def install_external_plugin(self, source_path, overwrite=False):
        """Install a plugin from outside the repo into the plugins directory."""
        try:
            plugin_name, destination_path = self.installer.install_from_path(source_path, overwrite=overwrite)
            self.logger.info("External plugin installed: %s -> %s", plugin_name, destination_path)
            return plugin_name
        except Exception as exc:
            self.logger.exception("Failed to install external plugin from %s: %s", source_path, exc)
            raise

    def install_external_plugin_zip(self, zip_path, overwrite=False, install_name=None):
        """Install a plugin from a zip archive into the plugins directory."""
        try:
            plugin_name, destination_path = self.installer.install_from_zip(zip_path, overwrite=overwrite, install_name=install_name)
            self.logger.info("External plugin zip installed: %s -> %s", plugin_name, destination_path)
            return plugin_name
        except Exception as exc:
            self.logger.exception("Failed to install external plugin zip from %s: %s", zip_path, exc)
            raise

    def reload_plugins(self):
        """Clear and reload all installed plugins."""
        self.plugins = {}
        self.load_plugins()