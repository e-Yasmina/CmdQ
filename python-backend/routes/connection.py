import json
import logging
import socket

from fastapi import APIRouter, HTTPException
from sqlalchemy import text, create_engine

from database import build_engine, get_db_connection
from db_context_builder import extract_schema, extract_entity_graph_data
from helpers import validate_identifier
from models import ConnectionDetails, PortCheckDetails, CreateDatabaseRequest, DropDatabaseRequest, DatabaseCopyRequest, EntityGraphRequest
from persistence_manager import storage
from secret_utils import mask_password

logger = logging.getLogger("cmdq-backend")

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
        system_dbs = {"information_schema", "mysql", "performance_schema", "sys"}

        # Check if database is protected
        protection_rules = storage.get_items("protected_items")
        conn_id = cfg.server_name or f"{cfg.user}@{cfg.host}:{cfg.port}"
        for rule in protection_rules:
            rule_id = rule.get("id", "")
            rule_level = rule.get("level", "full")
            # Check if this rule protects the entire database
            parts = rule_id.split("::")
            if len(parts) >= 2 and parts[-1].lower() == db_name.lower():
                if rule_level == "full":
                    raise ValueError(f"Database '{db_name}' is fully protected and cannot be dropped.")
            # Also check connection-level protection
            if rule.get("connection_id", "") == conn_id and parts[-1].lower() == db_name.lower():
                if rule_level == "full":
                    raise ValueError(f"Database '{db_name}' is fully protected and cannot be dropped.")

        if cfg.db_type == "postgres":
            system_dbs.add("postgres")
            bootstrap = "postgres"
            engine = create_engine(
                cfg.build_url(database=bootstrap, driver="psycopg2"),
                isolation_level="AUTOCOMMIT"
            )
            with engine.connect() as conn:
                row = conn.execute(text("SELECT datistemplate FROM pg_database WHERE datname = :dbname"), {"dbname": db_name}).scalar()
                if row is True or db_name.lower() in system_dbs:
                    raise ValueError("Cannot drop critical system databases.")
                conn.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :dbname AND pid <> pg_backend_pid()"), {"dbname": db_name})
                conn.execute(text(f'DROP DATABASE "{db_name}"'))
        else:
            if db_name.lower() in system_dbs:
                raise ValueError("Cannot drop critical system databases.")
            bootstrap = ""
            engine = create_engine(
                cfg.build_url(database=bootstrap, driver="mysqlconnector"),
                isolation_level="AUTOCOMMIT"
            )
            with engine.connect() as conn:
                conn.execute(text(f'DROP DATABASE `{db_name}`'))
        return {"status": "success", "message": f"Database '{req.db_name}' dropped successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to drop database: {mask_password(str(e))}")


