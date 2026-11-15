"""Run the whole suite against PostgreSQL (the Tiger Data engine) by setting TEST_POSTGRES_URL, e.g.

    TEST_POSTGRES_URL=postgresql://user:pass@localhost:5432/postgres python -m pytest

Every SQLite path a test uses is mapped to its own fresh Postgres database, so the same tests prove the app
works on both. Without TEST_POSTGRES_URL nothing changes (SQLite)."""
import os
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

ADMIN_URL = os.environ.get("TEST_POSTGRES_URL", "").strip()
_mapped: dict[str, str] = {}
_created: list[str] = []


def _pg_for(path: str) -> str:
    """The Postgres database standing in for a test's SQLite file (created on first use)."""
    if path not in _mapped:
        import psycopg

        name = "t_" + uuid.uuid4().hex[:12]
        with psycopg.connect(ADMIN_URL, autocommit=True) as con:
            con.execute(f"CREATE DATABASE {name}")
        base, _, query = ADMIN_URL.partition("?")
        _mapped[path] = base.rsplit("/", 1)[0] + "/" + name + (f"?{query}" if query else "")
        _created.append(name)
    return _mapped[path]


@pytest.fixture(autouse=True)
def _postgres(monkeypatch):
    if not ADMIN_URL:
        yield
        return
    import app as app_module
    import seed

    real_create, real_seed = app_module.create_app, seed.run

    def create_app(config=None):
        config = dict(config or {})
        if config.get("DATABASE") and not str(config["DATABASE"]).startswith("postgres"):
            config["DATABASE"] = _pg_for(str(config["DATABASE"]))
            # Each test has its own throwaway database; a pool per database would exhaust the server's
            # connections. The pool itself is covered by test_db_pool.py.
            config.setdefault("DB_POOL", False)
        return real_create(config)

    def seed_run(path, reset=False):
        return real_seed(_pg_for(str(path)) if not str(path).startswith("postgres") else path, reset)

    monkeypatch.setattr(app_module, "create_app", create_app)
    monkeypatch.setattr(seed, "run", seed_run)
    for mod in list(sys.modules.values()):  # test modules imported `create_app` by name
        if getattr(mod, "__name__", "").startswith(("test_", "tests.")) and getattr(mod, "create_app", None) is real_create:
            monkeypatch.setattr(mod, "create_app", create_app)
    yield


def pytest_sessionfinish(session, exitstatus):
    if not ADMIN_URL or not _created:
        return
    import psycopg

    with psycopg.connect(ADMIN_URL, autocommit=True) as con:
        for name in _created:
            con.execute(f"DROP DATABASE IF EXISTS {name} WITH (FORCE)")
