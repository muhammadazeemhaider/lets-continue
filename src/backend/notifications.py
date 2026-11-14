"""Re-engagement reminders: which are due, what they say, and how they are delivered."""
import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from db import utcnow

# Days since last reading activity at which a reminder is sent (2 days, 1 week, 2 weeks, 1 month, 6 months).
MILESTONES = [2, 7, 14, 30, 180]


def due_milestone(days_since: float, already_sent: set[int]) -> int | None:
    """The single reminder to send now, or None.

    Only the latest eligible milestone is considered, so a reader returning to a long-idle
    server never receives a burst of backlog reminders."""
    eligible = [m for m in MILESTONES if m <= days_since]
    if not eligible:
        return None
    latest = eligible[-1]
    return None if latest in already_sent else latest


def compose(milestone: int, name: str, title: str, last_chapter: str | None, next_chapter: str | None,
            note: str | None) -> tuple[str, str]:
    """Warm, never pressuring copy. This is the seam for LLM-written text later."""
    resume = f"Ready for {next_chapter}?" if next_chapter else "Ready to pick it back up?"
    where = f"You left off around {last_chapter}." if last_chapter else "The first page is waiting."
    snippet = ""
    if note:
        cut = note[:90].rstrip() + ("..." if len(note) > 90 else "")
        snippet = f' You wanted to remember: "{cut}"'
    if milestone <= 2:
        return "A small nudge", f"{name}, {title} is right where you left it. {resume}"
    if milestone <= 7:
        return "Your story is waiting", f"It's been about a week. {where}{snippet}"
    if milestone <= 14:
        return "Still here when you are", f"{name}, {title} hasn't gone anywhere. {where} {resume}"
    if milestone <= 30:
        return "A gentle hello", f"A month has passed, and the sunrise in {title} is still ahead. {where}{snippet}"
    return "Your journey is still here", f"No rush, {name}. {title} will be waiting whenever you want to continue. {where}"


# --------------------------------------------------------------------------- generation
def check_and_notify(con, now: datetime | None = None, sender=None) -> list[dict]:
    """Create (and push) every reminder that is due. Safe to run as often as you like."""
    now = now or datetime.now(timezone.utc)
    created = []
    users = con.execute("SELECT * FROM users WHERE notifications_enabled = 1").fetchall()
    for u in users:
        books = con.execute("SELECT * FROM books WHERE user_id = ?", (u["id"],)).fetchall()
        for b in books:
            chapters = con.execute(
                "SELECT number, title FROM chapters WHERE book_id = ? ORDER BY number", (b["id"],)
            ).fetchall()
            if not chapters or b["completed"] >= len(chapters):
                continue  # finished books never get reminders
            days = (now - datetime.fromisoformat(b["last_activity"])).total_seconds() / 86400
            sent = {
                r[0]
                for r in con.execute(
                    "SELECT milestone_days FROM notifications WHERE book_id = ? AND activity_at = ?",
                    (b["id"], b["last_activity"]),
                )
            }
            m = due_milestone(days, sent)
            if m is None:
                continue
            done = b["completed"]
            last = chapters[done - 1]["title"] if done > 0 else None
            nxt = chapters[done]["title"]
            note = con.execute(
                "SELECT text FROM notes WHERE book_id = ? ORDER BY created_at DESC, id DESC LIMIT 1", (b["id"],)
            ).fetchone()
            title, body = compose(m, u["preferred_name"], b["title"], last, nxt, note["text"] if note else None)
            cur = con.execute(
                "INSERT INTO notifications (user_id, book_id, milestone_days, activity_at, title, body, created_at)"
                " VALUES (?,?,?,?,?,?,?)",
                (u["id"], b["id"], m, b["last_activity"], title, body, utcnow()),
            )
            payload = {"title": title, "body": body, "url": f"/#/book/{b['id']}", "tag": f"book-{b['id']}",
                       "id": cur.lastrowid}
            status = deliver_push(con, u["id"], payload, sender)
            con.execute("UPDATE notifications SET push_status = ? WHERE id = ?", (status, cur.lastrowid))
            created.append({"id": cur.lastrowid, "bookId": b["id"], "milestone": m, "title": title, "body": body,
                            "push": status})
    con.commit()
    return created


# --------------------------------------------------------------------------- web push
def deliver_push(con, user_id: int, payload: dict, sender=None) -> str:
    subs = con.execute("SELECT * FROM push_subscriptions WHERE user_id = ?", (user_id,)).fetchall()
    if not subs:
        return "no_subscription"
    sender = sender or send_web_push
    ok = False
    for s in subs:
        info = {"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}}
        result = sender(info, payload)
        if result == "gone":  # the browser says this subscription no longer exists
            con.execute("DELETE FROM push_subscriptions WHERE id = ?", (s["id"],))
        ok = ok or result == "sent"
    return "sent" if ok else "failed"


def vapid_keys(path: Path) -> dict:
    """Load (or create once) the server's VAPID key pair. Lives next to the database; never commit it."""
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid

    if path.exists():
        return json.loads(path.read_text())
    v = Vapid()
    v.generate_keys()
    pub = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    data = {
        "public_key": base64.urlsafe_b64encode(pub).rstrip(b"=").decode(),
        "private_pem": v.private_pem().decode(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))
    return data


def make_web_push_sender(keys_path: Path):
    """Build the real sender. Returns 'sent', 'gone' (subscription expired) or 'failed'."""

    def send(subscription_info: dict, payload: dict) -> str:
        try:
            from py_vapid import Vapid
            from pywebpush import WebPushException, webpush
        except ImportError:
            return "failed"
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=Vapid.from_pem(vapid_keys(keys_path)["private_pem"].encode()),
                vapid_claims={"sub": os.environ.get("VAPID_SUBJECT", "mailto:noreply@towardthelight.app")},
                ttl=86400,
            )
            return "sent"
        except WebPushException as e:
            code = getattr(e.response, "status_code", None)
            return "gone" if code in (404, 410) else "failed"
        except Exception:
            return "failed"

    return send
