"""Toward the Light: Flask API.

Run:  flask --app app run --debug --port 5000     (from src/backend)
Seed: flask --app app seed
"""
import os
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click
from flask import Flask, abort, jsonify, request

import db
import notifications

DEFAULT_DB = Path(__file__).parent / "data" / "toward_the_light.db"


def create_app(config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config["DATABASE"] = os.environ.get("DATABASE_PATH", str(DEFAULT_DB))
    app.config["CORS_ORIGIN"] = os.environ.get("CORS_ORIGIN", "*")  # tighten when deploying
    # Minutes between reminder checks. Auto-on only when serving (`flask run`); 0 disables.
    app.config["NOTIFY_INTERVAL_MINUTES"] = float(
        os.environ.get("NOTIFY_INTERVAL_MINUTES", 30 if "run" in sys.argv else 0)
    )
    if config:
        app.config.update(config)

    db.init_db(app.config["DATABASE"])
    app.config.setdefault("VAPID_KEYS_PATH", str(Path(app.config["DATABASE"]).parent / "vapid.json"))
    # The push sender is injectable so tests never touch the network.
    app.config.setdefault("PUSH_SENDER", notifications.make_web_push_sender(Path(app.config["VAPID_KEYS_PATH"])))
    app.teardown_appcontext(db.close_db)

    @app.after_request
    def cors(resp):  # the frontend is served from a different port in dev
        resp.headers["Access-Control-Allow-Origin"] = app.config["CORS_ORIGIN"]
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,PUT,DELETE,OPTIONS"
        return resp

    @app.errorhandler(400)
    @app.errorhandler(404)
    def http_error(e):
        return jsonify(error=e.description), e.code

    register_routes(app)
    register_cli(app)
    start_scheduler(app)
    return app


def run_notification_check(app: Flask) -> list[dict]:
    """One reminder pass outside a request (scheduler / CLI)."""
    con = db.connect(app.config["DATABASE"])
    try:
        return notifications.check_and_notify(con, sender=app.config["PUSH_SENDER"])
    finally:
        con.close()


def start_scheduler(app: Flask) -> None:
    minutes = app.config["NOTIFY_INTERVAL_MINUTES"]
    if minutes <= 0:
        return
    # With the debug reloader only the serving child process should run the loop.
    if app.debug and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return

    app.logger.setLevel("INFO")

    def loop():
        while True:
            try:
                made = run_notification_check(app)
                if made:
                    app.logger.info("Created %d reminder(s)", len(made))
            except Exception:  # never let the loop die
                app.logger.exception("Reminder check failed")
            time.sleep(minutes * 60)

    threading.Thread(target=loop, name="reminder-scheduler", daemon=True).start()
    app.logger.info("Reminder scheduler running every %s min", minutes)


# ---------------------------------------------------------------- helpers
def body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, "Expected a JSON object body")
    return data


def current_user():
    """Single-user for now. This is the seam for real authentication later."""
    con = db.get_db()
    row = con.execute("SELECT * FROM users ORDER BY id LIMIT 1").fetchone()
    if row is None:
        now = db.utcnow()
        con.execute(
            "INSERT INTO users (name, preferred_name, created_at) VALUES (?, ?, ?)",
            ("Reader", "Reader", now),
        )
        con.commit()
        row = con.execute("SELECT * FROM users ORDER BY id LIMIT 1").fetchone()
    return row


def user_json(u) -> dict:
    return {
        "id": u["id"],
        "name": u["name"],
        "preferredName": u["preferred_name"],
        "email": u["email"],
        "notificationsEnabled": bool(u["notifications_enabled"]),
        "pausedAfterDays": u["paused_after_days"],
    }


def own_book(book_id: int):
    row = db.get_db().execute(
        "SELECT * FROM books WHERE id = ? AND user_id = ?", (book_id, current_user()["id"])
    ).fetchone()
    if row is None:
        abort(404, "Book not found")
    return row


def parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s)


