from core.interfaces.plugin import Plugin
from core.logging_utils import get_logger


class PluginImpl(Plugin):

    def __init__(self):
        self.logger = get_logger("sample_external")

    def name(self):
        return "sample_external"

    def initialize(self, event_bus):
        self.event_bus = event_bus
        self.event_bus.subscribe("email.received", self.handle_email)
        self.logger.info("Sample external plugin initialized")

    def handle_email(self, data):
        self.logger.info("External plugin received email: %s", data)