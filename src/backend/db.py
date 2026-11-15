"""Database access for SQLite (local development, tests) and PostgreSQL (Tiger Data in production).

The target is a SQLite file path or a Postgres URL (postgres://... / postgresql://...), normally from
DATABASE_URL. Callers always write SQLite-style SQL with `?` placeholders and use `cur.lastrowid`,
`row["column"]` / `row[0]`; the Postgres wrapper below translates, so the rest of the app is unchanged.
"""
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import current_app, g

SCHEMA = Path(__file__).with_name("schema.sql")


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def is_postgres(target: str) -> bool:
    return str(target).startswith(("postgres://", "postgresql://"))


def describe(target: str) -> str:
    """Where the data lives, without the password (for logs)."""
    if is_postgres(target):
        return "Postgres at " + re.sub(r"^.*@", "", str(target)).split("?")[0]
    return f"SQLite file {target}"


# --------------------------------------------------------------------------- Postgres wrapper
class PgRow(tuple):
    """A row usable like sqlite3.Row: row[0], row["name"], row.keys(), dict(row)."""

    def __new__(cls, names, values):
        row = super().__new__(cls, values)
        row._index = {n: i for i, n in enumerate(names)}
        return row

    def __getitem__(self, key):
        if isinstance(key, str):
            return tuple.__getitem__(self, self._index[key])
        return tuple.__getitem__(self, key)

    def keys(self):
        return list(self._index)


def _row_factory(cursor):
    names = [d.name for d in cursor.description] if cursor.description else []
    return lambda values: PgRow(names, values)


# Tables with an identity `id` column: INSERTs into them get `RETURNING id` so `cur.lastrowid` works.
_ID_TABLES = {"users", "books", "chapters", "checkpoints", "notes", "notifications", "push_subscriptions",
              "catalog_books", "chapter_questions", "llm_summaries"}
_INSERT = re.compile(r"^\s*INSERT\s+INTO\s+(\w+)", re.IGNORECASE)


def _translate(sql: str, has_params: bool) -> tuple[str, bool]:
    """SQLite-style SQL -> psycopg SQL. Returns (sql, wants_id)."""
    if has_params:
        sql = sql.replace("%", "%%").replace("?", "%s")
    m = _INSERT.match(sql)
    wants_id = bool(m) and m.group(1).lower() in _ID_TABLES and "returning" not in sql.lower()
    if wants_id:
        sql = sql.rstrip().rstrip(";") + " RETURNING id"
    return sql, wants_id


class PgCursor:
    def __init__(self, cursor, wants_id: bool):
        self._cur = cursor
        self.lastrowid = None
        if wants_id:
            row = cursor.fetchone()  # None when ON CONFLICT DO NOTHING skipped the insert
            self.lastrowid = row[0] if row else None

    @property
    def rowcount(self):
        return self._cur.rowcount

    def fetchone(self):
        return self._cur.fetchone() if self._cur.description else None

    def fetchall(self):
        return self._cur.fetchall() if self._cur.description else []

    def __iter__(self):
        return iter(self.fetchall())


class PgConnection:
    """psycopg connection with the small sqlite3 surface this app uses. Either opens its own connection
    (`url`) or wraps one borrowed from a pool (`conn` + `release`, which hands it back on close)."""

    def __init__(self, url: str | None = None, conn=None, release=None):
        if conn is None:
            import psycopg

            conn = psycopg.connect(url, row_factory=_row_factory, connect_timeout=15)
        self._con, self._release = conn, release

    def execute(self, sql: str, params=()):
        sql, wants_id = _translate(sql, bool(params))
        try:
            cur = self._con.cursor()
            cur.execute(sql, tuple(params) if params else None)
            return PgCursor(cur, wants_id)
        except Exception:
            # Postgres aborts the whole transaction after an error; SQLite doesn't. Roll back so the
            # connection stays usable for callers that catch the error (e.g. a duplicate email).
            self._con.rollback()
            raise

    def executemany(self, sql: str, seq):
        rows = [tuple(r) for r in seq]
        if not rows:
            return PgCursor(self._con.cursor(), False)
        sql, _ = _translate(sql, True)
        sql = re.sub(r"\s+RETURNING id$", "", sql)
        try:
            cur = self._con.cursor()
            cur.executemany(sql, rows)
            return PgCursor(cur, False)
        except Exception:
            self._con.rollback()
            raise

    def executescript(self, script: str):
        self._con.execute(script)

    def commit(self):
        self._con.commit()

    def rollback(self):
        self._con.rollback()

    def close(self):
        if self._release is not None:
            try:
                self._con.rollback()  # never hand back a connection mid-transaction
            finally:
                self._release()
                self._release = None
            return
        self._con.close()


