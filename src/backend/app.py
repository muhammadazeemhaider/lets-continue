"""Toward the Light: Flask API.

Run:  flask --app app run --debug --port 5000     (from src/backend)
Seed: flask --app app seed
"""
import hashlib
import os
import re
import secrets
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click
from flask import Flask, abort, current_app, g, jsonify, request

import catalog
import db
import llm
import notifications
import question_writer
import questions
import summaries

DEFAULT_DB = Path(__file__).parent / "data" / "toward_the_light.db"

if os.name == "nt":
    # On Windows, SO_REUSEADDR lets a second server bind a port that is already taken, without any error,
    # and requests are then split between the two at random (e.g. "Enable" hits one server, "Send a test"
    # the other). Make a second `flask run` on a busy port fail with "address already in use" instead.
    from werkzeug.serving import BaseWSGIServer

    BaseWSGIServer.allow_reuse_address = False


def create_app(config: dict | None = None) -> Flask:
    testing = bool(config and config.get("TESTING"))
    if not testing:
        llm.load_dotenv(Path(__file__).with_name(".env"))  # Provider credentials; never committed
    app = Flask(__name__)
    # DATABASE_URL (postgres://...) = hosted Postgres such as Tiger Data; otherwise a local SQLite file.
    app.config["DATABASE"] = (os.environ.get("DATABASE_URL") or os.environ.get("DATABASE_PATH") or str(DEFAULT_DB)).strip()
    app.config["CORS_ORIGIN"] = os.environ.get("CORS_ORIGIN", "*")  # tighten when deploying
    # Minutes between reminder checks. Auto-on only when serving (`flask run`); 0 disables.
    # Accounts: every request needs the device key from sign-up. Off in tests (they opt in) or via AUTH_REQUIRED=0.
    app.config["AUTH_REQUIRED"] = os.environ.get("AUTH_REQUIRED", "0" if testing else "1") not in ("0", "false", "no")
    app.config["NOTIFY_INTERVAL_MINUTES"] = float(
        os.environ.get("NOTIFY_INTERVAL_MINUTES", 30 if "run" in sys.argv else 0)
    )
    if config:
        app.config.update(config)

    db.init_db(app.config["DATABASE"])
    data_dir = DEFAULT_DB.parent if db.is_postgres(app.config["DATABASE"]) else Path(app.config["DATABASE"]).parent
    app.config.setdefault("VAPID_KEYS_PATH", str(data_dir / "vapid.json"))
    # The push sender is injectable so tests never touch the network.
    app.config.setdefault("PUSH_SENDER", notifications.make_web_push_sender(Path(app.config["VAPID_KEYS_PATH"])))
    # Configured LLM provider. None = template text only; tests inject a fake client.
    if "LLM" not in app.config:
        app.config["LLM"] = None if testing else llm.client_from_env()
    app.config.setdefault("LLM_WARM_PER_PASS", int(os.environ.get("LLM_WARM_PER_PASS", 3)))
    # Where unknown books are looked up (Open Library). None = curated/saved catalogue only (tests).
    if "CATALOG_SOURCE" not in app.config:
        app.config["CATALOG_SOURCE"] = None if testing else catalog.OpenLibrary()
    con = db.connect(app.config["DATABASE"])
    try:
        catalog.ensure_curated(con)  # The Lord of the Rings, Dune
        if app.config.get("LOAD_BUNDLED_CATALOG", not testing):
            catalog.ensure_bundled(con)  # catalog_data/books.json: source-attributed classics
            questions.ensure_bundled(con, Path(__file__).with_name("catalog_data") / "questions")
    finally:
        con.close()
    app.teardown_appcontext(db.close_db)

    @app.after_request
    def cors(resp):  # the frontend is served from a different port in dev
        resp.headers["Access-Control-Allow-Origin"] = app.config["CORS_ORIGIN"]
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET,POST,PATCH,PUT,DELETE,OPTIONS"
        return resp

    @app.errorhandler(400)
    @app.errorhandler(401)
    @app.errorhandler(404)
    @app.errorhandler(409)
    def http_error(e):
        return jsonify(error=e.description), e.code

    register_routes(app)
    register_cli(app)
    start_scheduler(app)
    return app


