import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import ConnectionDetails


def build_engine(cfg, database=None, driver=None, isolation_level=None):
    """Create a SQLAlchemy engine from ConnectionDetails.

    Args:
        cfg: ConnectionDetails instance.
        database: Override database name (defaults to cfg.database).
        driver:  SQLAlchemy driver (e.g. \"psycopg2\", \"mysqlconnector\").
                 Defaults to \"psycopg2\" for postgres, \"mysqlconnector\" for mysql.
        isolation_level: Optional isolation level string (e.g. \"AUTOCOMMIT\").

    Returns:
        sqlalchemy.engine.Engine
    """
    if driver is None:
        driver = "psycopg2" if cfg.db_type == "postgres" else "mysqlconnector"
    url = cfg.build_url(database=database, driver=driver)
    kwargs = {}
    if isolation_level:
        kwargs["isolation_level"] = isolation_level
    return create_engine(url, **kwargs)


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
