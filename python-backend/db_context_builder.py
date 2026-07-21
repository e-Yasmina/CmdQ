"""
Database context builder for AI prompts.
Handles schema extraction from the database and construction of prompt context strings.
"""

import json
import re
from typing import Optional
from database import get_db_connection
from sqlalchemy import text
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from sql_safety_checker import SQLSafetyChecker
from models import ProtectionItem


def extract_schema(db_type, host, port, user, password, database):
    """
    Extracts full schema metadata from the database.

    Returns dict:
        {schema_name: {table_name: {
            columns: [str],
            column_info: {col_name: {"nullable": bool}},
            has_rls: bool,
            constraints: [{name, type, definition}]
        }}}
    """
    session = get_db_connection(
        db_type=db_type,
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=database
    )

    try:
        schema_dict = {}

        if db_type == "postgres":
            query = """
                SELECT
                    c.table_schema,
                    c.table_name,
                    c.column_name,
                    c.is_nullable,
                    pgc.relrowsecurity as has_rls
                FROM information_schema.columns c
                JOIN information_schema.tables t
                  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
                JOIN pg_class pgc ON pgc.relname = t.table_name
                JOIN pg_namespace pgn ON pgn.oid = pgc.relnamespace AND pgn.nspname = t.table_schema
                WHERE c.table_schema NOT IN ('information_schema', 'pg_catalog')
                  AND t.table_type = 'BASE TABLE'
                ORDER BY c.table_schema, c.table_name, c.ordinal_position;
            """
        else:
            query = """
                SELECT c.table_schema, c.table_name, c.column_name, c.is_nullable, false as has_rls
                FROM information_schema.columns c
                JOIN information_schema.tables t
                  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
                WHERE c.table_schema = DATABASE()
                  AND t.table_type = 'BASE TABLE'
                ORDER BY c.table_schema, c.table_name, c.ordinal_position;
            """

        result = session.execute(text(query)).fetchall()
        for row in result:
            schema_name, table_name, col_name, is_nullable, has_rls = row[0], row[1], row[2], row[3], row[4]
            nullable = is_nullable == "YES"
            if schema_name not in schema_dict:
                schema_dict[schema_name] = {}
            if table_name not in schema_dict[schema_name]:
                schema_dict[schema_name][table_name] = {
                    "columns": [],
                    "column_info": {},
                    "has_rls": bool(has_rls),
                    "constraints": []
                }
            schema_dict[schema_name][table_name]["columns"].append(col_name)
            schema_dict[schema_name][table_name]["column_info"][col_name] = {"nullable": nullable}

        if db_type == "postgres":
            constr_query = """
                SELECT
                    tc.table_schema,
                    tc.table_name,
                    tc.constraint_name,
                    tc.constraint_type,
                    pg_get_constraintdef(c.oid) AS definition
                FROM information_schema.table_constraints AS tc
                JOIN pg_namespace n ON n.nspname = tc.table_schema
                JOIN pg_class cl ON cl.relname = tc.table_name AND cl.relnamespace = n.oid
                JOIN pg_constraint c ON c.conrelid = cl.oid AND c.conname = tc.constraint_name
                WHERE tc.table_schema NOT IN ('information_schema', 'pg_catalog');
            """
        else:
            constr_query = """
                SELECT table_schema, table_name, constraint_name, constraint_type, '' as definition
                FROM information_schema.table_constraints
                WHERE table_schema = DATABASE();
            """

        constr_result = session.execute(text(constr_query)).fetchall()
        for row in constr_result:
            s_name, t_name, c_name, c_type, c_def = str(row[0]), str(row[1]), str(row[2]), str(row[3]), str(row[4])

            if s_name in schema_dict and t_name in schema_dict[s_name]:
                schema_dict[s_name][t_name]["constraints"].append({
                    "name": c_name,
                    "type": c_type,
                    "definition": c_def
                })
                continue

            s_low, t_low = s_name.lower(), t_name.lower()
            s_match = next((k for k in schema_dict.keys() if k.lower() == s_low), None)
            if s_match:
                t_match = next((k for k in schema_dict[s_match].keys() if k.lower() == t_low), None)
                if t_match:
                    schema_dict[s_match][t_match]["constraints"].append({
                        "name": c_name,
                        "type": c_type,
                        "definition": c_def
                    })

        return schema_dict

    finally:
        session.close()


