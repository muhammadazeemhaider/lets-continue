"""LLM-written recaps ("where was I?") and reminder notifications, cached per reading position.

Spoiler safety: the model is only shown chapter titles the reader has finished (plus the next title,
which the app already displays), and is told never to go past the last finished chapter.
Everything degrades to template text when no LLM is configured or every model fails.
"""
import hashlib
import json
import logging
from datetime import datetime, timezone

from db import utcnow

log = logging.getLogger("summaries")

RECAP_SYSTEM = (
    "You write short, warm recaps for a reading companion app. The reader paused a book and is coming back. "
    "Only describe events up to and including the last chapter they finished; never reveal or hint at anything after it. "
    "Weave in what the reader wanted to remember from their notes. "
    "If you do not know this book well, rely only on the reader's notes and the blurb, and stay gentle and vague rather than invent plot. "
    "Never pressure or guilt the reader. "
    'Reply with JSON only: {"recap": "<2-3 sentences, max 60 words>", "nudge": "<one inviting sentence, max 20 words>"}'
)

NOTIFY_SYSTEM = (
    "You write one push notification for a reading companion app, nudging a reader back to a paused book. "
    "Be warm and brief, never guilt-tripping. Mention something concrete from where they stopped or from their note. "
    "Only refer to events up to the last chapter they finished; no spoilers. "
    "The longer they have been away, the gentler and lower-pressure the tone. "
    'Reply with JSON only: {"title": "<max 40 characters>", "body": "<max 130 characters>"}'
)

MAX_NOTES_IN_PROMPT = 6


# --------------------------------------------------------------------------- context
def book_context(con, book_id: int) -> dict | None:
    b = con.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    if b is None:
        return None
    user = con.execute("SELECT preferred_name FROM users WHERE id = ?", (b["user_id"],)).fetchone()
    chapters = [r["title"] for r in con.execute(
        "SELECT title FROM chapters WHERE book_id = ? ORDER BY number", (book_id,))]
    done = min(b["completed"], len(chapters))
    notes = con.execute(
        "SELECT chapter_number, text FROM notes WHERE book_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        (book_id, MAX_NOTES_IN_PROMPT),
    ).fetchall()
    days_away = (datetime.now(timezone.utc) - datetime.fromisoformat(b["last_activity"])).days
    return {
        "title": b["title"],
        "author": b["author"],
        "blurb": b["recap"],
        "done": done,
        "total": len(chapters),
        "read": chapters[:done],                       # only what the reader has finished
        "next": chapters[done] if done < len(chapters) else None,
        "notes": [{"chapter": n["chapter_number"], "text": n["text"]} for n in notes],
        "name": user["preferred_name"] if user else "Reader",
        "days_away": days_away,
    }


def _prompt(ctx: dict) -> str:
    lines = [f"Book: {ctx['title']}" + (f" by {ctx['author']}" if ctx["author"] else "")]
    if ctx["blurb"]:
        lines.append(f"Blurb: {ctx['blurb']}")
    if ctx["done"]:
        lines.append(f"Finished {ctx['done']} of {ctx['total']} chapters. Last finished chapter: '{ctx['read'][-1]}'.")
        lines.append("Chapters read: " + "; ".join(ctx["read"]))
    else:
        lines.append(f"Has not finished any of the {ctx['total']} chapters yet.")
    if ctx["next"]:
        lines.append(f"Next chapter: '{ctx['next']}'.")
    if ctx["notes"]:
        lines.append("Reader's notes (most recent first):")
        lines += [f"- ({'ch. ' + str(n['chapter']) if n['chapter'] else 'general'}) {n['text']}" for n in ctx["notes"]]
    lines.append(f"Reader's name: {ctx['name']}.")
    return "\n".join(lines)


def _cache_key(ctx: dict, extra: str = "") -> str:
    # days_away is deliberately excluded: a recap stays valid until position, notes or name change.
    material = {k: ctx[k] for k in ("title", "author", "blurb", "done", "read", "next", "notes", "name")}
    return hashlib.sha256((json.dumps(material, sort_keys=True) + extra).encode()).hexdigest()[:32]


def _clean(value, limit: int) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:")
    return cut + "…"


