"""Re-engagement reminders: which are due, what they say, and how they are delivered."""
import base64
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from db import utcnow

log = logging.getLogger("notifications")

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
def check_and_notify(con, now: datetime | None = None, sender=None, writer=None) -> list[dict]:
    """Create (and push) every reminder that is due. Safe to run as often as you like.

    `writer(con, book_id, milestone)` may return (title, body, model) for LLM-written copy;
    when it is missing or returns None the warm template from `compose` is used."""
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
            written = writer(con, b["id"], m) if writer else None
            if written:
                title, body = written[0], written[1]
            else:
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
# Push services (FCM in particular) can answer 410 "expired" for a few moments right after a browser
# re-subscribes, e.g. when notifications are turned off and on again. Within this window a 410 is
# treated as temporary, so a brand-new, valid subscription is never thrown away.
NEW_SUBSCRIPTION_GRACE = timedelta(minutes=10)


def deliver_push(con, user_id: int, payload: dict, sender, details: list | None = None,
                 now: datetime | None = None) -> str:
    """Push to every device of the user. `sender(info, payload)` returns a status string, or
    (status, reason). If `details` is given, one {status, reason, host} entry per device is appended."""
    now = now or datetime.now(timezone.utc)
    subs = con.execute("SELECT * FROM push_subscriptions WHERE user_id = ?", (user_id,)).fetchall()
    if not subs:
        return "no_subscription"
    statuses = []
    for s in subs:
        info = {"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}}
        result = sender(info, payload)
        status, reason = result if isinstance(result, tuple) else (result, "")
        if status == "gone":  # the push service says this subscription no longer exists
            if now - datetime.fromisoformat(s["created_at"]) < NEW_SUBSCRIPTION_GRACE:
                status = "pending"
                reason = "the push service is still activating this device; try again in a minute"
            else:
                con.execute("DELETE FROM push_subscriptions WHERE id = ?", (s["id"],))
        if details is not None:
            details.append({"status": status, "reason": reason, "host": _host(s["endpoint"])})
        statuses.append(status)
    if "sent" in statuses:
        return "sent"
    return "pending" if "pending" in statuses else "failed"


def _host(endpoint: str) -> str:
    return endpoint.split("/")[2] if "//" in endpoint else "?"


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
    """Build the real sender. Returns (status, reason): status is 'sent', 'gone' (expired) or 'failed'."""

    def send(subscription_info: dict, payload: dict) -> tuple[str, str]:
        try:
            from py_vapid import Vapid
            from pywebpush import WebPushException, webpush
        except ImportError as e:
            log.error("Web Push unavailable (%s). Run: pip install -r requirements.txt", e)
            return "failed", f"server is missing a library: {e}"
        host = _host(subscription_info.get("endpoint", ""))
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps(payload),
                vapid_private_key=Vapid.from_pem(vapid_keys(keys_path)["private_pem"].encode()),
                vapid_claims={"sub": os.environ.get("VAPID_SUBJECT", "mailto:noreply@towardthelight.app")},
                ttl=86400,
                timeout=15,
            )
            return "sent", ""
        except WebPushException as e:
            code = getattr(e.response, "status_code", None)
            body = (getattr(e.response, "text", "") or str(e)).strip()[:300]
            if code in (404, 410):
                log.warning("Push subscription at %s is gone (%s): %s; removing it", host, code, body)
                return "gone", f"{code}: {body}"
            log.warning("Push to %s rejected (%s): %s", host, code, body)
            return "failed", f"{code}: {body}"
        except Exception as e:  # network errors, bad keys, ...
            log.warning("Push to %s failed: %s: %s", host, type(e).__name__, e)
            return "failed", f"{type(e).__name__}: {e}"

    return send