def build_metadata_str(schema_dict):
    """Builds a human-readable summary of table counts per schema."""
    parts = []
    if isinstance(schema_dict, dict):
        for s_name, tables in schema_dict.items():
            if isinstance(tables, dict):
                parts.append(f"Schema '{s_name}' contains exactly {len(tables)} tables.")
    return " ".join(parts)


def build_schema_json_str(schema_dict, max_chars=10000):
    """Builds a JSON string of the schema, truncated if too large."""
    schema_json_str = json.dumps(schema_dict)
    if len(schema_json_str) > max_chars:
        schema_json_str = schema_json_str[:max_chars] + "... [TRUNCATED]"
    return schema_json_str


def build_protection_instruction(protected_items):
    """Builds the protection instruction for the prompt from a list of protected item IDs."""
    if not protected_items:
        return ""
    prot_list = ", ".join([f"'{p.split('::')[-1]}'" for p in protected_items])
    return (
        f"URGENT ABSOLUTE RULE: The following databases, schemas, or tables are PROTECTED "
        f"and strictly forbidden to be accessed or modified: {prot_list}. "
        f"You MUST NEVER generate queries targeting them.\n\n"
    )


def build_session_context_instr(session_context):
    """Builds the session context instruction showing SET commands auto-executed before SQL."""
    if not session_context:
        return ""
    ctx_cmds = "\n".join(session_context)
    return (
        f"ACTIVE SESSION CONTEXT (These commands are automatically executed before your generated SQL, "
        f"so you don't need to repeat them):\n{ctx_cmds}\n\n"
    )


def get_attached_file_prompt(attached_file):
    """Builds the attached file context section for the prompt."""
    if not attached_file:
        return ""
    name = attached_file.get("name", "unknown")
    ftype = attached_file.get("type", "unknown")
    content = attached_file.get("content", "")
    if not content:
        return ""
    max_chars = 50000
    if len(content) > max_chars:
        content = content[:max_chars] + f"\n... [TRUNCATED to {max_chars} characters]"
    return f"The user attached a file '{name}' (type: {ftype}). File contents:\n{content}\n\n"


def build_chat_history_str(chat_history):
    """Builds the chat history section for the prompt."""
    if not chat_history:
        return ""
    lines = [f"{msg.role}: {msg.content}" for msg in chat_history]
    return "Previous Conversation History:\n" + "\n".join(lines) + "\n\n"


BASE_PROMPT_TEMPLATE = PromptTemplate(
    input_variables=[
        "database", "db_type", "metadata_str", "schema_json_str",
        "protection_instruction", "session_context_instr",
        "attached_str", "history_str", "user_prompt"
    ],
    template=(
        "You are an autonomous AI database engineer. You are currently connected to the "
        "'{database}' {db_type} database. "
        "Unless the user explicitly specifies another database, assume all queries and operations "
        "should be performed on the '{database}' database.\n"
        "Given this database schema:\n"
        "{metadata_str}\n"
        "Schema JSON: {schema_json_str}\n\n"
        "{protection_instruction}"
        "{session_context_instr}"
        "{attached_str}"
        "IMPORTANT: When filtering by names (e.g., first_name, last_name), exact string matches "
        "often fail due to trailing spaces or casing. You MUST prioritize using their primary ID "
        "(like employee_id) if available. If you only have a name, ALWAYS use fuzzy matching "
        "(e.g., ILIKE '%%name%%') and consider running an `-- INVESTIGATE` query first to fetch "
        "their exact ID before proceeding.\n\n"
        "{history_str}"
        "User request: {user_prompt}\n\n"
        "Provide your answer. IF you determine that a SQL query needs to be executed "
        "(to read, insert, seed, or modify data), you MUST output it wrapped exactly in "
        "```sql ... ``` block.\n"
        "IMPORTANT: If you need to run a diagnostic SELECT query to investigate the schema or "
        "data states before performing the final action, "
        "you MUST add the exact comment `-- INVESTIGATE` inside your SQL block. The system will "
        "execute it and give you the results so you can continue. "
        "HOWEVER, investigation is ONLY a means to an end. You MUST eventually perform the final "
        "action (INSERT, UPDATE, etc.) requested by the user in the same session. "
        "Do NOT stop after an investigation; use the results to complete the task immediately.\n"
        "CRITICAL: When you are completely finished with the ENTIRE task, you MUST output the "
        "exact token: __CMDQ_DONE__"
    )
)