# --------------------------------------------------------------------------- cache
def _cached(con, book_id: int, kind: str, key: str) -> dict | None:
    row = con.execute(
        "SELECT content, model FROM llm_summaries WHERE book_id = ? AND kind = ? AND cache_key = ?",
        (book_id, kind, key),
    ).fetchone()
    if row is None:
        return None
    data = json.loads(row["content"])
    data["model"] = row["model"]
    return data


def _store(con, book_id: int, kind: str, key: str, content: dict, model: str) -> None:
    con.execute(
        """INSERT INTO llm_summaries (book_id, kind, cache_key, content, model, created_at) VALUES (?,?,?,?,?,?)
           ON CONFLICT(book_id, kind, cache_key) DO UPDATE SET content = excluded.content,
           model = excluded.model, created_at = excluded.created_at""",
        (book_id, kind, key, json.dumps(content), model, utcnow()),
    )
    # Keep only the latest few per book/kind so the table cannot grow without bound.
    con.execute(
        """DELETE FROM llm_summaries WHERE book_id = ? AND kind = ? AND id NOT IN (
             SELECT id FROM llm_summaries WHERE book_id = ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT 5)""",
        (book_id, kind, book_id, kind),
    )
    con.commit()


# --------------------------------------------------------------------------- recap
def cached_recap(con, book_id: int) -> dict | None:
    ctx = book_context(con, book_id)
    return _cached(con, book_id, "recap", _cache_key(ctx)) if ctx else None


def get_recap(con, book_id: int, llm) -> dict | None:
    """{"recap", "nudge", "model"} from cache or a fresh LLM call; None if no LLM or every model failed."""
    ctx = book_context(con, book_id)
    if ctx is None:
        return None
    key = _cache_key(ctx)
    hit = _cached(con, book_id, "recap", key)
    if hit or llm is None:
        return hit
    try:
        data, model = llm.complete_json(RECAP_SYSTEM, _prompt(ctx))
    except Exception as e:
        log.warning("Recap for book %s fell back to template: %s", book_id, e)
        return None
    recap, nudge = _clean(data.get("recap"), 420), _clean(data.get("nudge"), 160)
    if not recap:
        log.warning("Recap for book %s: model %s returned no recap", book_id, model)
        return None
    content = {"recap": recap, "nudge": nudge}
    _store(con, book_id, "recap", key, content, model)
    return {**content, "model": model}


# --------------------------------------------------------------------------- notifications
def notification_copy(con, book_id: int, milestone: int, llm) -> tuple[str, str, str] | None:
    """(title, body, model) for a reminder, or None to use the template."""
    if llm is None:
        return None
    ctx = book_context(con, book_id)
    if ctx is None:
        return None
    key = _cache_key(ctx, f"|m{milestone}")
    hit = _cached(con, book_id, "notification", key)
    if hit:
        return hit["title"], hit["body"], hit["model"]
    away = {2: "2 days", 7: "about a week", 14: "about two weeks", 30: "about a month", 180: "about six months"}
    prompt = _prompt(ctx) + f"\nThey have been away for {away.get(milestone, f'{milestone} days')}."
    try:
        data, model = llm.complete_json(NOTIFY_SYSTEM, prompt, max_tokens=500)
    except Exception as e:
        log.warning("Notification for book %s fell back to template: %s", book_id, e)
        return None
    title, body = _clean(data.get("title"), 60), _clean(data.get("body"), 180)
    if not title or not body:
        return None
    _store(con, book_id, "notification", key, {"title": title, "body": body}, model)
    return title, body, model


def warm_recaps(con, llm, limit: int = 3) -> int:
    """Pre-generate recaps for books that are waiting, so "Where was I?" opens instantly.
    Small `limit` per pass keeps well inside free-tier daily request allowances."""
    if llm is None:
        return 0
    made = 0
    rows = con.execute(
        """SELECT b.id FROM books b JOIN users u ON u.id = b.user_id
           WHERE b.completed < (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id)
             AND julianday('now') - julianday(b.last_activity) >= 2
           ORDER BY b.last_activity ASC"""
    ).fetchall()
    for r in rows:
        if made >= limit:
            break
        if cached_recap(con, r["id"]) is None and get_recap(con, r["id"], llm):
            made += 1
    return made
