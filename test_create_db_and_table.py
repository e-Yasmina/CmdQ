import asyncio
from sqlalchemy import create_engine, text
import urllib.parse
import os

DB_HOST = "localhost"
DB_PORT = 5432
DB_USER = "postgres"
DB_PASS = "postgres"

safe_user = urllib.parse.quote_plus(DB_USER)
safe_password = urllib.parse.quote_plus(DB_PASS)

# Connect to the default 'postgres' database
connection_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{DB_HOST}:{DB_PORT}/postgres"
engine = create_engine(connection_url, isolation_level="AUTOCOMMIT")

# The AI generated script to create DB and seed tables
# (This represents the exact extracted_sql from the /ai/prompt endpoint)
ai_generated_sql = """
DROP DATABASE IF EXISTS auto_test_db;
CREATE DATABASE auto_test_db;
CREATE TABLE test_auto_users (id INT, name VARCHAR);
"""

print("1. Running AI generated SQL script against default 'postgres' connection...")
try:
    with engine.connect() as conn:
        conn.execute(text(ai_generated_sql))
    print("Execution successful!")
except Exception as e:
    print(f"Error executing script: {e}")

print("\n2. Checking where 'test_auto_users' was actually created...")

# Check if table exists in 'postgres' database (where connection started)
postgres_tables = []
with engine.connect() as conn:
    res = conn.execute(text(f"SELECT table_name FROM information_schema.tables WHERE table_name = 'test_auto_users'"))
    postgres_tables = [row[0] for row in res]

print(f"Tables found in 'postgres' DB: {postgres_tables}")

# Check if table exists in 'auto_test_db' database (where user actually wanted it)
test_db_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{DB_HOST}:{DB_PORT}/auto_test_db"
try:
    test_engine = create_engine(test_db_url)
    with test_engine.connect() as conn:
        res = conn.execute(text(f"SELECT table_name FROM information_schema.tables WHERE table_name = 'test_auto_users'"))
        test_db_tables = [row[0] for row in res]
    print(f"Tables found in 'auto_test_db' DB: {test_db_tables}")
except Exception as e:
    print(f"Error connecting to auto_test_db: {e}")

print("\nCONCLUSION:")
if postgres_tables and not test_db_tables:
    print("BUG REPRODUCED: The table was created in the original 'postgres' database context rather than the newly created 'auto_test_db'.")
    print("This confirms PostgreSQL does not switch database context dynamically during a single script execution over a static connection.")
elif test_db_tables:
    print("The table was mysteriously created in the correct database!?")
