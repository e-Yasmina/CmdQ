from fastapi import FastAPI, HTTPException, Response, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, List
import io
import csv
import logging
import tempfile
import os
import subprocess
import shutil
import json
import socket
import urllib.parse
import urllib.request
import re
import time
import traceback
import uvicorn
from database import get_db_connection
from sqlalchemy import text, create_engine, MetaData, Table, select
from sqlalchemy.schema import CreateTable
from persistence_manager import storage
from fastapi.middleware.cors import CORSMiddleware
from process_manager import manager as process_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("cmdq-backend")

app = FastAPI(title="Antigravity Engine Sidecar")

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

class QueryRequest(BaseModel):
    query: str
    db_config: ConnectionDetails
    session_context: List[str] = []

class TableDataRequest(BaseModel):
    table_name: str
    schema_name: str
    limit: int = 100
    offset: int = 0
    db_config: ConnectionDetails
    session_context: List[str] = []

class ChatMessage(BaseModel):
    role: str
    content: str

class AIPrompt(BaseModel):
    prompt: str
    command: str
    db_config: ConnectionDetails
    schema_data: Dict[str, Any]
    chat_history: List[ChatMessage] = []
    protected_items: List[str] = []
    session_context: List[str] = []
    attached_file: Dict[str, Any] = None

def get_attached_file_prompt(attached_file):
    if not attached_file:
        return ""
    name = attached_file.get("name", "unknown")
    ftype = attached_file.get("type", "unknown")
    content = attached_file.get("content", "")
    if not content:
        return ""
    max_chars = 50000
    if len(content) > max_chars:
        content = content[:max_chars] + f"\n... [TRUNCATED to {max_chars} characters]"
    return f"The user attached a file '{name}' (type: {ftype}). File contents:\n{content}\n\n"

class SecurityAnalysisRequest(BaseModel):
    db_config: ConnectionDetails
    schema_name: str = ""
    table_name: str = ""
    command: str = ""

class PerformanceAnalysisRequest(BaseModel):
    db_config: ConnectionDetails
    schema_name: str = ""
    table_name: str = ""
    command: str = ""

class ProtectionAnalysisRequest(BaseModel):
    db_config: ConnectionDetails
    schema_name: str
    table_name: str

class DataAnalysisRequest(BaseModel):
    db_config: ConnectionDetails
    schema_name: str = ""
    table_name: str = ""
    command: str = ""

class SummaryAnalysisRequest(BaseModel):
    db_config: ConnectionDetails
    schema_name: str = ""
    table_name: str = ""
    command: str = ""

class FieldMapping(BaseModel):
    source_fields: List[str]
    target_fields: List[str] = []
    target_field: str = ""
    transformation: str = "none"

class DataMigrationRequest(BaseModel):
    source_config: ConnectionDetails
    source_schema: str = ""
    source_table: str
    target_config: ConnectionDetails
    target_schema: str = ""
    target_table: str
    mappings: List[FieldMapping]

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

class CreateDatabaseRequest(BaseModel):
    db_config: ConnectionDetails
    new_db_name: str

@app.post("/create_database")
async def create_database(req: CreateDatabaseRequest):
    """Creates a new database."""
    try:
        from sqlalchemy import create_engine
        
        cfg = req.db_config
        safe_user = urllib.parse.quote_plus(cfg.user)
        safe_password = urllib.parse.quote_plus(cfg.password)
        
        if cfg.db_type == "postgres":
            connection_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/postgres"
            engine = create_engine(connection_url, isolation_level="AUTOCOMMIT")
            with engine.connect() as conn:
                conn.execute(text(f'CREATE DATABASE "{req.new_db_name}"'))
        else:
            connection_url = f"mysql+mysqlconnector://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/"
            engine = create_engine(connection_url, isolation_level="AUTOCOMMIT")
            with engine.connect() as conn:
                conn.execute(text(f'CREATE DATABASE `{req.new_db_name}`'))
                
        return {"status": "success", "message": f"Database '{req.new_db_name}' created successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create database: {str(e)}")

class DropDatabaseRequest(BaseModel):
    db_config: ConnectionDetails
    db_name: str