def build_base_prompt(db_config, schema_dict, protected_items, session_context,
                      attached_file, chat_history, user_prompt, relationships=None):
    """Builds the complete base prompt for the AI from all context components.

    Args:
        protected_items: List of ProtectionItem dicts (with 'id' and 'level' keys).
        relationships: Optional list of FK relationship dicts for FK-aware filtering.
    """
    # Filter schema based on protection rules before building prompt
    checker = SQLSafetyChecker([p.dict() if hasattr(p, 'dict') else p for p in (protected_items or [])])
    has_protection = any(
        (p.level if hasattr(p, 'level') else (p.get("level", "full") if isinstance(p, dict) else "full")) != "none"
        for p in (protected_items or [])
    )
    if has_protection:
        if relationships:
            schema_dict = checker.filter_schema_for_fk(schema_dict, relationships)
        else:
            schema_dict = checker.filter_schema(schema_dict)

    metadata_str = build_metadata_str(schema_dict)
    schema_json_str = build_schema_json_str(schema_dict)

    # Only include protection instruction for partial protection (readonly/insert/update/delete)
    # For full protection, tables are already hidden from schema
    partial_items = []
    for p in (protected_items or []):
        level = p.level if hasattr(p, 'level') else (p.get("level", "full") if isinstance(p, dict) else "full")
        if level not in ("full", "none"):
            bare = (p.id if hasattr(p, 'id') else p.get("id", "")).split("::")[-1]
            partial_items.append(f"'{bare}' ({level})")
    if partial_items:
        prot_list = ", ".join(partial_items)
        protection_instruction = (
            f"IMPORTANT: The following items have restricted access: {prot_list}. "
            f"Respect their permissions — only perform allowed operations on them.\n\n"
        )
    else:
        protection_instruction = ""

    session_context_instr = build_session_context_instr(session_context)
    history_str = build_chat_history_str(chat_history)
    attached_str = get_attached_file_prompt(attached_file)

    return BASE_PROMPT_TEMPLATE.format(
        database=db_config.database,
        db_type=db_config.db_type,
        metadata_str=metadata_str,
        schema_json_str=schema_json_str,
        protection_instruction=protection_instruction,
        session_context_instr=session_context_instr,
        attached_str=attached_str,
        history_str=history_str,
        user_prompt=user_prompt
    )