def schedule_recap(app: Flask, book_id: int) -> bool:
    """Right after a checkpoint, write the "Where was I?" recap for the new position in the background,
    so it is ready (and identical) whenever the reader comes back. Returns True if a job was started."""
    client = app.config["LLM"]
    if client is None:
        return False
    check = db.connect(app.config["DATABASE"])
    try:
        if not summaries.should_write_recap(check, book_id) or summaries.cached_recap(check, book_id):
            return False
    finally:
        check.close()

    def work():
        con = db.connect(app.config["DATABASE"])
        try:
            summaries.get_recap(con, book_id, client)
        except Exception:
            app.logger.exception("Background recap for book %s failed", book_id)
        finally:
            con.close()

    if app.config.get("LLM_ASYNC", True):
        threading.Thread(target=work, name=f"recap-{book_id}", daemon=True).start()
    else:  # tests: run inline so results are deterministic
        work()
    return True


def llm_writer(app: Flask):
    """Notification copywriter backed by the LLM, or None for template copy."""
    client = app.config["LLM"]
    if client is None:
        return None
    return lambda con, book_id, milestone: summaries.notification_copy(con, book_id, milestone, client)


def run_notification_check(app: Flask, warm: bool = False) -> list[dict]:
    """One reminder pass outside a request (scheduler / CLI). `warm` also pre-writes recaps for waiting books."""
    con = db.connect(app.config["DATABASE"])
    try:
        made = notifications.check_and_notify(con, sender=app.config["PUSH_SENDER"], writer=llm_writer(app))
        if warm:
            summaries.warm_recaps(con, app.config["LLM"], limit=app.config["LLM_WARM_PER_PASS"])
            # Upgrade a few chapters' boss questions per pass, within the daily free-tier budget.
            report = question_writer.run(con, app.config["LLM"],
                                         max_requests=int(os.environ.get("QUESTION_REQUESTS_PER_PASS", 3)))
            if report["upgraded"]:
                app.logger.info("AI wrote boss questions for %d chapter(s)", len(report["upgraded"]))
        return made
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
                made = run_notification_check(app, warm=True)
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


def token_hash(token: str) -> str:
    """Only a hash of the device's private key is stored, so a leaked database can't be used to sign in."""
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    """The signed-in reader, from the `Authorization: Bearer <key>` header the app sends after sign-up.

    With AUTH_REQUIRED off (tests, or a purely local single-user setup) a request without a key falls back
    to the first user, like before accounts existed."""
    if "user" in g:
        return g.user
    con = db.get_db()
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer ") and header[7:].strip():
        row = con.execute("SELECT * FROM users WHERE token_hash = ?", (token_hash(header[7:].strip()),)).fetchone()
        if row is None:
            abort(401, "This device isn't signed in any more. Please sign up again.")
        g.user = row
        return row
    if current_app.config["AUTH_REQUIRED"]:
        abort(401, "Please sign up to continue.")
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
        "signedUp": bool(u["signed_up_at"]) if "signed_up_at" in u.keys() else False,
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


