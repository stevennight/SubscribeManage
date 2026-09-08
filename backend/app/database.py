"""Database connection and session management."""
import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

logger = logging.getLogger(__name__)

# Handle SQLite-specific connect args
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the initial schema. ``create_all`` creates missing tables
# but never alters existing ones, so new columns on old tables are added here.
_ADDED_COLUMNS = {
    "payment_history": {
        "cost_unified_actual": "NUMERIC(12, 2)",
    },
    "subscriptions": {
        "rate_asof": "DATE",
    },
}


def _run_migrations():
    """Lightweight, idempotent schema top-up for existing databases."""
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            if table not in tables:
                continue  # create_all() will build it fresh with all columns
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in columns.items():
                if name in existing:
                    continue
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                logger.info("Migration: added %s.%s", table, name)


def init_db():
    """Create all database tables, then apply incremental column migrations."""
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _run_migrations()
