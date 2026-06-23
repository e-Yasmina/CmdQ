import json
import urllib.parse
import re
from typing import Any
from langchain_core.tools import tool
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from sqlalchemy import text, create_engine


def create_sql_agent(
    llm: BaseChatModel,
    system_prompt: str,
    db_config: Any,
    protected_items: list[str],
    session_context: list[str],
    max_iterations: int = 10
):
    safe_user = urllib.parse.quote_plus(db_config.user)
    safe_password = urllib.parse.quote_plus(db_config.password)

    @tool
    def execute_sql(query: str) -> str:
        """Execute a SQL query on the connected database and return results as JSON."""
        upper = query.upper()
        if any(kw in upper for kw in ["DROP ", "ALTER ", "TRUNCATE "]):
            return "BLOCKED BY SAFETY SYSTEM: Destructive commands are not allowed."
        if "DELETE " in upper and "WHERE " not in upper:
            return "BLOCKED BY SAFETY SYSTEM: DELETE without WHERE is not allowed."

        for p in protected_items:
            p_bare = p.split("::")[-1]
            if p_bare.lower() in query.lower():
                return f"BLOCKED BY SAFETY SYSTEM: '{p_bare}' is protected."

        if db_config.db_type == "postgres":
            base_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{db_config.host}:{db_config.port}/"
            db_name = db_config.database if db_config.database else "postgres"
        else:
            base_url = f"mysql+mysqlconnector://{safe_user}:{safe_password}@{db_config.host}:{db_config.port}/"
            db_name = db_config.database

        engine = create_engine(base_url + db_name)
        try:
            with engine.begin() as conn:
                for ctx_cmd in session_context:
                    if ctx_cmd.strip():
                        conn.execute(text(ctx_cmd))
                result = conn.execute(text(query))
                if result.returns_rows:
                    rows = result.fetchall()
                    keys = list(result.keys())
                    return json.dumps([dict(zip(keys, row)) for row in rows], default=str)
                return "Query executed successfully (no rows returned)."
        except Exception as e:
            return f"SQL Error: {str(e)}"

    graph = create_agent(
        model=llm,
        tools=[execute_sql],
        system_prompt=system_prompt
    )

    return graph