def book_json(row, detail: bool = True, chapters=None, activity=None) -> dict:
    """`chapters` / `activity` can be passed in when many books are listed at once (fewer round trips to
    a hosted database); otherwise they are looked up here."""
    con = db.get_db()
    if chapters is None:
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
        "streak": streak_from(activity if activity is not None else activity_times(row["id"]), tz_offset()),
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
        client = app.config["LLM"]
        return jsonify(status="ok", llm={"enabled": client is not None, "models": client.models if client else []})

    # ---- user profile
    # ---- sign-up
    @app.post("/api/signup")
    def signup():
        """Create the reader's profile and a private key for this device. The first sign-up takes over the
        profile that existed before accounts (so earlier books and progress are kept)."""
        data = body()
        name = " ".join(str(data.get("name") or "").split())
        preferred = " ".join(str(data.get("preferredName") or "").split()) or (name.split(" ")[0] if name else "")
        email = str(data.get("email") or "").strip().lower() or None
        if not 1 <= len(name) <= 80:
            abort(400, "Please tell us your name.")
        if not 1 <= len(preferred) <= 40:
            abort(400, "What should we call you? Keep it under 40 characters.")
        if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            abort(400, "That email doesn't look right.")
        con = db.get_db()
        if email and con.execute("SELECT 1 FROM users WHERE lower(email) = ?", (email,)).fetchone():
            abort(409, "That email is already used by another reader.")
        token, now = secrets.token_urlsafe(32), db.utcnow()
        unclaimed = con.execute("SELECT id FROM users WHERE token_hash IS NULL AND signed_up_at IS NULL "
                                "ORDER BY id LIMIT 1").fetchone()
        if unclaimed:
            con.execute("""UPDATE users SET name = ?, preferred_name = ?, email = ?, token_hash = ?, signed_up_at = ?
                           WHERE id = ?""", (name, preferred, email, token_hash(token), now, unclaimed["id"]))
            uid = unclaimed["id"]
        else:
            uid = con.execute("""INSERT INTO users (name, preferred_name, email, token_hash, signed_up_at, created_at)
                                 VALUES (?,?,?,?,?,?)""", (name, preferred, email, token_hash(token), now, now)).lastrowid
        con.commit()
        user = con.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        return jsonify(token=token, user=user_json(user)), 201

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
            g.pop("user", None)  # the cached row is stale now
        return jsonify(user_json(current_user()))

    # ---- books
    @app.get("/api/books")
    def list_books():
        con = db.get_db()
        rows = con.execute(
            "SELECT * FROM books WHERE user_id = ? ORDER BY last_activity DESC", (current_user()["id"],)
        ).fetchall()
        # Three queries for the whole shelf instead of two per book (each query is a round trip to the database).
        chapters, activity = {}, {}
        if rows:
            ids = [r["id"] for r in rows]
            marks = ", ".join("?" * len(ids))
            for c in con.execute(f"SELECT book_id, number, title FROM chapters WHERE book_id IN ({marks}) "
                                 "ORDER BY book_id, number", ids):
                chapters.setdefault(c["book_id"], []).append(c)
            for a in con.execute(f"SELECT book_id, created_at FROM checkpoints WHERE book_id IN ({marks}) "
                                 f"UNION ALL SELECT book_id, created_at FROM notes WHERE book_id IN ({marks})", ids + ids):
                activity.setdefault(a["book_id"], []).append(a["created_at"])
        return jsonify([book_json(r, detail=False, chapters=chapters.get(r["id"], []), activity=activity.get(r["id"], []))
                        for r in rows])

    @app.post("/api/books")
    def create_book():
        data = body()
        entry = None
        if data.get("catalogId") is not None:
            # Fill anything the reader left out from the catalogue entry they picked.
            entry = catalog.details(db.get_db(), as_int(data["catalogId"], "catalogId"), app.config["CATALOG_SOURCE"],
                                    app.config["LLM"])
            if entry is None:
                abort(400, "Unknown catalogId")
            data.setdefault("title", entry["title"])
            data.setdefault("author", entry["author"])
            if not str(data.get("recap") or "").strip():
                data["recap"] = entry["summary"]
            if data.get("chapters") is None and data.get("chapterCount") is None and entry["chapters"]:
                data["chapters"] = entry["chapters"]
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
        if entry is not None:
            catalog.mark_used(con, entry["id"])  # popular books rank higher in search
            con.execute("UPDATE books SET catalog_slug = ? WHERE id = ?", (entry.get("slug"), cur.lastrowid))
        con.commit()
        return jsonify(book_json(own_book(cur.lastrowid))), 201

    # ---- boss-battle questions
    def book_slug(book) -> str | None:
        """The catalogue entry a shelf book belongs to. Books added before slugs existed are matched once by
        title and author, and the link is saved."""
        if book["catalog_slug"]:
            return book["catalog_slug"]
        con = db.get_db()
        row = con.execute("SELECT slug FROM catalog_books WHERE slug IS NOT NULL AND title_norm = ? AND lower(author) = ?",
                          (catalog.normalize(book["title"]), (book["author"] or "").lower())).fetchone()
        if row:
            con.execute("UPDATE books SET catalog_slug = ? WHERE id = ?", (row["slug"], book["id"]))
            con.commit()
            return row["slug"]
        return None

    @app.get("/api/books/<int:book_id>/chapters/<int:n>/questions")
    def chapter_questions(book_id, n):
        """Three boss questions for chapter n, if the catalogue has them. `available: false` means the battle
        falls back to the reader's own excerpt."""
        book = own_book(book_id)
        slug = book_slug(book)
        found = questions.for_chapter(db.get_db(), slug, n) if slug else None
        if not found:
            return jsonify(available=False, questions=[], source=None)
        return jsonify(available=True, **found)

    # ---- catalogue
    @app.get("/api/catalog/search")
    def catalog_search():
        """As-you-type suggestions: our saved catalogue first, then Open Library (saved for next time)."""
        q = request.args.get("q", "")[:120]
        return jsonify(items=catalog.search(db.get_db(), q, app.config["CATALOG_SOURCE"]))

    @app.get("/api/catalog/<int:catalog_id>")
    def catalog_entry(catalog_id):
        """Full entry with summary and chapters (looked up and saved the first time; may take a few seconds)."""
        entry = catalog.details(db.get_db(), catalog_id, app.config["CATALOG_SOURCE"], app.config["LLM"])
        if entry is None:
            abort(404, "Not in the catalogue")
        return jsonify(entry)

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
        result["recapPending"] = schedule_recap(app, book_id)
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
        """Fast: the recap saved for the reader's current position (written when they saved the checkpoint),
        or template text. When `llmPending` is true the client can POST /recap, which waits for the
        background job (or writes the recap itself) and returns the saved text."""
        book, u, con = own_book(book_id), current_user(), db.get_db()
        story = summaries.cached_recap(con, book_id)
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
            headline=(
                "Your journey is waiting for you."
                if u["preferred_name"].strip().lower() == "reader"  # the default placeholder, not a real name
                else f"Your journey is waiting for you, {u['preferred_name']}."
            ),
            lastLeft=(f"You last left {book['title']} around {last}." if last else f"You haven't begun {book['title']} yet."),
            recap=story["recap"] if story else book["recap"],
            note={"text": note["text"], "chapter": note["chapter_number"]} if note else None,
            nudge=(story and story.get("nudge"))
            or (f"Perhaps it is time to continue with {current}." if current else "Perhaps it is time to begin."),
            daysAway=days_away,
            isPaused=done < len(chapters) and days_away >= u["paused_after_days"],
            source="llm" if story else "template",
            model=story["model"] if story else None,
            llmPending=story is None and app.config["LLM"] is not None and done > 0,
        )

    @app.post("/api/books/<int:book_id>/recap")
    def write_recap(book_id):
        """Write (or fetch the cached) LLM recap. Falls back to `source: template` if every model fails."""
        own_book(book_id)
        story = summaries.get_recap(db.get_db(), book_id, app.config["LLM"])
        if not story:
            return jsonify(source="template", recap=None, nudge=None, model=None)
        return jsonify(source="llm", recap=story["recap"], nudge=story.get("nudge"), model=story["model"])

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
        made = notifications.check_and_notify(con, sender=app.config["PUSH_SENDER"], writer=llm_writer(app))
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
        details: list[dict] = []
        status = notifications.deliver_push(db.get_db(), u["id"], payload, app.config["PUSH_SENDER"], details)
        db.get_db().commit()
        return jsonify(status=status, devices=details)


