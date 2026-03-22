import traceback
from sqlalchemy import create_engine, text
import urllib.parse
import re

DB_HOST = "localhost"
DB_PORT = 5432
DB_USER = "postgres"
DB_PASS = "postgres" # Assuming default postgres
safe_user = urllib.parse.quote_plus(DB_USER)
safe_password = urllib.parse.quote_plus(DB_PASS)

ai_sql = """
CREATE DATABASE auto_test_unique_db_2;
CREATE TABLE users_old (id serial primary key, fname varchar, lname varchar, age_string varchar);
INSERT INTO users_old (fname, lname, age_string) VALUES ('John', 'Doe', '25');
"""

statements = [s.strip() for s in ai_sql.split(';') if s.strip()]

current_db = "postgres"

try:
    for stmt in statements:
        # Clean psql commands
        stmt = "\n".join([line for line in stmt.split("\n") if not line.strip().startswith("\\c ") and not line.strip().startswith("\\connect ")])
        if not stmt.strip():
            continue
            
        print(f"\nEvaluating: {stmt}")
            
        new_db_name = None
        db_match = re.search(r'CREATE\s+DATABASE\s+([a-zA-Z0-9_]+)', stmt, re.IGNORECASE)
        if db_match:
            new_db_name = db_match.group(1).strip('"\'`')
            
        # Connect
        temp_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{DB_HOST}:{DB_PORT}/{current_db}"
        engine = create_engine(temp_url, isolation_level="AUTOCOMMIT")
        print(f"Executing against DB context: {current_db}")
        
        with engine.connect() as conn:
            result = conn.execute(text(stmt))
            if result.returns_rows:
                print("Result rows:", len(result.fetchall()))
        
        if new_db_name:
            print(f"--> Switch Context to: {new_db_name}")
            current_db = new_db_name
            
    print("FINISHED SCRIPT SUCCESFULLY")
except Exception as e:
    print("ERROR DURING SCRIPT:", str(e))
    with open("error.log", "w") as f:
        traceback.print_exc(file=f)

# Verify where tables went
print("\nVerification step:")
try:
    check_engine = create_engine(f"postgresql+psycopg2://{safe_user}:{safe_password}@{DB_HOST}:{DB_PORT}/auto_test_db")
    with check_engine.connect() as check_conn:
        res = check_conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"))
        print(f"Tables in auto_test_db: {[row[0] for row in res]}")
except Exception as e:
    print(f"Verify Error: {e}")
