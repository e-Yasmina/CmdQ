import csv
import io
import json
import os
import re
import urllib.parse

from fastapi import APIRouter, UploadFile, File, Form
from sqlalchemy import text, create_engine

from database import get_db_connection
from helpers import validate_identifier
from models import ConnectionDetails
from secret_utils import mask_password
import logging

logger = logging.getLogger("cmdq-backend")

router = APIRouter()


@router.post("/import/scan")
async def import_scan(
    file: UploadFile = File(...),
    format: str = Form(...)
):
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
            stmts = [s.strip() for s in content_str.split(';') if s.strip()]
            report["estimated_operations"] = len(stmts)
            for s in stmts:
                s_upper = s.upper()
                if s_upper.startswith("DROP"):
                    report["destructive_actions"].append(f"Destructive: {s[:100]}...")
                if "CREATE TABLE" in s_upper:
                    report["table_count"] += 1
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
        return {"status": "error", "message": f"Scan failed: {mask_password(str(e))}"}


@router.post("/import/table")
async def import_table(
    file: UploadFile = File(...),
    db_config: str = Form(...),
    schema_name: str = Form(...),
    table_name: str = Form(...),
    format: str = Form(...)
):
    session = None
    try:
        safe_schema = validate_identifier(schema_name, "schema name")
        safe_table = validate_identifier(table_name, "table name")
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
                cols = [validate_identifier(k, "column name") for k in row.keys()]
                col_str = ", ".join([f'"{k}"' if cfg.db_type == 'postgres' else f"`{k}`" for k in cols])
                val_plh = ", ".join([f":{k}" for k in cols])
                tbl_path = f'"{safe_schema}"."{safe_table}"' if cfg.db_type == 'postgres' else f"`{safe_schema}`.`{safe_table}`"
                q = f"INSERT INTO {tbl_path} ({col_str}) VALUES ({val_plh})"
                session.execute(text(q), dict(row))
                inserted += 1
        elif format == "json":
            data_arr = json.loads(content_str)
            for row in data_arr:
                cols = [validate_identifier(k, "column name") for k in row.keys()]
                val_plh = ", ".join([f":{k}" for k in cols])
                col_str = ", ".join([f'"{k}"' if cfg.db_type == 'postgres' else f"`{k}`" for k in cols])
                tbl_path = f'"{safe_schema}"."{safe_table}"' if cfg.db_type == 'postgres' else f"`{safe_schema}`.`{safe_table}`"
                q = f"INSERT INTO {tbl_path} ({col_str}) VALUES ({val_plh})"
                session.execute(text(q), dict(row))
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
        session = None
        return {"status": "success", "message": f"Successfully imported data. Processed {inserted} items."}
    except Exception as e:
        if session:
            session.rollback()
            session.close()
        return {"status": "error", "message": f"Table Import Failed: {mask_password(str(e))}"}


@router.post("/import/database")
async def import_database(
    file: UploadFile = File(...),
    db_config: str = Form(...),
    target_database: str = Form("")
):
    try:
        cfg_dict = json.loads(db_config)
        cfg = ConnectionDetails(**cfg_dict)
        content = await file.read()
        content_str = content.decode("utf-8")

        create_db_match = re.search(r'CREATE\s+DATABASE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"]?)([a-zA-Z0-9_]+)\1', content_str, re.IGNORECASE)
        drop_db_match = re.search(r'DROP\s+DATABASE\s+(?:IF\s+EXISTS\s+)?([`"]?)([a-zA-Z0-9_]+)\1', content_str, re.IGNORECASE)
        dump_db_name = create_db_match.group(2) if create_db_match else (drop_db_match.group(2) if drop_db_match else "")

        target_db = target_database or dump_db_name or cfg.database
        if not target_db:
            return {"status": "error", "message": "No target database specified. Provide a database name or include CREATE DATABASE in your SQL dump."}

        raw_statements = re.split(r';(?=(?:[^\']*\'[^\']*\')*[^\']*$)', content_str)

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

        def make_url(db_name):
            return cfg.build_url(
                database=db_name,
                driver="psycopg2" if cfg.db_type == "postgres" else "mysqlconnector"
            )

        bootstrap_db = "postgres" if cfg.db_type == "postgres" else ""
        total_executed = 0

        if ddl_statements:
            ddl_engine = create_engine(make_url(bootstrap_db), isolation_level="AUTOCOMMIT")
            with ddl_engine.connect() as conn:
                for stmt in ddl_statements:
                    try:
                        conn.execute(text(stmt))
                        total_executed += 1
                    except Exception as stmt_err:
                        err_msg = str(stmt_err).lower()
                        if any(kw in err_msg for kw in ["already exists", "duplicate", "already been created"]):
                            logger.info(f"Skipped (already exists): {stmt[:60]}...")
                        else:
                            logger.warning(f"DDL statement error: {stmt[:60]}... {str(stmt_err)}")
            ddl_engine.dispose()

        current_db = target_db
        if create_db_match:
            current_db = create_db_match.group(2)

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
        logger.exception(f"Database Import Failed: {mask_password(str(e))}")
        return {"status": "error", "message": f"Database Import Failed: {mask_password(str(e))}"}