@router.post("/database/copy")
async def copy_database(req: DatabaseCopyRequest):
    src_raw_engine = None
    tgt_raw_engine = None
    try:
        src_db = validate_identifier(req.source_database, "source database name")
        tgt_db = validate_identifier(req.target_database, "target database name")

        if src_db.lower() == tgt_db.lower() and \
           req.source_config.host == req.target_config.host and \
           req.source_config.port == req.target_config.port:
            raise ValueError("Source and target database must differ when copying within the same server")

        # 1. Create target database
        bootstrap = "postgres" if req.target_config.db_type == "postgres" else ""
        temp_engine = build_engine(
            req.target_config,
            database=bootstrap,
            isolation_level="AUTOCOMMIT"
        )
        try:
            with temp_engine.connect() as conn:
                quoted = f'"{tgt_db}"' if req.target_config.db_type == "postgres" else f"`{tgt_db}`"
                conn.execute(text(f'CREATE DATABASE {quoted}'))
        finally:
            temp_engine.dispose()

        # 2. Extract source schema
        schema_dict = extract_schema(
            db_type=req.source_config.db_type,
            host=req.source_config.host,
            port=req.source_config.port,
            user=req.source_config.user,
            password=req.source_config.password,
            database=src_db
        )

        # 3. Create reusable engines with pool_size=1 to avoid connection exhaustion
        src_pool_kwargs = {"pool_size": 1, "max_overflow": 0}
        tgt_pool_kwargs = {"pool_size": 1, "max_overflow": 0}

        src_url = req.source_config.build_url(
            database=src_db,
            driver="psycopg2" if req.source_config.db_type == "postgres" else "mysqlconnector"
        )
        tgt_url = req.target_config.build_url(
            database=tgt_db,
            driver="psycopg2" if req.target_config.db_type == "postgres" else "mysqlconnector"
        )
        src_raw_engine = create_engine(src_url, **src_pool_kwargs)
        tgt_raw_engine = create_engine(tgt_url, **tgt_pool_kwargs)

        # Create all non-default schemas on target before copying tables
        tgt_quote = '"' if req.target_config.db_type == "postgres" else "`"
        logger.info(f"[copy_database] Target schemas from source: {list(schema_dict.keys())}")
        for schema_name in schema_dict:
            s_name = validate_identifier(schema_name, "schema name")
            if req.target_config.db_type != "mysql" and s_name.lower() == "public":
                logger.info(f"[copy_database] Skipping schema '{s_name}' (public)")
                continue
            quoted_schema = f"{tgt_quote}{s_name}{tgt_quote}"
            sql = f'CREATE SCHEMA IF NOT EXISTS {quoted_schema}'
            logger.info(f"[copy_database] Creating schema on target: {sql}")
            try:
                with tgt_raw_engine.connect() as conn:
                    conn.execute(text(sql))
                    conn.commit()
            except Exception as schema_err:
                logger.error(f"[copy_database] Failed to create schema '{s_name}': {schema_err}")
                raise

        total_tables = 0
        total_rows = 0
        empty_tables = []
        rls_tables = []

        for schema_name, tables in schema_dict.items():
            schema_name = validate_identifier(schema_name, "schema name")
            for table_name, table_info in tables.items():
                table_name = validate_identifier(table_name, "table name")
                total_tables += 1

                src_quote = '"' if req.source_config.db_type == "postgres" else "`"
                tgt_quote = '"' if req.target_config.db_type == "postgres" else "`"
                src_full = f"{src_quote}{schema_name}{src_quote}.{src_quote}{table_name}{src_quote}"
                tgt_full = f"{tgt_quote}{schema_name}{tgt_quote}.{tgt_quote}{table_name}{tgt_quote}"

                src_columns = table_info if isinstance(table_info, list) else table_info.get("columns", [])
                if not src_columns:
                    continue

                col_list = ", ".join([f"{src_quote}{c}{src_quote}" for c in src_columns])

                # Get column definitions from source to recreate table structure
                if req.source_config.db_type == "postgres":
                    col_defs_q = text("""
                        SELECT column_name, data_type, character_maximum_length,
                               is_nullable, column_default
                        FROM information_schema.columns
                        WHERE table_schema = :schema AND table_name = :table
                        ORDER BY ordinal_position
                    """)
                else:
                    col_defs_q = text("""
                        SELECT column_name, data_type, character_maximum_length,
                               is_nullable, column_default
                        FROM information_schema.columns
                        WHERE table_schema = DATABASE() AND table_name = :table
                        ORDER BY ordinal_position
                    """)

                with src_raw_engine.connect() as conn:
                    params = {"schema": schema_name, "table": table_name} if req.source_config.db_type == "postgres" else {"table": table_name}
                    col_defs_result = conn.execute(col_defs_q, params)
                    col_defs_rows = [dict(row._mapping) for row in col_defs_result.fetchall()]

                if not col_defs_rows:
                    continue

                # Build CREATE TABLE statement
                col_def_parts = []
                for cd in col_defs_rows:
                    col_n = cd["column_name"]
                    data_type = cd["data_type"]
                    max_len = cd.get("character_maximum_length")
                    nullable = cd.get("is_nullable") == "YES"
                    default = cd.get("column_default")

                    if max_len and data_type in ("character varying", "varchar"):
                        dtype_def = f"VARCHAR({max_len})"
                    elif max_len and data_type in ("nchar", "char"):
                        dtype_def = f"CHAR({max_len})"
                    else:
                        dtype_def = data_type.upper()

                    parts = [f"{tgt_quote}{col_n}{tgt_quote} {dtype_def}"]
                    if not nullable:
                        parts.append("NOT NULL")
                    if default and ("nextval" in default or "::regclass" in default or default.startswith("next ")):
                        pass
                    elif default:
                        parts.append(f"DEFAULT {default}")

                    col_def_parts.append(" ".join(parts))

                # Ensure schema exists before creating table
                if req.target_config.db_type == "postgres" and schema_name.lower() != "public":
                    quoted_schema = f'{tgt_quote}{schema_name}{tgt_quote}'
                    schema_sql = f'CREATE SCHEMA IF NOT EXISTS {quoted_schema}'
                    with tgt_raw_engine.connect() as conn:
                        conn.execute(text(schema_sql))
                        conn.commit()

                create_sql = f"CREATE TABLE {tgt_full} ({', '.join(col_def_parts)})"
                logger.info(f"[copy_database] Creating table '{schema_name}.{table_name}' on target")
                with tgt_raw_engine.connect() as conn:
                    conn.execute(text(create_sql))
                    conn.commit()

                # Copy data rows if requested
                if req.copy_rows:
                    logger.info(f"[copy_database] Copying data for '{schema_name}.{table_name}'")
                    select_sql = text(f"SELECT {col_list} FROM {src_full}")
                    try:
                        with src_raw_engine.connect() as conn:
                            if req.source_config.db_type == "postgres":
                                conn.execute(text("SET row_security TO off"))
                            rows_result = conn.execute(select_sql)
                            rows_data = [dict(row._mapping) for row in rows_result.fetchall()]

                        if rows_data:
                            tgt_col_list = ", ".join([f"{tgt_quote}{c}{tgt_quote}" for c in src_columns])
                            val_plh = ", ".join([f":{c}" for c in src_columns])
                            ins_q = text(f"INSERT INTO {tgt_full} ({tgt_col_list}) VALUES ({val_plh})")

                            batch = []
                            for row in rows_data:
                                params = {}
                                for c in src_columns:
                                    val = row.get(c)
                                    if isinstance(val, (dict, list)):
                                        val = json.dumps(val)
                                    params[c] = val
                                batch.append(params)
                            with tgt_raw_engine.connect() as conn:
                                conn.execute(ins_q, batch)
                                conn.commit()

                            total_rows += len(batch)
                            logger.info(f"[copy_database] Inserted {len(batch)} rows into '{schema_name}.{table_name}'")
                        else:
                            rls_tables.append(f"{schema_name}.{table_name}")
                            logger.info(f"[copy_database] No rows to copy for '{schema_name}.{table_name}'")
                    except Exception as read_err:
                        err_str = str(read_err)
                        if "InsufficientPrivilege" in err_str or "row-level security" in err_str:
                            logger.warning(f"[copy_database] Skipping data for '{schema_name}.{table_name}' due to RLS: {read_err}")
                            rls_tables.append(f"{schema_name}.{table_name}")
                        else:
                            raise

        msg_parts = [f"{total_tables} tables"]
        if req.copy_rows:
            msg_parts.append(f"{total_rows} rows")
            msg_parts_str = ", ".join(msg_parts)
            warnings = []
            if empty_tables:
                warnings.append(f"{len(empty_tables)} tables had 0 rows")
            if rls_tables:
                warnings.append(f"{len(rls_tables)} tables skipped due to RLS")
            detail = "; ".join(warnings) if warnings else None
        else:
            msg_parts_str = "structures only"
            detail = None

        return {
            "status": "success",
            "message": f"Copied database '{src_db}' to '{tgt_db}': {msg_parts_str} copied.",
            "detail": detail,
        }
    except Exception as e:
        return {"status": "error", "message": f"Database copy failed: {mask_password(str(e))}"}
    finally:
        if src_raw_engine:
            src_raw_engine.dispose()
        if tgt_raw_engine:
            tgt_raw_engine.dispose()


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


