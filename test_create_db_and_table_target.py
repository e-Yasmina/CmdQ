import asyncio
from sqlalchemy import create_engine, text
import urllib.parse
import re
import traceback

DB_HOST = "localhost"
DB_PORT = 5432
DB_USER = "postgres"
DB_PASS = "password"
DB_PASS = "postgres"

safe_user = urllib.parse.quote_plus(DB_USER)
safe_password = urllib.parse.quote_plus(DB_PASS)

# This simulates exactly what the AI generates:
extracted_sql = """
CREATE DATABASE etl_test_target;
\\c etl_test_target
CREATE TABLE users_new_schema (id serial primary key, full_name varchar, age_integer integer);
"""

print("1. Parsing SQL exactly like main.py ai_prompt endpoint...")
raw_statements = [s.strip() for s in extracted_sql.split(';') if s.strip()]
statements = []
force_switch_db = None

for s in raw_statements:
    cleaned_lines = []
    for line in s.split("\n"):
        l_strip = line.strip()
        if l_strip.startswith("\\c ") or l_strip.startswith("\\connect "):
            parts = l_strip.split()
            if len(parts) >= 2:
                force_switch_db = parts[1].replace(';', '').replace('"', '').replace("'", "").replace('`', '').strip()
                print(f"Detected explicit switch to: {force_switch_db}")
        else:
            cleaned_lines.append(line)
            
    cleaned_stmt = "\n".join(cleaned_lines)
    if cleaned_stmt.strip():
        statements.append(cleaned_stmt.strip())

print("Parsed statements:", statements)

current_db = "postgres"
if force_switch_db:
    current_db = force_switch_db
    print(f"Force switching DB initialized to: {current_db}")

try:
    for stmt in statements:
        new_db_name = None
        db_match = re.search(r'CREATE\s+DATABASE\s+([a-zA-Z0-9_]+)', stmt, re.IGNORECASE)
        if db_match:
            new_db_name = db_match.group(1).replace('"', '').replace("'", "").replace('`', '').strip()
            print(f"Detected CREATE DATABASE: {new_db_name}")
            
        temp_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{DB_HOST}:{DB_PORT}/{current_db}"
        print(f"Executing against: {temp_url}")
        
        engine = create_engine(temp_url, isolation_level="AUTOCOMMIT")
        with engine.connect() as conn:
            conn.execute(text(stmt))
            
        if new_db_name:
            current_db = new_db_name
            print(f"Updated current_db to: {current_db}")
            
    print("Execution Success!")
except Exception as e:
    print(f"Error executing script: {e}")
    traceback.print_exc()

# Let's verify where tables went
for test_db in ["postgres", "etl_test_target"]:
    print(f"\\nChecking tables in {test_db}...")
    try:
        check_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{DB_HOST}:{DB_PORT}/{test_db}"
        check_engine = create_engine(check_url)
        with check_engine.connect() as conn:
            res = conn.execute(text(f"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
            tables = [row[0] for row in res]
            print(f"Tables in '{test_db}': {tables}")
    except Exception as e:
        print(f"Could not connect or check: {e}")
