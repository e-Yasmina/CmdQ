import socket

from fastapi import APIRouter, HTTPException
from sqlalchemy import text, create_engine

from database import get_db_connection
from db_context_builder import extract_schema
from helpers import validate_identifier
from models import ConnectionDetails, PortCheckDetails, CreateDatabaseRequest, DropDatabaseRequest
from secret_utils import mask_password

router = APIRouter()


@router.post("/check_port")
async def check_port(details: PortCheckDetails):
    try:
        with socket.create_connection((details.host, details.port), timeout=2):
            return {"status": "success", "message": "Port is open"}
    except (socket.timeout, ConnectionRefusedError, socket.error):
        raise HTTPException(status_code=400, detail=f"Cannot reach {details.host}:{details.port}")


@router.post("/connect")
async def connect(details: ConnectionDetails):
    try:
        session = get_db_connection(
            db_type=details.db_type,
            host=details.host,
            port=details.port,
            user=details.user,
            password=details.password,
            dbname=details.database
        )
        session.execute(text("SELECT 1"))
        session.close()
        return {"status": "success", "token": "temp-token-xyz"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {mask_password(str(e))}")


@router.post("/databases")
async def get_databases(details: ConnectionDetails):
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
        raise HTTPException(status_code=400, detail=f"Database list extraction failed: {mask_password(str(e))}")


@router.post("/create_database")
async def create_database(req: CreateDatabaseRequest):
    try:
        cfg = req.db_config
        db_name = validate_identifier(req.new_db_name, "database name")
        bootstrap = "postgres" if cfg.db_type == "postgres" else ""
        engine = create_engine(
            cfg.build_url(database=bootstrap, driver="psycopg2" if cfg.db_type == "postgres" else "mysqlconnector"),
            isolation_level="AUTOCOMMIT"
        )
        with engine.connect() as conn:
            quoted = f'"{db_name}"' if cfg.db_type == "postgres" else f"`{db_name}`"
            conn.execute(text(f'CREATE DATABASE {quoted}'))
        return {"status": "success", "message": f"Database '{req.new_db_name}' created successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create database: {mask_password(str(e))}")


@router.post("/drop_database")
async def drop_database(req: DropDatabaseRequest):
    try:
        cfg = req.db_config
        db_name = validate_identifier(req.db_name, "database name")
        if db_name.lower() in ["postgres", "sys", "information_schema", "mysql", "performance_schema"]:
            raise ValueError("Cannot drop critical system databases.")
        bootstrap = "postgres" if cfg.db_type == "postgres" else ""
        engine = create_engine(
            cfg.build_url(database=bootstrap, driver="psycopg2" if cfg.db_type == "postgres" else "mysqlconnector"),
            isolation_level="AUTOCOMMIT"
        )
        with engine.connect() as conn:
            if cfg.db_type == "postgres":
                conn.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :dbname AND pid <> pg_backend_pid()"), {"dbname": db_name})
                conn.execute(text(f'DROP DATABASE "{db_name}"'))
            else:
                conn.execute(text(f'DROP DATABASE `{db_name}`'))
        return {"status": "success", "message": f"Database '{req.db_name}' dropped successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to drop database: {mask_password(str(e))}")


@router.post("/schema")
async def get_schema(details: ConnectionDetails):
    try:
        schema_dict = extract_schema(
            db_type=details.db_type,
            host=details.host,
            port=details.port,
            user=details.user,
            password=details.password,
            database=details.database
        )
        return {"status": "success", "schema": schema_dict}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Schema extraction failed: {mask_password(str(e))}")