@router.post("/entity_graph")
async def get_entity_graph(req: EntityGraphRequest):
    try:
        graph_data = extract_entity_graph_data(
            db_type=req.db_config.db_type,
            host=req.db_config.host,
            port=req.db_config.port,
            user=req.db_config.user,
            password=req.db_config.password,
            database=req.db_config.database,
            schema_name=req.schema_name,
            include_columns=req.include_columns,
            include_column_types=req.include_column_types,
            include_pk=req.include_pk,
            include_fk=req.include_fk,
            include_not_null=req.include_not_null,
            include_enums=req.include_enums,
            max_nodes=req.max_nodes,
        )
        print(f"[ENTITY_GRAPH DEBUG] db={req.db_config.database} type={req.db_config.db_type} "
              f"nodes={len(graph_data['nodes'])} edges={len(graph_data['edges'])} "
              f"total_tables={graph_data.get('total_tables', '?')} truncated={graph_data.get('truncated', False)}")
        if graph_data['edges']:
            for e in graph_data['edges'][:5]:
                print(f"  edge: {e['source']} --{e.get('source_column','')}->{e['target']} ({e.get('target_column','')})")
        else:
            print("[ENTITY_GRAPH DEBUG] NO EDGES RETURNED - FK query returned 0 results or edges not built")
        return {"status": "success", "graph": graph_data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Entity graph extraction failed: {mask_password(str(e))}")
