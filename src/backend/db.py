"""SQLite access. Swap this module's internals to move to Postgres / Tiger Data later."""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import current_app, g

SCHEMA = Path(__file__).with_name("schema.sql")


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: str) -> sqlite3.Connection:
    """Standalone connection (CLI, background scheduler); request code uses get_db()."""
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect(current_app.config["DATABASE"])
    return g.db


def close_db(_exc=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


# Columns added after a table first shipped: (table, column, definition). CREATE TABLE IF NOT EXISTS
# does not change existing tables, so these are added in place on older databases.
MIGRATIONS = [
    ("catalog_books", "sources", "TEXT NOT NULL DEFAULT '{}'"),  # {"summary_url": ..., "chapters_url": ...}
]


def init_db(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.executescript(SCHEMA.read_text(encoding="utf-8"))
    for table, column, definition in MIGRATIONS:
        existing = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
        if existing and column not in existing:
            con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    con.commit()
    con.close()
