"""Background AI upgrade of boss-battle questions, within the free tier's daily request budget.

For books with a public text (the Gutenberg classics) the model sees ONLY the chapter's text and must quote the
sentence that proves each answer; a question whose quote isn't really in that chapter is thrown away
(questions.validate_ai). For books without a public text (Dune, The Lord of the Rings) it writes from its own
knowledge, only when it says it knows the chapter, and those questions are labelled 'ai-knowledge'.

Order of work: chapters readers are about to fight (around their current position) first, then the rest.
"""
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import questions
import sources

log = logging.getLogger("question_writer")
TEXTS = Path(__file__).with_name("data") / "texts"
CHAPTERS_PER_REQUEST = 3
CHARS_PER_REQUEST = 24_000

TEXT_SYSTEM = (
    "You write quiz questions for a reading game. You get the full text of one or more chapters of a public-domain "
    "book. For EACH chapter write exactly 3 multiple-choice questions about what happens in THAT chapter only: "
    "events, choices, who did what and why. Use only the chapter text, never outside knowledge or later chapters. "
    "Each question has 4 short options (max 12 words each) with exactly one correct answer, plausible wrong answers, "
    "a one-sentence explanation, and `evidence`: a sentence copied EXACTLY, character for character, from the "
    "chapter text that proves the answer. Return JSON only: "
    '{"chapters": [{"chapter": <number>, "questions": [{"question": "...", "options": ["...", "...", "...", "..."], '
    '"answer_index": 0, "explanation": "...", "evidence": "..."}]}]}'
)
KNOWLEDGE_SYSTEM = (
    "You write quiz questions for a reading game about a well-known novel. For the requested chapter write exactly 3 "
    "multiple-choice questions about events in that chapter only, with no spoilers from later chapters. Each has 4 "
    "short options (max 12 words) with exactly one correct answer and a one-sentence explanation. Only answer if you "
    "genuinely know what happens in this specific chapter; otherwise return {\"known\": false}. Return JSON only: "
    '{"known": true, "questions": [{"question": "...", "options": ["...", "...", "...", "..."], "answer_index": 0, '
    '"explanation": "..."}]}'
)


# --------------------------------------------------------------------------- budget
def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def used_today(con) -> int:
    row = con.execute("SELECT requests FROM llm_usage WHERE day = ?", (_today(),)).fetchone()
    return row[0] if row else 0


def _count_request(con) -> None:
    con.execute("""INSERT INTO llm_usage (day, requests) VALUES (?, 1)
                   ON CONFLICT(day) DO UPDATE SET requests = llm_usage.requests + 1""", (_today(),))
    con.commit()


def daily_budget() -> int:
    # Free OpenRouter accounts allow about 50 requests a day; leave room for recaps and reminders.
    return int(os.environ.get("QUESTION_REQUESTS_PER_DAY", 35))


# --------------------------------------------------------------------------- what to do next
def _catalog_rows(con) -> dict[str, dict]:
    return {r["slug"]: {"slug": r["slug"], "title": r["title"], "author": r["author"], "series": r["series"],
                        "chapters": json.loads(r["chapters"])}
            for r in con.execute("SELECT slug, title, author, series, chapters FROM catalog_books WHERE slug IS NOT NULL "
                                 "AND (slug LIKE 'gutenberg:%' OR slug LIKE 'curated:%')")}


MAX_FAILURES = 2


def _upgraded(con, slug: str) -> set[int]:
    """Chapters already written by the AI, or that it failed on twice (not worth more of the budget)."""
    done = {r[0] for r in con.execute("""SELECT DISTINCT chapter_number FROM chapter_questions
                                         WHERE catalog_slug = ? AND source != 'text'""", (slug,))}
    given_up = {r[0] for r in con.execute("""SELECT chapter_number FROM question_attempts
                                             WHERE catalog_slug = ? AND failures >= ?""", (slug, MAX_FAILURES))}
    return done | given_up


def _failed(con, slug: str, n: int) -> None:
    con.execute("""INSERT INTO question_attempts (catalog_slug, chapter_number, failures, last_at) VALUES (?,?,1,?)
                   ON CONFLICT(catalog_slug, chapter_number) DO UPDATE SET failures = question_attempts.failures + 1,
                   last_at = excluded.last_at""", (slug, n, datetime.now(timezone.utc).isoformat(timespec="seconds")))


