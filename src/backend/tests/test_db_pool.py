"""The Postgres connection pool (only runs with TEST_POSTGRES_URL): connections are reused across requests,
always handed back, and never returned mid-transaction."""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db  # noqa: E402

pytestmark = pytest.mark.skipif(not os.environ.get("TEST_POSTGRES_URL"), reason="needs TEST_POSTGRES_URL")


@pytest.fixture
def pooled_app(tmp_path):
    from app import create_app  # the conftest wrapper maps the path to a fresh Postgres database

    app = create_app({"DATABASE": str(tmp_path / "pool.db"), "TESTING": True, "DB_POOL": True, "LLM": None,
                      "CATALOG_SOURCE": None, "PUSH_SENDER": lambda i, p: "sent"})
    yield app
    db.close_pools()


def test_requests_reuse_pooled_connections(pooled_app):
    c = pooled_app.test_client()
    for _ in range(20):
        assert c.get("/api/books").status_code == 200
    pool = db._pools[pooled_app.config["DATABASE"]]
    stats = pool.get_stats()
    assert stats["pool_size"] <= 5 and stats.get("requests_num", 0) >= 20
    assert stats["pool_available"] == stats["pool_size"]  # every connection was handed back


def test_failed_request_does_not_poison_the_pool(pooled_app):
    c = pooled_app.test_client()
    c.post("/api/signup", json={"name": "A Reader", "email": "a@example.com"})
    assert c.post("/api/signup", json={"name": "B Reader", "email": "a@example.com"}).status_code == 409
    for _ in range(5):  # later requests on the same pooled connections still work
        assert c.get("/api/catalog/search?q=dune").status_code == 200
    book = c.post("/api/books", json={"title": "Emma", "chapterCount": 2}).get_json()
    assert c.get(f"/api/books/{book['id']}").get_json()["title"] == "Emma"