def streak_from(timestamps: list[str], tz_offset_minutes: int = 0) -> dict:
    """Consecutive local calendar days with any activity. Alive until the day ends."""
    tz = timezone(timedelta(minutes=tz_offset_minutes))
    days = {parse_iso(t).astimezone(tz).date() for t in timestamps}
    today = datetime.now(tz).date()
    active_today = today in days
    cursor = today if active_today else today - timedelta(days=1)
    count = 0
    while cursor in days:
        count += 1
        cursor -= timedelta(days=1)
    return {"count": count, "activeToday": active_today, "alive": count > 0}


def tz_offset() -> int:
    """Client passes ?tz=<minutes east of UTC> (JS: -new Date().getTimezoneOffset())."""
    try:
        return max(-14 * 60, min(14 * 60, int(request.args.get("tz", 0))))
    except ValueError:
        abort(400, "tz must be an integer (minutes east of UTC)")


def activity_times(book_id: int) -> list[str]:
    con = db.get_db()
    rows = con.execute(
        "SELECT created_at FROM checkpoints WHERE book_id = ? UNION ALL SELECT created_at FROM notes WHERE book_id = ?",
        (book_id, book_id),
    ).fetchall()
    return [r[0] for r in rows]


def book_json(row, detail: bool = True) -> dict:
    con = db.get_db()
    chapters = con.execute(
        "SELECT number, title FROM chapters WHERE book_id = ? ORDER BY number", (row["id"],)
    ).fetchall()
    out = {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "recap": row["recap"],
        "completed": row["completed"],
        "totalChapters": len(chapters),
        "lastActivity": row["last_activity"],
        "createdAt": row["created_at"],
        "streak": streak_from(activity_times(row["id"]), tz_offset()),
        "chapters": [{"n": c["number"], "title": c["title"]} for c in chapters],
    }
    if detail:
        notes = con.execute(
            "SELECT id, chapter_number, text, created_at FROM notes WHERE book_id = ? ORDER BY created_at DESC, id DESC",
            (row["id"],),
        ).fetchall()
        cps = con.execute(
            "SELECT id, completed, note, created_at FROM checkpoints WHERE book_id = ? ORDER BY created_at DESC, id DESC",
            (row["id"],),
        ).fetchall()
        out["notes"] = [
            {"id": n["id"], "at": n["created_at"], "chapter": n["chapter_number"], "text": n["text"]} for n in notes
        ]
        history = [
            {"id": f"c{c['id']}", "at": c["created_at"], "type": "checkpoint", "chapter": c["completed"] or None,
             "completedAfter": c["completed"], "text": c["note"]}
            for c in cps
        ] + [
            {"id": f"n{n['id']}", "at": n["created_at"], "type": "note", "chapter": n["chapter_number"],
             "completedAfter": None, "text": n["text"]}
            for n in notes
        ]
        out["history"] = sorted(history, key=lambda h: h["at"], reverse=True)
    return out


def touch(book_id: int, now: str) -> None:
    db.get_db().execute("UPDATE books SET last_activity = ? WHERE id = ?", (now, book_id))


def as_int(value, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) != value:
        abort(400, f"{field} must be an integer")
    return int(value)


