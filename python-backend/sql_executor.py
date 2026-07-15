import logging
from typing import Any, Optional

from sqlalchemy import text

from database import build_engine
from models import ConnectionDetails

logger = logging.getLogger("cmdq-backend")


class SqlResult:
    """Standardized result container from SQL execution."""

    def __init__(self, rows=None, rowcount=0, returns_rows=False, error=None):
        self.rows = rows or []
        self.rowcount = rowcount
        self.returns_rows = returns_rows
        self.error = error

    @property
    def is_error(self):
        return self.error is not None

    def __bool__(self):
        return not self.is_error


class SqlExecutor:
    """Unified SQL executor with consistent result serialization, error handling, and logging.

    Consolidates raw SQL execution patterns that were duplicated across query, table_data,
    import, export, ETL, and agent_tools endpoints.
    """

    def __init__(self, cfg: ConnectionDetails):
        self.cfg = cfg

    def execute(
        self,
        sql: str,
        params: Optional[dict] = None,
        database: Optional[str] = None,
        isolation_level: Optional[str] = None,
        session_context: Optional[list[str]] = None,
        max_rows: Optional[int] = None,
    ) -> SqlResult:
        """Execute SQL and return a standardized SqlResult.

        - Creates engine via build_engine() (reuses P1.5 factory)
        - Uses engine.begin() for auto-commit/rollback
        - Applies session_context SET commands before the main query
        - Serializes result rows to list[dict] preserving native types
        - Wraps all exceptions in SqlResult.error

        Args:
            sql: SQL statement to execute.
            params: Bound parameter dictionary.
            database: Override database name (for DDL against bootstrap DB, etc.).
            isolation_level: Transaction isolation level (e.g. "AUTOCOMMIT").
            session_context: List of SET/SESSION commands to run before the query.
            max_rows: Maximum rows to fetch (used by agent_tools safety limit).

        Returns:
            SqlResult with .rows (list[dict]), .rowcount, .returns_rows, .error.
        """
        try:
            engine = build_engine(
                self.cfg,
                database=database,
                isolation_level=isolation_level,
            )
            with engine.begin() as conn:
                if session_context:
                    for cmd in session_context:
                        if cmd and cmd.strip():
                            try:
                                conn.execute(text(cmd))
                            except Exception as ctx_err:
                                logger.warning(
                                    "Session context command '%s' failed: %s",
                                    cmd[:80],
                                    ctx_err,
                                )

                result = conn.execute(text(sql), params or {})
                raw_rowcount = result.rowcount
                rowcount = raw_rowcount if raw_rowcount and raw_rowcount > 0 else 0
                if result.returns_rows:
                    keys = list(result.keys())
                    if max_rows is not None:
                        rows = [
                            dict(zip(keys, row))
                            for row in result.fetchmany(max_rows)
                        ]
                    else:
                        rows = [
                            dict(zip(keys, row))
                            for row in result.fetchall()
                        ]
                    return SqlResult(rows=rows, rowcount=rowcount, returns_rows=True)
                return SqlResult(rowcount=rowcount)

        except MemoryError:
            return SqlResult(
                error="Result set too large. Add a LIMIT clause to your query."
            )
        except Exception as e:
            logger.error("SQL execution failed: %s", str(e))
            return SqlResult(error=str(e))

    def execute_ddl(self, sql: str, database: Optional[str] = None) -> SqlResult:
        """Execute DDL statements with AUTOCOMMIT isolation."""
        return self.execute(sql, database=database, isolation_level="AUTOCOMMIT")
