from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List

app = FastAPI(title="Antigravity Engine Sidecar")

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
class ConnectionDetails(BaseModel):
    db_type: str
    host: str
    port: int
    user: str
    password: str
    database: str = ""

class ChatMessage(BaseModel):
    role: str
    content: str

class AIPrompt(BaseModel):
    prompt: str
    command: str
    db_config: ConnectionDetails
    schema_json: Dict[str, Any]
    chat_history: List[ChatMessage] = []

import socket

class PortCheckDetails(BaseModel):
    host: str
    port: int

@app.post("/check_port")
async def check_port(details: PortCheckDetails):
    """Checks if a given host and port are reachable."""
    try:
        with socket.create_connection((details.host, details.port), timeout=2):
            return {"status": "success", "message": "Port is open"}
    except (socket.timeout, ConnectionRefusedError, socket.error):
        raise HTTPException(status_code=400, detail=f"Cannot reach {details.host}:{details.port}")

from database import get_db_connection
from sqlalchemy import text

@app.post("/connect")
async def connect(details: ConnectionDetails):
    """Takes DB credentials, tests the connection, and returns a success token."""
    try:
        session = get_db_connection(
            db_type=details.db_type,
            host=details.host,
            port=details.port,
            user=details.user,
            password=details.password,
            dbname=details.database
        )
        # Test connection
        session.execute(text("SELECT 1"))
        session.close()
        return {"status": "success", "token": "temp-token-xyz"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")

@app.post("/databases")
async def get_databases(details: ConnectionDetails):
    """Lists all available non-template databases."""
    try:
        session = get_db_connection(
            db_type=details.db_type,
            host=details.host,
            port=details.port,
            user=details.user,
            password=details.password,
            dbname=""
        )
        databases = []
        if details.db_type == "postgres":
            query = "SELECT datname FROM pg_database WHERE datistemplate = false;"
            databases = [row[0] for row in session.execute(text(query)).fetchall()]
        else:
            query = "SHOW DATABASES;"
            databases = [row[0] for row in session.execute(text(query)).fetchall()]
            
        session.close()
        return {"status": "success", "databases": databases}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Database list extraction failed: {str(e)}")

@app.post("/schema")
async def get_schema(details: ConnectionDetails):
    """Executes SELECT queries against information_schema in read-only mode."""
    try:
        session = get_db_connection(
            db_type=details.db_type,
            host=details.host,
            port=details.port,
            user=details.user,
            password=details.password,
            dbname=details.database
        )
        
        schema_dict = {}
        if details.db_type == "postgres":
            query = """
                SELECT c.table_schema, c.table_name, c.column_name 
                FROM information_schema.columns c
                JOIN information_schema.tables t 
                  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
                WHERE c.table_schema NOT IN ('information_schema', 'pg_catalog')
                  AND t.table_type = 'BASE TABLE'
                ORDER BY c.table_schema, c.table_name, c.ordinal_position;
            """
        else:
            query = """
                SELECT c.table_schema, c.table_name, c.column_name 
                FROM information_schema.columns c
                JOIN information_schema.tables t 
                  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
                WHERE c.table_schema = DATABASE()
                  AND t.table_type = 'BASE TABLE'
                ORDER BY c.table_schema, c.table_name, c.ordinal_position;
            """
            
        result = session.execute(text(query)).fetchall()
        for row in result:
            schema_name, table_name, col_name = row[0], row[1], row[2]
            if schema_name not in schema_dict:
                schema_dict[schema_name] = {}
            if table_name not in schema_dict[schema_name]:
                schema_dict[schema_name][table_name] = []
            schema_dict[schema_name][table_name].append(col_name)
            
        session.close()
        return {"status": "success", "schema": schema_dict}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Schema extraction failed: {str(e)}")

import shutil

@app.get("/ai/detect_cli")
async def detect_cli():
    """Detects installed AI CLI tools in the environment."""
    known_clis = {
        "gemini": "Gemini CLI",
        "gh": "GitHub Copilot CLI (gh)",
        "ollama": "Ollama Local AI",
        "chatgpt": "ChatGPT CLI"
    }
    
    available_clis = []
    for cmd, name in known_clis.items():
        if shutil.which(cmd):
            available_clis.append({"command": cmd, "name": name, "installed": True})
            
    # Always provide a fallback "custom" option
    available_clis.append({"command": "custom", "name": "Custom CLI Launch Command", "installed": True})
    
    return {"status": "success", "clis": available_clis}

import subprocess
import os
import urllib.parse

class CLILaunchDetails(BaseModel):
    command: str
    db_config: ConnectionDetails

@app.post("/ai/launch_cli")
async def launch_cli(details: CLILaunchDetails):
    """Spawns the requested CLI in a new cmd window with DATABASE_URL injected."""
    try:
        cfg = details.db_config
        safe_user = urllib.parse.quote_plus(cfg.user)
        safe_password = urllib.parse.quote_plus(cfg.password)
        
        if cfg.db_type == "postgres":
            db_url = f"postgresql://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/{cfg.database}"
        else:
            db_url = f"mysql://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/{cfg.database}"
            
        env = os.environ.copy()
        env["DATABASE_URL"] = db_url
        env["DB_HOST"] = cfg.host
        env["DB_PORT"] = str(cfg.port)
        env["DB_USER"] = cfg.user
        env["DB_PASS"] = cfg.password
        env["DB_NAME"] = cfg.database
        
        # Start a new detached console window on Windows
        cmd_to_run = details.command
        # start cmd /k launches it and keeps console open
        subprocess.Popen(f'start cmd /k "{cmd_to_run}"', shell=True, env=env)
        
        return {"status": "success", "message": f"Launched '{cmd_to_run}'"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to launch CLI: {str(e)}")

import json
import re

@app.post("/ai/prompt")
async def ai_prompt(payload: AIPrompt):
    """Takes user's prompt + JSON schema, constructs context window, calls subprocess, extracts/runs SQL."""
    try:
        cfg = payload.db_config
        safe_user = urllib.parse.quote_plus(cfg.user)
        safe_password = urllib.parse.quote_plus(cfg.password)
        
        db_url = ""
        if cfg.db_type == "postgres":
            db_url = f"postgresql://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/{cfg.database}"
        else:
            db_url = f"mysql://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/{cfg.database}"
            
        env = os.environ.copy()
        env["DATABASE_URL"] = db_url

        schema_metadata = []
        if isinstance(payload.schema_json, dict):
            for s_name, tables in payload.schema_json.items():
                if isinstance(tables, dict):
                    schema_metadata.append(f"Schema '{s_name}' contains exactly {len(tables)} tables.")
        metadata_str = " ".join(schema_metadata)

        history_str = ""
        if payload.chat_history:
            history_str = "Previous Conversation History:\n" + "\n".join([f"{msg.role}: {msg.content}" for msg in payload.chat_history]) + "\n\n"

        base_prompt = (
            f"You are an AI database engineer. You are currently connected to the '{cfg.database}' {cfg.db_type} database. "
            f"Unless the user explicitly specifies another database, assume all queries and operations should be performed on the '{cfg.database}' database.\n"
            f"Given this database schema:\n"
            f"{metadata_str}\n"
            f"Schema JSON: {json.dumps(payload.schema_json)}\n\n"
            f"{history_str}"
            f"User request: {payload.prompt}\n\n"
            f"Provide your answer. IF you determine that a SQL query needs to be executed "
            f"(to read, insert, seed, or modify data), you MUST output it wrapped exactly in ```sql ... ``` block."
        )

        cmd_to_run = payload.command
        
        # We explicitly write the massive schema + prompt context to a temporary file 
        # and pipe it directly to the CLI tool using standard input redirection.
        # This completely bypasses Windows CMD's 8191 character argument limit.
        import tempfile
        
        MAX_RETRIES = 3
        current_prompt = base_prompt
        output = ""
        error_output = ""
        extracted_sql = None
        execution_results = []
        
        for attempt in range(MAX_RETRIES):
            with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as tf:
                tf.write(current_prompt)
                temp_file_path = tf.name
                
            try:
                # Using < pipe feeds the contents seamlessly into any CLI that supports stdin.
                # E.g., `gemini < temp.txt` or `ollama run model < temp.txt`
                process = subprocess.run(
                    f'{cmd_to_run} < "{temp_file_path}"', 
                    env=env, capture_output=True, text=True, shell=True
                )
                output = process.stdout.strip()
                error_output = process.stderr.strip()
            finally:
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
            
            if not output and error_output:
                if attempt == MAX_RETRIES - 1:
                    return {"status": "error", "message": f"CLI Error: {error_output}"}
                else:
                    break
                
            if not output:
                 output = "No valid text output returned from CLI."
                 
            # Extract SQL and execute it
            sql_match = re.search(r'```sql(.*?)(?:```|$)', output, re.IGNORECASE | re.DOTALL)
            
            if sql_match:
                extracted_sql = sql_match.group(1).strip()
                
                # Safety check
                upper_sql = extracted_sql.upper()
                is_unsafe = any(kw in upper_sql for kw in ["DROP ", "ALTER ", "TRUNCATE "])
                if is_unsafe or ("DELETE " in upper_sql and "WHERE " not in upper_sql):
                    execution_results = [{"error": "BLOCKED BY SAFETY SYSTEM: Destructive commands (DROP, ALTER, TRUNCATE, or DELETE without WHERE) are not allowed to be executed automatically."}]
                    break
                    
                # Open direct session using the injected credentials
                session = get_db_connection(
                    db_type=cfg.db_type, host=cfg.host, port=cfg.port, 
                    user=cfg.user, password=cfg.password, dbname=cfg.database
                )
                try:
                    # Execute the modeled SQL directly on the live DB
                    result_proxy = session.execute(text(extracted_sql))
                    if result_proxy.returns_rows:
                        rows = result_proxy.fetchall()
                        # Convert row tuples to generic dicts safely using mapping
                        keys = result_proxy.keys()
                        execution_results = [dict(zip(keys, row)) for row in rows]
                    session.commit()
                    session.close()
                    break # Execution successful, exit loop
                except Exception as sql_err:
                    session.rollback()
                    session.close()
                    execution_results = [{"error": str(sql_err)}]
                    
                    if attempt < MAX_RETRIES - 1:
                        # Feed the error back to the model
                        error_feedback = (
                            f"\n\nThe SQL query you generated:\n```sql\n{extracted_sql}\n```\n"
                            f"Resulted in this error during execution:\n{str(sql_err)}\n\n"
                            f"Please correct the query based on this error and output it again wrapped in a ```sql ... ``` block."
                        )
                        current_prompt += error_feedback
                    else:
                        break # Max retries reached
            else:
                break # No SQL to execute, break loop
                
        return {
            "status": "success", 
            "message": output, 
            "extracted_sql": extracted_sql,
            "data": execution_results
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"AI Prompt Execution Failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    # Typically running on a port that Tauri expects
    uvicorn.run(app, host="127.0.0.1", port=8000)
