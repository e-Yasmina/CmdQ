import re
import json
from typing import Callable, Dict, Any

from fastapi import APIRouter
from sqlalchemy import text

from database import get_db_connection
from cli_client import invoke_llm_structured
from helpers import validate_identifier
from models import ProtectionAnalysisRequest, AnalysisRequest
from secret_utils import mask_password

router = APIRouter()

AnalysisCollector = Callable[[Any, Any, AnalysisRequest, Dict], None]
AnalysisPromptBuilder = Callable[[str], str]

# ── MetricsCollector — reusable metric queries ────────────────────────────

class MetricsCollector:
    """Reusable metric-gathering methods for database analysis.

    Handles Postgres/MySQL branching internally. Each method returns None
    on query failure, letting callers decide how to handle missing data.
    """

    def __init__(self, session, db_type: str):
        self.session = session
        self.db_type = db_type
        self.is_pg = db_type == "postgres"

    def _one(self, query: str, params: dict = None):
        try:
            return self.session.execute(text(query), params or {}).fetchone()
        except Exception:
            return None

    def _all(self, query: str, params: dict = None):
        try:
            return self.session.execute(text(query), params or {}).fetchall()
        except Exception:
            return []

    # ── Individual metric methods ──────────────────────────────────────

    def table_columns(self, table_name: str, schema_name: str = None):
        """List of (column_name, data_type, is_nullable, column_default [, column_key])."""
        if self.is_pg:
            q = "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = :t AND table_schema = :s"
            return self._all(q, {"t": table_name, "s": schema_name or "public"})
        q = "SELECT column_name, data_type, is_nullable, column_default, column_key FROM information_schema.columns WHERE table_name = :t AND table_schema = DATABASE()"
        return self._all(q, {"t": table_name})

    def table_size(self, table_name: str, schema_name: str = None):
        """Return (total_bytes, data_bytes, index_bytes) or None."""
        if self.is_pg:
            q = "SELECT pg_total_relation_size(quote_ident(:s) || '.' || quote_ident(:t)) as total, pg_relation_size(quote_ident(:s) || '.' || quote_ident(:t)) as data"
            row = self._one(q, {"s": schema_name or "public", "t": table_name})
            return (row[0], row[1], row[0] - row[1]) if row else None
        q = "SELECT data_length, index_length, table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :t"
        row = self._one(q, {"t": table_name})
        return (row[0] + row[1], row[0], row[1]) if row else None

    def table_scan_stats(self, table_name: str, schema_name: str = None):
        """Postgres-only: (seq_scan, seq_tup_read, idx_scan, idx_tup_fetch) or None."""
        if not self.is_pg:
            return None
        return self._one(
            "SELECT seq_scan, seq_tup_read, idx_scan, idx_tup_fetch FROM pg_stat_user_tables WHERE schemaname = :s AND relname = :t",
            {"s": schema_name or "public", "t": table_name},
        )

    def table_activity(self, table_name: str, schema_name: str = None):
        """Postgres-only: (n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup) or None."""
        if not self.is_pg:
            return None
        return self._one(
            "SELECT n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE schemaname = :s AND relname = :t",
            {"s": schema_name or "public", "t": table_name},
        )

    def total_rows(self, table_name: str, schema_name: str = None):
        """Approximate row count for a table."""
        if self.is_pg:
            row = self._one(
                "SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname = :s AND relname = :t",
                {"s": schema_name or "public", "t": table_name},
            )
            return row[0] if row else None
        row = self._one(
            "SELECT table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :t",
            {"t": table_name},
        )
        return row[0] if row else None

    def table_count(self):
        """Total number of user tables in the database."""
        if self.is_pg:
            row = self._one("SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog')")
        else:
            row = self._one("SELECT count(*) FROM information_schema.tables WHERE table_schema = DATABASE()")
        return row[0] if row else 0

    def largest_tables(self, limit: int = 10):
        """Largest tables by row count."""
        if self.is_pg:
            rows = self._all("SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT :limit", {"limit": limit})
        else:
            rows = self._all("SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_rows DESC LIMIT :limit", {"limit": limit})
        return [{"name": str(r[0]), "rows": int(r[1] or 0)} for r in rows] if rows else []

    def database_size(self, database_name: str):
        """Total database size in bytes."""
        if self.is_pg:
            row = self._one("SELECT pg_database_size(:d)", {"d": database_name})
            return row[0] if row else 0
        row = self._one("SELECT SUM(data_length + index_length) FROM information_schema.tables WHERE table_schema = DATABASE()")
        return row[0] if row and row[0] is not None else 0

    def database_stats(self, database_name: str):
        """pg_stat_database aggregate (blks_hit, blks_read, xact_commit, xact_rollback, conflicts, deadlocks)."""
        if not self.is_pg:
            return None
        return self._one(
            "SELECT blks_hit, blks_read, xact_commit, xact_rollback, conflicts, deadlocks FROM pg_stat_database WHERE datname = :d",
            {"d": database_name},
        )

    def active_connections(self, database_name: str):
        """(total_connections, active_queries) for the database."""
        if self.is_pg:
            row = self._one(
                "SELECT count(*) as active, sum(case when state = 'active' then 1 else 0 end) as executing FROM pg_stat_activity WHERE datname = :d",
                {"d": database_name},
            )
            return (row[0] or 0, row[1] or 0) if row else (0, 0)
        threads = self._one("SHOW GLOBAL STATUS LIKE 'Threads_connected'")
        running = self._one("SHOW GLOBAL STATUS LIKE 'Threads_running'")
        return (int(threads[1]) if threads else 0, int(running[1]) if running else 0)

    def max_connections(self):
        """max_connections configuration value."""
        if self.is_pg:
            row = self._one("SHOW max_connections")
            return int(row[0]) if row else 100
        row = self._one("SHOW VARIABLES LIKE 'max_connections'")
        return int(row[1]) if row else 151

    def table_grants(self, table_name: str):
        """Postgres-only: list of {grantee, privilege}."""
        if not self.is_pg:
            return []
        rows = self._all("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = :t", {"t": table_name})
        return [{"grantee": r[0], "privilege": r[1]} for r in rows] if rows else []

    def table_constraints(self, table_name: str, schema_name: str = None):
        """List of {name, type} for the table."""
        if self.is_pg:
            rows = self._all("SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = :t", {"t": table_name})
        else:
            rows = self._all("SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = :t AND table_schema = DATABASE()", {"t": table_name})
        return [{"name": r[0], "type": r[1]} for r in rows] if rows else []

    def user_roles(self):
        """Database users: {admins: list[str], total_users: int} or None."""
        if self.is_pg:
            rows = self._all("SELECT rolname, rolsuper FROM pg_roles")
            if rows:
                admins = [str(r[0]) for r in rows if r[1] is True]
                return {"admins": admins, "total_users": len(rows)}
            return None
        rows = self._all("SELECT user, Super_priv FROM mysql.user")
        if rows:
            admins = [str(r[0]) for r in rows if r[1] == 'Y']
            return {"admins": admins, "total_users": len(rows)}
        return None

    def primary_keys(self, table_name: str, schema_name: str = None):
        """List of primary key column names."""
        if self.is_pg:
            q = """
                SELECT a.attname
                FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                WHERE i.indrelid = (quote_ident(:s) || '.' || quote_ident(:t))::regclass
                AND i.indisprimary
            """
            rows = self._all(q, {"s": schema_name or "public", "t": table_name})
            return [str(r[0]) for r in rows] if rows else []
        cols = self.table_columns(table_name, schema_name)
        return [str(r[0]) for r in cols if len(r) > 4 and r[4] == 'PRI'] if cols else []


