from fastapi import APIRouter, HTTPException, File, UploadFile, Form
import os
import tempfile
from api.plugin_models import ExternalPluginInstallRequest
from api.deps import plugin_manager, logger

router = APIRouter()


@router.get("/plugins")
async def list_plugins():
    """List all loaded plugins."""
    try:
        plugins_list = []
        for name, plugin in plugin_manager.plugins.items():
            plugins_list.append({
                "name": name,
                "class": plugin.__class__.__name__
            })
        return {"plugins": plugins_list, "count": len(plugins_list)}
    except Exception as exc:
        logger.exception("Failed to list plugins: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/plugins/install")
async def install_plugin(request: ExternalPluginInstallRequest):
    """Install an external plugin from a folder on disk and reload the system."""
    try:
        plugin_name = plugin_manager.install_external_plugin(request.source_path, overwrite=request.force)
        plugin_manager.reload_plugins()
        return {
            "status": "success",
            "message": f"Plugin installed and loaded: {plugin_name}",
            "plugin": plugin_name
        }
    except FileExistsError as exc:
        logger.warning("Plugin install skipped: %s", exc)
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to install plugin: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/plugins/install-zip")
async def install_plugin_zip(file: UploadFile = File(...), force: bool = Form(False)):
    """Install an external plugin from a zip file upload and reload the system."""
    temp_zip_path = None
    try:
        if not file.filename or not file.filename.lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="Uploaded file must be a .zip archive")

        install_name = os.path.splitext(os.path.basename(file.filename))[0]

        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as temp_zip:
            temp_zip.write(await file.read())
            temp_zip_path = temp_zip.name

        plugin_name = plugin_manager.install_external_plugin_zip(temp_zip_path, overwrite=force, install_name=install_name)
        plugin_manager.reload_plugins()
        return {
            "status": "success",
            "message": f"Zip plugin installed and loaded: {plugin_name}",
            "plugin": plugin_name
        }
    except FileExistsError as exc:
        logger.warning("Zip plugin install skipped: %s", exc)
        raise HTTPException(status_code=409, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to install zip plugin: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if temp_zip_path and os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