# One small pool per database URL: a hosted database is far away, and opening a new encrypted connection for
# every request costs several hundred milliseconds.
_pools: dict = {}


def _pool(url: str):
    if url not in _pools:
        import os

        from psycopg_pool import ConnectionPool

        _pools[url] = ConnectionPool(
            url, min_size=1, max_size=int(os.environ.get("DB_POOL_SIZE", 5)),
            kwargs={"row_factory": _row_factory, "connect_timeout": 15},
            # Retire connections idle for 5 minutes, before the server would drop them; this avoids a
            # health-check round trip on every request.
            max_idle=300, reconnect_timeout=30, open=True, name="toward-the-light",
        )
    return _pools[url]


def close_pools() -> None:
    """Close every pool (tests, shutdown)."""
    while _pools:
        _pools.popitem()[1].close()


# --------------------------------------------------------------------------- connections
def connect(target: str):
    """Standalone connection (CLI, background scheduler); request code uses get_db()."""
    if is_postgres(target):
        return PgConnection(target)
    con = sqlite3.connect(target, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def get_db():
    """The request's connection. On Postgres it is borrowed from the pool and returned at the end of the request."""
    if "db" not in g:
        target = current_app.config["DATABASE"]
        if is_postgres(target) and current_app.config.get("DB_POOL", True):
            pool = _pool(target)
            conn = pool.getconn()
            g.db = PgConnection(conn=conn, release=lambda: pool.putconn(conn))
        else:
            g.db = connect(target)
    return g.db


def close_db(_exc=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


# --------------------------------------------------------------------------- schema
# Columns added after a table first shipped: (table, column, definition). CREATE TABLE IF NOT EXISTS
# does not change existing tables, so these are added in place on older databases.
MIGRATIONS = [
    ("catalog_books", "sources", "TEXT NOT NULL DEFAULT '{}'"),  # {"summary_url": ..., "chapters_url": ...}
    ("catalog_books", "slug", "TEXT"),                            # stable id: curated:dune-1, gutenberg:1342
    ("catalog_books", "series", "TEXT"),                          # e.g. 'Dune' for its three parts
    ("catalog_books", "part", "INTEGER"),
    ("books", "catalog_slug", "TEXT"),                            # which catalogue entry a shelf book came from
    ("users", "token_hash", "TEXT"),                              # sign-up: hash of the device's private key
    ("users", "signed_up_at", "TEXT"),
]
# Indexes on migrated columns can only be created after the columns exist.
POST_MIGRATION = [
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_slug ON catalog_books(slug)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_token ON users(token_hash)",
]


def postgres_schema(sql: str) -> str:
    """The SQLite schema, in Postgres dialect."""
    sql = re.sub(r"PRAGMA[^;]*;", "", sql)
    return sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY")


def init_db(target: str) -> None:
    schema = SCHEMA.read_text(encoding="utf-8")
    if is_postgres(target):
        con = PgConnection(target)
        con.executescript(postgres_schema(schema))
        for table, column, definition in MIGRATIONS:
            con.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}")
        for statement in POST_MIGRATION:
            con.execute(statement)
        con.commit()
        con.close()
        return
    Path(target).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(target)
    con.executescript(schema)
    for table, column, definition in MIGRATIONS:
        existing = {r[1] for r in con.execute(f"PRAGMA table_info({table})")}
        if existing and column not in existing:
            con.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    for statement in POST_MIGRATION:
        con.execute(statement)
    con.commit()
    con.close()