def next_jobs(con, limit_chapters: int) -> list[tuple[str, int]]:
    """(slug, chapter) pairs to upgrade, most useful first: the next chapters on readers' shelves."""
    books = _catalog_rows(con)
    queue, seen = [], set()

    def add(slug, n):
        if slug in books and 1 <= n <= len(books[slug]["chapters"]) and (slug, n) not in seen:
            seen.add((slug, n))
            queue.append((slug, n))

    shelf = con.execute("SELECT catalog_slug, completed FROM books WHERE catalog_slug IS NOT NULL "
                        "ORDER BY last_activity DESC").fetchall()
    for window in (range(0, 3), range(-3, 0), range(3, 10)):  # around each reader's position, then a bit further
        for row in shelf:
            for d in window:
                add(row["catalog_slug"], row["completed"] + d if d < 0 else row["completed"] + 1 + d)
    for slug in books:  # then everything else, book by book
        for n in range(1, len(books[slug]["chapters"]) + 1):
            add(slug, n)
    done = {s: _upgraded(con, s) for s in books}
    return [(s, n) for s, n in queue if n not in done[s]][:limit_chapters]


# --------------------------------------------------------------------------- chapter text
def chapter_text(slug: str, chapters: list[str], n: int) -> str | None:
    if not slug.startswith("gutenberg:"):
        return None
    gid = int(slug.split(":")[1])
    TEXTS.mkdir(parents=True, exist_ok=True)
    path = TEXTS / f"{gid}.txt"
    if path.exists():
        with open(path, encoding="utf-8", newline="") as f:
            text = f.read()
    else:
        text = sources.gutenberg_text(gid)
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(text)
    parts = sources.chapter_texts(text)
    if [t for t, _ in parts] != chapters:
        log.warning("Chapters of %s no longer match the catalogue; not writing questions", slug)
        return None
    return questions.strip_heading(parts[n - 1][1])


# --------------------------------------------------------------------------- one pass
def run(con, llm, max_requests: int = 5) -> dict:
    """Upgrade as many chapters as `max_requests` (and today's budget) allow. Returns a small report."""
    report = {"requests": 0, "upgraded": [], "skipped": []}
    if llm is None:
        return report
    books = _catalog_rows(con)
    while report["requests"] < max_requests and used_today(con) < daily_budget():
        jobs = next_jobs(con, CHAPTERS_PER_REQUEST * 4)
        jobs = [j for j in jobs if j not in report["skipped"]]
        if not jobs:
            break
        slug = jobs[0][0]
        book = books[slug]
        if slug.startswith("gutenberg:"):
            batch, size = [], 0
            for s, n in jobs:
                if s != slug or len(batch) >= CHAPTERS_PER_REQUEST:
                    break
                text = chapter_text(slug, book["chapters"], n)
                if text is None:
                    _failed(con, slug, n)
                    report["skipped"].append((s, n))
                    continue
                if batch and size + len(text) > CHARS_PER_REQUEST:
                    break
                batch.append((n, text[:CHARS_PER_REQUEST]))
                size += len(batch[-1][1])
            if not batch:
                continue
            user = f"Book: {book['title']} by {book['author']}\n\n" + "\n\n".join(
                f"=== Chapter {n}: {book['chapters'][n - 1]} ===\n{text}" for n, text in batch)
            _count_request(con)
            report["requests"] += 1
            try:
                data, model = llm.complete_json(TEXT_SYSTEM, user, max_tokens=4000, temperature=0.3)
            except Exception as e:
                log.warning("Question writer request failed: %s", e)
                break  # rate-limited or offline: try again next pass
            by_chapter = {c.get("chapter"): c for c in data.get("chapters") or [] if isinstance(c, dict)}
            for n, text in batch:
                good = questions.validate_ai(by_chapter.get(n) or {}, text)
                if len(good) >= 3 and questions.store(con, slug, n, good[:3], "ai-text", model):
                    report["upgraded"].append((slug, n))
                else:
                    _failed(con, slug, n)
                    report["skipped"].append((slug, n))
        else:
            n = jobs[0][1]
            part = f" ({book['series']})" if book.get("series") and book["series"] not in book["title"] else ""
            user = (f"Book: {book['title']}{part} by {book['author']}\nChapter {n} of {len(book['chapters'])}: "
                    f"{book['chapters'][n - 1]}\nPrevious chapter: {book['chapters'][n - 2] if n > 1 else '(start)'}")
            _count_request(con)
            report["requests"] += 1
            try:
                data, model = llm.complete_json(KNOWLEDGE_SYSTEM, user, max_tokens=2000, temperature=0.3)
            except Exception as e:
                log.warning("Question writer request failed: %s", e)
                break
            good = questions.validate_ai(data, None) if data.get("known") is True else []
            if len(good) >= 3 and questions.store(con, slug, n, good[:3], "ai-knowledge", model):
                report["upgraded"].append((slug, n))
            else:
                _failed(con, slug, n)
                report["skipped"].append((slug, n))
        con.commit()
    return report
