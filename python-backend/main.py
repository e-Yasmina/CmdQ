from fastapi import FastAPI, HTTPException, Response, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, List
import io
import csv

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

class QueryRequest(BaseModel):
    query: str
    db_config: ConnectionDetails

class TableDataRequest(BaseModel):
    table_name: str
    schema_name: str
    limit: int = 100
    offset: int = 0
    db_config: ConnectionDetails

class ChatMessage(BaseModel):
    role: str
    content: str

class AIPrompt(BaseModel):
    prompt: str
    command: str
    db_config: ConnectionDetails
    schema_json: Dict[str, Any]
    chat_history: List[ChatMessage] = []

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
        import urllib.parse
        
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

@app.post("/query")
async def execute_query(req: QueryRequest):
    """Executes an arbitrary SQL query and returns the results."""
    try:
        session = get_db_connection(
            db_type=req.db_config.db_type,
            host=req.db_config.host,
            port=req.db_config.port,
            user=req.db_config.user,
            password=req.db_config.password,
            dbname=req.db_config.database
        )
        
        result_proxy = session.execute(text(req.query))
        execution_results = []
        
        if result_proxy.returns_rows:
            rows = result_proxy.fetchall()
            keys = result_proxy.keys()
            for row in rows:
                # Stringify values to prevent JSON serialization errors (e.g. UUID, datetime)
                row_dict = {}
                for k, v in zip(keys, row):
                    row_dict[k] = str(v) if v is not None else None
                execution_results.append(row_dict)
                
        session.commit()
        session.close()
        
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
            # For MySQL, schema_name is typically the database name, and it doesn't use the same quoting
            query = f"SELECT * FROM `{req.schema_name}`.`{req.table_name}` LIMIT :limit OFFSET :offset"
            
        result_proxy = session.execute(text(query), {"limit": req.limit, "offset": req.offset})
        execution_results = []
        
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

import shutil

registered_api_models = []

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
            
    # Add newly registered API CLIs
    for model in registered_api_models:
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
    for existing in registered_api_models:
        if existing["id"] == m.id:
            existing.update(m.dict())
            return {"status": "success", "message": "Updated registered API Model."}
            
    registered_api_models.append(m.dict())
    return {"status": "success", "message": "Registered new API Model."}


import subprocess
import os
import urllib.parse
import urllib.request

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
        prompt_str = f"Analyze the following security metrics for {metrics['level']} '{metrics['target']}': {raw_json_metrics}. Provide a brief, concise security risk assessment and simple recommendations if any. Use plain text or light markdown. Do not mention any of the files, backend code, or python files (like main.py or database.py) you might have read in your response. Just provide the insights directly to the user."
        
        try:
            cmd_to_run = req.command
            selected_api_model = next((m for m in registered_api_models if m["id"] == cmd_to_run), None)
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
                import tempfile
                with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as tf:
                    tf.write(prompt_str)
                    temp_file_path = tf.name
                try:
                    proc = subprocess.run(f'{cmd_to_run} < "{temp_file_path}"', shell=True, capture_output=True, text=True)
                    output = proc.stdout.strip()
                finally:
                    if os.path.exists(temp_file_path):
                        os.remove(temp_file_path)
                        
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
        prompt_str = f"Analyze these performance metrics for {metrics['level']} '{metrics['target']}': {raw_json_metrics}. Identify bottlenecks based on cache hit ratio, index usage, active connections, or lock conflicts. Provide a brief actionable performance tuning assessment. Don't mention specific commands, just the tuning concept. Do not mention any of the files, backend code, or python files (like main.py or database.py) you might have read in your response. Just provide the insights directly to the user."
        
        try:
            cmd_to_run = req.command
            selected_api_model = next((m for m in registered_api_models if m["id"] == cmd_to_run), None)
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
                import tempfile
                with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as tf:
                    tf.write(prompt_str)
                    temp_file_path = tf.name
                try:
                    proc = subprocess.run(f'{cmd_to_run} < "{temp_file_path}"', shell=True, capture_output=True, text=True)
                    output = proc.stdout.strip()
                finally:
                    if os.path.exists(temp_file_path):
                        os.remove(temp_file_path)
                        
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
        prompt_str = f"Analyze these data quality and volume metrics for {metrics['level']} '{metrics['target']}': {raw_json_metrics}. Identify any notable data skew, missing values, fill rates, unique ratios, or table sizing insights. Provide a concise data assessment emphasizing structural characteristics or potential data quality red flags. Do not mention any of the files, backend code, or python files you might have read in your response. Just provide the insights directly to the user."
        
        try:
            cmd_to_run = req.command
            selected_api_model = next((m for m in registered_api_models if m["id"] == cmd_to_run), None)
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
                import tempfile
                with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as tf:
                    tf.write(prompt_str)
                    temp_file_path = tf.name
                try:
                    proc = subprocess.run(f'{cmd_to_run} < "{temp_file_path}"', shell=True, capture_output=True, text=True)
                    output = proc.stdout.strip()
                finally:
                    if os.path.exists(temp_file_path):
                        os.remove(temp_file_path)
                        
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
        prompt_str = f"Provide a comprehensive summary about the {metrics['level']} '{metrics['target']}', based on these metrics: {raw_json_metrics}. Briefly describe its structure, schema complexity, or overall footprint. Do not mention any of the files, backend code, or python files (like main.py or database.py) you might have read in your response. Just provide the summary directly to the user."
        
        try:
            cmd_to_run = req.command
            selected_api_model = next((m for m in registered_api_models if m["id"] == cmd_to_run), None)
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
                import tempfile
                with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as tf:
                    tf.write(prompt_str)
                    temp_file_path = tf.name
                try:
                    proc = subprocess.run(f'{cmd_to_run} < "{temp_file_path}"', shell=True, capture_output=True, text=True)
                    output = proc.stdout.strip()
                finally:
                    if os.path.exists(temp_file_path):
                        os.remove(temp_file_path)
                        
            ai_summary = output
        except Exception as e:
            ai_summary = f"Failed to generate AI output: {str(e)}"
            
    return {"status": "success", "metrics": metrics, "ai_summary": ai_summary}

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
        selected_api_model = next((m for m in registered_api_models if m["id"] == cmd_to_run), None)
        
        for attempt in range(MAX_RETRIES):
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
                    with urllib.request.urlopen(req) as response:
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

