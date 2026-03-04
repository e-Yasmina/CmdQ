import re
import subprocess
import json
from typing import Dict, Any

def execute_ai_cli(prompt: str, model: str, api_key: str, schema_json: Dict[str, Any]) -> str:
    """
    Subprocess execution of Gemini/Qwen CLI.
    """
    # Placeholder for `subprocess.run(["gemini", "generate", "--prompt", engineered_prompt])`
    # Returning a mock SQL execution
    mock_sql = "SELECT id, name FROM users LIMIT 10;"
    return mock_sql

def is_safe_sql(sql_query: str) -> bool:
    """
    Blocks destructive queries and regex matches.
    - If AI generates DROP TABLE, TRUNCATE, or DELETE FROM without WHERE clause, block it.
    """
    upper_query = sql_query.upper()
    if "DROP TABLE" in upper_query or "TRUNCATE" in upper_query:
        return False
        
    if "DELETE FROM" in upper_query and "WHERE" not in upper_query:
        return False
        
    return True