def extract_and_build_prompt(db_config, protected_items, session_context,
                             attached_file, chat_history, user_prompt):
    """Convenience function: extracts schema from DB and builds the full base prompt."""
    schema_dict = extract_schema(
        db_type=db_config.db_type,
        host=db_config.host,
        port=db_config.port,
        user=db_config.user,
        password=db_config.password,
        database=db_config.database
    )

    # Extract relationships for FK-aware protection filtering
    relationships = None
    has_protection = any(
        (p.level if hasattr(p, 'level') else (p.get("level", "full") if isinstance(p, dict) else "full")) != "none"
        for p in (protected_items or [])
    )
    if has_protection:
        relationships = extract_relationships(
            db_type=db_config.db_type,
            host=db_config.host,
            port=db_config.port,
            user=db_config.user,
            password=db_config.password,
            database=db_config.database
        )

    return build_base_prompt(
        db_config=db_config,
        schema_dict=schema_dict,
        protected_items=protected_items,
        session_context=session_context,
        attached_file=attached_file,
        chat_history=chat_history,
        user_prompt=user_prompt,
        relationships=relationships
    )

    # TODO: In a future enhancement, the frontend should only send lightweight info
    # (selected table, action type, etc.) and the backend will fetch schema data
    # directly from the database using extract_schema(), eliminating the round-trip
    # of sending full schema JSON to the frontend and back.


def extract_relationships(db_type, host, port, user, password, database):
    """
    Extracts all foreign key relationships across the database.

    Returns a list of dicts:
        [{
            "constraint_name": str,
            "source_schema": str,
            "source_table": str,
            "source_column": str,
            "referenced_schema": str,
            "referenced_table": str,
            "referenced_column": str
        }, ...]
    """
    session = get_db_connection(
        db_type=db_type,
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=database
    )

    try:
        if db_type == "postgres":
            query = """
                SELECT
                    tc.constraint_name,
                    tc.table_schema AS source_schema,
                    tc.table_name AS source_table,
                    kcu.column_name AS source_column,
                    ccu.table_schema AS referenced_schema,
                    ccu.table_name AS referenced_table,
                    ccu.column_name AS referenced_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_catalog = kcu.constraint_catalog
                    AND tc.constraint_schema = kcu.constraint_schema
                    AND tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_catalog = ccu.constraint_catalog
                    AND tc.constraint_schema = ccu.constraint_schema
                    AND tc.constraint_name = ccu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema NOT IN ('information_schema', 'pg_catalog')
                ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position;
            """
        else:
            query = """
                SELECT
                    tc.constraint_name,
                    tc.table_schema AS source_schema,
                    tc.table_name AS source_table,
                    kcu.column_name AS source_column,
                    COALESCE(kcu.referenced_table_schema, tc.table_schema) AS referenced_schema,
                    kcu.referenced_table_name AS referenced_table,
                    kcu.referenced_column_name AS referenced_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_catalog = kcu.constraint_catalog
                    AND tc.constraint_schema = kcu.constraint_schema
                    AND tc.constraint_name = kcu.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = DATABASE()
                ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position;
            """

        result = session.execute(text(query)).fetchall()
        relationships = []
        for row in result:
            relationships.append({
                "constraint_name": str(row[0]),
                "source_schema": str(row[1]),
                "source_table": str(row[2]),
                "source_column": str(row[3]),
                "referenced_schema": str(row[4]),
                "referenced_table": str(row[5]),
                "referenced_column": str(row[6])
            })
        return relationships

    finally:
        session.close()


def extract_focused_schema(db_type, host, port, user, password, database,
                            schema_name, table_name):
    """
    Extracts schema for only the specified table and tables related via foreign keys.

    Returns the same format as extract_schema() but filtered to:
      - The specified table itself
      - Tables that have FK relationships to/from the specified table
    """
    schema_dict = extract_schema(
        db_type=db_type, host=host, port=port,
        user=user, password=password, database=database
    )
    relationships = extract_relationships(
        db_type=db_type, host=host, port=port,
        user=user, password=password, database=database
    )

    related = {(schema_name, table_name)}
    for rel in relationships:
        if rel["source_schema"] == schema_name and rel["source_table"] == table_name:
            related.add((rel["referenced_schema"], rel["referenced_table"]))
        if rel["referenced_schema"] == schema_name and rel["referenced_table"] == table_name:
            related.add((rel["source_schema"], rel["source_table"]))

    focused = {}
    for s_name, tables in schema_dict.items():
        for t_name, t_info in tables.items():
            if (s_name, t_name) in related:
                if s_name not in focused:
                    focused[s_name] = {}
                focused[s_name][t_name] = t_info

    return focused


