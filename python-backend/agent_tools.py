import json
from typing import Any
from langchain_core.tools import tool
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel

from sql_executor import SqlExecutor
from sql_safety_checker import SQLSafetyChecker


def create_sql_agent(
    llm: BaseChatModel,
    system_prompt: str,
    db_config: Any,
    protected_items: list,
    session_context: list[str],
    max_iterations: int = 10
):
    checker = SQLSafetyChecker(protected_items)

    @tool
    def execute_sql(query: str) -> str:
        """Execute a SQL query on the connected database and return results as JSON."""
        is_safe, error = checker.check_all(query, context="agent")
        if not is_safe:
            return f"BLOCKED BY SAFETY SYSTEM: {error}"

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
