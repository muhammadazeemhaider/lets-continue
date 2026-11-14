import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db as dbmod  # noqa: E402
import notifications as N  # noqa: E402
from app import create_app  # noqa: E402


class FakeSender:
    """Stands in for the real Web Push sender; records what would have been pushed."""

    def __init__(self):
        self.sent, self.result = [], "sent"

    def __call__(self, info, payload):
        self.sent.append((info, payload))
        return self.result


@pytest.fixture
def ctx(tmp_path):
    sender = FakeSender()
    app = create_app({"DATABASE": str(tmp_path / "n.db"), "TESTING": True, "PUSH_SENDER": sender})
    return app, app.test_client(), sender


def new_book(client, **kw):
    r = client.post("/api/books", json={"title": "Dune", "chapters": ["One", "Two", "Three"], **kw})
    return r.get_json()["id"]


def age(app, book_id, days):
    """Pretend the last reading activity was `days` ago."""
    ts = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
    con = dbmod.connect(app.config["DATABASE"])
    con.execute("UPDATE books SET last_activity = ? WHERE id = ?", (ts, book_id))
    con.commit()
    con.close()


def check(client):
    return client.post("/api/notifications/check").get_json()["created"]


# ------------------------------------------------------------------ pure logic
@pytest.mark.parametrize(
    "days,sent,expected",
    [
        (0, set(), None), (1.9, set(), None),
        (2, set(), 2), (6, set(), 2), (2.5, {2}, None),
        (7, {2}, 7), (13, {2, 7}, None), (14, {2, 7}, 14),
        (30, {2, 7, 14}, 30), (179, {2, 7, 14, 30}, None), (180, {2, 7, 14, 30}, 180),
        (400, {2, 7, 14, 30, 180}, None),
        (200, set(), 180),  # a long-idle reader gets one reminder, not the whole backlog
    ],
)
def test_due_milestone(days, sent, expected):
    assert N.due_milestone(days, sent) == expected


def test_milestones_are_the_requested_ladder():
    assert N.MILESTONES == [2, 7, 14, 30, 180]


def test_compose_is_warm_and_personal():
    title, body = N.compose(7, "Azeem", "Dune", "Part 3", "Part 4", "Fear is the mind-killer")
    assert "Part 3" in body and "Fear is the mind-killer" in body
    t2, b2 = N.compose(2, "Azeem", "Dune", None, "Part 1", None)
    assert "Azeem" in b2 and "Dune" in b2 and t2


# ------------------------------------------------------------------ the ladder end to end
def test_nothing_before_two_days(ctx):
    app, c, _ = ctx
    bid = new_book(c)
    age(app, bid, 1.5)
    assert check(c) == []


def test_each_milestone_fires_once_in_order(ctx):
    app, c, sender = ctx
    bid = new_book(c)  # last_activity stays fixed; we move the clock forward instead
    con = dbmod.connect(app.config["DATABASE"])
    last = datetime.fromisoformat(con.execute("SELECT last_activity FROM books WHERE id = ?", (bid,)).fetchone()[0])
    fired = []
    for days in (1.9, 2.1, 3, 7.1, 8, 14.5, 31, 181, 400):
        now = last + timedelta(days=days)
        fired += [m["milestone"] for m in N.check_and_notify(con, now=now, sender=sender)]
        assert N.check_and_notify(con, now=now, sender=sender) == []  # running again creates nothing
    assert fired == [2, 7, 14, 30, 180]
    assert len(c.get("/api/notifications").get_json()["items"]) == 5
    con.close()


def test_long_gap_sends_single_latest_reminder(ctx):
    app, c, _ = ctx
    bid = new_book(c)
    age(app, bid, 200)
    assert [m["milestone"] for m in check(c)] == [180]


def test_new_activity_resets_the_ladder(ctx):
    app, c, _ = ctx
    bid = new_book(c)
    age(app, bid, 3)
    assert [m["milestone"] for m in check(c)] == [2]
    c.post(f"/api/books/{bid}/notes", json={"text": "back!"})  # reading activity -> last_activity = now
    assert check(c) == []
    age(app, bid, 3.5)  # a different, later absence than the first one
    assert [m["milestone"] for m in check(c)] == [2]  # the 2-day reminder can fire again for the new absence


def test_finished_books_and_opted_out_users_get_nothing(ctx):
    app, c, _ = ctx
    done = new_book(c)
    c.post(f"/api/books/{done}/checkpoints", json={"completed": 3})
    age(app, done, 100)
    assert check(c) == []
    waiting = new_book(c, title="Other")
    age(app, waiting, 100)
    c.put("/api/user", json={"notificationsEnabled": False})
    assert check(c) == []
    c.put("/api/user", json={"notificationsEnabled": True})
    assert [m["bookId"] for m in check(c)] == [waiting]


