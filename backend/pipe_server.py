"""Pipe Server for CmdQ Backend.
Communicates with Electron Main process over inherited stdin/stdout pipes.
Does NOT listen on any TCP port, providing complete isolation from external networks/browsers.
"""

import sys
import json
import asyncio
import base64
import logging
import traceback
from typing import Any, Dict

# Ensure stdout and stdin are unbuffered utf-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", line_buffering=True)

# Direct all logging strictly to stderr
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr
)
logger = logging.getLogger("cmdq-pipe-server")

from main import app
import httpx

stdout_lock = asyncio.Lock()


async def write_stdout(msg: Dict[str, Any]):
    line = json.dumps(msg) + "\n"
    async with stdout_lock:
        sys.stdout.write(line)
        sys.stdout.flush()


async def process_request(client: httpx.AsyncClient, req: Dict[str, Any]):
    req_id = req.get("id")
    method = req.get("method", "GET").upper()
    path = req.get("path", "/")
    headers = req.get("headers", {})
    params = req.get("params", None)
    body = req.get("body", None)
    files_payload = req.get("files", None)

    try:
        kwargs: Dict[str, Any] = {
            "method": method,
            "url": path,
            "headers": headers,
            "params": params,
        }

        if files_payload:
            # Handle multipart file uploads
            # Expected format: { field_name: { "name": filename, "data": base64_str, "type": content_type } }
            files_dict = {}
            for field_name, file_info in files_payload.items():
                fname = file_info.get("name", "file")
                fdata = base64.b64decode(file_info.get("data", ""))
                ftype = file_info.get("type", "application/octet-stream")
                files_dict[field_name] = (fname, fdata, ftype)
            kwargs["files"] = files_dict
            if isinstance(body, dict):
                kwargs["data"] = body
        elif body is not None:
            if isinstance(body, (dict, list)):
                kwargs["json"] = body
            elif isinstance(body, str):
                kwargs["content"] = body.encode("utf-8")
            elif isinstance(body, bytes):
                kwargs["content"] = body

        response = await client.request(**kwargs)

        content_type = response.headers.get("content-type", "")
        is_json = "application/json" in content_type or (not content_type and response.text.startswith(("{", "[")))
        is_text = content_type.startswith("text/") or "csv" in content_type or "sql" in content_type

        is_base64 = False
        if is_json:
            try:
                data = response.json()
            except Exception:
                data = response.text
        elif is_text:
            data = response.text
        else:
            # Binary content
            data = base64.b64encode(response.content).decode("ascii")
            is_base64 = True

        resp_msg = {
            "id": req_id,
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "data": data,
            "is_base64": is_base64,
            "ok": response.is_success
        }
        await write_stdout(resp_msg)

    except Exception as exc:
        logger.error(f"Error handling pipe request {req_id} for {method} {path}: {exc}", exc_info=True)
        err_msg = {
            "id": req_id,
            "status_code": 500,
            "headers": {},
            "data": {"detail": str(exc), "error": traceback.format_exc()},
            "is_base64": False,
            "ok": False
        }
        await write_stdout(err_msg)


async def main():
    logger.info("CmdQ Pipe Server initializing in-process ASGI client...")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://cmdq.internal", timeout=600.0) as client:
        # Notify Electron that the pipe server is ready
        await write_stdout({"type": "ready", "version": "1.0.0"})
        logger.info("CmdQ Pipe Server ready for IPC requests.")

        loop = asyncio.get_running_loop()

        while True:
            # Read line asynchronously from stdin
            line = await loop.run_in_executor(None, sys.stdin.readline)
            if not line:
                # EOF reached, Electron parent exited
                logger.info("CmdQ Pipe Server received EOF on stdin, shutting down.")
                break

            line_str = line.strip()
            if not line_str:
                continue

            try:
                req = json.loads(line_str)
            except json.JSONDecodeError as jde:
                logger.error(f"Invalid JSON received on pipe: {line_str[:200]} - {jde}")
                continue

            # Process concurrently
            asyncio.create_task(process_request(client, req))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Pipe server stopped by KeyboardInterrupt.")
    except Exception as e:
        logger.critical(f"Pipe server fatal error: {e}", exc_info=True)
        sys.exit(1)