# ---------------------------------------------------------------- routes
def register_routes(app: Flask) -> None:
    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    # ---- user profile
    @app.get("/api/user")
    def get_user():
        return jsonify(user_json(current_user()))

    @app.route("/api/user", methods=["PUT", "PATCH"])
    def update_user():
        data, u = body(), current_user()
        fields = {}
        for key, col in (("name", "name"), ("preferredName", "preferred_name"), ("email", "email")):
            if key in data:
                val = data[key]
                if key != "email" and (not isinstance(val, str) or not val.strip()):
                    abort(400, f"{key} must be a non-empty string")
                fields[col] = val.strip() if isinstance(val, str) else None
        if "notificationsEnabled" in data:
            fields["notifications_enabled"] = 1 if data["notificationsEnabled"] else 0
        if "pausedAfterDays" in data:
            days = as_int(data["pausedAfterDays"], "pausedAfterDays")
            if not 1 <= days <= 365:
                abort(400, "pausedAfterDays must be between 1 and 365")
            fields["paused_after_days"] = days
        if fields:
            con = db.get_db()
            sets = ", ".join(f"{c} = ?" for c in fields)  # column names come from the whitelist above
            try:
                con.execute(f"UPDATE users SET {sets} WHERE id = ?", (*fields.values(), u["id"]))
                con.commit()
            except Exception:
                abort(400, "Could not update profile (is that email already used?)")
        return jsonify(user_json(current_user()))

    # ---- books
    @app.get("/api/books")
    def list_books():
        rows = db.get_db().execute(
            "SELECT * FROM books WHERE user_id = ? ORDER BY last_activity DESC", (current_user()["id"],)
        ).fetchall()
        return jsonify([book_json(r, detail=False) for r in rows])

    @app.post("/api/books")
    def create_book():
        data = body()
        title = data.get("title")
        if not isinstance(title, str) or not title.strip():
            abort(400, "title is required")
        titles = data.get("chapters")
        if titles is None:
            count = as_int(data.get("chapterCount", 0), "chapterCount")
            titles = [f"Chapter {i}" for i in range(1, count + 1)]
        if (
            not isinstance(titles, list)
            or not 1 <= len(titles) <= 500
            or not all(isinstance(t, str) and t.strip() for t in titles)
        ):
            abort(400, "Provide `chapters` (1-500 titles) or a positive `chapterCount`")
        now, con = db.utcnow(), db.get_db()
        cur = con.execute(
            "INSERT INTO books (user_id, title, author, recap, created_at, last_activity) VALUES (?,?,?,?,?,?)",
            (current_user()["id"], title.strip(), str(data.get("author", "")).strip(), str(data.get("recap", "")).strip(), now, now),
        )
        con.executemany(
            "INSERT INTO chapters (book_id, number, title) VALUES (?,?,?)",
            [(cur.lastrowid, i, t.strip()) for i, t in enumerate(titles, 1)],
        )
        con.commit()
        return jsonify(book_json(own_book(cur.lastrowid))), 201

    @app.get("/api/books/<int:book_id>")
    def get_book(book_id):
        return jsonify(book_json(own_book(book_id)))

    @app.patch("/api/books/<int:book_id>")
    def update_book(book_id):
        own_book(book_id)
        data, con = body(), db.get_db()
        for key in ("title", "author", "recap"):
            if key in data:
                if not isinstance(data[key], str) or (key == "title" and not data[key].strip()):
                    abort(400, f"invalid {key}")
                con.execute(f"UPDATE books SET {key} = ? WHERE id = ?", (data[key].strip(), book_id))
        con.commit()
        return jsonify(book_json(own_book(book_id)))

    @app.delete("/api/books/<int:book_id>")
    def delete_book(book_id):
        own_book(book_id)
        con = db.get_db()
        con.execute("DELETE FROM books WHERE id = ?", (book_id,))
        con.commit()
        return "", 204

    # ---- checkpoints
    @app.post("/api/books/<int:book_id>/checkpoints")
    def add_checkpoint(book_id):
        book, data, con = own_book(book_id), body(), db.get_db()
        total = con.execute("SELECT COUNT(*) FROM chapters WHERE book_id = ?", (book_id,)).fetchone()[0]
        completed = as_int(data.get("completed"), "completed")
        if not 0 <= completed <= total:
            abort(400, f"completed must be between 0 and {total}")
        note = str(data.get("note", "")).strip()
        now = db.utcnow()
        con.execute("INSERT INTO checkpoints (book_id, completed, note, created_at) VALUES (?,?,?,?)", (book_id, completed, note, now))
        con.execute("UPDATE books SET completed = ? WHERE id = ?", (completed, book_id))
        if note:
            con.execute(
                "INSERT INTO notes (book_id, chapter_number, text, created_at) VALUES (?,?,?,?)",
                (book_id, completed or None, note, now),
            )
        touch(book_id, now)
        con.commit()
        result = book_json(own_book(book_id))
        result["justFinished"] = book["completed"] < total and completed >= total
        return jsonify(result), 201

    # ---- notes
    @app.post("/api/books/<int:book_id>/notes")
    def add_note(book_id):
        own_book(book_id)
        data, con = body(), db.get_db()
        text = data.get("text")
        if not isinstance(text, str) or not text.strip():
            abort(400, "text is required")
        chapter = data.get("chapter")
        if chapter is not None:
            chapter = as_int(chapter, "chapter")
            exists = con.execute("SELECT 1 FROM chapters WHERE book_id = ? AND number = ?", (book_id, chapter)).fetchone()
            if not exists:
                abort(400, "chapter does not exist in this book")
        now = db.utcnow()
        cur = con.execute(
            "INSERT INTO notes (book_id, chapter_number, text, created_at) VALUES (?,?,?,?)",
            (book_id, chapter, text.strip(), now),
        )
        touch(book_id, now)
        con.commit()
        return jsonify(id=cur.lastrowid, at=now, chapter=chapter, text=text.strip()), 201

    @app.delete("/api/books/<int:book_id>/notes/<int:note_id>")
    def delete_note(book_id, note_id):
        own_book(book_id)
        con = db.get_db()
        cur = con.execute("DELETE FROM notes WHERE id = ? AND book_id = ?", (note_id, book_id))
        con.commit()
        if cur.rowcount == 0:
            abort(404, "Note not found")
        return "", 204

    # ---- streak & re-engagement
    @app.get("/api/streak")
    def reader_streak():
        con = db.get_db()
        rows = con.execute(
            """SELECT c.created_at FROM checkpoints c JOIN books b ON b.id = c.book_id WHERE b.user_id = ?
               UNION ALL SELECT n.created_at FROM notes n JOIN books b ON b.id = n.book_id WHERE b.user_id = ?""",
            (current_user()["id"],) * 2,
        ).fetchall()
        return jsonify(streak_from([r[0] for r in rows], tz_offset()))

    @app.get("/api/books/<int:book_id>/reminder")
    def reminder(book_id):
        """Template-based today. This endpoint is the seam where an LLM-generated reminder plugs in."""
        book, u, con = own_book(book_id), current_user(), db.get_db()
        chapters = con.execute("SELECT number, title FROM chapters WHERE book_id = ? ORDER BY number", (book_id,)).fetchall()
        done = book["completed"]
        last = chapters[done - 1]["title"] if 0 < done <= len(chapters) else None
        current = chapters[min(done, len(chapters) - 1)]["title"] if chapters else None
        notes = con.execute(
            "SELECT chapter_number, text FROM notes WHERE book_id = ? ORDER BY created_at DESC, id DESC", (book_id,)
        ).fetchall()
        near = next((n for n in notes if n["chapter_number"] and done - 1 <= n["chapter_number"] <= done + 1), None)
        note = near or (notes[0] if notes else None)
        days_away = (datetime.now(timezone.utc) - parse_iso(book["last_activity"])).days
        return jsonify(
            headline=f"Your journey is waiting for you, {u['preferred_name']}.",
            lastLeft=(f"You last left {book['title']} around {last}." if last else f"You haven't begun {book['title']} yet."),
            recap=book["recap"],
            note={"text": note["text"], "chapter": note["chapter_number"]} if note else None,
            nudge=f"Perhaps it is time to continue with {current}." if current else "Perhaps it is time to begin.",
            daysAway=days_away,
            isPaused=done < len(chapters) and days_away >= u["paused_after_days"],
        )

    # ---- notifications inbox
    def notif_json(n) -> dict:
        return {
            "id": n["id"], "bookId": n["book_id"], "title": n["title"], "body": n["body"],
            "milestoneDays": n["milestone_days"], "createdAt": n["created_at"],
            "read": n["read_at"] is not None, "pushStatus": n["push_status"],
        }

    @app.get("/api/notifications")
    def list_notifications():
        con, uid = db.get_db(), current_user()["id"]
        rows = con.execute(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50", (uid,)
        ).fetchall()
        unread = con.execute(
            "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL", (uid,)
        ).fetchone()[0]
        return jsonify(unread=unread, items=[notif_json(r) for r in rows])

    @app.post("/api/notifications/<int:nid>/read")
    def mark_read(nid):
        con = db.get_db()
        cur = con.execute(
            "UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?",
            (db.utcnow(), nid, current_user()["id"]),
        )
        con.commit()
        if cur.rowcount == 0:
            abort(404, "Notification not found")
        return "", 204

    @app.post("/api/notifications/read-all")
    def mark_all_read():
        con = db.get_db()
        con.execute("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
                    (db.utcnow(), current_user()["id"]))
        con.commit()
        return "", 204

    @app.post("/api/notifications/check")
    def check_now():
        """Run a reminder pass immediately (idempotent: only reminders that are due and unsent are created)."""
        con = db.get_db()
        made = notifications.check_and_notify(con, sender=app.config["PUSH_SENDER"])
        return jsonify(created=made)

    # ---- web push subscriptions
    @app.get("/api/push/public-key")
    def push_public_key():
        try:
            return jsonify(publicKey=notifications.vapid_keys(Path(app.config["VAPID_KEYS_PATH"]))["public_key"])
        except ImportError:
            abort(404, "Web Push is not available on this server (install pywebpush).")

    @app.post("/api/push/subscribe")
    def push_subscribe():
        data = body()
        keys = data.get("keys") or {}
        endpoint = data.get("endpoint")
        if not (isinstance(endpoint, str) and endpoint.startswith("https://")
                and isinstance(keys.get("p256dh"), str) and isinstance(keys.get("auth"), str)):
            abort(400, "Expected a PushSubscription JSON: {endpoint, keys: {p256dh, auth}}")
        con = db.get_db()
        con.execute(
            """INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?)
               ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth""",
            (current_user()["id"], endpoint, keys["p256dh"], keys["auth"], db.utcnow()),
        )
        con.commit()
        return jsonify(subscribed=True), 201

    @app.post("/api/push/unsubscribe")
    def push_unsubscribe():
        endpoint = body().get("endpoint")
        con = db.get_db()
        con.execute("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
                    (endpoint, current_user()["id"]))
        con.commit()
        return "", 204

    @app.post("/api/push/test")
    def push_test():
        """Send a test notification to this reader's subscribed devices."""
        u = current_user()
        payload = {"title": "Toward the Light", "body": f"{u['preferred_name']}, notifications are working. ✨",
                   "url": "/#/", "tag": "test"}
        status = notifications.deliver_push(db.get_db(), u["id"], payload, app.config["PUSH_SENDER"])
        db.get_db().commit()
        return jsonify(status=status)


# ---------------------------------------------------------------- CLI
def register_cli(app: Flask) -> None:
    @app.cli.command("notify")
    @click.option("--loop", "loop_minutes", type=float, default=0, help="Keep running, checking every N minutes.")
    def notify_cmd(loop_minutes):
        """Send any due reminders (2d, 1w, 2w, 1mo, 6mo after last activity). Cron / Task Scheduler friendly."""
        while True:
            made = run_notification_check(app)
            click.echo(f"{datetime.now():%H:%M:%S} created {len(made)} reminder(s)")
            for m in made:
                click.echo(f"  [{m['milestone']}d] {m['title']}: {m['body']}  (push: {m['push']})")
            if loop_minutes <= 0:
                break
            time.sleep(loop_minutes * 60)

    @app.cli.command("seed")
    @click.option("--reset", is_flag=True, help="Delete existing books first.")
    def seed_cmd(reset):
        """Load sample books (mirrors the frontend sample data)."""
        import seed

        n = seed.run(app.config["DATABASE"], reset=reset)
        click.echo(f"Seeded {n} books into {app.config['DATABASE']}")


if __name__ == "__main__":
    create_app().run(debug=True, port=int(os.environ.get("PORT", 5000)))
