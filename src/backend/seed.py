"""Sample data for local development (same books as the frontend demo)."""
import sqlite3
from datetime import datetime, timedelta, timezone

from db import init_db

NOW = datetime.now(timezone.utc)


def ago(days: float) -> str:
    return (NOW - timedelta(days=days)).isoformat(timespec="seconds")


def numbered(count: int, prefix: str = "Chapter") -> list[str]:
    return [f"{prefix} {i}" for i in range(1, count + 1)]


BOOKS = [
    {
        "title": "The Five People You Meet in Heaven", "author": "Mitch Albom",
        "recap": "Eddie, an old maintenance man at a seaside amusement park, dies trying to save a child. In the afterlife he meets five people who each explain a piece of his life.",
        "chapters": ["The End", "The Beginning", "Eddie's Birthday", "The Blue Man", "Ruby", "The Pier",
                     "The Captain", "Marguerite", "The War", "Tala", "The Last Lesson", "Home"],
        "completed": 4, "last": 23, "checkpoint_days": [29, 26, 23], "checkpoint_chapters": [1, 2, 4],
        "notes": [(4, 23, "The Blue Man's explanation of how our lives are interconnected - \"there are no random acts.\" I want to keep this in mind when Ruby shows up."),
                  (None, 30, "Recommended by Dad. Read it slowly, one chapter at night.")],
    },
    {
        "title": "Piranesi", "author": "Susanna Clarke",
        "recap": "Piranesi lives in a House of endless halls, tides and statues. He keeps careful journals - until signs appear that someone else is in the House.",
        "chapters": numbered(14, "Entry"), "completed": 9, "last": 1,
        "checkpoint_days": list(range(9, 0, -1)), "checkpoint_chapters": list(range(1, 10)),  # daily -> live streak
        "notes": [(5, 2, "The Other is not as kind as he seems. Note the dates in the journals."),
                  (9, 1, "Who is 16? The numbering doesn't add up.")],
    },
    {
        "title": "Dune", "author": "Frank Herbert",
        "recap": "Young Paul Atreides arrives on the desert planet Arrakis, the only source of the spice - and the House Atreides is about to be betrayed.",
        "chapters": numbered(22, "Part"), "completed": 3, "last": 61,
        "checkpoint_days": [66, 63, 61], "checkpoint_chapters": [1, 2, 3],
        "notes": [(3, 61, "The gom jabbar test. Fear is the mind-killer - re-read the litany.")],
    },
    {
        "title": "The Little Prince", "author": "Antoine de Saint-Exupery",
        "recap": "A pilot stranded in the desert meets a small prince who has travelled from planet to planet.",
        "chapters": numbered(27), "completed": 27, "last": 9,
        "checkpoint_days": [11, 10, 9], "checkpoint_chapters": [9, 18, 27],
        "notes": [(21, 9, "\"What is essential is invisible to the eye.\" The fox chapter. Gift this to Sara.")],
    },
]


def run(db_path: str, reset: bool = False) -> int:
    init_db(db_path)
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = ON")
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
            "INSERT INTO books (user_id, title, author, recap, completed, created_at, last_activity) VALUES (?,?,?,?,?,?,?)",
            (uid, b["title"], b["author"], b["recap"], b["completed"], ago(b["checkpoint_days"][0] + 1), ago(b["last"])),
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