# ---------------------------------------------------------------- CLI
def register_cli(app: Flask) -> None:
    @app.cli.command("backdate")
    @click.argument("book_id", type=int)
    @click.argument("days", type=float)
    def backdate_cmd(book_id, days):
        """Dev helper: pretend BOOK_ID was last read DAYS ago (then run `notify` to see the reminder fire)."""
        ts = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
        con = db.connect(app.config["DATABASE"])
        cur = con.execute("UPDATE books SET last_activity = ? WHERE id = ?", (ts, book_id))
        con.commit()
        con.close()
        if cur.rowcount == 0:
            raise click.ClickException(f"No book with id {book_id}")
        click.echo(f"Book {book_id} now looks last read {days:g} day(s) ago.")

    @app.cli.command("questions")
    @click.option("--requests", "max_requests", type=int, default=5, help="AI requests to spend (within today's budget).")
    def questions_cmd(max_requests):
        """Have the AI upgrade boss questions now (normally done a few at a time by the background scheduler)."""
        con = db.connect(app.config["DATABASE"])
        try:
            if app.config["LLM"] is None:
                raise click.ClickException("No OPENROUTER_API_KEY configured.")
            report = question_writer.run(con, app.config["LLM"], max_requests=max_requests)
            total = con.execute("SELECT source, COUNT(DISTINCT catalog_slug || ':' || chapter_number) FROM chapter_questions "
                                "GROUP BY source").fetchall()
            used = question_writer.used_today(con)
        finally:
            con.close()
        click.echo(f"{report['requests']} request(s); upgraded {len(report['upgraded'])} chapter(s); "
                   f"skipped {len(report['skipped'])}; AI requests used today: {used}/{question_writer.daily_budget()}")
        click.echo("chapters by question source: " + ", ".join(f"{s}={c}" for s, c in total))

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
        click.echo(f"Seeded {n} books into {db.describe(app.config['DATABASE'])}")


if __name__ == "__main__":
    create_app().run(debug=True, port=int(os.environ.get("PORT", 5000)))
