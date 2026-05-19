import os
import shutil
import tempfile
import zipfile

from core.logging_utils import get_logger


class PluginInstaller:
    """Install external plugins into the local plugins directory."""

    def __init__(self, plugin_dir="plugins"):
        self.plugin_dir = plugin_dir
        self.logger = get_logger("plugin_installer")

    def install_from_path(self, source_path, overwrite=False, install_name=None):
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

        plugin_name = install_name or os.path.basename(os.path.normpath(source_path))
        destination_path = os.path.join(self.plugin_dir, plugin_name)

        if os.path.exists(destination_path):
            if not overwrite:
                raise FileExistsError(f"Plugin already installed: {plugin_name}")
            shutil.rmtree(destination_path)
            self.logger.info("Overwriting existing plugin: %s", plugin_name)

        os.makedirs(self.plugin_dir, exist_ok=True)
        shutil.copytree(source_path, destination_path)

        self.logger.info("Installed external plugin: %s", plugin_name)
        return plugin_name, destination_path

    def install_from_zip(self, zip_path, overwrite=False, install_name=None):
        """Install a plugin from a zip archive into plugins/."""
        if not os.path.exists(zip_path):
            raise FileNotFoundError(f"Plugin archive not found: {zip_path}")

        if not zipfile.is_zipfile(zip_path):
            raise ValueError(f"Invalid zip archive: {zip_path}")

        with tempfile.TemporaryDirectory() as temp_dir:
            self._safe_extract_zip(zip_path, temp_dir)
            source_path = self._resolve_plugin_root(temp_dir)
            archive_name = install_name or os.path.splitext(os.path.basename(zip_path))[0]
            return self.install_from_path(source_path, overwrite=overwrite, install_name=archive_name)

    def _resolve_plugin_root(self, extracted_root):
        """Find the directory that contains plugin.py after extraction."""
        plugin_py = os.path.join(extracted_root, "plugin.py")
        if os.path.exists(plugin_py):
            return extracted_root

        candidate_dirs = []
        for name in os.listdir(extracted_root):
            candidate_path = os.path.join(extracted_root, name)
            if os.path.isdir(candidate_path) and os.path.exists(os.path.join(candidate_path, "plugin.py")):
                candidate_dirs.append(candidate_path)

        if len(candidate_dirs) == 1:
            return candidate_dirs[0]

        if not candidate_dirs:
            raise ValueError("No plugin.py found in extracted zip archive")

        raise ValueError("Zip archive contains multiple plugin roots; keep one plugin folder per archive")

    def _safe_extract_zip(self, zip_path, target_dir):
        """Extract a zip file while preventing path traversal."""
        with zipfile.ZipFile(zip_path, "r") as archive:
            for member in archive.infolist():
                member_path = os.path.abspath(os.path.join(target_dir, member.filename))
                target_root = os.path.abspath(target_dir)

                if not member_path.startswith(target_root + os.sep) and member_path != target_root:
                    raise ValueError(f"Unsafe path detected in zip archive: {member.filename}")

            archive.extractall(target_dir)

    def list_installed(self):
        """List plugin folders available for loading."""
        if not os.path.exists(self.plugin_dir):
            return []

        return [
            name
            for name in os.listdir(self.plugin_dir)
            if os.path.isdir(os.path.join(self.plugin_dir, name))
        ]