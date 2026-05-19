from abc import ABC, abstractmethod

# Base contract that every plugin must follow.
class Plugin(ABC):

    @abstractmethod
    def name(self):
        # Return the public name used to register and look up the plugin.
        pass
    
    @abstractmethod
    def initialize(self, event_bus):
        # Receive the shared event bus during startup.
        pass