# ── Shared analysis pipeline ──────────────────────────────────────────────

async def _run_analysis(req: AnalysisRequest, analysis_type: str,
                        collect_metrics: AnalysisCollector,
                        build_prompt: AnalysisPromptBuilder,
                        timeout: int = 300):
    cfg = req.db_config
    session = None
    metrics = {
        "level": "table" if req.table_name else "database",
        "target": req.table_name or cfg.database,
    }
    try:
        session = get_db_connection(
            db_type=cfg.db_type, host=cfg.host, port=cfg.port,
            user=cfg.user, password=cfg.password, dbname=cfg.database
        )
        collect_metrics(session, cfg, req, metrics)
        session.close()
    except Exception as e:
        if session: session.close()
        return {"status": "error", "message": mask_password(str(e))}

    ai_summary = ""
    structured_analysis = None
    if req.command:
        raw_json_metrics = json.dumps(metrics)
        prompt_str = build_prompt(raw_json_metrics)
        try:
            output, structured_analysis = invoke_llm_structured(
                req.command, prompt_str, analysis_type, timeout=timeout
            )
            ai_summary = output
        except Exception as e:
            ai_summary = f"Failed to generate {analysis_type} analysis: {mask_password(str(e))}"

    return {"status": "success", "metrics": metrics, "ai_summary": ai_summary, "structured_analysis": structured_analysis}