def get_table_relationships(db_type, host, port, user, password, database,
                            schema_name, table_name):
    """
    Returns all foreign key relationships for a specific table (both directions).

    Returns dict:
        {
            "schema": schema_name,
            "table": table_name,
            "outgoing_fks": [{...}],   # FKs from this table to others
            "incoming_fks": [{...}]    # FKs from other tables pointing to this table
        }
    """
    all_relationships = extract_relationships(
        db_type=db_type,
        host=host,
        port=port,
        user=user,
        password=password,
        database=database
    )

    outgoing = []
    incoming = []

    for rel in all_relationships:
        if rel["source_schema"] == schema_name and rel["source_table"] == table_name:
            outgoing.append(rel)
        if rel["referenced_schema"] == schema_name and rel["referenced_table"] == table_name:
            incoming.append(rel)

    return {
        "schema": schema_name,
        "table": table_name,
        "outgoing_fks": outgoing,
        "incoming_fks": incoming
    }


def parse_table_mentions(text):
    """
    Extracts all @schema.table or @table mentions from text.

    Returns a list of (schema, table) tuples.
    Defaults schema to 'public' when only @table is given.
    """
    matches = re.findall(r'@(\w+(?:\.\w+)?)', text)
    result = []
    seen = set()
    for m in matches:
        if '.' in m:
            schema, table = m.split('.', 1)
        else:
            schema, table = "public", m
        key = (schema, table)
        if key not in seen:
            seen.add(key)
            result.append(key)
    return result


def build_mentioned_tables_context(db_type, host, port, user, password, database,
                                    mentions, schema_dict=None, all_relationships=None,
                                    target_table=None):
    """
    For each (schema, table) mention, returns columns, constraints,
    and FK relationships as a formatted context string.

    Labels the primary target table vs reference tables.
    Shows NOT NULL columns and full FK chain (1 level deep).

    Pass pre-fetched schema_dict and all_relationships to avoid redundant DB queries.
    Pass target_table = (schema, table) to distinguish the primary action target.
    """
    if not mentions:
        return ""

    if schema_dict is None:
        schema_dict = extract_schema(
            db_type=db_type, host=host, port=port,
            user=user, password=password, database=database
        )
    if all_relationships is None:
        all_relationships = extract_relationships(
            db_type=db_type, host=host, port=port,
            user=user, password=password, database=database
        )

    lines = ["Referenced tables context:"]

    referenced_table_fks = {}

    for schema_name, table_name in mentions:
        table_info = schema_dict.get(schema_name, {}).get(table_name)
        if not table_info:
            lines.append(f"\n  @{schema_name}.{table_name}: table not found")
            continue

        is_target = target_table is not None and (schema_name, table_name) == target_table
        label = "PRIMARY TARGET" if is_target else "REFERENCE"

        cols = table_info.get("columns", [])
        col_info = table_info.get("column_info", {})
        constraints = table_info.get("constraints", [])

        outgoing = []
        incoming = []
        for rel in all_relationships:
            if rel["source_schema"] == schema_name and rel["source_table"] == table_name:
                outgoing.append(rel)
            if rel["referenced_schema"] == schema_name and rel["referenced_table"] == table_name:
                incoming.append(rel)

        referenced_table_fks[(schema_name, table_name)] = outgoing

        lines.append(f"\n  [{label}] @{schema_name}.{table_name}")
        for col in cols:
            nullable = col_info.get(col, {}).get("nullable", True)
            nn = " (NOT NULL)" if not nullable else ""
            lines.append(f"    Column: {col}{nn}")
        if table_info.get("has_rls"):
            lines.append(f"    RLS: enabled (DO NOT disable)")
        for c in constraints:
            c_def = f" ({c['definition']})" if c.get('definition') else ""
            lines.append(f"    Constraint: {c['name']} ({c['type']}){c_def}")
        for r in outgoing:
            lines.append(f"    FK: {r['source_column']} -> {r['referenced_schema']}.{r['referenced_table']}.{r['referenced_column']}")
        for r in incoming:
            lines.append(f"    Referenced by: {r['source_schema']}.{r['source_table']}.{r['source_column']}")

        if is_target:
            lines.append(f"    ACTION: This is the table to modify (target of the user's request)")

    transitive = []
    for (s_name, t_name), fks in referenced_table_fks.items():
        for r in fks:
            ref_schema = r["referenced_schema"]
            ref_table = r["referenced_table"]
            key = (ref_schema, ref_table)
            if key not in {(m[0], m[1]) for m in mentions}:
                transitive.append(key)

    if transitive:
        lines.append("")
        transitive = list(set(transitive))
        for ref_schema, ref_table in transitive:
            t_info = schema_dict.get(ref_schema, {}).get(ref_table)
            if not t_info:
                continue
            t_cols = t_info.get("columns", [])
            t_col_info = t_info.get("column_info", {})
            t_constr = t_info.get("constraints", [])
            lines.append(f"\n  [TRANSITIVE FK TARGET] @{ref_schema}.{ref_table}")
            for col in t_cols:
                nullable = t_col_info.get(col, {}).get("nullable", True)
                nn = " (NOT NULL)" if not nullable else ""
                lines.append(f"    Column: {col}{nn}")
            for c in t_constr:
                c_def = f" ({c['definition']})" if c.get('definition') else ""
                lines.append(f"    Constraint: {c['name']} ({c['type']}){c_def}")

    lines.append("")
    return "\n".join(lines)


