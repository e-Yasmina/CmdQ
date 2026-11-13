import os
import platform
import re
import time
from pathlib import Path

from pydantic import BaseModel
from sqlalchemy import create_engine, MetaData, Table, select, text
from sqlalchemy.schema import CreateTable

from secret_utils import mask_password
import logging

logger = logging.getLogger("cmdq-backend")

IDENTIFIER_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_$]{0,127}$')


def validate_identifier(name: str, label: str = "identifier"):
    if not name or not isinstance(name, str):
        raise ValueError(f"Invalid {label}: must be a non-empty string")
    if not IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid {label} '{name}': must start with a letter or underscore, contain only letters, digits, underscores, or $, max 128 chars")
    return name


def split_sql_statements(sql: str) -> list[str]:
    """Split a SQL dump into individual executable statements in linear O(N) time.

    Correctly handles:
    - Single quotes ('...') including escaped quotes ('' and \\')
    - Double quotes ("...")
    - Backticks (`...`)
    - Single-line comments (-- and #)
    - Multi-line comments (/* ... */)
    - PostgreSQL dollar-quoted blocks ($$ ... $$ and $tag$ ... $tag$)
    """
    statements = []
    current = []
    in_single_quote = False
    in_double_quote = False
    in_backtick = False
    in_line_comment = False
    in_block_comment = False
    in_dollar_quote = False
    dollar_tag = ""
    i = 0
    n = len(sql)

    while i < n:
        c = sql[i]
        c2 = sql[i:i+2]

        if in_line_comment:
            if c == '\n':
                in_line_comment = False
            current.append(c)
            i += 1
            continue

        if in_block_comment:
            if c2 == '*/':
                in_block_comment = False
                current.append('*/')
                i += 2
                continue
            current.append(c)
            i += 1
            continue

        if in_single_quote:
            current.append(c)
            if c == '\\' and i + 1 < n:
                current.append(sql[i+1])
                i += 2
                continue
            if c == "'":
                if i + 1 < n and sql[i+1] == "'":
                    current.append(sql[i+1])
                    i += 2
                    continue
                in_single_quote = False
            i += 1
            continue

        if in_double_quote:
            current.append(c)
            if c == '\\' and i + 1 < n:
                current.append(sql[i+1])
                i += 2
                continue
            if c == '"':
                in_double_quote = False
            i += 1
            continue

        if in_backtick:
            current.append(c)
            if c == '`':
                in_backtick = False
            i += 1
            continue

        if in_dollar_quote:
            current.append(c)
            if c == '$' and dollar_tag and sql[i-len(dollar_tag)+1:i+1] == dollar_tag:
                in_dollar_quote = False
                dollar_tag = ""
            i += 1
            continue

        # Comments
        if c2 == '--' or c == '#':
            in_line_comment = True
            current.append(c)
            i += 1
            continue
        if c2 == '/*':
            in_block_comment = True
            current.append('/*')
            i += 2
            continue

        # Quotes
        if c == "'":
            in_single_quote = True
            current.append(c)
            i += 1
            continue
        if c == '"':
            in_double_quote = True
            current.append(c)
            i += 1
            continue
        if c == '`':
            in_backtick = True
            current.append(c)
            i += 1
            continue

        # PostgreSQL dollar quotes ($tag$...$tag$ or $$...$$)
        if c == '$':
            m = re.match(r'^\$[a-zA-Z0-9_]*\$', sql[i:])
            if m:
                tag = m.group(0)
                in_dollar_quote = True
                dollar_tag = tag
                current.append(tag)
                i += len(tag)
                continue

        # Statement delimiter
        if c == ';':
            stmt = ''.join(current).strip()
            if stmt:
                statements.append(stmt)
            current = []
            i += 1
            continue

        current.append(c)
        i += 1

    last_stmt = ''.join(current).strip()
    if last_stmt:
        statements.append(last_stmt)

    return statements


def strip_leading_comments(stmt: str) -> str:
    """Remove leading whitespace and comments (-- or /* */ or #) to reveal the SQL verb."""
    s = stmt.lstrip()
    while True:
        if s.startswith("--") or s.startswith("#"):
            nl = s.find("\n")
            if nl == -1:
                return ""
            s = s[nl+1:].lstrip()
        elif s.startswith("/*"):
            end = s.find("*/")
            if end == -1:
                return ""
            s = s[end+2:].lstrip()
        else:
            break
    return s


def _upsert_model(models, payload):
    for existing in models:
        if existing["id"] == payload["id"]:
            existing.update(payload)
            return models
    models.append(payload)
    return models


def _delete_model(models, model_id):
    before = len(models)
    models[:] = [m for m in models if m["id"] != model_id]
    if len(models) == before:
        return None
    return models


def generate_native_sql_dump(cfg, temp_path):
    try:
        logger.info(f"Starting native SQL export for {cfg.database}...")
        url = cfg.build_url(driver="psycopg2" if cfg.db_type == "postgres" else "mysqlconnector")
        engine = create_engine(url)
        metadata = MetaData()
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
                create_stmt = str(CreateTable(table).compile(engine))
                f.write(f"-- Structure for table {table_name}\n")
                f.write(f"DROP TABLE IF EXISTS {table_name};\n")
                f.write(f"{create_stmt.strip()};\n\n")
                logger.info(f"Exporting table data: {table_name}")
                with engine.connect() as conn:
                    res = conn.execute(select(table))
                    keys = list(res.keys())
                    count = 0
                    for row in res:
                        row_dict = dict(zip(keys, row))
                        cols_str = ", ".join([f'"{k}"' if cfg.db_type == 'postgres' else f"`{k}`" for k in keys])
                        vals = []
                        for v in row_dict.values():
                            if v is None:
                                vals.append("NULL")
                            elif isinstance(v, (int, float)):
                                vals.append(str(v))
                            elif isinstance(v, bool):
                                vals.append("TRUE" if v else "FALSE")
                            else:
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
        logger.exception(f"Native SQL Export Error: {mask_password(str(e))}")
        raise e


def get_desktop_path():
    if platform.system() == "Windows":
        return Path(os.environ.get("USERPROFILE", "")) / "Desktop"
    return Path.home() / "Desktop"


def safe_filepath(directory, filename):
    path = Path(directory) / filename
    if not path.exists():
        return str(path)
    stem = path.stem
    suffix = path.suffix
    counter = 1
    while True:
        new_path = path.parent / f"{stem} ({counter}){suffix}"
        if not new_path.exists():
            return str(new_path)
        counter += 1


class SaveFileRequest(BaseModel):
    content: str
    filename: str
    directory: str = ""
