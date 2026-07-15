import re

from fastapi import APIRouter
from sqlalchemy import text, create_engine

from database import get_db_connection
from helpers import validate_identifier
from models import QueryRequest, TableDataRequest
from secret_utils import mask_password

router = APIRouter()


@router.post("/query")
async def execute_query(req: QueryRequest):
    try:
        cfg = req.db_config
        url = cfg.build_url(driver="psycopg2" if cfg.db_type == "postgres" else "mysqlconnector")
        engine = create_engine(url)
        execution_results = []
        with engine.begin() as conn:
            if req.session_context:
                for cmd in req.session_context:
                    if cmd.strip():
                        try:
                            conn.execute(text(cmd))
                        except:
                            pass
            result_proxy = conn.execute(text(req.query))
            rowcount = result_proxy.rowcount if result_proxy.rowcount > 0 else 0
            if result_proxy.returns_rows:
                rows = result_proxy.fetchall()
                keys = result_proxy.keys()
                for row in rows:
                    row_dict = {}
                    for k, v in zip(keys, row):
                        row_dict[k] = str(v) if v is not None else None
                    execution_results.append(row_dict)
            query_upper = req.query.strip().upper()
            is_dml = query_upper.startswith("UPDATE") or query_upper.startswith("DELETE")
            if is_dml and rowcount == 0:
                return {"status": "warning", "data": execution_results, "rows_affected": 0, "message": "Query executed but 0 rows were affected. The row may have changed since it was fetched, or the WHERE clause did not match."}
        return {"status": "success", "data": execution_results, "rows_affected": rowcount, "message": "Query executed successfully."}
    except Exception as e:
        return {"status": "error", "message": f"Query Failed: {mask_password(str(e))}"}


@router.post("/table_data")
async def get_table_data(req: TableDataRequest):
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
            query = f'SELECT * FROM "{schema_name}"."{table_name}" LIMIT :limit OFFSET :offset'
        else:
            query = f"SELECT * FROM `{schema_name}`.`{table_name}` LIMIT :limit OFFSET :offset"
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
        return {"status": "error", "message": f"Failed to fetch table data: {mask_password(str(e))}"}
