import re

from fastapi import APIRouter

from helpers import validate_identifier
from models import QueryRequest, TableDataRequest
from secret_utils import mask_password
from sql_executor import SqlExecutor
from sql_safety_checker import SQLSafetyChecker

router = APIRouter()


@router.post("/query")
async def execute_query(req: QueryRequest):
    try:
        cfg = req.db_config
        checker = SQLSafetyChecker()
        is_safe, error = checker.check_all(req.query, context="query")
        if not is_safe:
            return {"status": "error", "message": f"Query Blocked: {error}"}

        executor = SqlExecutor(cfg)
        result = executor.execute(
            req.query,
            session_context=req.session_context,
        )
        if result.is_error:
            return {"status": "error", "message": f"Query Failed: {mask_password(result.error)}"}
        rows = [
            {k: str(v) if v is not None else None for k, v in row.items()}
            for row in result.rows
        ]
        query_upper = req.query.strip().upper()
        is_dml = query_upper.startswith("UPDATE") or query_upper.startswith("DELETE")
        if is_dml and result.rowcount == 0:
            return {
                "status": "warning",
                "data": rows,
                "columns": result.columns,
                "rows_affected": 0,
                "message": "Query executed but 0 rows were affected. The row may have changed since it was fetched, or the WHERE clause did not match."
            }
        return {
            "status": "success",
            "data": rows,
            "columns": result.columns,
            "rows_affected": result.rowcount,
            "message": "Query executed successfully."
        }
    except Exception as e:
        return {"status": "error", "message": f"Query Failed: {mask_password(str(e))}"}


@router.post("/table_data")
async def get_table_data(req: TableDataRequest):
    try:
        schema_name = validate_identifier(req.schema_name, "schema name")
        table_name = validate_identifier(req.table_name, "table name")
        cfg = req.db_config

        checker = SQLSafetyChecker()
        is_safe, error = checker.check_table_access(schema_name, table_name, write_op=None)
        if not is_safe:
            return {"status": "error", "message": f"Table Access Blocked: {error}"}

        if cfg.db_type == "postgres":
            query = f'SELECT * FROM "{schema_name}"."{table_name}" LIMIT :limit OFFSET :offset'
        else:
            query = f"SELECT * FROM `{schema_name}`.`{table_name}` LIMIT :limit OFFSET :offset"
        executor = SqlExecutor(cfg)
        result = executor.execute(
            query,
            params={"limit": req.limit, "offset": req.offset},
            session_context=req.session_context,
        )
        if result.is_error:
            return {"status": "error", "message": f"Failed to fetch table data: {mask_password(result.error)}"}
        rows = [
            {k: str(v) if v is not None else None for k, v in row.items()}
            for row in result.rows
        ]
        return {"status": "success", "data": rows, "columns": result.columns}
    except Exception as e:
        return {"status": "error", "message": f"Failed to fetch table data: {mask_password(str(e))}"}
