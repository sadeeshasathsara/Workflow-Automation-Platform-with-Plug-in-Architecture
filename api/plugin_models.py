from pydantic import BaseModel


class ExternalPluginInstallRequest(BaseModel):
    source_path: str
    force: bool = False