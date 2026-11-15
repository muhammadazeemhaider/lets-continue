"""Starter data: The Fellowship of the Ring and Dune (Book One). Chapters and summaries come from
the curated catalogue; everything else the reader adds through the catalogue search."""

from datetime import datetime, timedelta, timezone

from catalog_seed import CURATED
from db import connect, init_db

NOW = datetime.now(timezone.utc)
_CATALOG = {b["slug"]: b for b in CURATED}


def ago(days: float) -> str:
    return (NOW - timedelta(days=days)).isoformat(timespec="seconds")


def _from_catalog(slug: str, **progress) -> dict:
    entry = _CATALOG[slug]
    return {"title": entry["title"], "author": entry["author"], "recap": entry["summary"],
            "chapters": entry["chapters"], "catalog_slug": slug, **progress}


BOOKS = [
    # In progress, read daily for the last five days -> a live streak.
    _from_catalog(
        "curated:lotr-1", completed=14, last=1,
        checkpoint_days=[5, 4, 3, 2, 1], checkpoint_chapters=[10, 11, 12, 13, 14],
        notes=[(2, 6, "Gandalf: \"All we have to decide is what to do with the time that is given us.\""),
               (10, 4, "Strider is not what he seems. Keep an eye on him."),
               (None, 7, "Reading it again after the films; taking it slowly.")],
    ),
    # Paused for three weeks -> shows up as waiting, with reminders and a "Where was I?" recap.
    _from_catalog(
        "curated:dune-1", completed=3, last=20,
        checkpoint_days=[26, 23, 20], checkpoint_chapters=[1, 2, 3],
        notes=[(1, 26, "The gom jabbar test. Fear is the mind-killer - re-read the litany.")],
    ),
]


def run(db_path: str, reset: bool = False) -> int:
    init_db(db_path)
    con = connect(db_path)  # SQLite file or Postgres URL
    if reset:
        con.execute("DELETE FROM books")
    user = con.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
    if user is None:
        user = (con.execute(
            "INSERT INTO users (name, preferred_name, created_at) VALUES (?,?,?)",
            ("Sample Reader", "Reader", ago(90)),
        ).lastrowid,)
    uid = user[0]
    for b in BOOKS:
        cur = con.execute(
            "INSERT INTO books (user_id, title, author, recap, completed, created_at, last_activity, catalog_slug)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (uid, b["title"], b["author"], b["recap"], b["completed"], ago(b["checkpoint_days"][0] + 1), ago(b["last"]),
             b.get("catalog_slug")),
        )
        bid = cur.lastrowid
        con.executemany("INSERT INTO chapters (book_id, number, title) VALUES (?,?,?)",
                        [(bid, i, t) for i, t in enumerate(b["chapters"], 1)])
        con.executemany("INSERT INTO checkpoints (book_id, completed, note, created_at) VALUES (?,?,?,?)",
                        [(bid, c, "", ago(d)) for d, c in zip(b["checkpoint_days"], b["checkpoint_chapters"])])
        con.executemany("INSERT INTO notes (book_id, chapter_number, text, created_at) VALUES (?,?,?,?)",
                        [(bid, ch, text, ago(d)) for ch, d, text in b["notes"]])
    con.commit()
    con.close()
    return len(BOOKS)