# ── Security ──────────────────────────────────────────────────────────────

SECURITY_SENSITIVE_KEYWORDS = ['pass', 'token', 'secret', 'email', 'ssn', 'key', 'card', 'phone']


def _collect_security(session, cfg, req, metrics):
    collector = MetricsCollector(session, cfg.db_type)
    if req.table_name:
        cols = collector.table_columns(req.table_name, req.schema_name)
        sensitive_cols = []
        for r in cols:
            col = str(r[0]).lower()
            if any(kw in col for kw in SECURITY_SENSITIVE_KEYWORDS):
                sensitive_cols.append({"column": r[0], "type": r[1]})
        metrics["sensitive_columns"] = sensitive_cols
        metrics["total_columns"] = len(cols)
        metrics["constraints"] = collector.table_constraints(req.table_name, req.schema_name)
        metrics["permissions"] = collector.table_grants(req.table_name)
    else:
        roles = collector.user_roles()
        if roles:
            metrics["admins"] = roles["admins"]
            metrics["total_users"] = roles["total_users"]
        else:
            metrics["permissions_error"] = "Could not query user roles."


def _build_prompt_security(raw_json: str) -> str:
    return (
        f"Analyze the following security metrics: {raw_json}. "
        "Provide a brief, concise security risk assessment and simple recommendations if any. "
        "Use plain text or light markdown. Do not mention any of the files, backend code, "
        "or python files (like main.py or database.py) you might have read in your response. "
        "Just provide the insights directly to the user. "
        "VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
    )


@router.post("/analyze/security")
async def analyze_security(req: AnalysisRequest):
    return await _run_analysis(req, "security", _collect_security, _build_prompt_security, timeout=420)


# ── Performance ───────────────────────────────────────────────────────────