class ExportTableRequest(BaseModel):
    db_config: ConnectionDetails
    schema_name: str
    table_name: str
    format: str = "csv"

class ExportDatabaseRequest(BaseModel):
    db_config: ConnectionDetails
    format: str = "sql"

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
    try:
        cfg = req.db_config
        fd, temp_path = tempfile.mkstemp(suffix=".sql")
        os.close(fd)
        
        env = os.environ.copy()
        if cfg.db_type == "postgres":
            env["PGPASSWORD"] = cfg.password
            cmd = ["pg_dump", "-h", cfg.host, "-p", str(cfg.port), "-U", cfg.user, "-d", cfg.database, "-f", temp_path]
        else:
            env["MYSQL_PWD"] = cfg.password
            cmd = ["mysqldump", "-h", cfg.host, "-P", str(cfg.port), "-u", cfg.user, cfg.database, "-r", temp_path]
            
        proc = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if proc.returncode != 0:
            raise Exception(proc.stderr)
            
        background_tasks.add_task(os.remove, temp_path)
        return FileResponse(temp_path, media_type="application/sql", filename=f"{cfg.database}_dump.sql")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Database Export Failed: {str(e)}")

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
    db_config: str = Form(...)
):
    try:
        cfg_dict = json.loads(db_config)
        cfg = ConnectionDetails(**cfg_dict)
        
        fd, temp_path = tempfile.mkstemp(suffix=".sql")
        with os.fdopen(fd, "wb") as f:
            content = await file.read()
            f.write(content)
            
        env = os.environ.copy()
        if cfg.db_type == "postgres":
            env["PGPASSWORD"] = cfg.password
            cmd = ["psql", "-h", cfg.host, "-p", str(cfg.port), "-U", cfg.user, "-d", cfg.database, "-f", temp_path]
        else:
            env["MYSQL_PWD"] = cfg.password
            cmd = ["mysql", "-h", cfg.host, "-P", str(cfg.port), "-u", cfg.user, cfg.database, "-e", f"source {temp_path}"]
            
        proc = subprocess.run(cmd, env=env, capture_output=True, text=True)
        os.remove(temp_path)
        
        if proc.returncode != 0:
            raise Exception(proc.stderr)
            
        return {"status": "success", "message": "Database imported successfully."}
    except Exception as e:
        return {"status": "error", "message": f"Database Import Failed: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    # Typically running on a port that Tauri expects
    uvicorn.run(app, host="127.0.0.1", port=8000)
