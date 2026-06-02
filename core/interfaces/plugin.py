from abc import ABC, abstractmethod


class Plugin(ABC):
    """Base contract that every plugin must implement.

    Plugins are the atomic units of the workflow automation platform.
    Each plugin can act as a trigger (starts a flow) or an action (does
    something when data arrives from a previous step).

    Lifecycle:
        1. __init__()        — called by PluginManager during discovery
        2. initialize(bus)   — receive the shared event bus
        3. describe()        — introspected by the API / UI
        4. execute(data,cfg) — called by the FlowEngine for each node
    """

    # ── Identity ──────────────────────────────────────────────

    @abstractmethod
    def name(self) -> str:
        """Return the unique machine-readable name (e.g. 'slack', 'gmail')."""
        ...

    @abstractmethod
    def describe(self) -> dict:
        """Return plugin metadata for UI rendering.

        Expected keys:
            name          — machine name (same as self.name())
            display_name  — human-readable label shown in the UI
            description   — one-sentence summary
            icon          — icon identifier or emoji
            category      — grouping tag (e.g. 'communication', 'utility')
            type          — 'trigger' | 'action'
            version       — semver string
        """
        ...

    # ── Schema ────────────────────────────────────────────────

    @abstractmethod
    def get_input_schema(self) -> list:
        """Declare what fields the user must configure for this node.

        Returns a list of field descriptors:
        [
            {
                "name":        "channel",
                "display_name":"Channel",
                "type":        "string",     # string | text | number | boolean | select | credential
                "required":    True,
                "default":     "#general",
                "placeholder": "e.g. #alerts",
                "description": "Slack channel to post to",
                "options":     []             # only for type='select'
            },
            ...
        ]
        """
        ...

    @abstractmethod
    def get_output_schema(self) -> dict:
        """Declare what data this plugin returns after execution.

        Returns a dict mapping field names to their types:
        {
            "message_id": "string",
            "timestamp":  "string",
            "ok":         "boolean"
        }
        """
        ...

    # ── Execution ─────────────────────────────────────────────

    @abstractmethod
    def execute(self, input_data: dict, config: dict) -> dict:
        """Run the plugin logic.

        Called by the FlowEngine when this node's turn arrives in the
        graph traversal.  Must return a dict that matches
        get_output_schema().

        Args:
            input_data — output from the previous node (or trigger payload)
            config     — user-supplied field values (from get_input_schema)

        Returns:
            dict with the execution result
        """
        ...

    # ── Lifecycle ─────────────────────────────────────────────

    @abstractmethod
    def initialize(self, event_bus):
        """Receive the shared event bus during startup.

        Use this to subscribe to system-level events (e.g. broadcast
        notifications).  For flow-based execution, implement execute()
        instead.
        """
        ...

    # ── Optional overrides ────────────────────────────────────

    def get_config_schema(self) -> list:
        """Declare what credentials / settings this plugin needs.

        Same format as get_input_schema() but for secrets and connection
        settings that are stored separately from per-node config.

        Default: empty (no credentials needed).
        """
        return []

    def test_connection(self, config: dict) -> dict:
        """Validate that the provided credentials / settings work.

        Returns:
            {"ok": True}  or  {"ok": False, "error": "reason"}

        Default: always succeeds.
        """
        return {"ok": True}

    def on_event(self, event: str, data: dict):
        """Handle a system-level event from the event bus.

        This is a convenience wrapper — plugins can also subscribe
        directly via event_bus.subscribe() in initialize().
        """
        pass

    def get_publisher_schema(self) -> dict:
        """Data this plugin emits after execution. Defaults to get_output_schema()."""
        return self.get_output_schema()

    def get_subscriber_schema(self) -> dict:
        """Data fields this plugin accepts as input. Defaults to extracting from get_input_schema()."""
        return {f["name"]: f["type"] for f in self.get_input_schema() if "name" in f}