def _collect_performance(session, cfg, req, metrics):
    collector = MetricsCollector(session, cfg.db_type)
    if req.table_name:
        size = collector.table_size(req.table_name, req.schema_name)
        if size:
            metrics["total_size_bytes"], metrics["table_size_bytes"], metrics["index_size_bytes"] = size
        elif collector.is_pg:
            metrics["size_error"] = "Could not retrieve table size."

        if cfg.db_type == "postgres":
            scan = collector.table_scan_stats(req.table_name, req.schema_name)
            if scan:
                metrics["seq_scans"] = scan[0]
                metrics["idx_scans"] = scan[2]
                total_scans = (scan[0] or 0) + (scan[2] or 0)
                metrics["idx_scan_ratio"] = (scan[2] / total_scans) if total_scans > 0 else 0
            else:
                metrics["seq_scans"] = 0
                metrics["idx_scan_ratio"] = 0

            act = collector.table_activity(req.table_name, req.schema_name)
            if act:
                metrics["inserts"] = act[0]
                metrics["updates"] = act[1]
                metrics["deletes"] = act[2]
                metrics["live_rows"] = act[3]
                metrics["dead_rows"] = act[4]
                metrics["bloat_ratio"] = (act[4] / (act[3] + act[4])) if (act[3] + act[4]) > 0 else 0

        rows = collector.total_rows(req.table_name, req.schema_name)
        if rows is not None:
            metrics["live_rows"] = rows
    else:
        if cfg.db_type == "postgres":
            db = collector.database_stats(cfg.database)
            if db:
                hits = db[0] or 0
                reads = db[1] or 0
                metrics["cache_hits"] = hits
                metrics["disk_reads"] = reads
                metrics["cache_hit_ratio"] = hits / (hits + reads) if (hits + reads) > 0 else 0
                metrics["commits"] = db[2]
                metrics["rollbacks"] = db[3]
                metrics["conflicts"] = db[4]
                metrics["deadlocks"] = db[5]
            else:
                metrics["stat_error"] = "Could not retrieve database stats."
        else:
            try:
                reads = session.execute(text("SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_reads';")).fetchone()
                reqs = session.execute(text("SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read_requests';")).fetchone()
                if reads and reqs:
                    r = int(reads[1])
                    q = int(reqs[1])
                    hits = q - r
                    metrics["cache_hits"] = hits
                    metrics["disk_reads"] = r
                    metrics["cache_hit_ratio"] = hits / q if q > 0 else 0
            except Exception:
                pass

        conns = collector.active_connections(cfg.database)
        if conns:
            metrics["total_connections"], metrics["active_queries"] = conns
        metrics["max_connections"] = collector.max_connections()

        if not collector.is_pg:
            size = collector.database_size(cfg.database)
            if size:
                metrics["database_size_bytes"] = size


def _build_prompt_performance(raw_json: str) -> str:
    return (
        f"Analyze these performance metrics: {raw_json}. "
        "Identify bottlenecks based on cache hit ratio, index usage, active connections, or lock conflicts. "
        "Provide a brief actionable performance tuning assessment. Don't mention specific commands, just the tuning concept. "
        "Do not mention any of the files, backend code, or python files (like main.py or database.py) "
        "you might have read in your response. Just provide the insights directly to the user. "
        "VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
    )


@router.post("/analyze/performance")
async def analyze_performance(req: AnalysisRequest):
    return await _run_analysis(req, "performance", _collect_performance, _build_prompt_performance)


# ── Data ──────────────────────────────────────────────────────────────────

def _collect_data(session, cfg, req, metrics):
    collector = MetricsCollector(session, cfg.db_type)
    if req.table_name:
        table_name = validate_identifier(req.table_name, "table name")
        cols = collector.table_columns(req.table_name, req.schema_name)
        metrics["total_columns"] = len(cols)
        total_rows = collector.total_rows(req.table_name, req.schema_name) or 0
        metrics["total_rows"] = total_rows

        sampled_columns = cols[:10]
        completeness = {}
        if total_rows > 0 and sampled_columns:
            schema = req.schema_name or "public"
            if collector.is_pg:
                union_parts = [
                    f'SELECT :c{i} AS col_name, count("{r[0]}") AS non_nulls, count(distinct "{r[0]}") AS unique_vals FROM "{schema}"."{table_name}"'
                    for i, r in enumerate(sampled_columns)
                ]
                c_q = " UNION ALL ".join(union_parts)
                params = {f"c{i}": r[0] for i, r in enumerate(sampled_columns)}
            else:
                union_parts = [
                    f"SELECT :c{i} AS col_name, count(`{r[0]}`) AS non_nulls, count(distinct `{r[0]}`) AS unique_vals FROM `{table_name}`"
                    for i, r in enumerate(sampled_columns)
                ]
                c_q = " UNION ALL ".join(union_parts)
                params = {f"c{i}": r[0] for i, r in enumerate(sampled_columns)}
            try:
                c_rows = session.execute(text(c_q), params).fetchall()
                for cr in c_rows:
                    col_name, non_nulls, unique_vals = cr[0], cr[1], cr[2]
                    dtype = next((r[1] for r in sampled_columns if r[0] == col_name), "unknown")
                    completeness[col_name] = {
                        "fill_rate": (non_nulls or 0) / total_rows,
                        "unique_ratio": (unique_vals or 0) / total_rows if total_rows > 0 else 0,
                        "type": dtype
                    }
            except Exception:
                pass
        metrics["column_stats"] = completeness
    else:
        metrics["largest_tables"] = collector.largest_tables()
        metrics["total_db_rows"] = sum(t["rows"] for t in metrics["largest_tables"])
        metrics["total_tables"] = collector.table_count()