def test_reminder_text_uses_context(ctx):
    app, c, _ = ctx
    c.put("/api/user", json={"preferredName": "Azeem"})
    bid = new_book(c)
    c.post(f"/api/books/{bid}/checkpoints", json={"completed": 1, "note": "The Blue Man matters"})
    age(app, bid, 8)
    m = check(c)[0]
    assert m["milestone"] == 7 and "One" in m["body"] and "Blue Man" in m["body"]


# ------------------------------------------------------------------ inbox
def test_inbox_read_flow(ctx):
    app, c, _ = ctx
    a, b = new_book(c), new_book(c, title="B")
    age(app, a, 3)
    age(app, b, 3)
    check(c)
    inbox = c.get("/api/notifications").get_json()
    assert inbox["unread"] == 2 and not inbox["items"][0]["read"]
    nid = inbox["items"][0]["id"]
    assert c.post(f"/api/notifications/{nid}/read").status_code == 204
    assert c.get("/api/notifications").get_json()["unread"] == 1
    assert c.post("/api/notifications/999/read").status_code == 404
    c.post("/api/notifications/read-all")
    assert c.get("/api/notifications").get_json()["unread"] == 0


# ------------------------------------------------------------------ push
SUB = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "P", "auth": "A"}}


def test_subscribe_validation_and_upsert(ctx):
    _, c, _ = ctx
    for bad in ({}, {"endpoint": "http://insecure", "keys": {"p256dh": "P", "auth": "A"}}, {"endpoint": "https://x", "keys": {}}):
        assert c.post("/api/push/subscribe", json=bad).status_code == 400
    assert c.post("/api/push/subscribe", json=SUB).status_code == 201
    assert c.post("/api/push/subscribe", json=SUB).status_code == 201  # same device again: no duplicate
    con = dbmod.connect(ctx[0].config["DATABASE"])
    assert con.execute("SELECT COUNT(*) FROM push_subscriptions").fetchone()[0] == 1


def test_due_reminder_is_pushed_to_subscribed_devices(ctx):
    app, c, sender = ctx
    c.post("/api/push/subscribe", json=SUB)
    bid = new_book(c)
    age(app, bid, 3)
    made = check(c)
    assert made[0]["push"] == "sent" and len(sender.sent) == 1
    info, payload = sender.sent[0]
    assert info["endpoint"] == SUB["endpoint"] and payload["url"] == f"/#/book/{bid}" and payload["title"] == "A small nudge"
    assert c.get("/api/notifications").get_json()["items"][0]["pushStatus"] == "sent"


def test_no_subscription_still_creates_inbox_item(ctx):
    app, c, sender = ctx
    bid = new_book(c)
    age(app, bid, 3)
    assert check(c)[0]["push"] == "no_subscription" and sender.sent == []


def test_expired_subscription_is_removed(ctx):
    app, c, sender = ctx
    c.post("/api/push/subscribe", json=SUB)
    sender.result = "gone"
    bid = new_book(c)
    age(app, bid, 3)
    assert check(c)[0]["push"] == "failed"
    con = dbmod.connect(app.config["DATABASE"])
    assert con.execute("SELECT COUNT(*) FROM push_subscriptions").fetchone()[0] == 0


def test_unsubscribe_and_test_endpoint(ctx):
    _, c, sender = ctx
    assert c.post("/api/push/test").get_json()["status"] == "no_subscription"
    c.post("/api/push/subscribe", json=SUB)
    assert c.post("/api/push/test").get_json()["status"] == "sent" and sender.sent
    assert c.post("/api/push/unsubscribe", json={"endpoint": SUB["endpoint"]}).status_code == 204
    assert c.post("/api/push/test").get_json()["status"] == "no_subscription"


def test_vapid_public_key_is_stable_and_valid(ctx):
    _, c, _ = ctx
    k1 = c.get("/api/push/public-key").get_json()["publicKey"]
    k2 = c.get("/api/push/public-key").get_json()["publicKey"]
    assert k1 == k2 and len(k1) == 87  # base64url of a 65-byte uncompressed P-256 point


def test_backdate_cli_then_notify(ctx):
    app, c, _ = ctx
    bid = new_book(c)
    runner = app.test_cli_runner()
    assert runner.invoke(args=["backdate", str(bid), "8"]).exit_code == 0
    assert runner.invoke(args=["backdate", "999", "8"]).exit_code != 0
    assert "[7d]" in runner.invoke(args=["notify"]).output


def test_scheduler_disabled_in_tests_and_cli_runs(ctx):
    app, c, _ = ctx
    assert app.config["NOTIFY_INTERVAL_MINUTES"] == 0
    bid = new_book(c)
    age(app, bid, 3)
    result = app.test_cli_runner().invoke(args=["notify"])
    assert result.exit_code == 0 and "created 1 reminder" in result.output
