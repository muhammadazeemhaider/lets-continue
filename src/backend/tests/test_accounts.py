"""Sign-up and accounts: name + preferred name (+ optional email), a private key per device, readers kept apart."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db as dbmod  # noqa: E402
import seed  # noqa: E402
from app import create_app  # noqa: E402


@pytest.fixture
def app(tmp_path):
    return create_app({"DATABASE": str(tmp_path / "a.db"), "TESTING": True, "AUTH_REQUIRED": True,
                       "CATALOG_SOURCE": None, "LLM": None, "PUSH_SENDER": lambda i, p: "sent"})


def signup(c, **body):
    r = c.post("/api/signup", json={"name": "Azeem Haider", "preferredName": "Azeem", **body})
    return r


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_everything_private_needs_sign_up_but_catalogue_is_public(app):
    c = app.test_client()
    for path in ("/api/user", "/api/books", "/api/streak", "/api/notifications"):
        r = c.get(path)
        assert r.status_code == 401 and "sign up" in r.get_json()["error"].lower(), path
    assert c.get("/api/health").status_code == 200
    assert c.get("/api/catalog/search?q=dune").status_code == 200
    assert c.get("/api/user", headers=auth("not-a-real-key")).status_code == 401


def test_sign_up_saves_name_preferred_name_and_email(app):
    c = app.test_client()
    r = signup(c, email="Azeem@Example.com")
    assert r.status_code == 201
    token, user = r.get_json()["token"], r.get_json()["user"]
    assert len(token) >= 40 and user["name"] == "Azeem Haider" and user["preferredName"] == "Azeem"
    assert user["email"] == "azeem@example.com" and user["signedUp"] is True
    me = c.get("/api/user", headers=auth(token)).get_json()
    assert me["preferredName"] == "Azeem"
    con = dbmod.connect(app.config["DATABASE"])
    stored = con.execute("SELECT token_hash FROM users WHERE id = ?", (user["id"],)).fetchone()[0]
    assert stored and token not in stored  # only a hash is kept


def test_preferred_name_defaults_to_first_name_and_validation(app):
    c = app.test_client()
    assert c.post("/api/signup", json={"name": "Mary Ann Evans"}).get_json()["user"]["preferredName"] == "Mary"
    assert c.post("/api/signup", json={"name": "  "}).status_code == 400
    assert c.post("/api/signup", json={"name": "X", "preferredName": "y" * 41}).status_code == 400
    assert c.post("/api/signup", json={"name": "X", "email": "not-an-email"}).status_code == 400


def test_sign_up_always_starts_with_an_empty_shelf(app):
    seed.run(app.config["DATABASE"])  # data from before accounts: a 'Reader' profile with two books
    c = app.test_client()
    first = signup(c).get_json()
    token = first["token"]
    assert first["user"]["id"] != 1  # a brand-new account, not the old profile
    assert c.get("/api/books", headers=auth(token)).get_json() == []
    second = c.post("/api/signup", json={"name": "Sara Khan"}).get_json()["token"]
    assert c.get("/api/books", headers=auth(second)).get_json() == []
    con = dbmod.connect(app.config["DATABASE"])
    assert con.execute("SELECT COUNT(*) FROM books WHERE user_id = 1").fetchone()[0] == 2  # untouched, unreachable


def test_reminder_greets_the_reader_by_preferred_name(app):
    c = app.test_client()
    token = signup(c).get_json()["token"]
    lotr = c.get("/api/catalog/search?q=fellowship").get_json()["items"][0]
    book = c.post("/api/books", json={"catalogId": lotr["id"]}, headers=auth(token)).get_json()
    r = c.get(f"/api/books/{book['id']}/reminder", headers=auth(token)).get_json()
    assert r["headline"] == "Your journey is waiting for you, Azeem."


def test_seed_never_touches_signed_up_readers(app):
    c = app.test_client()
    token = signup(c).get_json()["token"]
    c.post("/api/books", json={"title": "My own book", "chapterCount": 3}, headers=auth(token))
    seed.run(app.config["DATABASE"])
    seed.run(app.config["DATABASE"], reset=True)
    assert [b["title"] for b in c.get("/api/books", headers=auth(token)).get_json()] == ["My own book"]


def test_account_cleanup_commands(app):
    seed.run(app.config["DATABASE"])  # unclaimed profile #1 with 2 books
    c = app.test_client()
    me = signup(c).get_json()
    c.post("/api/books", json={"title": "Old test book", "chapterCount": 2}, headers=auth(me["token"]))
    runner = app.test_cli_runner()
    listing = runner.invoke(args=["accounts", "list"]).output
    assert "never signed up" in listing and "signed up" in listing
    dry = runner.invoke(args=["accounts", "purge-unclaimed"])
    assert "Would delete 1" in dry.output and "Nothing changed" in dry.output
    con = dbmod.connect(app.config["DATABASE"])
    assert con.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 2
    assert "Done." in runner.invoke(args=["accounts", "purge-unclaimed", "--yes"]).output
    assert con.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert con.execute("SELECT COUNT(*) FROM chapters").fetchone()[0] == 2  # the sample books' chapters went too
    dry = runner.invoke(args=["accounts", "clear-shelf", str(me["user"]["id"])])
    assert "Would remove 1 book(s): ['Old test book']" in dry.output
    runner.invoke(args=["accounts", "clear-shelf", str(me["user"]["id"]), "--yes"])
    assert c.get("/api/books", headers=auth(me["token"])).get_json() == []
    assert c.get("/api/user", headers=auth(me["token"])).get_json()["preferredName"] == "Azeem"  # still signed in
    assert con.execute("SELECT COUNT(*) FROM chapters").fetchone()[0] == 0
    assert runner.invoke(args=["accounts", "clear-shelf", "999"]).exit_code != 0


def test_readers_are_kept_apart(app):
    seed.run(app.config["DATABASE"])
    c = app.test_client()
    a = signup(c).get_json()["token"]
    b = c.post("/api/signup", json={"name": "Sara Khan", "preferredName": "Sara", "email": "sara@example.com"}).get_json()["token"]
    assert c.get("/api/books", headers=auth(b)).get_json() == []  # Sara starts with an empty shelf
    new = c.post("/api/books", json={"title": "Emma", "chapterCount": 3}, headers=auth(b)).get_json()
    assert [x["title"] for x in c.get("/api/books", headers=auth(b)).get_json()] == ["Emma"]
    assert "Emma" not in [x["title"] for x in c.get("/api/books", headers=auth(a)).get_json()]
    assert c.get(f"/api/books/{new['id']}", headers=auth(a)).status_code == 404  # not Azeem's book
    assert c.get("/api/user", headers=auth(b)).get_json()["preferredName"] == "Sara"


def test_email_belongs_to_one_reader(app):
    c = app.test_client()
    assert signup(c, email="a@example.com").status_code == 201
    r = c.post("/api/signup", json={"name": "Someone Else", "email": "A@example.com"})
    assert r.status_code == 409 and "already" in r.get_json()["error"]


def test_profile_can_be_edited_after_sign_up(app):
    c = app.test_client()
    token = signup(c).get_json()["token"]
    r = c.put("/api/user", json={"preferredName": "Az"}, headers=auth(token)).get_json()
    assert r["preferredName"] == "Az" and r["name"] == "Azeem Haider"