def _build_prompt_data(raw_json: str) -> str:
    return (
        f"Analyze these data quality and volume metrics: {raw_json}. "
        "Identify any notable data skew, missing values, fill rates, unique ratios, or table sizing insights. "
        "Provide a concise data assessment emphasizing structural characteristics or potential data quality red flags. "
        "Do not mention any of the files, backend code, or python files you might have read in your response. "
        "Just provide the insights directly to the user. "
        "VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
    )


@router.post("/analyze/data")
async def analyze_data(req: AnalysisRequest):
    return await _run_analysis(req, "data", _collect_data, _build_prompt_data)


# ── Summary ───────────────────────────────────────────────────────────────

def _collect_summary(session, cfg, req, metrics):
    collector = MetricsCollector(session, cfg.db_type)
    if req.table_name:
        size = collector.table_size(req.table_name, req.schema_name)
        metrics["total_size_bytes"] = size[0] if size else 0

        rows = collector.total_rows(req.table_name, req.schema_name)
        metrics["approx_rows"] = rows if rows is not None else 0

        cols = collector.table_columns(req.table_name, req.schema_name)
        metrics["columns"] = [{"name": r[0], "type": r[1], "nullable": r[2] == 'YES', "default": r[3]} for r in cols]
        metrics["primary_keys"] = collector.primary_keys(req.table_name, req.schema_name)
    else:
        metrics["database_size_bytes"] = collector.database_size(cfg.database)
        metrics["total_tables"] = collector.table_count()
    metrics["db_engine"] = cfg.db_type


def _build_prompt_summary(raw_json: str) -> str:
    return (
        f"Provide a comprehensive summary based on these metrics: {raw_json}. "
        "Briefly describe its structure, schema complexity, or overall footprint. "
        "Do not mention any of the files, backend code, or python files (like main.py or database.py) "
        "you might have read in your response. Just provide the summary directly to the user. "
        "VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
    )


@router.post("/analyze/summary")
async def analyze_summary(req: AnalysisRequest):
    return await _run_analysis(req, "summary", _collect_summary, _build_prompt_summary)


# ── Protection (RLS) ──────────────────────────────────────────────────────

@router.post("/analyze/protection")
async def analyze_protection(req: ProtectionAnalysisRequest):
    try:
        session = get_db_connection(
            db_type=req.db_config.db_type, host=req.db_config.host,
            port=req.db_config.port, user=req.db_config.user,
            password=req.db_config.password, dbname=req.db_config.database
        )
        report = {
            "is_protected": False,
            "mechanisms": [],
            "suggested_steps": [],
            "details": {}
        }
        if req.db_config.db_type == "postgres":
            rls_query = """
                SELECT c.relrowsecurity, c.relforcerowsecurity
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
                            match = re.search(r"current_setting\(\s*'([^']+)'", qual)
                            if match:
                                var_name = match.group(1)
                                if var_name not in [s.split()[1] for s in report["suggested_steps"] if "SET" in s]:
                                    report["suggested_steps"].append(f"SET {var_name} = 'demo'; -- Adjust value as needed")
            if "search_path" not in str(report["suggested_steps"]) and req.schema_name != "public":
                report["suggested_steps"].append(f'SET search_path TO "{req.schema_name}", public;')
        session.close()
        return {"status": "success", "report": report}
    except Exception as e:
        if 'session' in locals(): session.close()
        return {"status": "error", "message": mask_password(str(e))}
