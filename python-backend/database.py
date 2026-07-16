import time
import threading
import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import ConnectionDetails

# ── Engine cache ───────────────────────────────────────────────────────────

_engine_cache: dict = {}
_engine_cache_lock = threading.Lock()
_ENGINE_CACHE_TTL = 300  # seconds


def _cache_key(cfg, database=None, driver=None, isolation_level=None):
    return (
        cfg.db_type, cfg.host, cfg.port, cfg.user, cfg.password,
        database or cfg.database, driver or "psycopg2" if cfg.db_type == "postgres" else "mysqlconnector",
        isolation_level,
    )


def build_engine(cfg, database=None, driver=None, isolation_level=None):
    """Create (or reuse) a SQLAlchemy engine from ConnectionDetails.

    Engines are cached using a ``(connection_details, database, driver,
    isolation_level)`` key with a 5-minute TTL.  Callers **must not** modify
    the returned engine's configuration.

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
    key = _cache_key(cfg, database, driver, isolation_level)
    now = time.time()

    with _engine_cache_lock:
        entry = _engine_cache.get(key)
        if entry and (now - entry["ts"]) < _ENGINE_CACHE_TTL:
            return entry["engine"]
        url = cfg.build_url(database=database, driver=driver)
        kwargs = {"pool_size": 5, "max_overflow": 10}
        if isolation_level:
            kwargs["isolation_level"] = isolation_level
        engine = create_engine(url, **kwargs)
        _engine_cache[key] = {"engine": engine, "ts": now}
        return engine


def clear_engine_cache():
    """Dispose all cached engines and clear the cache."""
    with _engine_cache_lock:
        for entry in _engine_cache.values():
            entry["engine"].dispose()
        _engine_cache.clear()


def get_db_connection(db_type, host, port, user, password, dbname=""):
    """
    Connects to Postgres/MySQL.
    Reuses cached engines when possible.
    """
    cfg = ConnectionDetails(
        db_type=db_type, host=host, port=port,
        user=user, password=password, database=dbname or ""
    )
    engine = build_engine(cfg, database=dbname or None)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()
