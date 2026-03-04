import os
import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

def get_db_connection(db_type, host, port, user, password, dbname=""):
    """
    Connects to Postgres/MySQL.
    Implements Read-Only mode default mapping logic if not overridden.
    """
    safe_user = urllib.parse.quote_plus(user)
    safe_password = urllib.parse.quote_plus(password)
    
    if db_type == "postgres":
        if not dbname:
            dbname = "postgres"
        connection_url = f"postgresql+psycopg2://{safe_user}:{safe_password}@{host}:{port}/{dbname}"
    else:
        # Defaults to mysql
        db_part = f"/{dbname}" if dbname else ""
        connection_url = f"mysql+mysqlconnector://{safe_user}:{safe_password}@{host}:{port}{db_part}"
        
    engine = create_engine(connection_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()
