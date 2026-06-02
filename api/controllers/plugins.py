from fastapi import APIRouter, HTTPException, File, UploadFile, Form
import os
import json
import tempfile
from api.plugin_models import ExternalPluginInstallRequest
from api.deps import plugin_manager, logger, credential_store
from pydantic import BaseModel

router = APIRouter()

# Sentinel mask used by the frontend for sensitive stored credentials.
# Any value equal to this must NOT be sent to plugins or saved — it means
# "keep the real stored value unchanged".
_MASK = "\u2022" * 8  # ••••••••

def _strip_masked(d: dict) -> dict:
    """Return a copy of d with all masked placeholder values removed."""
    return {k: v for k, v in d.items() if v != _MASK}


# ── List / introspect ─────────────────────────────────────────────────────

@router.get("/plugins")
async def list_plugins():
    """List all loaded plugins with their metadata."""
    try:
        plugins_list = []
        for name, plugin in plugin_manager.plugins.items():
            try:
                desc = plugin.describe()
            except Exception:
                desc = {"display_name": name, "description": "", "icon": "🧩", "type": "action", "category": ""}
            plugins_list.append({
                "name":         name,
                "class":        plugin.__class__.__name__,
                "display_name": desc.get("display_name", name),
                "description":  desc.get("description", ""),
                "icon":         desc.get("icon", "🧩"),
                "category":     desc.get("category", ""),
                "type":         desc.get("type", "action"),
                "version":      desc.get("version", "1.0.0"),
                "has_credentials": bool(get_credential_store_safe(name)),
            })
        return {"plugins": plugins_list, "count": len(plugins_list)}
    except Exception as exc:
        logger.exception("Failed to list plugins: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


def get_credential_store_safe(plugin_name: str) -> dict:
    try:
        return credential_store.load(plugin_name)
    except Exception:
        return {}


def parse_settings_xml(plugin_name: str):
    """Parse settings.xml from plugins/{plugin_name}_plugin or plugins/{plugin_name} folder."""
    import xml.etree.ElementTree as ET
    paths = [
        f"plugins/{plugin_name}_plugin/settings.xml",
        f"plugins/{plugin_name}/settings.xml"
    ]
    xml_path = None
    for p in paths:
        if os.path.exists(p):
            xml_path = p
            break
            
    if not xml_path:
        return None, None, None
        
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        
        menus = []
        fields = []
        elements = []
        
        menu_elements = root.findall(".//menu")
        for menu_el in menu_elements:
            menu_id = menu_el.get("id")
            menu_title = menu_el.get("title", menu_id)
            menu_icon = menu_el.get("icon", "")
            
            menus.append({
                "id": menu_id,
                "title": menu_title,
                "icon": menu_icon
            })
            
            for child in menu_el:
                if child.tag == "field":
                    field_name = child.get("name")
                    field_type = child.get("type", "string")
                    required = child.get("required", "false").lower() == "true"
                    default_val = child.get("default")
                    placeholder = child.get("placeholder", "")
                    display_name = child.get("display_name", field_name)
                    
                    desc_el = child.find("description")
                    description = desc_el.text.strip() if desc_el is not None and desc_el.text else ""
                    
                    options = []
                    option_elements = child.findall("option")
                    for opt_el in option_elements:
                        if opt_el.text:
                            options.append(opt_el.text.strip())
                            
                    field_dict = {
                        "element_type": "field",
                        "name": field_name,
                        "type": field_type,
                        "required": required,
                        "display_name": display_name,
                        "description": description,
                        "menu_id": menu_id
                    }
                    if default_val is not None:
                        if field_type == "number":
                            try:
                                field_dict["default"] = int(default_val)
                            except ValueError:
                                try:
                                    field_dict["default"] = float(default_val)
                                except ValueError:
                                    field_dict["default"] = default_val
                        elif field_type == "boolean":
                            field_dict["default"] = default_val.lower() == "true"
                        else:
                            field_dict["default"] = default_val
                    if placeholder:
                        field_dict["placeholder"] = placeholder
                    if options:
                        field_dict["options"] = options
                    fields.append(field_dict)
                    elements.append(field_dict)
                
                elif child.tag == "button":
                    button_id = child.get("id")
                    button_type = child.get("type", "custom")
                    display_name = child.get("display_name", button_id)
                    button_icon = child.get("icon", "")
                    button_action = child.get("action", "")
                    button_style = child.get("style", "primary")
                    
                    desc_el = child.find("description")
                    description = desc_el.text.strip() if desc_el is not None and desc_el.text else ""
                    
                    button_dict = {
                        "element_type": "button",
                        "id": button_id,
                        "type": button_type,
                        "display_name": display_name,
                        "icon": button_icon,
                        "action": button_action,
                        "style": style_val if (style_val := child.get("style")) else "primary",
                        "description": description,
                        "menu_id": menu_id
                    }
                    elements.append(button_dict)
                
                elif child.tag == "divider":
                    elements.append({
                        "element_type": "divider",
                        "menu_id": menu_id
                    })
                
                elif child.tag == "heading":
                    heading_text = child.get("text", child.text or "")
                    heading_level = child.get("level", "h3")
                    elements.append({
                        "element_type": "heading",
                        "text": heading_text.strip(),
                        "level": heading_level,
                        "menu_id": menu_id
                    })
                
                elif child.tag == "info":
                    info_text = child.text.strip() if child.text else child.get("text", "")
                    info_style = child.get("style", "info")  # info, warning, success, error
                    info_icon = child.get("icon", "")
                    elements.append({
                        "element_type": "info",
                        "text": info_text,
                        "style": info_style,
                        "icon": info_icon,
                        "menu_id": menu_id
                    })
                
                elif child.tag == "log_viewer":
                    elements.append({
                        "element_type": "log_viewer",
                        "filename": child.get("filename", "email_archive.log"),
                        "height": child.get("height", "300"),
                        "menu_id": menu_id
                    })
                    
        # If no menus, check for top-level fields/buttons
        if not menu_elements:
            for child in root.iter():
                if child.tag == "field":
                    field_name = child.get("name")
                    field_type = child.get("type", "string")
                    required = child.get("required", "false").lower() == "true"
                    default_val = child.get("default")
                    placeholder = child.get("placeholder", "")
                    display_name = child.get("display_name", field_name)
                    
                    desc_el = child.find("description")
                    description = desc_el.text.strip() if desc_el is not None and desc_el.text else ""
                    
                    options = []
                    option_elements = child.findall("option")
                    for opt_el in option_elements:
                        if opt_el.text:
                            options.append(opt_el.text.strip())
                            
                    field_dict = {
                        "element_type": "field",
                        "name": field_name,
                        "type": field_type,
                        "required": required,
                        "display_name": display_name,
                        "description": description,
                        "menu_id": None
                    }
                    if default_val is not None:
                        if field_type == "number":
                            try:
                                field_dict["default"] = int(default_val)
                            except ValueError:
                                try:
                                    field_dict["default"] = float(default_val)
                                except ValueError:
                                    field_dict["default"] = default_val
                        elif field_type == "boolean":
                            field_dict["default"] = default_val.lower() == "true"
                        else:
                            field_dict["default"] = default_val
                    if placeholder:
                        field_dict["placeholder"] = placeholder
                    if options:
                        field_dict["options"] = options
                    fields.append(field_dict)
                    elements.append(field_dict)
                    
                elif child.tag == "button":
                    button_id = child.get("id")
                    button_type = child.get("type", "custom")
                    display_name = child.get("display_name", button_id)
                    button_icon = child.get("icon", "")
                    button_action = child.get("action", "")
                    button_style = child.get("style", "primary")
                    
                    desc_el = child.find("description")
                    description = desc_el.text.strip() if desc_el is not None and desc_el.text else ""
                    
                    button_dict = {
                        "element_type": "button",
                        "id": button_id,
                        "type": button_type,
                        "display_name": display_name,
                        "icon": button_icon,
                        "action": button_action,
                        "style": button_style,
                        "description": description,
                        "menu_id": None
                    }
                    elements.append(button_dict)
                
                elif child.tag == "divider":
                    elements.append({"element_type": "divider", "menu_id": None})
                
                elif child.tag == "heading":
                    heading_text = child.get("text", child.text or "")
                    elements.append({
                        "element_type": "heading",
                        "text": heading_text.strip(),
                        "level": child.get("level", "h3"),
                        "menu_id": None
                    })
                
                elif child.tag == "info":
                    info_text = child.text.strip() if child.text else child.get("text", "")
                    elements.append({
                        "element_type": "info",
                        "text": info_text,
                        "style": child.get("style", "info"),
                        "icon": child.get("icon", ""),
                        "menu_id": None
                    })
                
                elif child.tag == "log_viewer":
                    elements.append({
                        "element_type": "log_viewer",
                        "filename": child.get("filename", "email_archive.log"),
                        "height": child.get("height", "300"),
                        "menu_id": None
                    })
                    
        return menus, fields, elements
    except Exception as exc:
        logger.exception("Failed to parse settings XML for %s: %s", plugin_name, exc)
        return None, None, None


@router.get("/plugins/{plugin_name}/schema")
async def get_plugin_schema(plugin_name: str):
    """Return the full schema for a plugin: inputs, outputs, config fields."""
    plugin = plugin_manager.plugins.get(plugin_name)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin '{plugin_name}' not found")
    try:
        # Try to parse configuration fields from settings.xml first
        menus, config_schema, config_elements = parse_settings_xml(plugin_name)
        if config_schema is None:
            # Fallback to python definition if settings.xml is missing or corrupt
            menus = None
            config_schema = plugin.get_config_schema()
            config_elements = None
            
        schema_data = {
            "name":          plugin_name,
            "describe":      plugin.describe(),
            "input_schema":  plugin.get_input_schema(),
            "output_schema": plugin.get_output_schema(),
            "publisher_schema": plugin.get_publisher_schema(),
            "subscriber_schema": plugin.get_subscriber_schema(),
            "config_schema": config_schema,
        }
        if menus is not None:
            schema_data["config_menus"] = menus
        if config_elements is not None:
            schema_data["config_elements"] = config_elements
            
        return schema_data
    except Exception as exc:
        logger.exception("Failed to get schema for %s: %s", plugin_name, exc)
        raise HTTPException(status_code=500, detail=str(exc))

@router.get("/flows/schemas")
async def get_all_plugin_schemas():
    """Bulk retrieve publisher and subscriber schemas for all loaded plugins."""
    try:
        schemas = {}
        for name, plugin in plugin_manager.plugins.items():
            try:
                publisher = plugin.get_publisher_schema()
            except Exception:
                publisher = {}
            try:
                subscriber = plugin.get_subscriber_schema()
            except Exception:
                subscriber = {}
            schemas[name] = {
                "publisher": publisher,
                "subscriber": subscriber
            }
        return schemas
    except Exception as exc:
        logger.exception("Failed to bulk get schemas: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))



@router.post("/plugins/{plugin_name}/execute")
async def execute_plugin(plugin_name: str, body: dict):
    """Execute a single plugin node directly with given input_data and config."""
    plugin = plugin_manager.plugins.get(plugin_name)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin '{plugin_name}' not found")
    try:
        input_data = body.get("input_data", {})
        config     = body.get("config", {})
        # Merge stored credentials into config
        stored_creds = credential_store.load(plugin_name)
        merged_config = {**stored_creds, **config}
        result = plugin.execute(input_data, merged_config)
        return {"status": "success", "output": result}
    except Exception as exc:
        logger.exception("Plugin execute failed for %s: %s", plugin_name, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/plugins/{plugin_name}/test-connection")
async def test_plugin_connection(plugin_name: str, body: dict):
    """Test whether a plugin can connect using the provided / stored credentials.
    
    Masked placeholder values (••••••••) sent by the frontend are stripped so
    the real stored credentials are always used for validation.
    """
    plugin = plugin_manager.plugins.get(plugin_name)
    if not plugin:
        raise HTTPException(status_code=404, detail=f"Plugin '{plugin_name}' not found")
    try:
        stored_creds  = credential_store.load(plugin_name)
        # Only override stored values when the frontend has supplied a *real* new value
        clean_body    = _strip_masked(body)
        merged_config = {**stored_creds, **clean_body}
        result = plugin.test_connection(merged_config)
        return result
    except Exception as exc:
        logger.exception("test_connection failed for %s: %s", plugin_name, exc)
        raise HTTPException(status_code=500, detail=str(exc))



# ── Google OAuth2 ─────────────────────────────────────────────────────────

@router.get("/plugins/gmail/auth-url")
async def get_gmail_auth_url(client_id: str, client_secret: str):
    """Generate Google OAuth2 authorization URL with client keys in state."""
    # Resolve masked values from backend stored credentials if possible
    stored_creds = get_credential_store_safe("gmail")
    if client_id == _MASK:
        client_id = stored_creds.get("client_id", "")
    if client_secret == _MASK:
        client_secret = stored_creds.get("client_secret", "")

    if not client_id or not client_secret or client_id == _MASK or client_secret == _MASK:
        raise HTTPException(status_code=400, detail="Client ID and Client Secret are required.")
    
    try:
        import urllib.parse, base64, json as _json
        redirect_uri = "http://localhost:8000/oauth2/callback"
        scope = "https://www.googleapis.com/auth/gmail.readonly"
        
        # Obfuscate or encode the keys in state so they are returned to us in the callback
        state_data = {
            "client_id": client_id,
            "client_secret": client_secret
        }
        state = base64.urlsafe_b64encode(_json.dumps(state_data).encode()).decode()
        
        auth_url = (
            "https://accounts.google.com/o/oauth2/v2/auth?"
            f"client_id={urllib.parse.quote(client_id)}&"
            f"redirect_uri={urllib.parse.quote(redirect_uri)}&"
            "response_type=code&"
            f"scope={urllib.parse.quote(scope)}&"
            "access_type=offline&"
            "prompt=consent&"
            f"state={urllib.parse.quote(state)}"
        )
        return {"auth_url": auth_url}
    except Exception as exc:
        logger.exception("Failed to generate Google auth URL: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/oauth2/callback")
async def oauth2_callback(code: str = None, state: str = None, error: str = None):
    """Handle Google OAuth2 redirect callback and exchange authorization code for refresh token."""
    from fastapi.responses import RedirectResponse
    import urllib.request, urllib.parse, base64, json as _json

    if error:
        logger.error("Google OAuth2 authorization error: %s", error)
        return RedirectResponse(f"http://localhost:5173/?gmail_auth=error&message={urllib.parse.quote(error)}")

    if not code or not state:
        return RedirectResponse(f"http://localhost:5173/?gmail_auth=error&message={urllib.parse.quote('Missing code or state parameter.')}")

    try:
        # 1. Decode client ID and secret from state
        try:
            state_decoded = base64.urlsafe_b64decode(state.encode()).decode()
            state_data = _json.loads(state_decoded)
            client_id = state_data["client_id"]
            client_secret = state_data["client_secret"]
        except Exception as e:
            logger.exception("Failed to decode state: %s", e)
            return RedirectResponse(f"http://localhost:5173/?gmail_auth=error&message={urllib.parse.quote('Invalid state parameter.')}")

        # 2. Exchange code for Refresh Token
        token_url = "https://oauth2.googleapis.com/token"
        redirect_uri = "http://localhost:8000/oauth2/callback"
        post_data = urllib.parse.urlencode({
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"
        }).encode()

        req = urllib.request.Request(token_url, data=post_data, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status != 200:
                body = resp.read().decode()
                logger.error("Google token exchange returned status %s: %s", resp.status, body)
                return RedirectResponse(f"http://localhost:5173/?gmail_auth=error&message={urllib.parse.quote(f'Google exchange failed: {body}')}")
            
            tokens = _json.loads(resp.read().decode())
            refresh_token = tokens.get("refresh_token")
            
            if not refresh_token:
                logger.warning("No refresh token returned by Google during exchange.")

        # 3. Load, update, and save credentials in the store
        creds = credential_store.load("gmail")
        creds["client_id"] = client_id
        creds["client_secret"] = client_secret
        if refresh_token:
            creds["refresh_token"] = refresh_token
        
        credential_store.save("gmail", creds)
        logger.info("Successfully completed Google OAuth2 credentials setup for gmail.")
        return RedirectResponse("http://localhost:5173/?gmail_auth=success")
        
    except Exception as exc:
        logger.exception("Google OAuth2 exchange failed: %s", exc)
        return RedirectResponse(f"http://localhost:5173/?gmail_auth=error&message={urllib.parse.quote(str(exc))}")


# ── Credentials ───────────────────────────────────────────────────────────

@router.get("/plugins/{plugin_name}/credentials")
async def get_credentials(plugin_name: str):
    """Return stored credentials for a plugin (values masked)."""
    creds = credential_store.load(plugin_name)
    masked = {k: ("••••••••" if any(s in k.lower() for s in ["token", "secret", "password", "key"]) else v)
              for k, v in creds.items()}
    return {"plugin": plugin_name, "credentials": masked, "configured": bool(creds)}


@router.put("/plugins/{plugin_name}/credentials")
async def save_credentials(plugin_name: str, body: dict):
    """Save credentials for a plugin.
    
    Masked placeholder values (••••••••) are stripped before saving so that
    existing sensitive fields (tokens, secrets) are preserved unchanged when
    the user didn't actually type a new value.
    """
    try:
        existing = credential_store.load(plugin_name)
        # Only apply fields the user actually changed (non-masked values)
        clean = _strip_masked(body)
        merged = {**existing, **clean}
        credential_store.save(plugin_name, merged)
        return {"status": "saved", "plugin": plugin_name}
    except Exception as exc:
        logger.exception("Failed to save credentials for %s: %s", plugin_name, exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/plugins/{plugin_name}/credentials")
async def delete_credentials(plugin_name: str):
    """Remove stored credentials for a plugin."""
    credential_store.delete(plugin_name)
    return {"status": "deleted", "plugin": plugin_name}


# ── Install ───────────────────────────────────────────────────────────────

@router.post("/plugins/install")
async def install_plugin(request: ExternalPluginInstallRequest):
    """Install an external plugin from a folder on disk and reload."""
    try:
        plugin_name = plugin_manager.install_external_plugin(request.source_path, overwrite=request.force)
        plugin_manager.reload_plugins()
        return {"status": "success", "message": f"Plugin installed: {plugin_name}", "plugin": plugin_name}
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to install plugin: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/plugins/install-zip")
async def install_plugin_zip(file: UploadFile = File(...), force: bool = Form(False)):
    """Install an external plugin from a zip upload and reload."""
    temp_zip_path = None
    try:
        if not file.filename or not file.filename.lower().endswith(".zip"):
            raise HTTPException(status_code=400, detail="Uploaded file must be a .zip archive")
        install_name = os.path.splitext(os.path.basename(file.filename))[0]
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
            tmp.write(await file.read())
            temp_zip_path = tmp.name
        plugin_name = plugin_manager.install_external_plugin_zip(temp_zip_path, overwrite=force, install_name=install_name)
        plugin_manager.reload_plugins()
        return {"status": "success", "message": f"Zip plugin installed: {plugin_name}", "plugin": plugin_name}
    except FileExistsError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to install zip plugin: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if temp_zip_path and os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)



# ── Browser Notification Queue ────────────────────────────────────────────

_NOTIF_FILE = os.path.join("data", "notifications.json")

@router.get("/plugins/notification/events")
async def get_notification_events():
    """Return all queued browser notification events and clear the queue.
    
    The notification plugin (worker) writes events to data/notifications.json.
    The frontend polls this endpoint every few seconds and fires browser
    Notification API calls for each returned event.
    """
    if not os.path.exists(_NOTIF_FILE):
        return {"events": [], "count": 0}
    try:
        with open(_NOTIF_FILE, "r", encoding="utf-8") as f:
            events = json.load(f)
        if not isinstance(events, list):
            events = []
        # Clear the queue after reading
        with open(_NOTIF_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)
        return {"events": events, "count": len(events)}
    except Exception as exc:
        logger.exception("Failed to read notification events: %s", exc)
        return {"events": [], "count": 0}


@router.get("/plugins/logs/view")
async def view_log_file(filename: str = "email_archive.log"):
    """Securely view the tail of a log file as structured lines."""
    safe_name = os.path.basename(filename)
    if not safe_name.endswith((".log", ".txt", ".json")):
        raise HTTPException(status_code=400, detail="Invalid log file format.")
    
    # Use the credential-configured path if set, otherwise use the requested filename
    creds = credential_store.load("file_logger")
    stored_path = creds.get("log_file", "").strip()
    log_path = stored_path if stored_path else safe_name
    
    if not os.path.exists(log_path):
        return {
            "file_path": log_path,
            "lines": [],
            "total_lines": 0,
            "exists": False
        }
    
    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = [ln.rstrip("\r\n") for ln in f.readlines()]
        # Filter empty lines, return last 200
        non_empty = [ln for ln in all_lines if ln.strip()]
        last_lines = non_empty[-200:]
        return {
            "file_path": log_path,
            "lines": last_lines,
            "total_lines": len(non_empty),
            "exists": True
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read logs: {exc}")



@router.get("/plugins/logs/download")
async def download_log_file(filename: str = "email_archive.log"):
    """Securely download a log file as an attachment."""
    from fastapi.responses import FileResponse
    safe_name = os.path.basename(filename)
    if not safe_name.endswith((".log", ".txt", ".json")):
        raise HTTPException(status_code=400, detail="Invalid log file format.")
        
    creds = credential_store.load("file_logger")
    log_path = creds.get("log_file", safe_name)
    
    if not os.path.exists(log_path):
        raise HTTPException(status_code=404, detail=f"Log file '{log_path}' not found.")
        
    return FileResponse(
        path=log_path,
        filename=os.path.basename(log_path),
        media_type="application/octet-stream"
    )


@router.post("/plugins/logs/clear")
async def clear_log_file(filename: str = "email_archive.log"):
    """Securely truncate/clear a log file."""
    safe_name = os.path.basename(filename)
    if not safe_name.endswith((".log", ".txt", ".json")):
        raise HTTPException(status_code=400, detail="Invalid log file format.")
        
    creds = credential_store.load("file_logger")
    stored_path = creds.get("log_file", "").strip()
    log_path = stored_path if stored_path else safe_name
    
    try:
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("")
        return {"status": "success", "message": f"Log file '{log_path}' cleared."}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to clear logs: {exc}")
