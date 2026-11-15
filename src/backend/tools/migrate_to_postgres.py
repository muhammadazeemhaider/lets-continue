"""Copy the local SQLite database into Postgres (e.g. Tiger Data), keeping every id and link.

    python tools/migrate_to_postgres.py                       # data/toward_the_light.db -> $DATABASE_URL
    python tools/migrate_to_postgres.py --sqlite other.db --replace

The target's tables are created first. By default it refuses to copy into a target that already has
readers or books (so nothing is ever overwritten by accident); --replace empties the target first.
"""
import argparse
import os
import sqlite3
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import db  # noqa: E402
import llm  # noqa: E402

# Parents before children, so foreign keys always resolve.
TABLES = ["users", "books", "chapters", "checkpoints", "notes", "notifications", "push_subscriptions",
          "catalog_books", "llm_summaries", "chapter_questions", "question_attempts", "llm_usage"]
ID_TABLES = {"users", "books", "chapters", "checkpoints", "notes", "notifications", "push_subscriptions",
             "catalog_books", "llm_summaries", "chapter_questions"}


def migrate(sqlite_path: str, url: str, replace: bool = False) -> dict:
    if not db.is_postgres(url):
        raise SystemExit("DATABASE_URL must be a postgres:// URL")
    db.init_db(sqlite_path)  # bring the local file up to the current schema first
    db.init_db(url)
    src = sqlite3.connect(sqlite_path)
    src.row_factory = sqlite3.Row
    dst = db.PgConnection(url)
    existing = {t: dst.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("users", "books")}
    if any(existing.values()) and not replace:
        raise SystemExit(f"The target already has data ({existing}). Use --replace to empty it first.")
    if replace:
        dst.execute("TRUNCATE " + ", ".join(TABLES) + " RESTART IDENTITY CASCADE")
    counts = {}
    for table in TABLES:
        src_cols = [r[1] for r in src.execute(f"PRAGMA table_info({table})")]
        if not src_cols:
            counts[table] = 0
            continue
        dst_cols = {r[0] for r in dst.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = ?", (table,)).fetchall()}
        cols = [c for c in src_cols if c in dst_cols]
        rows = [tuple(r[c] for c in cols) for r in src.execute(f"SELECT {', '.join(cols)} FROM {table}")]
        if rows:
            dst.executemany(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", rows)
        counts[table] = len(rows)
    # New rows must continue after the copied ids.
    for table in ID_TABLES:
        dst.execute(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)")
    dst.commit()
    dst.close()
    src.close()
    return counts


def main() -> None:
    llm.load_dotenv(BACKEND / ".env")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sqlite", default=str(BACKEND / "data" / "toward_the_light.db"))
    ap.add_argument("--url", default=os.environ.get("DATABASE_URL", ""))
    ap.add_argument("--replace", action="store_true", help="empty the target database first")
    args = ap.parse_args()
    if not Path(args.sqlite).exists():
        raise SystemExit(f"No SQLite database at {args.sqlite}")
    counts = migrate(args.sqlite, args.url, args.replace)
    print(f"Copied {args.sqlite} -> {db.describe(args.url)}")
    for table, n in counts.items():
        print(f"  {table:<20} {n:>6} rows")


if __name__ == "__main__":
    main()