class SecurityAnalysis(BaseModel):
    risk_level: str = Field(description="Overall risk level: low, medium, high, or critical")
    findings: list[str] = Field(description="List of specific security findings")
    recommendations: list[str] = Field(description="Actionable recommendations to address findings")


class PerformanceAnalysis(BaseModel):
    bottlenecks: list[str] = Field(description="Identified performance bottlenecks")
    recommendations: list[str] = Field(description="Actionable tuning recommendations")
    severity: str = Field(description="Overall performance severity: low, medium, high")


class DataAnalysis(BaseModel):
    data_quality_issues: list[str] = Field(description="Notable data quality or skew issues found")
    structural_notes: list[str] = Field(description="Structural characteristics or schema observations")


class SummaryAnalysis(BaseModel):
    description: str = Field(description="Brief summary of the target's structure and footprint")
    key_metrics: list[str] = Field(description="Key metrics that characterize the target")


ANALYSIS_PARSERS = {
    "security": PydanticOutputParser(pydantic_object=SecurityAnalysis),
    "performance": PydanticOutputParser(pydantic_object=PerformanceAnalysis),
    "data": PydanticOutputParser(pydantic_object=DataAnalysis),
    "summary": PydanticOutputParser(pydantic_object=SummaryAnalysis),
}


def run_structured_analysis(llm: BaseChatModel, analysis_type: str, prompt: str) -> tuple[str, Optional[BaseModel]]:
    """
    Invokes the LLM with the given prompt and attempts to parse a structured response.
    Returns (raw_text, structured_model_or_None).
    The raw_text is always available as fallback.
    """
    parser = ANALYSIS_PARSERS.get(analysis_type)
    if not parser:
        response = llm.invoke(prompt)
        return response.content, None

    format_instructions = parser.get_format_instructions()
    structured_prompt = f"{prompt}\n\nRespond in this format:\n{format_instructions}"

    try:
        response = llm.invoke(structured_prompt)
        raw = response.content
        parsed = parser.invoke(response)
        return raw, parsed
    except Exception:
        response = llm.invoke(prompt)
        return response.content, None