@app.post("/drop_database")
async def drop_database(req: DropDatabaseRequest):
    """Drops an existing database."""
    try:
        from sqlalchemy import create_engine
        
        cfg = req.db_config
        safe_user = urllib.parse.quote_plus(cfg.user)
        safe_password = urllib.parse.quote_plus(cfg.password)
        
        if req.db_name.lower() in ["postgres", "sys", "information_schema", "mysql", "performance_schema"]:
            raise ValueError("Cannot drop critical system databases.")
            
        if cfg.db_type == "postgres":
            connection_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/postgres"
            engine = create_engine(connection_url, isolation_level="AUTOCOMMIT")
            with engine.connect() as conn:
                # Terminate active connections before dropping exactly like pgAdmin
                conn.execute(text(f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{req.db_name}' AND pid <> pg_backend_pid()"))
                conn.execute(text(f'DROP DATABASE "{req.db_name}"'))
        else:
            connection_url = f"mysql+mysqlconnector://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/"
            engine = create_engine(connection_url, isolation_level="AUTOCOMMIT")
            with engine.connect() as conn:
                conn.execute(text(f'DROP DATABASE `{req.db_name}`'))
                
        return {"status": "success", "message": f"Database '{req.db_name}' dropped successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to drop database: {str(e)}")

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
                SELECT 
                    c.table_schema, 
                    c.table_name, 
                    c.column_name,
                    pgc.relrowsecurity as has_rls
                FROM information_schema.columns c
                JOIN information_schema.tables t 
                  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
                JOIN pg_class pgc ON pgc.relname = t.table_name
                JOIN pg_namespace pgn ON pgn.oid = pgc.relnamespace AND pgn.nspname = t.table_schema
                WHERE c.table_schema NOT IN ('information_schema', 'pg_catalog')
                  AND t.table_type = 'BASE TABLE'
                ORDER BY c.table_schema, c.table_name, c.ordinal_position;
            """
        else:
            query = """
                SELECT c.table_schema, c.table_name, c.column_name, false as has_rls
                FROM information_schema.columns c
                JOIN information_schema.tables t 
                  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
                WHERE c.table_schema = DATABASE()
                  AND t.table_type = 'BASE TABLE'
                ORDER BY c.table_schema, c.table_name, c.ordinal_position;
            """
            
        result = session.execute(text(query)).fetchall()
        for row in result:
            schema_name, table_name, col_name, has_rls = row[0], row[1], row[2], row[3]
            if schema_name not in schema_dict:
                schema_dict[schema_name] = {}
            if table_name not in schema_dict[schema_name]:
                schema_dict[schema_name][table_name] = {"columns": [], "has_rls": bool(has_rls), "constraints": []}
            schema_dict[schema_name][table_name]["columns"].append(col_name)
            
        # Fetch constraints
        if details.db_type == "postgres":
            constr_query = """
                SELECT 
                    tc.table_schema, 
                    tc.table_name, 
                    tc.constraint_name, 
                    tc.constraint_type,
                    pg_get_constraintdef(c.oid) AS definition
                FROM information_schema.table_constraints AS tc
                JOIN pg_namespace n ON n.nspname = tc.table_schema
                JOIN pg_class cl ON cl.relname = tc.table_name AND cl.relnamespace = n.oid
                JOIN pg_constraint c ON c.conrelid = cl.oid AND c.conname = tc.constraint_name
                WHERE tc.table_schema NOT IN ('information_schema', 'pg_catalog');
            """
        else:
            constr_query = """
                SELECT table_schema, table_name, constraint_name, constraint_type, '' as definition
                FROM information_schema.table_constraints
                WHERE table_schema = DATABASE();
            """
        
        constr_result = session.execute(text(constr_query)).fetchall()
        print(f"DEBUG: Found {len(constr_result)} constraints in total.")
        matched_count = 0
        unmatched_samples = []
        for row in constr_result:
            s_name, t_name, c_name, c_type, c_def = str(row[0]), str(row[1]), str(row[2]), str(row[3]), str(row[4])
            
            # 1. Try exact match
            if s_name in schema_dict and t_name in schema_dict[s_name]:
                schema_dict[s_name][t_name]["constraints"].append({
                    "name": c_name, 
                    "type": c_type,
                    "definition": c_def
                })
                matched_count += 1
                continue
                
            # 2. Try lowercase match
            s_low, t_low = s_name.lower(), t_name.lower()
            s_match = next((k for k in schema_dict.keys() if k.lower() == s_low), None)
            if s_match:
                t_match = next((k for k in schema_dict[s_match].keys() if k.lower() == t_low), None)
                if t_match:
                    schema_dict[s_match][t_match]["constraints"].append({
                        "name": c_name, 
                        "type": c_type,
                        "definition": c_def
                    })
                    matched_count += 1
                    continue
            
            if len(unmatched_samples) < 5:
                unmatched_samples.append(f"{s_name}.{t_name}")
                
        print(f"DEBUG: Matched {matched_count} constraints. Unmatched samples: {unmatched_samples}")

        session.close()
        return {"status": "success", "schema": schema_dict}
    except Exception as e:
        session.close() # Ensure closure on error
        raise HTTPException(status_code=400, detail=f"Schema extraction failed: {str(e)}")

@app.post("/analyze/protection")
async def analyze_protection(req: ProtectionAnalysisRequest):
    """Diagnoses Row Level Security (RLS) or other 'ERLS' style protection mechanisms."""
    try:
        session = get_db_connection(
            db_type=req.db_config.db_type,
            host=req.db_config.host,
            port=req.db_config.port,
            user=req.db_config.user,
            password=req.db_config.password,
            dbname=req.db_config.database
        )
        
        report = {
            "is_protected": False,
            "mechanisms": [],
            "suggested_steps": [],
            "details": {}
        }
        
        if req.db_config.db_type == "postgres":
            # Check for RLS
            rls_query = """
                SELECT 
                    c.relrowsecurity, 
                    c.relforcerowsecurity
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = :schema AND c.relname = :table;
            """
            result = session.execute(text(rls_query), {"schema": req.schema_name, "table": req.table_name}).fetchone()
            
            if result:
                rls_enabled, rls_forced = result
                if rls_enabled:
                    report["is_protected"] = True
                    report["mechanisms"].append("PostgreSQL Row Level Security (RLS)")
                    
                    # Fetch policies
                    policy_query = """
                        SELECT policyname, roles, cmd, qual, with_check
                        FROM pg_policies
                        WHERE schemaname = :schema AND tablename = :table;
                    """
                    policies = session.execute(text(policy_query), {"schema": req.schema_name, "table": req.table_name}).fetchall()
                    report["details"]["policies"] = []
                    for p in policies:
                        p_dict = {
                            "name": p[0],
                            "roles": list(p[1]) if p[1] else [],
                            "command": p[2],
                            "qual": p[3],
                            "with_check": p[4]
                        }
                        report["details"]["policies"].append(p_dict)
                        
                        qual = p_dict["qual"] or ""
                        if "current_setting" in qual:
                            # Match current_setting('var', ...) or current_setting('var')
                            match = re.search(r"current_setting\(\s*'([^']+)'", qual)
                            if match:
                                var_name = match.group(1)
                                if var_name not in [s.split()[1] for s in report["suggested_steps"] if "SET" in s]:
                                    report["suggested_steps"].append(f"SET {var_name} = 'demo'; -- Adjust value as needed")
                
            # Generic search_path suggestions
            if "search_path" not in str(report["suggested_steps"]) and req.schema_name != "public":
                report["suggested_steps"].append(f'SET search_path TO "{req.schema_name}", public;')

        session.close()
        return {"status": "success", "report": report}
    except Exception as e:
        if 'session' in locals(): session.close()
        return {"status": "error", "message": str(e)}

@app.post("/query")
async def execute_query(req: QueryRequest):
    """Executes an arbitrary SQL query and returns the results."""
    try:
        from sqlalchemy import create_engine
        import urllib.parse
        
        cfg = req.db_config
        safe_user = urllib.parse.quote_plus(cfg.user)
        safe_password = urllib.parse.quote_plus(cfg.password)
        
        if cfg.db_type == "postgres":
            dbname = cfg.database if cfg.database else "postgres"
            connection_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/{dbname}"
        else:
            db_part = f"/{cfg.database}" if cfg.database else ""
            connection_url = f"mysql+mysqlconnector://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}{db_part}"
            
        engine = create_engine(connection_url)
        execution_results = []
        with engine.begin() as conn:
            # Execute session context commands first
            if req.session_context:
                for cmd in req.session_context:
                    if cmd.strip():
                        try:
                            conn.execute(text(cmd))
                        except:
                            pass
            
            result_proxy = conn.execute(text(req.query))
            
            if result_proxy.returns_rows:
                rows = result_proxy.fetchall()
                keys = result_proxy.keys()
                for row in rows:
                    # Stringify values to prevent JSON serialization errors (e.g. UUID, datetime)
                    row_dict = {}
                    for k, v in zip(keys, row):
                        row_dict[k] = str(v) if v is not None else None
                    execution_results.append(row_dict)
        
        return {"status": "success", "data": execution_results, "message": "Query executed successfully."}
    except Exception as e:
        return {"status": "error", "message": f"Query Failed: {str(e)}"}

@app.post("/table_data")
async def get_table_data(req: TableDataRequest):
    """Fetches paginated data for a specific table."""
    try:
        session = get_db_connection(
            db_type=req.db_config.db_type,
            host=req.db_config.host,
            port=req.db_config.port,
            user=req.db_config.user,
            password=req.db_config.password,
            dbname=req.db_config.database
        )
        
        if req.db_config.db_type == "postgres":
            query = f'SELECT * FROM "{req.schema_name}"."{req.table_name}" LIMIT :limit OFFSET :offset'
        else:
            query = f"SELECT * FROM `{req.schema_name}`.`{req.table_name}` LIMIT :limit OFFSET :offset"

        # Execution results
        execution_results = []
        if req.session_context:
            for cmd in req.session_context:
                if cmd.strip():
                    try:
                        session.execute(text(cmd))
                    except:
                        pass
        
        result_proxy = session.execute(text(query), {"limit": req.limit, "offset": req.offset})
        
        if result_proxy.returns_rows:
            rows = result_proxy.fetchall()
            keys = result_proxy.keys()
            for row in rows:
                row_dict = {}
                for k, v in zip(keys, row):
                    row_dict[k] = str(v) if v is not None else None
                execution_results.append(row_dict)
        
        session.close()
        return {"status": "success", "data": execution_results}
    except Exception as e:
        return {"status": "error", "message": f"Failed to fetch table data: {str(e)}"}

MODELS_FILE = "registered_models.json"

def get_registered_models():
    if os.path.exists(MODELS_FILE):
        try:
            with open(MODELS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return []

def save_registered_models(models):
    with open(MODELS_FILE, "w", encoding="utf-8") as f:
        json.dump(models, f, indent=4)

@app.get("/ai/detect_cli")
async def detect_cli():
    """Detects installed AI CLI tools in the environment."""
    known_clis = {
        "gemini": "Gemini CLI",
        "gh": "GitHub Copilot CLI (gh)",
        "ollama": "Ollama Local AI",
        "chatgpt": "ChatGPT CLI",
        "qwen": "Qwen CLI",
    }
    
    # Common npm/bin paths to check if shutils.which fails
    extra_paths = [
        os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "npm")
    ]
    
    available_clis = []
    for cmd, name in known_clis.items():
        found_path = shutil.which(cmd)
        
        # If not in regular PATH, check common npm/global folders
        if not found_path:
            for p in extra_paths:
                full_p = os.path.join(p, f"{cmd}.cmd")
                if os.path.exists(full_p):
                    found_path = full_p
                    break
        
        if found_path:
            available_clis.append({"command": found_path, "name": name, "installed": True})
            
    # Add newly registered API CLIs
    for model in get_registered_models():
        available_clis.append({
            "command": model["id"],
            "name": f"{model['name']} (API)",
            "installed": True,
            "is_registered": True
        })
            
    # Always provide a fallback "custom" option
    available_clis.append({"command": "custom", "name": "Custom CLI Launch Command", "installed": True})
    
    return {"status": "success", "clis": available_clis}

class RegisterAPIModel(BaseModel):
    id: str
    name: str
    provider: str
    model: str
    api_key: str
    base_url: str = ""

@app.post("/ai/register_api_model")
async def register_api_model(m: RegisterAPIModel):
    models = get_registered_models()
    for existing in models:
        if existing["id"] == m.id:
            existing.update(m.dict())
            save_registered_models(models)
            return {"status": "success", "message": "Updated registered API Model."}
            
    models.append(m.dict())
    save_registered_models(models)
    return {"status": "success", "message": "Registered new API Model."}


from process_manager import manager as process_manager

class CLILaunchDetails(BaseModel):
    command: str
    db_config: ConnectionDetails

@app.post("/ai/launch_cli")
async def launch_cli(details: CLILaunchDetails):
    """Spawns the requested CLI in a new cmd window with DATABASE_URL injected."""
    try:
        print(f"DEBUG: launch_cli/debug called for command: '{details.command}'")
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
        
        cmd_to_run = details.command
        # When backend runs as child of Electron (windowless node.exe),
        # Windows suppresses new console windows. We must use 
        # CREATE_NEW_CONSOLE (0x10) + DETACHED_PROCESS (0x8) to force visibility.
        # We also write a small .bat launcher to handle .cmd path resolution.
        bat_content = f'@echo off\ntitle CmdQ Debug Console\n"{cmd_to_run}"\npause\n'
        bat_file = os.path.join(tempfile.gettempdir(), "cmdq_debug_launch.bat")
        with open(bat_file, "w") as f:
            f.write(bat_content)
        
        subprocess.Popen(
            [bat_file],
            env=env,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
        
        return {"status": "success", "message": f"Successfully spawned debug console for '{cmd_to_run}'"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Failed to launch debug terminal: {str(e)}")

@app.post("/ai/launch_debug")
async def launch_debug(details: CLILaunchDetails):
    """Alias for launch_cli to explicitly help with debugging."""
    return await launch_cli(details)

import json
import re

@app.post("/analyze/security")
async def analyze_security(req: SecurityAnalysisRequest):
    cfg = req.db_config
    session = get_db_connection(
        db_type=cfg.db_type, host=cfg.host, port=cfg.port, 
        user=cfg.user, password=cfg.password, dbname=cfg.database
    )
    
    metrics = {
        "level": "table" if req.table_name else "database",
        "target": req.table_name or cfg.database,
    }
    
    try:
        if req.table_name:
            if cfg.db_type == "postgres":
                grants_q = "SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = :table_name;"
                grants_res = session.execute(text(grants_q), {"table_name": req.table_name}).fetchall()
                metrics["permissions"] = [{"grantee": r[0], "privilege": r[1]} for r in grants_res]
                
                cols_q = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = :table_name;"
                cols_res = session.execute(text(cols_q), {"table_name": req.table_name}).fetchall()
                sensitive_keywords = ['pass', 'token', 'secret', 'email', 'ssn', 'key', 'card', 'phone']
                sensitive_cols = []
                for r in cols_res:
                    col = str(r[0]).lower()
                    if any(kw in col for kw in sensitive_keywords):
                        sensitive_cols.append({"column": r[0], "type": r[1]})
                metrics["sensitive_columns"] = sensitive_cols
                metrics["total_columns"] = len(cols_res)
                
                constr_q = "SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = :table_name;"
                constr_res = session.execute(text(constr_q), {"table_name": req.table_name}).fetchall()
                metrics["constraints"] = [{"name": r[0], "type": r[1]} for r in constr_res]
                
            else: # MySQL
                cols_q = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = :table_name AND table_schema = DATABASE();"
                cols_res = session.execute(text(cols_q), {"table_name": req.table_name}).fetchall()
                sensitive_keywords = ['pass', 'token', 'secret', 'email', 'ssn', 'key', 'card', 'phone']
                sensitive_cols = []
                for r in cols_res:
                    col = str(r[0]).lower()
                    if any(kw in col for kw in sensitive_keywords):
                        sensitive_cols.append({"column": r[0], "type": r[1]})
                metrics["sensitive_columns"] = sensitive_cols
                metrics["total_columns"] = len(cols_res)
                
                constr_q = "SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = :table_name AND table_schema = DATABASE();"
                constr_res = session.execute(text(constr_q), {"table_name": req.table_name}).fetchall()
                metrics["constraints"] = [{"name": r[0], "type": r[1]} for r in constr_res]
                metrics["permissions"] = []
                
        else:
            if cfg.db_type == "postgres":
                roles_q = "SELECT rolname, rolsuper FROM pg_roles;"
                try:
                    roles_res = session.execute(text(roles_q)).fetchall()
                    metrics["admins"] = [str(r[0]) for r in roles_res if r[1] is True]
                    metrics["total_users"] = len(roles_res)
                except Exception as e:
                    metrics["permissions_error"] = str(e)
            else:
                roles_q = "SELECT user, Super_priv FROM mysql.user;"
                try:
                    roles_res = session.execute(text(roles_q)).fetchall()
                    metrics["admins"] = [str(r[0]) for r in roles_res if r[1] == 'Y']
                    metrics["total_users"] = len(roles_res)
                except Exception as e:
                    metrics["permissions_error"] = str(e)
        
        session.close()
    except Exception as e:
        session.close()
        return {"status": "error", "message": str(e)}

    ai_summary = ""
    # Only invoke AI if command is provided
    if req.command:
        raw_json_metrics = json.dumps(metrics)
        prompt_str = f"Analyze the following security metrics for {metrics['level']} '{metrics['target']}': {raw_json_metrics}. Provide a brief, concise security risk assessment and simple recommendations if any. Use plain text or light markdown. Do not mention any of the files, backend code, or python files (like main.py or database.py) you might have read in your response. Just provide the insights directly to the user. VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
        
        try:
            cmd_to_run = req.command
            models = get_registered_models()
            selected_api_model = next((m for m in models if m["id"] == cmd_to_run), None)
            output = ""
            
            if selected_api_model:
                provider = selected_api_model["provider"]
                api_key = selected_api_model["api_key"]
                model_name = selected_api_model["model"]
                base_url = selected_api_model.get("base_url") or ""
                
                if provider in ["openai", "custom_openai"]:
                    url = f"{base_url.rstrip('/')}/chat/completions" if provider == "custom_openai" else "https://api.openai.com/v1/chat/completions"
                    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                    payload_data = {"model": model_name, "messages": [{"role": "user", "content": prompt_str}]}
                elif provider == "gemini":
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                    headers = {"Content-Type": "application/json"}
                    payload_data = {"contents": [{"parts": [{"text": prompt_str}]}]}
                elif provider == "anthropic":
                    url = "https://api.anthropic.com/v1/messages"
                    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
                    payload_data = {"model": model_name, "max_tokens": 4096, "messages": [{"role": "user", "content": prompt_str}]}
                
                req_obj = urllib.request.Request(url, data=json.dumps(payload_data).encode("utf-8"), headers=headers, method="POST")
                with urllib.request.urlopen(req_obj) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    if provider in ["openai", "custom_openai"]:
                        output = res_data["choices"][0]["message"]["content"]
                    elif provider == "gemini":
                        output = res_data["candidates"][0]["content"]["parts"][0]["text"]
                    elif provider == "anthropic":
                        output = res_data["content"][0]["text"]
            else:
                # One-shot CLI execution
                cmd_lower = cmd_to_run.lower()
                if "gemini" in cmd_lower:
                    result = subprocess.run([cmd_to_run, "-p", prompt_str], capture_output=True, text=True, timeout=420)
                    output = result.stdout.strip()
                else:
                    import tempfile
                    pf = os.path.join(tempfile.gettempdir(), "cmdq_analyze_prompt.txt")
                    with open(pf, "w", encoding="utf-8") as f: f.write(prompt_str)
                    result = subprocess.run(f'type "{pf}" | "{cmd_to_run}"', shell=True, capture_output=True, text=True, timeout=120)
                    output = result.stdout.strip()
                    try: os.remove(pf)
                    except: pass
                        
            ai_summary = output
        except Exception as e:
            ai_summary = f"Failed to generate AI analysis: {str(e)}"
            
    return {"status": "success", "metrics": metrics, "ai_summary": ai_summary}

@app.post("/analyze/performance")
async def analyze_performance(req: PerformanceAnalysisRequest):
    cfg = req.db_config
    session = get_db_connection(
        db_type=cfg.db_type, host=cfg.host, port=cfg.port, 
        user=cfg.user, password=cfg.password, dbname=cfg.database
    )
    
    metrics = {
        "level": "table" if req.table_name else "database",
        "target": req.table_name or cfg.database,
    }
    
    try:
        if req.table_name:
            if cfg.db_type == "postgres":
                schema_name = req.schema_name or "public"
                
                # Table Size & Row Count
                size_q = "SELECT pg_total_relation_size(quote_ident(:s) || '.' || quote_ident(:t)) as total_size, pg_relation_size(quote_ident(:s) || '.' || quote_ident(:t)) as table_size;"
                try:
                    size_res = session.execute(text(size_q), {"s": schema_name, "t": req.table_name}).fetchone()
                    metrics["total_size_bytes"] = size_res[0] if size_res else 0
                    metrics["table_size_bytes"] = size_res[1] if size_res else 0
                    metrics["index_size_bytes"] = metrics["total_size_bytes"] - metrics["table_size_bytes"]
                except Exception as e:
                    metrics["size_error"] = str(e)

                # Scan Metrics (Seq vs Index)  
                scan_q = "SELECT seq_scan, seq_tup_read, idx_scan, idx_tup_fetch FROM pg_stat_user_tables WHERE schemaname = :s AND relname = :t;"
                try:
                    scan_res = session.execute(text(scan_q), {"s": schema_name, "t": req.table_name}).fetchone()
                    if scan_res:
                        metrics["seq_scans"] = scan_res[0]
                        metrics["idx_scans"] = scan_res[2]
                        total_scans = (scan_res[0] or 0) + (scan_res[2] or 0)
                        metrics["idx_scan_ratio"] = (scan_res[2] / total_scans) if total_scans > 0 else 0
                    else:
                        metrics["seq_scans"] = 0
                        metrics["idx_scans"] = 0
                        metrics["idx_scan_ratio"] = 0
                except Exception as e: pass

                # Row Activity
                act_q = "SELECT n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE schemaname = :s AND relname = :t;"
                try:
                    act_res = session.execute(text(act_q), {"s": schema_name, "t": req.table_name}).fetchone()
                    if act_res:
                        metrics["inserts"] = act_res[0]
                        metrics["updates"] = act_res[1]
                        metrics["deletes"] = act_res[2]
                        metrics["live_rows"] = act_res[3]
                        metrics["dead_rows"] = act_res[4]
                        metrics["bloat_ratio"] = (act_res[4] / (act_res[3] + act_res[4])) if (act_res[3] + act_res[4]) > 0 else 0
                except Exception as e: pass

            else: # MySQL
                # Table Size & Row Count
                size_q = "SELECT data_length, index_length, table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :t;"
                try:
                    size_res = session.execute(text(size_q), {"t": req.table_name}).fetchone()
                    if size_res:
                        metrics["table_size_bytes"] = size_res[0]
                        metrics["index_size_bytes"] = size_res[1]
                        metrics["total_size_bytes"] = size_res[0] + size_res[1]
                        metrics["live_rows"] = size_res[2]
                except Exception as e: pass

        else: # Database Level
            if cfg.db_type == "postgres":
                # Cache Hit Ratio
                db_stat_q = "SELECT blks_hit, blks_read, xact_commit, xact_rollback, conflicts, deadlocks FROM pg_stat_database WHERE datname = :d;"
                try:
                    db_stat_res = session.execute(text(db_stat_q), {"d": cfg.database}).fetchone()
                    if db_stat_res:
                        hits = db_stat_res[0] or 0
                        reads = db_stat_res[1] or 0
                        metrics["cache_hits"] = hits
                        metrics["disk_reads"] = reads
                        metrics["cache_hit_ratio"] = hits / (hits + reads) if (hits + reads) > 0 else 0
                        metrics["commits"] = db_stat_res[2]
                        metrics["rollbacks"] = db_stat_res[3]
                        metrics["conflicts"] = db_stat_res[4]
                        metrics["deadlocks"] = db_stat_res[5]
                except Exception as e: metrics["stat_error"] = str(e)
                
                # Active Connections
                conn_q = "SELECT count(*) as active, sum(case when state = 'active' then 1 else 0 end) as executing FROM pg_stat_activity WHERE datname = :d;"
                try:
                    conn_res = session.execute(text(conn_q), {"d": cfg.database}).fetchone()
                    if conn_res:
                        metrics["total_connections"] = conn_res[0]
                        metrics["active_queries"] = conn_res[1] or 0
                except Exception as e: pass
                
                # Max Connections
                try:
                    max_conn_res = session.execute(text("SHOW max_connections;")).fetchone()
                    metrics["max_connections"] = int(max_conn_res[0]) if max_conn_res else 100
                except Exception as e: pass

            else: # MySQL
                try:
                    # Connections
                    threads_res = session.execute(text("SHOW GLOBAL STATUS LIKE 'Threads_connected';")).fetchone()
                    metrics["total_connections"] = int(threads_res[1]) if threads_res else 0
                    
                    running_res = session.execute(text("SHOW GLOBAL STATUS LIKE 'Threads_running';")).fetchone()
                    metrics["active_queries"] = int(running_res[1]) if running_res else 0

                    max_conn_res = session.execute(text("SHOW VARIABLES LIKE 'max_connections';")).fetchone()
                    metrics["max_connections"] = int(max_conn_res[1]) if max_conn_res else 151
                    
                    # Approximating Cache for InnoDB
                    innodb_reads = session.execute(text("SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_reads';")).fetchone()
                    innodb_reqs = session.execute(text("SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read_requests';")).fetchone()
                    if innodb_reads and innodb_reqs:
                        reads = int(innodb_reads[1])
                        reqs = int(innodb_reqs[1])
                        hits = reqs - reads
                        metrics["cache_hits"] = hits
                        metrics["disk_reads"] = reads
                        metrics["cache_hit_ratio"] = hits / reqs if reqs > 0 else 0
                except Exception as e: pass
        
        session.close()
    except Exception as e:
        session.close()
        return {"status": "error", "message": str(e)}

    ai_summary = ""
    if req.command:
        raw_json_metrics = json.dumps(metrics)
        prompt_str = f"Analyze these performance metrics for {metrics['level']} '{metrics['target']}': {raw_json_metrics}. Identify bottlenecks based on cache hit ratio, index usage, active connections, or lock conflicts. Provide a brief actionable performance tuning assessment. Don't mention specific commands, just the tuning concept. Do not mention any of the files, backend code, or python files (like main.py or database.py) you might have read in your response. Just provide the insights directly to the user. VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
        
        try:
            cmd_to_run = req.command
            models = get_registered_models()
            selected_api_model = next((m for m in models if m["id"] == cmd_to_run), None)
            output = ""
            
            if selected_api_model:
                provider = selected_api_model["provider"]
                api_key = selected_api_model["api_key"]
                model_name = selected_api_model["model"]
                base_url = selected_api_model.get("base_url") or ""
                
                if provider in ["openai", "custom_openai"]:
                    url = f"{base_url.rstrip('/')}/chat/completions" if provider == "custom_openai" else "https://api.openai.com/v1/chat/completions"
                    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                    payload_data = {"model": model_name, "messages": [{"role": "user", "content": prompt_str}]}
                elif provider == "gemini":
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                    headers = {"Content-Type": "application/json"}
                    payload_data = {"contents": [{"parts": [{"text": prompt_str}]}]}
                elif provider == "anthropic":
                    url = "https://api.anthropic.com/v1/messages"
                    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
                    payload_data = {"model": model_name, "max_tokens": 4096, "messages": [{"role": "user", "content": prompt_str}]}
                
                req_obj = urllib.request.Request(url, data=json.dumps(payload_data).encode("utf-8"), headers=headers, method="POST")
                with urllib.request.urlopen(req_obj) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    if provider in ["openai", "custom_openai"]:
                        output = res_data["choices"][0]["message"]["content"]
                    elif provider == "gemini":
                        output = res_data["candidates"][0]["content"]["parts"][0]["text"]
                    elif provider == "anthropic":
                        output = res_data["content"][0]["text"]
            else:
                # One-shot CLI execution
                cmd_lower = cmd_to_run.lower()
                if "gemini" in cmd_lower:
                    result = subprocess.run([cmd_to_run, "-p", prompt_str], capture_output=True, text=True, timeout=300)
                    output = result.stdout.strip()
                else:
                    import tempfile
                    pf = os.path.join(tempfile.gettempdir(), "cmdq_analyze_prompt.txt")
                    with open(pf, "w", encoding="utf-8") as f: f.write(prompt_str)
                    result = subprocess.run(f'type "{pf}" | "{cmd_to_run}"', shell=True, capture_output=True, text=True, timeout=300)
                    output = result.stdout.strip()
                    try: os.remove(pf)
                    except: pass
                        
            ai_summary = output
        except Exception as e:
            ai_summary = f"Failed to generate AI performance insight: {str(e)}"
            
    return {"status": "success", "metrics": metrics, "ai_summary": ai_summary}

@app.post("/analyze/data")
async def analyze_data(req: DataAnalysisRequest):
    cfg = req.db_config
    session = get_db_connection(
        db_type=cfg.db_type, host=cfg.host, port=cfg.port, 
        user=cfg.user, password=cfg.password, dbname=cfg.database
    )
    
    metrics = {
        "level": "table" if req.table_name else "database",
        "target": req.table_name or cfg.database,
    }
    
    try:
        if req.table_name:
            if cfg.db_type == "postgres":
                schema_name = req.schema_name or "public"
                
                # Column check
                cols_q = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = :t;"
                cols_res = session.execute(text(cols_q), {"t": req.table_name}).fetchall()
                metrics["total_columns"] = len(cols_res)
                
                # Approximate rows
                act_q = "SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname = :s AND relname = :t;"
                act_res = session.execute(text(act_q), {"s": schema_name, "t": req.table_name}).fetchone()
                total_rows = act_res[0] if act_res and act_res[0] is not None else 0
                metrics["total_rows"] = total_rows
                
                # Sample the first 10 columns for completeness (null check) and uniqueness
                sampled_columns = cols_res[:10]
                completeness = {}
                
                if total_rows > 0:
                    for col, dtype in sampled_columns:
                        try:
                            # Safely count non-nulls and distincts for sampling
                            c_q = f'SELECT count("{col}") as non_nulls, count(distinct "{col}") as unique_vals FROM "{schema_name}"."{req.table_name}"'
                            c_res = session.execute(text(c_q)).fetchone()
                            if c_res:
                                non_nulls = c_res[0]
                                unique_vals = c_res[1]
                                completeness[col] = {
                                    "fill_rate": non_nulls / total_rows,
                                    "unique_ratio": unique_vals / total_rows if total_rows > 0 else 0,
                                    "type": dtype
                                }
                        except Exception:
                            pass
                metrics["column_stats"] = completeness
                
            else: # MySQL
                # Approx rows
                size_q = "SELECT table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :t;"
                size_res = session.execute(text(size_q), {"t": req.table_name}).fetchone()
                total_rows = size_res[0] if size_res and size_res[0] is not None else 0
                metrics["total_rows"] = total_rows

                cols_q = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = :t AND table_schema = DATABASE();"
                cols_res = session.execute(text(cols_q), {"t": req.table_name}).fetchall()
                metrics["total_columns"] = len(cols_res)
                
                sampled_columns = cols_res[:10]
                completeness = {}
                
                if total_rows > 0:
                    for col, dtype in sampled_columns:
                        try:
                            c_q = f"SELECT count(`{col}`) as non_nulls, count(distinct `{col}`) as unique_vals FROM `{req.table_name}`"
                            c_res = session.execute(text(c_q)).fetchone()
                            if c_res:
                                non_nulls = c_res[0]
                                unique_vals = c_res[1]
                                completeness[col] = {
                                    "fill_rate": non_nulls / total_rows,
                                    "unique_ratio": unique_vals / total_rows if total_rows > 0 else 0,
                                    "type": dtype
                                }
                        except Exception:
                            pass
                metrics["column_stats"] = completeness

        else: # Database Level
            if cfg.db_type == "postgres":
                # Find largest tables by row count
                q = "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;"
                res = session.execute(text(q)).fetchall()
                metrics["largest_tables"] = [{"name": str(r[0]), "rows": int(r[1] or 0)} for r in res]
                metrics["total_db_rows"] = sum(int(r[1] or 0) for r in res)
                
                q_tables = "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog');"
                t_res = session.execute(text(q_tables)).fetchone()
                metrics["total_tables"] = t_res[0] if t_res else 0
            else: # MySQL
                q = "SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_rows DESC LIMIT 10;"
                res = session.execute(text(q)).fetchall()
                metrics["largest_tables"] = [{"name": str(r[0]), "rows": int(r[1] or 0)} for r in res]
                metrics["total_db_rows"] = sum(int(r[1] or 0) for r in res)
                
                q_tables = "SELECT count(*) FROM information_schema.tables WHERE table_schema = DATABASE();"
                t_res = session.execute(text(q_tables)).fetchone()
                metrics["total_tables"] = t_res[0] if t_res else 0
                
        session.close()
    except Exception as e:
        session.close()
        return {"status": "error", "message": str(e)}

    ai_summary = ""
    if req.command:
        raw_json_metrics = json.dumps(metrics)
        prompt_str = f"Analyze these data quality and volume metrics for {metrics['level']} '{metrics['target']}': {raw_json_metrics}. Identify any notable data skew, missing values, fill rates, unique ratios, or table sizing insights. Provide a concise data assessment emphasizing structural characteristics or potential data quality red flags. Do not mention any of the files, backend code, or python files you might have read in your response. Just provide the insights directly to the user. VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
        
        try:
            cmd_to_run = req.command
            models = get_registered_models()
            selected_api_model = next((m for m in models if m["id"] == cmd_to_run), None)
            output = ""
            
            if selected_api_model:
                provider = selected_api_model["provider"]
                api_key = selected_api_model["api_key"]
                model_name = selected_api_model["model"]
                base_url = selected_api_model.get("base_url") or ""
                
                if provider in ["openai", "custom_openai"]:
                    url = f"{base_url.rstrip('/')}/chat/completions" if provider == "custom_openai" else "https://api.openai.com/v1/chat/completions"
                    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                    payload_data = {"model": model_name, "messages": [{"role": "user", "content": prompt_str}]}
                elif provider == "gemini":
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                    headers = {"Content-Type": "application/json"}
                    payload_data = {"contents": [{"parts": [{"text": prompt_str}]}]}
                elif provider == "anthropic":
                    url = "https://api.anthropic.com/v1/messages"
                    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
                    payload_data = {"model": model_name, "max_tokens": 4096, "messages": [{"role": "user", "content": prompt_str}]}
                
                req_obj = urllib.request.Request(url, data=json.dumps(payload_data).encode("utf-8"), headers=headers, method="POST")
                with urllib.request.urlopen(req_obj) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    if provider in ["openai", "custom_openai"]:
                        output = res_data["choices"][0]["message"]["content"]
                    elif provider == "gemini":
                        output = res_data["candidates"][0]["content"]["parts"][0]["text"]
                    elif provider == "anthropic":
                        output = res_data["content"][0]["text"]
            else:
                # One-shot CLI execution
                cmd_lower = cmd_to_run.lower()
                if "gemini" in cmd_lower:
                    result = subprocess.run([cmd_to_run, "-p", prompt_str], capture_output=True, text=True, timeout=300)
                    output = result.stdout.strip()
                else:
                    import tempfile
                    pf = os.path.join(tempfile.gettempdir(), "cmdq_analyze_prompt.txt")
                    with open(pf, "w", encoding="utf-8") as f: f.write(prompt_str)
                    result = subprocess.run(f'type "{pf}" | "{cmd_to_run}"', shell=True, capture_output=True, text=True, timeout=300)
                    output = result.stdout.strip()
                    try: os.remove(pf)
                    except: pass
                        
            ai_summary = output
        except Exception as e:
            ai_summary = f"Failed to generate AI output: {str(e)}"
            
    return {"status": "success", "metrics": metrics, "ai_summary": ai_summary}

@app.post("/analyze/summary")
async def analyze_summary(req: SummaryAnalysisRequest):
    cfg = req.db_config
    session = get_db_connection(
        db_type=cfg.db_type, host=cfg.host, port=cfg.port, 
        user=cfg.user, password=cfg.password, dbname=cfg.database
    )
    
    metrics = {
        "level": "table" if req.table_name else "database",
        "target": req.table_name or cfg.database,
    }
    
    try:
        if req.table_name:
            if cfg.db_type == "postgres":
                schema_name = req.schema_name or "public"
                
                # Table Size & Rows
                size_q = "SELECT pg_total_relation_size(quote_ident(:s) || '.' || quote_ident(:t)) as total_size, pg_relation_size(quote_ident(:s) || '.' || quote_ident(:t)) as table_size;"
                try:
                    size_res = session.execute(text(size_q), {"s": schema_name, "t": req.table_name}).fetchone()
                    metrics["total_size_bytes"] = size_res[0] if size_res else 0
                except Exception: metrics["total_size_bytes"] = 0
                
                act_q = "SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname = :s AND relname = :t;"
                try:
                    act_res = session.execute(text(act_q), {"s": schema_name, "t": req.table_name}).fetchone()
                    metrics["approx_rows"] = act_res[0] if act_res and act_res[0] is not None else 0
                except Exception: metrics["approx_rows"] = 0
                
                # Columns structure & primary keys
                cols_q = "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = :t AND table_schema = :s;"
                cols_res = session.execute(text(cols_q), {"t": req.table_name, "s": schema_name}).fetchall()
                metrics["columns"] = [{"name": r[0], "type": r[1], "nullable": r[2] == 'YES', "default": r[3]} for r in cols_res]
                
                pk_q = '''
                SELECT a.attname
                FROM   pg_index i
                JOIN   pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                WHERE  i.indrelid = (quote_ident(:s) || '.' || quote_ident(:t))::regclass
                AND    i.indisprimary;
                '''
                try:
                    pk_res = session.execute(text(pk_q), {"s": schema_name, "t": req.table_name}).fetchall()
                    metrics["primary_keys"] = [str(r[0]) for r in pk_res]
                except Exception: metrics["primary_keys"] = []
                
            else: # MySQL
                # Approx rows and size
                size_q = "SELECT table_rows, data_length, index_length FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :t;"
                size_res = session.execute(text(size_q), {"t": req.table_name}).fetchone()
                metrics["approx_rows"] = size_res[0] if size_res and size_res[0] is not None else 0
                metrics["total_size_bytes"] = (size_res[1] or 0) + (size_res[2] or 0) if size_res else 0

                cols_q = "SELECT column_name, data_type, is_nullable, column_default, column_key FROM information_schema.columns WHERE table_name = :t AND table_schema = DATABASE();"
                cols_res = session.execute(text(cols_q), {"t": req.table_name}).fetchall()
                metrics["columns"] = [{"name": r[0], "type": r[1], "nullable": r[2] == 'YES', "default": r[3]} for r in cols_res]
                metrics["primary_keys"] = [str(r[0]) for r in cols_res if r[4] == 'PRI']

        else: # Database Level
            if cfg.db_type == "postgres":
                try:
                    db_size_q = "SELECT pg_database_size(:d);"
                    db_size_res = session.execute(text(db_size_q), {"d": cfg.database}).fetchone()
                    metrics["database_size_bytes"] = db_size_res[0] if db_size_res else 0
                except Exception: metrics["database_size_bytes"] = 0
                
                q_tables = "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog');"
                t_res = session.execute(text(q_tables)).fetchone()
                metrics["total_tables"] = t_res[0] if t_res else 0
                
            else: # MySQL
                q_size = "SELECT SUM(data_length + index_length) FROM information_schema.tables WHERE table_schema = DATABASE();"
                db_size_res = session.execute(text(q_size)).fetchone()
                metrics["database_size_bytes"] = db_size_res[0] if db_size_res and db_size_res[0] is not None else 0
                
                q_tables = "SELECT count(*) FROM information_schema.tables WHERE table_schema = DATABASE();"
                t_res = session.execute(text(q_tables)).fetchone()
                metrics["total_tables"] = t_res[0] if t_res else 0

        # General info available to both levels
        metrics["db_engine"] = cfg.db_type
        
        session.close()
    except Exception as e:
        session.close()
        return {"status": "error", "message": str(e)}

    ai_summary = ""
    if req.command:
        raw_json_metrics = json.dumps(metrics)
        prompt_str = f"Provide a comprehensive summary about the {metrics['level']} '{metrics['target']}', based on these metrics: {raw_json_metrics}. Briefly describe its structure, schema complexity, or overall footprint. Do not mention any of the files, backend code, or python files (like main.py or database.py) you might have read in your response. Just provide the summary directly to the user. VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
        
        try:
            cmd_to_run = req.command
            models = get_registered_models()
            selected_api_model = next((m for m in models if m["id"] == cmd_to_run), None)
            output = ""
            
            if selected_api_model:
                provider = selected_api_model["provider"]
                api_key = selected_api_model["api_key"]
                model_name = selected_api_model["model"]
                base_url = selected_api_model.get("base_url") or ""
                
                if provider in ["openai", "custom_openai"]:
                    url = f"{base_url.rstrip('/')}/chat/completions" if provider == "custom_openai" else "https://api.openai.com/v1/chat/completions"
                    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                    payload_data = {"model": model_name, "messages": [{"role": "user", "content": prompt_str}]}
                elif provider == "gemini":
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                    headers = {"Content-Type": "application/json"}
                    payload_data = {"contents": [{"parts": [{"text": prompt_str}]}]}
                elif provider == "anthropic":
                    url = "https://api.anthropic.com/v1/messages"
                    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
                    payload_data = {"model": model_name, "max_tokens": 4096, "messages": [{"role": "user", "content": prompt_str}]}
                
                req_obj = urllib.request.Request(url, data=json.dumps(payload_data).encode("utf-8"), headers=headers, method="POST")
                with urllib.request.urlopen(req_obj) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    if provider in ["openai", "custom_openai"]:
                        output = res_data["choices"][0]["message"]["content"]
                    elif provider == "gemini":
                        output = res_data["candidates"][0]["content"]["parts"][0]["text"]
                    elif provider == "anthropic":
                        output = res_data["content"][0]["text"]
            else:
                # One-shot CLI execution
                cmd_lower = cmd_to_run.lower()
                if "gemini" in cmd_lower:
                    result = subprocess.run([cmd_to_run, "-p", prompt_str], capture_output=True, text=True, timeout=300)
                    output = result.stdout.strip()
                else:
                    import tempfile
                    pf = os.path.join(tempfile.gettempdir(), "cmdq_analyze_prompt.txt")
                    with open(pf, "w", encoding="utf-8") as f: f.write(prompt_str)
                    result = subprocess.run(f'type "{pf}" | "{cmd_to_run}"', shell=True, capture_output=True, text=True, timeout=300)
                    output = result.stdout.strip()
                    try: os.remove(pf)
                    except: pass
                        
            ai_summary = output
        except Exception as e:
            ai_summary = f"Failed to generate AI output: {str(e)}"
            
    return {"status": "success", "metrics": metrics, "ai_summary": ai_summary}

class TranslateRequest(BaseModel):
    command: str
    table_data: list

@app.post("/ai/translate_table")
def translate_table(req: TranslateRequest):
    try:
        raw_json_data = json.dumps(req.table_data)
        prompt_str = f"You are a database localization tool. Translate the following JSON array of database rows into English (or the closest human-readable language if you can infer intent). Keep the exact same JSON structure (an array of objects). Translate the data values if they are text. If the keys (column headers) are in a foreign language, translate the keys to English too. Output ONLY valid JSON array of objects without any markdown blocks or backticks. JSON:\n{raw_json_data}\n\nVERY IMPORTANT: Output ONLY raw JSON, nothing else."
        
        cmd_to_run = req.command
        models = get_registered_models()
        selected_api_model = next((m for m in models if m["id"] == cmd_to_run), None)
        output = ""
        
        if selected_api_model:
            provider = selected_api_model["provider"]
            api_key = selected_api_model["api_key"]
            model_name = selected_api_model["model"]
            base_url = selected_api_model.get("base_url") or ""
            
            if provider in ["openai", "custom_openai"]:
                url = f"{base_url.rstrip('/')}/chat/completions" if provider == "custom_openai" else "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                payload_data = {"model": model_name, "messages": [{"role": "user", "content": prompt_str}]}
            elif provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                headers = {"Content-Type": "application/json"}
                payload_data = {"contents": [{"parts": [{"text": prompt_str}]}]}
            elif provider == "anthropic":
                url = "https://api.anthropic.com/v1/messages"
                headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
                payload_data = {"model": model_name, "max_tokens": 8192, "messages": [{"role": "user", "content": prompt_str}]}
            
            req_obj = urllib.request.Request(url, data=json.dumps(payload_data).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req_obj, timeout=300) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                if provider in ["openai", "custom_openai"]:
                    output = res_data["choices"][0]["message"]["content"]
                elif provider == "gemini":
                    output = res_data["candidates"][0]["content"]["parts"][0]["text"]
                elif provider == "anthropic":
                    output = res_data["content"][0]["text"]
        else:
            import tempfile
            try:
                cmd_lower = cmd_to_run.lower()
                if "gemini" in cmd_lower:
                    node_script = None
                    if cmd_to_run.lower().endswith((".cmd", ".bat")):
                        try:
                            with open(cmd_to_run, "r") as f:
                                cmd_content = f.read()
                            import re as re_mod
                            match = re_mod.search(r'["\']?([^"\']+[\\\/]node_modules[\\\/][^"\']+\.js)["\']?', cmd_content)
                            if match:
                                raw = match.group(1)
                                cmd_dir = os.path.dirname(cmd_to_run)
                                node_script = raw.replace("%dp0%", cmd_dir).replace("%~dp0", cmd_dir).replace("%dp0", cmd_dir)
                                node_script = os.path.normpath(node_script)
                        except:
                            pass
                    
                    if node_script and os.path.exists(node_script):
                        run_cmd = ["node", node_script, "-p", prompt_str]
                    else:
                        run_cmd = [cmd_to_run, "-p", prompt_str[:7000]]
                        
                    result = subprocess.run(run_cmd, capture_output=True, text=True, timeout=300)
                    output = result.stdout.strip()
                else:
                    pf = os.path.join(tempfile.gettempdir(), "cmdq_translate_prompt.txt")
                    with open(pf, "w", encoding="utf-8") as f: f.write(prompt_str)
                    result = subprocess.run(f'type "{pf}" | "{cmd_to_run}"', shell=True, capture_output=True, text=True, timeout=300)
                    output = result.stdout.strip()
                    try: os.remove(pf)
                    except: pass
            except subprocess.TimeoutExpired:
                raise Exception("CLI process timed out after 300 seconds")
                    
        import re
        sql_match = re.search(r'```(?:json)?\s*(.*?)\s*```', output, re.IGNORECASE | re.DOTALL)
        if sql_match:
            output = sql_match.group(1).strip()
        else:
            start_idx = output.find('[')
            end_idx = output.rfind(']')
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                output = output[start_idx:end_idx+1].strip()
                
        translated_data = json.loads(output)
        return {"status": "success", "data": translated_data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Translation failed: {str(e)}")

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
        if isinstance(payload.schema_data, dict):
            for s_name, tables in payload.schema_data.items():
                if isinstance(tables, dict):
                    schema_metadata.append(f"Schema '{s_name}' contains exactly {len(tables)} tables.")
        metadata_str = " ".join(schema_metadata)

        history_str = ""
        if payload.chat_history:
            history_str = "Previous Conversation History:\n" + "\n".join([f"{msg.role}: {msg.content}" for msg in payload.chat_history]) + "\n\n"

        # Truncate metadata if it's obscenely large to prevent stdin saturation
        schema_json_str = json.dumps(payload.schema_data)
        if len(schema_json_str) > 10000:
            schema_json_str = schema_json_str[:10000] + "... [TRUNCATED]"
            
        protection_instruction = ""
        if payload.protected_items:
            prot_list = ", ".join([f"'{p.split('::')[-1]}'" for p in payload.protected_items])
            protection_instruction = f"URGENT ABSOLUTE RULE: The following databases, schemas, or tables are PROTECTED and strictly forbidden to be accessed or modified: {prot_list}. You MUST NEVER generate queries targeting them.\n\n"

        session_context_instr = ""
        if payload.session_context:
            ctx_cmds = "\n".join(payload.session_context)
            session_context_instr = f"ACTIVE SESSION CONTEXT (These commands are automatically executed before your generated SQL, so you don't need to repeat them):\n{ctx_cmds}\n\n"

        base_prompt = (
            f"You are an autonomous AI database engineer. You are currently connected to the '{cfg.database}' {cfg.db_type} database. "
            f"Unless the user explicitly specifies another database, assume all queries and operations should be performed on the '{cfg.database}' database.\n"
            f"Given this database schema:\n"
            f"{metadata_str}\n"
            f"Schema JSON: {schema_json_str}\n\n"
            f"{protection_instruction}"
            f"{session_context_instr}"
            f"{get_attached_file_prompt(payload.attached_file)}"
            f"IMPORTANT: When filtering by names (e.g., first_name, last_name), exact string matches often fail due to trailing spaces or casing. You MUST prioritize using their primary ID (like employee_id) if available. If you only have a name, ALWAYS use fuzzy matching (e.g., ILIKE '%name%') and consider running an `-- INVESTIGATE` query first to fetch their exact ID before proceeding.\n\n"
            f"{history_str}"
            f"User request: {payload.prompt}\n\n"
            f"Provide your answer. IF you determine that a SQL query needs to be executed "
            f"(to read, insert, seed, or modify data), you MUST output it wrapped exactly in ```sql ... ``` block.\n"
            f"IMPORTANT: If you need to run a diagnostic SELECT query to investigate the schema or data states before performing the final action, "
            f"you MUST add the exact comment `-- INVESTIGATE` inside your SQL block. The system will execute it and give you the results so you can continue. "
            f"HOWEVER, investigation is ONLY a means to an end. You MUST eventually perform the final action (INSERT, UPDATE, etc.) requested by the user in the same session. "
            f"Do NOT stop after an investigation; use the results to complete the task immediately.\n"
            f"CRITICAL: When you are completely finished with the ENTIRE task, you MUST output the exact token: __CMDQ_DONE__"
        )

        cmd_to_run = payload.command
        
        # We explicitly write the massive schema + prompt context to a temporary file 
        # and pipe it directly to the CLI tool using standard input redirection.
        # This completely bypasses Windows CMD's 8191 character argument limit.
        import tempfile
        
        MAX_RETRIES = 5
        current_prompt = base_prompt
        output = ""
        error_output = ""
        extracted_sql = None
        execution_results = []
        models = get_registered_models()
        # We bypass API matching if the command looks like an absolute path or a specific CLI binary
        is_direct_cli = "\\" in cmd_to_run or "/" in cmd_to_run or cmd_to_run.endswith((".exe", ".cmd", ".bat", ".ps1"))
        selected_api_model = None
        if not is_direct_cli:
            selected_api_model = next((m for m in models if m["id"] == cmd_to_run), None)
            
        for attempt in range(MAX_RETRIES):
            print(f"DEBUG: AI prompt attempt {attempt+1}/{MAX_RETRIES} using model/cmd: '{cmd_to_run}'")
            if selected_api_model:
                try:
                    provider = selected_api_model["provider"]
                    api_key = selected_api_model["api_key"]
                    model_name = selected_api_model["model"]
                    base_url = selected_api_model.get("base_url") or ""
                    
                    if provider in ["openai", "custom_openai"]:
                        url = f"{base_url.rstrip('/')}/chat/completions" if provider == "custom_openai" else "https://api.openai.com/v1/chat/completions"
                        headers = {
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json"
                        }
                        payload_data = {
                            "model": model_name,
                            "messages": [{"role": "user", "content": current_prompt}]
                        }
                    elif provider == "gemini":
                        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
                        headers = {"Content-Type": "application/json"}
                        payload_data = {
                            "contents": [{"parts": [{"text": current_prompt}]}]
                        }
                    elif provider == "anthropic":
                        url = "https://api.anthropic.com/v1/messages"
                        headers = {
                            "x-api-key": api_key,
                            "anthropic-version": "2023-06-01",
                            "Content-Type": "application/json"
                        }
                        payload_data = {
                            "model": model_name,
                            "max_tokens": 4096,
                            "messages": [{"role": "user", "content": current_prompt}]
                        }
                    else:
                        raise ValueError(f"Unknown provider: {provider}")

                    req = urllib.request.Request(url, data=json.dumps(payload_data).encode("utf-8"), headers=headers, method="POST")
                    with urllib.request.urlopen(req, timeout=60) as response:
                        res_data = json.loads(response.read().decode("utf-8"))
                        if provider in ["openai", "custom_openai"]:
                            output = res_data["choices"][0]["message"]["content"]
                        elif provider == "gemini":
                            output = res_data["candidates"][0]["content"]["parts"][0]["text"]
                        elif provider == "anthropic":
                            output = res_data["content"][0]["text"]
                        error_output = ""
                except Exception as api_err:
                    error_output = str(api_err)
                    if hasattr(api_err, "read"):
                        error_output += f" - {api_err.read().decode('utf-8')}"
                    output = ""
            else:
                # One-shot CLI execution.
                # Gemini CLI requires -p/--prompt for non-interactive mode.
                # Windows .CMD wrappers have an 8191 char limit, so we resolve
                # them to the underlying Node.js script and call node directly.
                import tempfile
                
                try:
                    cmd_lower = cmd_to_run.lower()
                    if "gemini" in cmd_lower:
                        # Resolve .CMD wrapper to underlying Node.js script
                        node_script = None
                        if cmd_to_run.lower().endswith((".cmd", ".bat")):
                            try:
                                with open(cmd_to_run, "r") as f:
                                    cmd_content = f.read()
                                # Look for: node "...node_modules\...\index.js" %*
                                import re as re_mod
                                match = re_mod.search(r'["\']?([^"\']+[\\\/]node_modules[\\\/][^"\']+\.js)["\']?', cmd_content)
                                if match:
                                    raw = match.group(1)
                                    # Replace %dp0% or %~dp0 or %dp0 with the directory of the .CMD file
                                    cmd_dir = os.path.dirname(cmd_to_run)
                                    node_script = raw.replace("%dp0%", cmd_dir).replace("%~dp0", cmd_dir).replace("%dp0", cmd_dir)
                                    node_script = os.path.normpath(node_script)
                            except:
                                pass
                        
                        if node_script and os.path.exists(node_script):
                            # Direct node invocation - NO command line length limit
                            run_cmd = ["node", node_script, "-p", current_prompt]
                            print(f"DEBUG: Gemini direct node: node {os.path.basename(node_script)} -p '<{len(current_prompt)} chars>'")
                        else:
                            # Fallback: use .CMD with truncated prompt
                            truncated = current_prompt[:7000]
                            run_cmd = [cmd_to_run, "-p", truncated]
                            print(f"DEBUG: Gemini .CMD fallback (truncated to {len(truncated)} chars)")
                        
                        result = subprocess.run(
                            run_cmd,
                            capture_output=True,
                            text=True,
                            timeout=300,
                            env=env
                        )
                        output = result.stdout.strip()
                        error_output = result.stderr.strip() if result.stderr else ""
                    else:
                        # Generic CLI: try piping via stdin
                        prompt_file = os.path.join(tempfile.gettempdir(), "cmdq_prompt.txt")
                        with open(prompt_file, "w", encoding="utf-8") as pf:
                            pf.write(current_prompt)
                        print(f"DEBUG: Generic one-shot: type prompt | {cmd_to_run}")
                        result = subprocess.run(
                            f'type "{prompt_file}" | "{cmd_to_run}"',
                            shell=True,
                            capture_output=True,
                            text=True,
                            timeout=300,
                            env=env
                        )
                        output = result.stdout.strip()
                        error_output = result.stderr.strip() if result.stderr else ""
                        try: os.remove(prompt_file)
                        except: pass
                    
                    print(f"DEBUG: CLI stdout ({len(output)} chars): {output[:200]}...")
                    if error_output:
                        print(f"DEBUG: CLI stderr: {error_output[:200]}...")
                except subprocess.TimeoutExpired:
                    output = ""
                    error_output = "CLI process timed out after 300 seconds."
                    print(f"DEBUG: CLI TIMEOUT")
                except Exception as cli_err:
                    output = ""
                    error_output = str(cli_err)
                    print(f"DEBUG: CLI ERROR: {cli_err}")
            
            if not output and error_output:
                if attempt == MAX_RETRIES - 1:
                    return {"status": "error", "message": f"CLI/API Error on attempt {attempt}: {error_output}"}
                else:
                    import time
                    time.sleep(1) # Small delay before retry
                    continue
                
            if not output:
                 output = "No valid text output returned from model or CLI."
                 
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
                    
                # Protection enforcement
                is_protected_breach = False
                for p in payload.protected_items:
                    p_bare = p.split('::')[-1] # extract the bare table/schema/db name
                    # Very strict check: if the name is mentioned ANYWHERE in the SQL
                    if p_bare.lower() in extracted_sql.lower():
                        is_protected_breach = True
                        break
                        
                if is_protected_breach:
                    execution_results = [{"error": "BLOCKED BY SAFETY SYSTEM: Cannot execute query. One or more targets are protected from AI operations."}]
                    break
                    
                # Open direct session using the injected credentials
                from sqlalchemy import create_engine
                
                # Split SQL into individual statements
                raw_statements = [s.strip() for s in extracted_sql.split(';') if s.strip()]
                parsed_statements = []
                
                for s in raw_statements:
                    cleaned_lines = []
                    local_switch = None
                    for line in s.split("\n"):
                        l_strip = line.strip()
                        if l_strip.startswith("\\c ") or l_strip.startswith("\\connect "):
                            # Capture the requested db switch explicitly!
                            parts = l_strip.split()
                            if len(parts) >= 2:
                                local_switch = parts[1].strip(';"\'`')
                        else:
                            cleaned_lines.append(line)
                            
                    cleaned_stmt = "\n".join(cleaned_lines).strip()
                    if cleaned_stmt or local_switch:
                        parsed_statements.append({
                            "stmt": cleaned_stmt,
                            "switch_db": local_switch
                        })
                
                current_db = cfg.database
                if cfg.db_type == "postgres" and not current_db:
                    current_db = "postgres"
                    
                try:
                    # Check if script contains CREATE DATABASE or context switches
                    requires_autocommit = False
                    for item in parsed_statements:
                        if re.search(r'CREATE\s+DATABASE', item["stmt"], re.IGNORECASE) or item["switch_db"]:
                            requires_autocommit = True
                            break
                            
                    if cfg.db_type == "postgres":
                        base_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/"
                    else:
                        base_url = f"mysql+mysqlconnector://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/"

                    current_db = cfg.database if cfg.database else "postgres"
                    
                    if not requires_autocommit:
                        # Transactional execution for clean rollbacks upon failure
                        engine = create_engine(base_url + current_db)
                        with engine.begin() as conn:
                            # Execute session context first
                            if payload.session_context:
                                for ctx_cmd in payload.session_context:
                                    if ctx_cmd.strip():
                                        conn.execute(text(ctx_cmd))

                            for item in parsed_statements:
                                stmt = item["stmt"]
                                if not stmt: continue
                                result_proxy = conn.execute(text(stmt))
                                if result_proxy.returns_rows:
                                    rows = result_proxy.fetchall()
                                    keys = result_proxy.keys()
                                    execution_results = [dict(zip(keys, row)) for row in rows]
                    else:
                        # Fallback for meta commands that require autocommit
                        for item in parsed_statements:
                            stmt = item["stmt"]
                            if item["switch_db"]:
                                current_db = item["switch_db"]
                            
                            new_db_name = None
                            db_match = re.search(r'CREATE\s+DATABASE\s+([a-zA-Z0-9_]+)', stmt, re.IGNORECASE)
                            if db_match:
                                new_db_name = db_match.group(1).replace('"', '').replace("'", "").replace('`', '').strip()
                                
                            engine = create_engine(base_url + current_db, isolation_level="AUTOCOMMIT")
                            with engine.connect() as conn:
                                if stmt:
                                    result_proxy = conn.execute(text(stmt))
                                    if result_proxy.returns_rows:
                                        rows = result_proxy.fetchall()
                                        keys = result_proxy.keys()
                                        execution_results = [dict(zip(keys, row)) for row in rows]
                            
                            if new_db_name:
                                current_db = new_db_name
                                
                    is_investigate = "-- INVESTIGATE" in extracted_sql.upper()
                    if is_investigate and attempt < MAX_RETRIES - 1:
                        investigate_feedback = (
                            f"\n\nThe diagnostic query you generated:\n```sql\n{extracted_sql}\n```\n"
                            f"Executed successfully and returned these results (truncated if large):\n{json.dumps(execution_results, default=str)[:10000]}\n\n"
                            f"Now, based on these results, you MUST proceed to complete the user's original task: '{payload.prompt}'. "
                            f"If you need one more investigation, you may, but the goal is to finish the task NOW."
                        )
                        current_prompt += investigate_feedback
                        continue # Feedback loops back to AI
                        
                    break # Execution successful, exit loop
                except Exception as sql_err:
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
                if attempt > 0 and attempt < MAX_RETRIES - 1:
                    current_prompt += f"\n\nYou did not wrap your output in a valid ```sql ... ``` block! You must wrap your query in ```sql ... ```. Please try again."
                    continue
                break # No SQL to execute, break loop
                
        return {
            "status": "success", 
            "message": output, 
            "extracted_sql": extracted_sql,
            "data": execution_results
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"AI Prompt Execution Failed: {str(e)}")

class ExportTableRequest(BaseModel):
    db_config: ConnectionDetails
    schema_name: str
    table_name: str
    format: str = "csv"

class ExportDatabaseRequest(BaseModel):
    db_config: ConnectionDetails
    format: str = "sql"

def generate_native_sql_dump(cfg, temp_path):
    """Generates a complete SQL dump using SQLAlchemy reflection (no external binaries needed)."""
    try:
        logger.info(f"Starting native SQL export for {cfg.database}...")
        
        # Re-create engine to ensure we have a fresh bind for reflection
        safe_user = urllib.parse.quote_plus(cfg.user)
        safe_password = urllib.parse.quote_plus(cfg.password)
        if cfg.db_type == "postgres":
            url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/{cfg.database}"
        else:
            url = f"mysql+mysqlconnector://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/{cfg.database}"
            
        engine = create_engine(url)
        metadata = MetaData()
        
        # Reflect all tables
        logger.info("Reflecting database schema...")
        metadata.reflect(bind=engine)
        
        with open(temp_path, "w", encoding="utf-8") as f:
            f.write(f"-- Native SQL Dump generated by CmdQ\n")
            f.write(f"-- Database: {cfg.database} ({cfg.db_type})\n")
            f.write(f"-- Generated at: {time.ctime()}\n")
            f.write(f"-- ------------------------------------------------------\n\n")
            
            if cfg.db_type == "postgres":
                f.write("SET statement_timeout = 0;\nSET lock_timeout = 0;\nSET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\nSELECT pg_catalog.set_config('search_path', '', false);\nSET check_function_bodies = false;\nSET xmloption = content;\nSET client_min_messages = warning;\nSET row_security = off;\n\n")

            for table_name in metadata.tables:
                logger.info(f"Exporting table structure: {table_name}")
                table = metadata.tables[table_name]
                
                # 1. Create Table statement
                create_stmt = str(CreateTable(table).compile(engine))
                f.write(f"-- Structure for table {table_name}\n")
                f.write(f"DROP TABLE IF EXISTS {table_name} CASCADE;\n")
                f.write(f"{create_stmt.strip()};\n\n")
                
                # 2. Insert statements
                logger.info(f"Exporting table data: {table_name}")
                with engine.connect() as conn:
                    # Use a basic select to fetch all data
                    res = conn.execute(select(table))
                    keys = list(res.keys())
                    
                    count = 0
                    for row in res:
                        row_dict = dict(zip(keys, row))
                        cols_str = ", ".join([f'"{k}"' if cfg.db_type == 'postgres' else f"`{k}`" for k in keys])
                        
                        # Helper for SQL value formatting
                        vals = []
                        for v in row_dict.values():
                            if v is None:
                                vals.append("NULL")
                            elif isinstance(v, (int, float)):
                                vals.append(str(v))
                            elif isinstance(v, bool):
                                vals.append("TRUE" if v else "FALSE")
                            else:
                                # Stringify and escape single quotes
                                escaped = str(v).replace("'", "''")
                                vals.append(f"'{escaped}'")
                        
                        vals_str = ", ".join(vals)
                        f.write(f"INSERT INTO {table_name} ({cols_str}) VALUES ({vals_str});\n")
                        count += 1
                    
                    logger.info(f"Exported {count} rows for {table_name}")
                    f.write("\n")
                    
        engine.dispose()
        logger.info(f"Native SQL export completed: {temp_path}")
        return True
    except Exception as e:
        logger.exception(f"Native SQL Export Error: {str(e)}")
        raise e

@app.post("/export/table")
async def export_table(req: ExportTableRequest):
    try:
        session = get_db_connection(
            db_type=req.db_config.db_type,
            host=req.db_config.host,
            port=req.db_config.port,
            user=req.db_config.user,
            password=req.db_config.password,
            dbname=req.db_config.database
        )
        
        if req.db_config.db_type == "postgres":
            query = f'SELECT * FROM "{req.schema_name}"."{req.table_name}"'
        else:
            query = f"SELECT * FROM `{req.schema_name}`.`{req.table_name}`"
            
        result_proxy = session.execute(text(query))
        rows = result_proxy.fetchall()
        keys = list(result_proxy.keys())
        session.close()

        data_dicts = []
        for row in rows:
            row_dict = {}
            for k, v in zip(keys, row):
                row_dict[k] = str(v) if v is not None else None
            data_dicts.append(row_dict)

        if req.format == "json":
            json_str = json.dumps(data_dicts, indent=2)
            return Response(content=json_str, media_type="application/json", headers={"Content-Disposition": f"attachment; filename={req.table_name}.json"})
        
        elif req.format == "csv":
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=keys)
            writer.writeheader()
            writer.writerows(data_dicts)
            return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={req.table_name}.csv"})

        elif req.format == "sql":
            output = io.StringIO()
            table_name_safe = req.table_name
            for d in data_dicts:
                cols = ", ".join([f'"{k}"' if req.db_config.db_type == 'postgres' else f"`{k}`" for k in keys])
                vals = ", ".join([f"'{str(v).replace(chr(39), chr(39)+chr(39))}'" if v is not None else "NULL" for v in d.values()])
                stmt = f"INSERT INTO {table_name_safe} ({cols}) VALUES ({vals});\n"
                output.write(stmt)
            return Response(content=output.getvalue(), media_type="application/sql", headers={"Content-Disposition": f"attachment; filename={req.table_name}.sql"})

        else:
            raise HTTPException(status_code=400, detail="Unsupported format")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Export Failed: {str(e)}")

@app.post("/export/database")
async def export_database(req: ExportDatabaseRequest, background_tasks: BackgroundTasks):
    logger.info(f"Export Database request received for: {req.db_config.database} (Type: {req.db_config.db_type})")
    try:
        cfg = req.db_config
        
        # Initialize temp file
        fd, temp_path = tempfile.mkstemp(suffix=".sql")
        os.close(fd)
        logger.info(f"Temporary file initialized at: {temp_path}")
        
        # Use native SQL exporter
        generate_native_sql_dump(cfg, temp_path)
            
        if not os.path.exists(temp_path):
            logger.error(f"CRITICAL: Temp file {temp_path} is missing after export!")
            raise Exception(f"Temp file {temp_path} was not found after export.")
            
        file_size = os.path.getsize(temp_path)
        logger.info(f"Export completed successfully. File size: {file_size} bytes.")
        
        # Background task to remove the file after it has been served
        background_tasks.add_task(os.remove, temp_path)
        logger.info(f"Scheduled background deletion for {temp_path}")
        
        return FileResponse(
            temp_path, 
            media_type="application/sql", 
            filename=f"{cfg.database}_dump.sql"
        )
    except Exception as e:
        logger.exception(f"Database Export Failed: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Database Export Failed: {str(e)}")

@app.post("/import/scan")
async def import_scan(
    file: UploadFile = File(...),
    format: str = Form(...)
):
    """Scans an import file and reports what will happen without executing anything."""
    try:
        content = await file.read()
        content_str = content.decode("utf-8")
        
        report = {
            "format": format,
            "table_count": 0,
            "row_count": 0,
            "destructive_actions": [],
            "tables_affected": [],
            "estimated_operations": 0
        }
        
        if format == "csv":
            reader = csv.DictReader(io.StringIO(content_str))
            rows = list(reader)
            report["row_count"] = len(rows)
            report["estimated_operations"] = len(rows)
            
        elif format == "json":
            data = json.loads(content_str)
            if isinstance(data, list):
                report["row_count"] = len(data)
                report["estimated_operations"] = len(data)
            else:
                report["destructive_actions"].append("JSON root is not an array. Import might fail.")
                
        elif format == "sql":
            # Simple SQL scanner
            stmts = [s.strip() for s in content_str.split(';') if s.strip()]
            report["estimated_operations"] = len(stmts)
            
            for s in stmts:
                s_upper = s.upper()
                if s_upper.startswith("DROP"):
                    report["destructive_actions"].append(f"Destructive: {s[:100]}...")
                
                if "CREATE TABLE" in s_upper:
                    report["table_count"] += 1
                    # Extract table name if possible
                    match = re.search(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s\(\)]+)", s, re.IGNORECASE)
                    if match:
                        name = match.group(1).replace('"', '').replace('`', '').split('.')[-1]
                        if name not in report["tables_affected"]:
                            report["tables_affected"].append(name)
                
                if "INSERT INTO" in s_upper:
                    report["row_count"] += 1
                    match = re.search(r"INSERT\s+INTO\s+([^\s\(\)]+)", s, re.IGNORECASE)
                    if match:
                        name = match.group(1).replace('"', '').replace('`', '').split('.')[-1]
                        if name not in report["tables_affected"]:
                            report["tables_affected"].append(name)

        return {"status": "success", "report": report}
    except Exception as e:
        return {"status": "error", "message": f"Scan failed: {str(e)}"}

@app.post("/import/table")
async def import_table(
    file: UploadFile = File(...),
    db_config: str = Form(...),
    schema_name: str = Form(...),
    table_name: str = Form(...),
    format: str = Form(...)
):
    try:
        cfg_dict = json.loads(db_config)
        cfg = ConnectionDetails(**cfg_dict)
        
        session = get_db_connection(
            db_type=cfg.db_type, host=cfg.host, port=cfg.port, 
            user=cfg.user, password=cfg.password, dbname=cfg.database
        )
        
        content = await file.read()
        content_str = content.decode("utf-8")
        
        inserted = 0
        if format == "csv":
            reader = csv.DictReader(io.StringIO(content_str))
            for row in reader:
                cols = list(row.keys())
                col_str = ", ".join([f'"{k}"' if cfg.db_type == 'postgres' else f"`{k}`" for k in cols])
                val_plh = ", ".join([f":{k}" for k in cols])
                
                tbl_path = f'"{schema_name}"."{table_name}"' if cfg.db_type == 'postgres' else f"`{schema_name}`.`{table_name}`"
                q = f"INSERT INTO {tbl_path} ({col_str}) VALUES ({val_plh})"
                session.execute(text(q), dict(row))
                inserted += 1

        elif format == "json":
            data_arr = json.loads(content_str)
            for row in data_arr:
                cols = list(row.keys())
                val_plh = ", ".join([f":{k}" for k in cols])
                col_str = ", ".join([f'"{k}"' if cfg.db_type == 'postgres' else f"`{k}`" for k in cols])
                tbl_path = f'"{schema_name}"."{table_name}"' if cfg.db_type == 'postgres' else f"`{schema_name}`.`{table_name}`"
                q = f"INSERT INTO {tbl_path} ({col_str}) VALUES ({val_plh})"
                session.execute(text(q), row)
                inserted += 1
                
        elif format == "sql":
            for stmt in content_str.split(';'):
                if stmt.strip():
                    session.execute(text(stmt))
                    inserted += 1
        else:
             raise Exception("Unsupported format")
             
        session.commit()
        session.close()
        return {"status": "success", "message": f"Successfully imported data. Processed {inserted} items."}
    except Exception as e:
        return {"status": "error", "message": f"Table Import Failed: {str(e)}"}

@app.post("/import/database")
async def import_database(
    file: UploadFile = File(...),
    db_config: str = Form(...),
    target_database: str = Form("")
):
    """Imports a SQL dump to restore a full database on the server.

    The .sql file may contain CREATE DATABASE, CREATE TABLE, INSERT, etc.
    This endpoint handles:
    - Bootstrapping: connecting to default admin DB first if the target DB doesn't exist
    - CREATE DATABASE / DROP DATABASE statements
    - AUTOCOMMIT for DDL
    - Transactional execution for DML
    """
    import re as re_mod
    try:
        cfg_dict = json.loads(db_config)
        cfg = ConnectionDetails(**cfg_dict)
        content = await file.read()
        content_str = content.decode("utf-8")

        # 1. Scan for CREATE DATABASE and DROP DATABASE statements
        create_db_match = re_mod.search(r'CREATE\s+DATABASE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?)([a-zA-Z0-9_]+)\1', content_str, re_mod.IGNORECASE)
        drop_db_match = re_mod.search(r'DROP\s+DATABASE\s+(?:IF\s+EXISTS\s+)?([`"]?)([a-zA-Z0-9_]+)\1', content_str, re_mod.IGNORECASE)
        dump_db_name = create_db_match.group(2) if create_db_match else (drop_db_match.group(2) if drop_db_match else "")

        # 2. Determine actual target database name
        target_db = target_database or dump_db_name or cfg.database
        if not target_db:
            return {"status": "error", "message": "No target database specified. Provide a database name or include CREATE DATABASE in your SQL dump."}

        # 3. Split SQL into statements (handle quoted semicolons, dollar quotes for PG functions)
        raw_statements = re_mod.split(r';(?=(?:[^\']*\'[^\']*\')*[^\']*$)', content_str)

        # 4. Separate DDL (needs autocommit) from DML (can be transactional)
        ddl_statements = []
        dml_statements = []
        for raw_stmt in raw_statements:
            stmt = raw_stmt.strip()
            if not stmt:
                continue
            upper = stmt.upper()
            if any(upper.startswith(kw) for kw in ["CREATE DATABASE", "DROP DATABASE", "CREATE TABLE", "DROP TABLE", "ALTER TABLE", "TRUNCATE", "CREATE INDEX", "DROP INDEX", "CREATE SEQUENCE", "DROP SEQUENCE", "CREATE SCHEMA", "DROP SCHEMA", "CREATE EXTENSION", "ALTER DATABASE", "ALTER SCHEMA", "SET ", "SELECT pg_catalog"]):
                ddl_statements.append(stmt)
            else:
                dml_statements.append(stmt)

        from sqlalchemy import create_engine
        safe_user = urllib.parse.quote_plus(cfg.user)
        safe_password = urllib.parse.quote_plus(cfg.password)

        def make_url(db_name):
            if cfg.db_type == "postgres":
                return f"postgresql+psycopg2://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/{db_name}"
            return f"mysql+mysqlconnector://{safe_user}:{safe_password}@{cfg.host}:{cfg.port}/{db_name}"

        # 5. Determine bootstrap database (default admin DB)
        bootstrap_db = "postgres" if cfg.db_type == "postgres" else ""
        import urllib.parse as url_parse_mod

        # 6. Connect to bootstrap DB and execute DDL
        total_executed = 0

        # Handle DDL statements that require AUTOCOMMIT (CREATE DATABASE, etc.)
        if ddl_statements:
            ddl_engine = create_engine(make_url(bootstrap_db), isolation_level="AUTOCOMMIT")
            with ddl_engine.connect() as conn:
                for stmt in ddl_statements:
                    try:
                        conn.execute(text(stmt))
                        total_executed += 1
                    except Exception as stmt_err:
                        err_msg = str(stmt_err).lower()
                        # Ignore "already exists" and "duplicate" errors for idempotent imports
                        if any(kw in err_msg for kw in ["already exists", "duplicate", "already been created"]):
                            logger.info(f"Skipped (already exists): {stmt[:60]}...")
                        else:
                            logger.warning(f"DDL statement error: {stmt[:60]}... {str(stmt_err)}")

            ddl_engine.dispose()

        # 7. If CREATE DATABASE was in the dump and we executed it, reconnect to the new DB
        current_db = target_db
        if create_db_match:
            current_db = create_db_match.group(2)

        # 8. Execute DML (INSERT, UPDATE, etc.) in a transaction
        if dml_statements:
            try:
                dml_engine = create_engine(make_url(current_db))
                with dml_engine.begin() as conn:
                    for stmt in dml_statements:
                        try:
                            conn.execute(text(stmt))
                            total_executed += 1
                        except Exception as stmt_err:
                            logger.warning(f"DML statement error: {stmt[:60]}... {str(stmt_err)}")
                dml_engine.dispose()
            except Exception as conn_err:
                # If we can't connect to the new DB, the CREATE DATABASE might have failed silently
                # Try connecting back to the bootstrap DB and executing DML there
                logger.warning(f"Could not connect to '{current_db}', falling back to bootstrap DB: {str(conn_err)}")
                fallback_engine = create_engine(make_url(bootstrap_db))
                with fallback_engine.begin() as conn:
                    for stmt in dml_statements:
                        try:
                            conn.execute(text(stmt))
                            total_executed += 1
                        except Exception as stmt_err:
                            logger.warning(f"DML (fallback) error: {stmt[:60]}... {str(stmt_err)}")
                fallback_engine.dispose()

        return {"status": "success", "message": f"Database import completed. Executed {total_executed} SQL statements in database '{current_db}'."}
    except Exception as e:
        logger.exception(f"Database Import Failed: {str(e)}")
        return {"status": "error", "message": f"Database Import Failed: {str(e)}"}

@app.post("/etl/migrate")
async def etl_migrate(req: DataMigrationRequest):
    """Extracts, transforms, and loads data mapping seamlessly between databases."""
    try:
        # Extract
        src_session = get_db_connection(
            db_type=req.source_config.db_type, host=req.source_config.host, port=req.source_config.port,
            user=req.source_config.user, password=req.source_config.password, dbname=req.source_config.database
        )
        
        src_schema = req.source_schema or "public" if req.source_config.db_type == "postgres" else req.source_schema
        src_tbl = f'"{src_schema}"."{req.source_table}"' if req.source_config.db_type == 'postgres' else f"`{src_schema}`.`{req.source_table}`"
        
        src_query = f"SELECT * FROM {src_tbl}"
        src_res = src_session.execute(text(src_query))
        src_data = []
        if src_res.returns_rows:
            keys = src_res.keys()
            for row in src_res.fetchall():
                src_data.append(dict(zip(keys, row)))
        src_session.close()

        # Transform
        transformed_data = []
        for src_row in src_data:
            tgt_row = {}
            for m in req.mappings:
                src_val = src_row.get(m.source_fields[0]) if len(m.source_fields) > 0 else None
                
                if m.transformation == "concat":
                    val = " ".join([str(src_row.get(f)) for f in m.source_fields if src_row.get(f) is not None])
                    if len(m.target_fields) > 0:
                        tgt_row[m.target_fields[0]] = val
                elif m.transformation == "split":
                    if src_val is not None:
                        parts = str(src_val).split(" ")
                        for i, tgt_f in enumerate(m.target_fields):
                            if i < len(parts):
                                tgt_row[tgt_f] = parts[i]
                            else:
                                tgt_row[tgt_f] = ""
                else:
                    val = src_val
                    if m.transformation == "split_first":
                        if src_val is not None:
                            val = str(src_val).split(" ")[0]
                    elif m.transformation == "split_last":
                        if src_val is not None:
                            parts = str(src_val).split(" ")
                            val = parts[-1] if len(parts) > 1 else ""
                    elif m.transformation == "cast_int":
                        if val is not None:
                            try:
                                val = int(val)
                            except ValueError:
                                val = 0
                    elif m.transformation == "cast_str":
                        if val is not None:
                            val = str(val)
                            
                    if len(m.target_fields) > 0:
                        tgt_row[m.target_fields[0]] = val
            transformed_data.append(tgt_row)

        if not transformed_data:
            return {"status": "success", "message": "No data found to migrate."}

        # Load
        tgt_session = get_db_connection(
            db_type=req.target_config.db_type, host=req.target_config.host, port=req.target_config.port,
            user=req.target_config.user, password=req.target_config.password, dbname=req.target_config.database
        )
        
        tgt_schema = req.target_schema or "public" if req.target_config.db_type == "postgres" else req.target_schema
        tgt_tbl = f'"{tgt_schema}"."{req.target_table}"' if req.target_config.db_type == 'postgres' else f"`{tgt_schema}`.`{req.target_table}`"
        
        inserted = 0
        tgt_cols = list(transformed_data[0].keys())
        col_str = ", ".join([f'"{k}"' if req.target_config.db_type == 'postgres' else f"`{k}`" for k in tgt_cols])
        val_plh = ", ".join([f":{k}" for k in tgt_cols])
        ins_q = f"INSERT INTO {tgt_tbl} ({col_str}) VALUES ({val_plh})"
        
        for tgt_row in transformed_data:
            tgt_session.execute(text(ins_q), tgt_row)
            inserted += 1
            
        tgt_session.commit()
        tgt_session.close()
        
        return {"status": "success", "message": f"Successfully migrated {inserted} rows."}
    except Exception as e:
        return {"status": "error", "message": f"Data Migration Failed: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    # Typically running on a port that Tauri expects
    uvicorn.run(app, host="127.0.0.1", port=8000)
@app.get("/storage/{key}")
async def get_storage_items(key: str):
    if key not in storage.files:
        raise HTTPException(status_code=400, detail="Invalid storage key")
    return {"status": "success", "data": storage.get_items(key)}

@app.post("/storage/{key}")
async def save_storage_item(key: str, item: Dict[str, Any]):
    if key not in storage.files:
        raise HTTPException(status_code=400, detail="Invalid storage key")
    if storage.save_item(key, item):
        return {"status": "success", "message": f"Item saved to {key}"}
    raise HTTPException(status_code=500, detail="Failed to save item")

@app.delete("/storage/{key}/{item_id}")
async def delete_storage_item(key: str, item_id: str):
    if key not in storage.files:
        raise HTTPException(status_code=400, detail="Invalid storage key")
    if storage.delete_item(key, item_id):
        return {"status": "success", "message": f"Item {item_id} deleted from {key}"}
    raise HTTPException(status_code=500, detail="Failed to delete item")
