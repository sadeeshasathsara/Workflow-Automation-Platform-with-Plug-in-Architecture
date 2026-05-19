import os
import shutil

from core.logging_utils import get_logger


class PluginInstaller:
    """Install external plugins into the local plugins directory."""

    def __init__(self, plugin_dir="plugins"):
        self.plugin_dir = plugin_dir
        self.logger = get_logger("plugin_installer")

    def install_from_path(self, source_path):
        """Install a plugin from an external folder into plugins/.

        The source must contain a plugin.py file and can optionally include
        a plugin.yml or plugin.yaml manifest for metadata.
        """
        if not os.path.exists(source_path):
            raise FileNotFoundError(f"Plugin source not found: {source_path}")

        if not os.path.isdir(source_path):
            raise ValueError(f"Plugin source must be a directory: {source_path}")

        plugin_py = os.path.join(source_path, "plugin.py")
        if not os.path.exists(plugin_py):
            raise ValueError(f"plugin.py not found in external plugin: {source_path}")

        plugin_name = os.path.basename(os.path.normpath(source_path))
        destination_path = os.path.join(self.plugin_dir, plugin_name)

        if os.path.exists(destination_path):
            raise FileExistsError(f"Plugin already installed: {plugin_name}")

        os.makedirs(self.plugin_dir, exist_ok=True)
        shutil.copytree(source_path, destination_path)

        self.logger.info("Installed external plugin: %s", plugin_name)
        return plugin_name, destination_path

    def list_installed(self):
        """List plugin folders available for loading."""
        if not os.path.exists(self.plugin_dir):
            return []

        return [
            name
            for name in os.listdir(self.plugin_dir)
            if os.path.isdir(os.path.join(self.plugin_dir, name))
        ]