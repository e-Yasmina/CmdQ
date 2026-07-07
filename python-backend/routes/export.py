import csv
import io
import json
import os
import tempfile

from fastapi import APIRouter, HTTPException, Response, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy import text

from database import get_db_connection
from helpers import validate_identifier, generate_native_sql_dump
from models import ExportTableRequest, ExportDatabaseRequest
from secret_utils import mask_password
import logging

logger = logging.getLogger("cmdq-backend")

router = APIRouter()


@router.post("/export/table")
async def export_table(req: ExportTableRequest):
    try:
        schema_name = validate_identifier(req.schema_name, "schema name")
        table_name = validate_identifier(req.table_name, "table name")
        session = get_db_connection(
            db_type=req.db_config.db_type,
            host=req.db_config.host,
            port=req.db_config.port,
            user=req.db_config.user,
            password=req.db_config.password,
            dbname=req.db_config.database
        )
        if req.db_config.db_type == "postgres":
            query = f'SELECT * FROM "{schema_name}"."{table_name}"'
        else:
            query = f"SELECT * FROM `{schema_name}`.`{table_name}`"
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
        raise HTTPException(status_code=400, detail=f"Export Failed: {mask_password(str(e))}")


@router.post("/export/database")
async def export_database(req: ExportDatabaseRequest, background_tasks: BackgroundTasks):
    logger.info(f"Export Database request received for: {req.db_config.database} (Type: {req.db_config.db_type})")
    try:
        cfg = req.db_config
        fd, temp_path = tempfile.mkstemp(suffix=".sql")
        os.close(fd)
        logger.info(f"Temporary file initialized at: {temp_path}")
        generate_native_sql_dump(cfg, temp_path)
        if not os.path.exists(temp_path):
            logger.error(f"CRITICAL: Temp file {temp_path} is missing after export!")
            raise Exception(f"Temp file {temp_path} was not found after export.")
        file_size = os.path.getsize(temp_path)
        logger.info(f"Export completed successfully. File size: {file_size} bytes.")
        background_tasks.add_task(os.remove, temp_path)
        logger.info(f"Scheduled background deletion for {temp_path}")
        return FileResponse(
            temp_path,
            media_type="application/sql",
            filename=f"{cfg.database}_dump.sql"
        )
    except Exception as e:
        logger.exception(f"Database Export Failed: {mask_password(str(e))}")
        raise HTTPException(status_code=400, detail=f"Database Export Failed: {mask_password(str(e))}")
