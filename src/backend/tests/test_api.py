import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db as dbmod  # noqa: E402
import seed  # noqa: E402
from app import create_app, streak_from  # noqa: E402


@pytest.fixture
def client(tmp_path):
    app = create_app({"DATABASE": str(tmp_path / "t.db"), "TESTING": True})
    return app.test_client()


def make_book(client, **kw):
    payload = {"title": "Dune", "author": "Frank Herbert", "chapters": ["One", "Two", "Three"], **kw}
    r = client.post("/api/books", json=payload)
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def test_health(client):
    assert client.get("/api/health").get_json() == {"status": "ok", "llm": {"enabled": False, "models": []}}


def test_user_profile_defaults_and_update(client):
    u = client.get("/api/user").get_json()
    assert u["preferredName"] == "Reader" and u["notificationsEnabled"] is True and u["pausedAfterDays"] == 14
    r = client.put("/api/user", json={"name": "Azeem H", "preferredName": "Azeem", "notificationsEnabled": False, "pausedAfterDays": 7})
    assert r.status_code == 200
    u = r.get_json()
    assert (u["name"], u["preferredName"], u["notificationsEnabled"], u["pausedAfterDays"]) == ("Azeem H", "Azeem", False, 7)


@pytest.mark.parametrize("payload", [{"preferredName": "  "}, {"pausedAfterDays": 0}, {"pausedAfterDays": "x"}])
def test_user_validation(client, payload):
    assert client.put("/api/user", json=payload).status_code == 400


def test_create_and_get_book(client):
    b = make_book(client)
    assert b["totalChapters"] == 3 and b["completed"] == 0 and b["chapters"][0] == {"n": 1, "title": "One"}
    assert client.get(f"/api/books/{b['id']}").get_json()["title"] == "Dune"
    assert len(client.get("/api/books").get_json()) == 1


def test_create_book_by_count_and_validation(client):
    r = client.post("/api/books", json={"title": "X", "chapterCount": 4})
    assert [c["title"] for c in r.get_json()["chapters"]] == [f"Chapter {i}" for i in range(1, 5)]
    assert client.post("/api/books", json={"title": ""}).status_code == 400
    assert client.post("/api/books", json={"title": "X"}).status_code == 400
    assert client.post("/api/books", data="nope").status_code == 400


def test_checkpoint_updates_progress_and_history(client):
    b = make_book(client)
    r = client.post(f"/api/books/{b['id']}/checkpoints", json={"completed": 2, "note": "Loved it"})
    out = r.get_json()
    assert r.status_code == 201 and out["completed"] == 2 and out["justFinished"] is False
    assert out["notes"][0]["text"] == "Loved it" and out["notes"][0]["chapter"] == 2
    assert {h["type"] for h in out["history"]} == {"checkpoint", "note"}


def test_checkpoint_finishing_and_bounds(client):
    b = make_book(client)
    assert client.post(f"/api/books/{b['id']}/checkpoints", json={"completed": 4}).status_code == 400
    assert client.post(f"/api/books/{b['id']}/checkpoints", json={"completed": -1}).status_code == 400
    assert client.post(f"/api/books/{b['id']}/checkpoints", json={"completed": "2"}).status_code == 400
    out = client.post(f"/api/books/{b['id']}/checkpoints", json={"completed": 3}).get_json()
    assert out["justFinished"] is True
    again = client.post(f"/api/books/{b['id']}/checkpoints", json={"completed": 3}).get_json()
    assert again["justFinished"] is False


def test_notes_crud(client):
    b = make_book(client)
    base = f"/api/books/{b['id']}/notes"
    n1 = client.post(base, json={"text": "general"}).get_json()
    n2 = client.post(base, json={"text": "ch2", "chapter": 2}).get_json()
    assert n1["chapter"] is None and n2["chapter"] == 2
    assert client.post(base, json={"text": "bad", "chapter": 99}).status_code == 400
    assert client.post(base, json={"text": " "}).status_code == 400
    assert len(client.get(f"/api/books/{b['id']}").get_json()["notes"]) == 2
    assert client.delete(f"{base}/{n1['id']}").status_code == 204
    assert client.delete(f"{base}/{n1['id']}").status_code == 404


def test_update_and_delete_book_cascades(client):
    b = make_book(client)
    client.post(f"/api/books/{b['id']}/notes", json={"text": "hi"})
    assert client.patch(f"/api/books/{b['id']}", json={"title": "Dune Messiah"}).get_json()["title"] == "Dune Messiah"
    assert client.delete(f"/api/books/{b['id']}").status_code == 204
    assert client.get(f"/api/books/{b['id']}").status_code == 404
    assert client.get("/api/books/999").status_code == 404


def test_streak_math():
    now = datetime.now(timezone.utc)
    iso = lambda d: (now - timedelta(days=d)).isoformat()
    assert streak_from([iso(0), iso(1), iso(2)])["count"] == 3
    s = streak_from([iso(1), iso(2)])
    assert s["count"] == 2 and not s["activeToday"] and s["alive"]  # still alive until today ends
    assert streak_from([iso(3)])["alive"] is False
    assert streak_from([iso(0), iso(2)])["count"] == 1  # gap breaks it
    assert streak_from([])["count"] == 0


def test_streak_endpoint_and_tz(client):
    b = make_book(client)
    client.post(f"/api/books/{b['id']}/notes", json={"text": "today"})
    s = client.get("/api/streak").get_json()
    assert s["count"] == 1 and s["activeToday"] is True
    assert client.get("/api/streak?tz=abc").status_code == 400


def test_reminder_uses_preferred_name_and_nearby_note(client):
    client.put("/api/user", json={"preferredName": "Azeem"})
    b = make_book(client)
    client.post(f"/api/books/{b['id']}/checkpoints", json={"completed": 2})
    client.post(f"/api/books/{b['id']}/notes", json={"text": "Remember the Blue Man", "chapter": 2})
    r = client.get(f"/api/books/{b['id']}/reminder").get_json()
    assert "Azeem" in r["headline"] and "Two" in r["lastLeft"] and "Three" in r["nudge"]
    assert r["note"]["text"] == "Remember the Blue Man" and r["isPaused"] is False


def test_seed_and_paused_detection(tmp_path):
    path = str(tmp_path / "s.db")
    app = create_app({"DATABASE": path, "TESTING": True})
    assert seed.run(path) == 2
    c = app.test_client()
    books = {b["title"]: b for b in c.get("/api/books").get_json()}
    assert set(books) == {"The Lord of the Rings", "Dune"}
    lotr, dune = books["The Lord of the Rings"], books["Dune"]
    assert lotr["totalChapters"] == 62 and lotr["chapters"][0]["title"] == "A Long-expected Party"
    assert lotr["author"] == "J.R.R. Tolkien" and "Frodo" in lotr["recap"] and lotr["streak"]["count"] >= 5
    assert dune["totalChapters"] == 48 and dune["chapters"][22]["title"] == "Book Two: Muad'Dib · 1"
    assert c.get(f"/api/books/{dune['id']}/reminder").get_json()["isPaused"] is True
    assert c.get(f"/api/books/{lotr['id']}/reminder").get_json()["isPaused"] is False
    assert seed.run(path, reset=True) == 2 and len(c.get("/api/books").get_json()) == 2


def test_cors_headers(client):
    assert client.get("/api/health").headers["Access-Control-Allow-Origin"] == "*"
    pre = client.options("/api/books")  # browser preflight: Flask answers OPTIONS itself
    assert pre.status_code == 200 and "POST" in pre.headers["Access-Control-Allow-Methods"]
