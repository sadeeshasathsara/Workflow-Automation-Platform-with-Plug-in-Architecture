import os
import yaml
from core.logging_utils import get_logger

logger = get_logger("config")


class ConfigLoader:
    """Load plugin configuration from YAML files."""
    
    def __init__(self, config_dir="config"):
        self.config_dir = config_dir
        self.configs = {}
        self._load_all_configs()
    
    def _load_all_configs(self):
        """Load all YAML config files from config directory."""
        if not os.path.exists(self.config_dir):
            logger.warning("Config directory not found: %s", self.config_dir)
            return
        
        for filename in os.listdir(self.config_dir):
            if filename.endswith('.yml') or filename.endswith('.yaml'):
                config_name = filename.split('.')[0]
                filepath = os.path.join(self.config_dir, filename)
                try:
                    with open(filepath, 'r') as f:
                        self.configs[config_name] = yaml.safe_load(f) or {}
                    logger.info("Loaded config: %s", config_name)
                except Exception as exc:
                    logger.exception("Failed to load config %s: %s", filename, exc)
    
    def get(self, plugin_name, key=None, default=None):
        """Get configuration value for a plugin.
        
        Args:
            plugin_name: Name of the plugin (e.g., 'gmail', 'slack')
            key: Optional specific key to retrieve (e.g., 'host', 'port')
            default: Default value if key not found
        
        Returns:
            Config dict or specific value, or default if not found
        """
        if plugin_name not in self.configs:
            return default if key else {}
        
        config = self.configs[plugin_name]
        
        if key is None:
            return config
        
        return config.get(key, default)
    
    def get_all(self):
        """Return all loaded configs."""
        return self.configs


# Global config loader instance
_config_loader = None


def get_config_loader():
    """Get or create the global config loader."""
    global _config_loader
    if _config_loader is None:
        _config_loader = ConfigLoader()
    return _config_loader
