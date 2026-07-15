import json
import re
from typing import Any
from langchain_core.tools import tool
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel

from sql_executor import SqlExecutor


def create_sql_agent(
    llm: BaseChatModel,
    system_prompt: str,
    db_config: Any,
    protected_items: list[str],
    session_context: list[str],
    max_iterations: int = 10
):
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

        from secret_utils import mask_password

        try:
            executor = SqlExecutor(db_config)
            sql_result = executor.execute(
                query,
                session_context=session_context,
                max_rows=5000,
            )
            if sql_result.is_error:
                return f"SQL Error: {mask_password(sql_result.error)}"
            if sql_result.returns_rows:
                return json.dumps(sql_result.rows, default=str)
            return "Query executed successfully (no rows returned)."
        except MemoryError:
            return "SQL Error: Result set too large. Add a LIMIT clause to your query."
        except Exception as e:
            return f"SQL Error: {mask_password(str(e))}"

    graph = create_agent(
        model=llm,
        tools=[execute_sql],
        system_prompt=system_prompt
    )

    return graph
