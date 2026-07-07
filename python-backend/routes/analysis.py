import re
import json

from fastapi import APIRouter
from sqlalchemy import text

from database import get_db_connection
from cli_client import invoke_llm_structured
from helpers import validate_identifier
from models import (
    ProtectionAnalysisRequest, SecurityAnalysisRequest,
    PerformanceAnalysisRequest, DataAnalysisRequest, SummaryAnalysisRequest
)
from secret_utils import mask_password

router = APIRouter()


@router.post("/analyze/protection")
async def analyze_protection(req: ProtectionAnalysisRequest):
    try:
        session = get_db_connection(
            db_type=req.db_config.db_type,
            host=req.db_config.host,
            port=req.db_config.port,
            user=req.db_config.user,
            password=req.db_config.password,
            dbname=req.db_config.database
        )
        report = {
            "is_protected": False,
            "mechanisms": [],
            "suggested_steps": [],
            "details": {}
        }
        if req.db_config.db_type == "postgres":
            rls_query = """
                SELECT 
                    c.relrowsecurity, 
                    c.relforcerowsecurity
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


@router.post("/analyze/security")
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
            else:
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
                    metrics["permissions_error"] = mask_password(str(e))
            else:
                roles_q = "SELECT user, Super_priv FROM mysql.user;"
                try:
                    roles_res = session.execute(text(roles_q)).fetchall()
                    metrics["admins"] = [str(r[0]) for r in roles_res if r[1] == 'Y']
                    metrics["total_users"] = len(roles_res)
                except Exception as e:
                    metrics["permissions_error"] = mask_password(str(e))
        session.close()
    except Exception as e:
        session.close()
        return {"status": "error", "message": mask_password(str(e))}

    ai_summary = ""
    structured_analysis = None
    if req.command:
        raw_json_metrics = json.dumps(metrics)
        prompt_str = f"Analyze the following security metrics for {metrics['level']} '{metrics['target']}': {raw_json_metrics}. Provide a brief, concise security risk assessment and simple recommendations if any. Use plain text or light markdown. Do not mention any of the files, backend code, or python files (like main.py or database.py) you might have read in your response. Just provide the insights directly to the user. VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
        try:
            output, structured_analysis = invoke_llm_structured(req.command, prompt_str, "security", timeout=420)
            ai_summary = output
        except Exception as e:
            ai_summary = f"Failed to generate AI analysis: {mask_password(str(e))}"
    return {"status": "success", "metrics": metrics, "ai_summary": ai_summary, "structured_analysis": structured_analysis}


@router.post("/analyze/performance")
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
                size_q = "SELECT pg_total_relation_size(quote_ident(:s) || '.' || quote_ident(:t)) as total_size, pg_relation_size(quote_ident(:s) || '.' || quote_ident(:t)) as table_size;"
                try:
                    size_res = session.execute(text(size_q), {"s": schema_name, "t": req.table_name}).fetchone()
                    metrics["total_size_bytes"] = size_res[0] if size_res else 0
                    metrics["table_size_bytes"] = size_res[1] if size_res else 0
                    metrics["index_size_bytes"] = metrics["total_size_bytes"] - metrics["table_size_bytes"]
                except Exception as e:
                    metrics["size_error"] = mask_password(str(e))
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
            else:
                size_q = "SELECT data_length, index_length, table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :t;"
                try:
                    size_res = session.execute(text(size_q), {"t": req.table_name}).fetchone()
                    if size_res:
                        metrics["table_size_bytes"] = size_res[0]
                        metrics["index_size_bytes"] = size_res[1]
                        metrics["total_size_bytes"] = size_res[0] + size_res[1]
                        metrics["live_rows"] = size_res[2]
                except Exception as e: pass
        else:
            if cfg.db_type == "postgres":
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
                except Exception as e: metrics["stat_error"] = mask_password(str(e))
                conn_q = "SELECT count(*) as active, sum(case when state = 'active' then 1 else 0 end) as executing FROM pg_stat_activity WHERE datname = :d;"
                try:
                    conn_res = session.execute(text(conn_q), {"d": cfg.database}).fetchone()
                    if conn_res:
                        metrics["total_connections"] = conn_res[0]
                        metrics["active_queries"] = conn_res[1] or 0
                except Exception as e: pass
                try:
                    max_conn_res = session.execute(text("SHOW max_connections;")).fetchone()
                    metrics["max_connections"] = int(max_conn_res[0]) if max_conn_res else 100
                except Exception as e: pass
            else:
                try:
                    threads_res = session.execute(text("SHOW GLOBAL STATUS LIKE 'Threads_connected';")).fetchone()
                    metrics["total_connections"] = int(threads_res[1]) if threads_res else 0
                    running_res = session.execute(text("SHOW GLOBAL STATUS LIKE 'Threads_running';")).fetchone()
                    metrics["active_queries"] = int(running_res[1]) if running_res else 0
                    max_conn_res = session.execute(text("SHOW VARIABLES LIKE 'max_connections';")).fetchone()
                    metrics["max_connections"] = int(max_conn_res[1]) if max_conn_res else 151
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
        return {"status": "error", "message": mask_password(str(e))}

    ai_summary = ""
    structured_analysis = None
    if req.command:
        raw_json_metrics = json.dumps(metrics)
        prompt_str = f"Analyze these performance metrics for {metrics['level']} '{metrics['target']}': {raw_json_metrics}. Identify bottlenecks based on cache hit ratio, index usage, active connections, or lock conflicts. Provide a brief actionable performance tuning assessment. Don't mention specific commands, just the tuning concept. Do not mention any of the files, backend code, or python files (like main.py or database.py) you might have read in your response. Just provide the insights directly to the user. VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
        try:
            output, structured_analysis = invoke_llm_structured(req.command, prompt_str, "performance", timeout=300)
            ai_summary = output
        except Exception as e:
            ai_summary = f"Failed to generate AI performance insight: {mask_password(str(e))}"
    return {"status": "success", "metrics": metrics, "ai_summary": ai_summary, "structured_analysis": structured_analysis}


@router.post("/analyze/data")
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
            table_name = validate_identifier(req.table_name, "table name")
            if cfg.db_type == "postgres":
                schema_name = validate_identifier(req.schema_name or "public", "schema name")
                cols_q = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = :t;"
                cols_res = session.execute(text(cols_q), {"t": table_name}).fetchall()
                metrics["total_columns"] = len(cols_res)
                act_q = "SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname = :s AND relname = :t;"
                act_res = session.execute(text(act_q), {"s": schema_name, "t": table_name}).fetchone()
                total_rows = act_res[0] if act_res and act_res[0] is not None else 0
                metrics["total_rows"] = total_rows
                sampled_columns = cols_res[:10]
                completeness = {}
                if total_rows > 0:
                    for col, dtype in sampled_columns:
                        try:
                            c_q = f'SELECT count("{col}") as non_nulls, count(distinct "{col}") as unique_vals FROM "{schema_name}"."{table_name}"'
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
            else:
                size_q = "SELECT table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :t;"
                size_res = session.execute(text(size_q), {"t": table_name}).fetchone()
                total_rows = size_res[0] if size_res and size_res[0] is not None else 0
                metrics["total_rows"] = total_rows
                cols_q = "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = :t AND table_schema = DATABASE();"
                cols_res = session.execute(text(cols_q), {"t": table_name}).fetchall()
                metrics["total_columns"] = len(cols_res)
                sampled_columns = cols_res[:10]
                completeness = {}
                if total_rows > 0:
                    for col, dtype in sampled_columns:
                        try:
                            c_q = f"SELECT count(`{col}`) as non_nulls, count(distinct `{col}`) as unique_vals FROM `{table_name}`"
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
        else:
            if cfg.db_type == "postgres":
                q = "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;"
                res = session.execute(text(q)).fetchall()
                metrics["largest_tables"] = [{"name": str(r[0]), "rows": int(r[1] or 0)} for r in res]
                metrics["total_db_rows"] = sum(int(r[1] or 0) for r in res)
                q_tables = "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog');"
                t_res = session.execute(text(q_tables)).fetchone()
                metrics["total_tables"] = t_res[0] if t_res else 0
            else:
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
        return {"status": "error", "message": mask_password(str(e))}

    ai_summary = ""
    structured_analysis = None
    if req.command:
        raw_json_metrics = json.dumps(metrics)
        prompt_str = f"Analyze these data quality and volume metrics for {metrics['level']} '{metrics['target']}': {raw_json_metrics}. Identify any notable data skew, missing values, fill rates, unique ratios, or table sizing insights. Provide a concise data assessment emphasizing structural characteristics or potential data quality red flags. Do not mention any of the files, backend code, or python files you might have read in your response. Just provide the insights directly to the user. VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
        try:
            output, structured_analysis = invoke_llm_structured(req.command, prompt_str, "data", timeout=300)
            ai_summary = output
        except Exception as e:
            ai_summary = f"Failed to generate AI output: {mask_password(str(e))}"
    return {"status": "success", "metrics": metrics, "ai_summary": ai_summary, "structured_analysis": structured_analysis}


@router.post("/analyze/summary")
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
            else:
                size_q = "SELECT table_rows, data_length, index_length FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :t;"
                size_res = session.execute(text(size_q), {"t": req.table_name}).fetchone()
                metrics["approx_rows"] = size_res[0] if size_res and size_res[0] is not None else 0
                metrics["total_size_bytes"] = (size_res[1] or 0) + (size_res[2] or 0) if size_res else 0
                cols_q = "SELECT column_name, data_type, is_nullable, column_default, column_key FROM information_schema.columns WHERE table_name = :t AND table_schema = DATABASE();"
                cols_res = session.execute(text(cols_q), {"t": req.table_name}).fetchall()
                metrics["columns"] = [{"name": r[0], "type": r[1], "nullable": r[2] == 'YES', "default": r[3]} for r in cols_res]
                metrics["primary_keys"] = [str(r[0]) for r in cols_res if r[4] == 'PRI']
        else:
            if cfg.db_type == "postgres":
                try:
                    db_size_q = "SELECT pg_database_size(:d);"
                    db_size_res = session.execute(text(db_size_q), {"d": cfg.database}).fetchone()
                    metrics["database_size_bytes"] = db_size_res[0] if db_size_res else 0
                except Exception: metrics["database_size_bytes"] = 0
                q_tables = "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('information_schema', 'pg_catalog');"
                t_res = session.execute(text(q_tables)).fetchone()
                metrics["total_tables"] = t_res[0] if t_res else 0
            else:
                q_size = "SELECT SUM(data_length + index_length) FROM information_schema.tables WHERE table_schema = DATABASE();"
                db_size_res = session.execute(text(q_size)).fetchone()
                metrics["database_size_bytes"] = db_size_res[0] if db_size_res and db_size_res[0] is not None else 0
                q_tables = "SELECT count(*) FROM information_schema.tables WHERE table_schema = DATABASE();"
                t_res = session.execute(text(q_tables)).fetchone()
                metrics["total_tables"] = t_res[0] if t_res else 0
        metrics["db_engine"] = cfg.db_type
        session.close()
    except Exception as e:
        session.close()
        return {"status": "error", "message": mask_password(str(e))}

    ai_summary = ""
    structured_analysis = None
    if req.command:
        raw_json_metrics = json.dumps(metrics)
        prompt_str = f"Provide a comprehensive summary about the {metrics['level']} '{metrics['target']}', based on these metrics: {raw_json_metrics}. Briefly describe its structure, schema complexity, or overall footprint. Do not mention any of the files, backend code, or python files (like main.py or database.py) you might have read in your response. Just provide the summary directly to the user. VERY IMPORTANT: When you are finished with your response, you MUST end with the exact token: __CMDQ_DONE__"
        try:
            output, structured_analysis = invoke_llm_structured(req.command, prompt_str, "summary", timeout=300)
            ai_summary = output
        except Exception as e:
            ai_summary = f"Failed to generate AI output: {mask_password(str(e))}"
    return {"status": "success", "metrics": metrics, "ai_summary": ai_summary, "structured_analysis": structured_analysis}
