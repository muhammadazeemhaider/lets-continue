"""Book catalogue: type a title, get author, summary and chapters filled in.

How it grows (a bit like Shazam's song catalogue): search looks in our own `catalog_books` table first.
If that has too few matches it asks Open Library, saves what it finds, and returns it. The first time a
book is opened, its summary and table of contents are looked up once (Open Library work description and
the best table of contents across its editions; an LLM fills gaps only when it says it knows the book)
and saved, so every later reader gets it instantly. Hand-curated entries (catalog_seed.py) always win.
"""
import json
import logging
import re
import time
import unicodedata

import requests

from catalog_seed import CURATED
from db import utcnow

log = logging.getLogger("catalog")

OL = "https://openlibrary.org"
USER_AGENT = "TowardTheLight/0.1 (reading companion; catalogue builder)"
SEARCH_LIMIT = 8
_search_cache: dict[str, tuple[float, list]] = {}
SEARCH_CACHE_SECONDS = 24 * 3600


# --------------------------------------------------------------------------- text helpers
def normalize(text: str) -> str:
    """Lower-case, strip accents and punctuation: 'Lothlórien!' -> 'lothlorien'."""
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text.lower()).split())


def clean_description(text: str, limit: int = 700) -> str:
    """Open Library descriptions are Markdown with footnote links and 'also contained in' tails."""
    if not text:
        return ""
    text = re.split(r"\n\s*-{3,}\s*\n", text)[0]               # drop '----------' appendix sections
    text = re.sub(r"^\s*\[\d+\]:\s*\S+.*$", "", text, flags=re.M)  # footnote link definitions
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)         # [text](url) -> text
    text = re.sub(r"\[([^\]]+)\]\[\d+\]", r"\1", text)           # [text][1] -> text
    text = re.sub(r"\(\[source\]\)|\(source\)", "", text, flags=re.I)
    text = re.sub(r"[*_#>]+", "", text)
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[: end + 1] if end > limit * 0.5 else cut.rsplit(" ", 1)[0] + "…"


_FRONT_BACK_MATTER = re.compile(
    r"^(contents|table of contents|list of (illustrations|maps|figures|plates)|(a )?note on the text|"
    r"preface|foreword|introduction|acknowledg(e)?ments?|dedication|epigraph|copyright|title page|"
    r"half title|cover|about the (author|book)|also by.*|index|bibliography|notes?|glossary|maps?|"
    r"appendi(x|ces)\b.*|afterword|reading group guide|discussion questions|praise for.*|"
    r"family trees?|chronology|further reading)$"
)


def clean_toc(entries: list) -> list[str]:
    """Turn an Open Library table_of_contents into chapter titles (no front/back matter, one level)."""
    items = []
    for e in entries or []:
        if not isinstance(e, dict):
            continue
        title = " ".join(str(e.get("title") or "").split()).strip(" .:-")
        label = " ".join(str(e.get("label") or "").split()).strip(" .:-")
        if not title and label:
            title = label
        if not title or _FRONT_BACK_MATTER.match(normalize(title)):
            continue
        items.append((e.get("level"), title))
    levels = [lvl for lvl, _ in items if isinstance(lvl, int)]
    if levels and len(set(levels)) > 1:
        # Mixed parts and chapters: keep the most common level (the chapters).
        common = max(set(levels), key=levels.count)
        items = [(lvl, t) for lvl, t in items if lvl == common]
    titles = [t for _, t in items]
    if titles and sum(t.isupper() for t in titles) > len(titles) / 2:
        titles = [t.title() if len(t) > 3 else t for t in titles]  # 'THE OTHER' -> 'The Other'
    return titles[:300]


# --------------------------------------------------------------------------- Open Library
class OpenLibrary:
    """Thin client; injectable so tests never hit the network."""

    def __init__(self, session=None, timeout: float = 10.0):
        self.http = session or requests.Session()
        self.timeout = timeout

    def get(self, path: str, params: dict | None = None) -> dict:
        r = self.http.get(OL + path, params=params, headers={"User-Agent": USER_AGENT}, timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def search(self, q: str) -> list[dict]:
        data = self.get("/search.json", {
            "q": q, "limit": SEARCH_LIMIT,
            "fields": "key,title,author_name,first_publish_year,cover_i,number_of_pages_median",
        })
        out = []
        for d in data.get("docs", []):
            if not d.get("key", "").startswith("/works/") or not d.get("title"):
                continue
            out.append({
                "ol_key": d["key"],
                "title": d["title"],
                "author": ", ".join((d.get("author_name") or [])[:2]),
                "year": d.get("first_publish_year"),
                "pages": d.get("number_of_pages_median"),
                "cover_url": f"https://covers.openlibrary.org/b/id/{d['cover_i']}-M.jpg" if d.get("cover_i") else None,
            })
        return out

    def work(self, ol_key: str) -> dict:
        return self.get(f"{ol_key}.json")

    def editions(self, ol_key: str) -> list[dict]:
        return self.get(f"{ol_key}/editions.json", {"limit": 100}).get("entries", [])


# --------------------------------------------------------------------------- storage
def _row_json(r, full: bool = False) -> dict:
    chapters = json.loads(r["chapters"] or "[]")
    out = {
        "id": r["id"], "title": r["title"], "author": r["author"], "year": r["year"], "pages": r["pages"],
        "coverUrl": r["cover_url"], "chapterCount": len(chapters), "curated": r["chapter_source"] == "curated",
    }
    if full:
        out.update(summary=r["summary"], summarySource=r["summary_source"], chapters=chapters,
                   chapterSource=r["chapter_source"])
    return out


def ensure_curated(con) -> None:
    """Make sure the hand-curated books exist and carry their curated data (idempotent)."""
    now = utcnow()
    for b in CURATED:
        con.execute(
            """INSERT INTO catalog_books (ol_key, title, title_norm, author, year, pages, cover_url, summary,
                   summary_source, chapters, chapter_source, enriched_at, created_at)
               VALUES (?,?,?,?,?,?,?,?, 'curated', ?, 'curated', ?, ?)
               ON CONFLICT(ol_key) DO UPDATE SET title = excluded.title, title_norm = excluded.title_norm,
                   author = excluded.author, year = excluded.year, pages = excluded.pages,
                   cover_url = excluded.cover_url, summary = excluded.summary, summary_source = 'curated',
                   chapters = excluded.chapters, chapter_source = 'curated', enriched_at = excluded.enriched_at""",
            (b["ol_key"], b["title"], normalize(b["title"]), b["author"], b["year"], b["pages"], b["cover_url"],
             b["summary"], json.dumps(b["chapters"]), now, now),
        )
    con.commit()


def _save_search_results(con, results: list[dict]) -> None:
    now = utcnow()
    for r in results:
        con.execute(
            """INSERT INTO catalog_books (ol_key, title, title_norm, author, year, pages, cover_url, created_at)
               VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(ol_key) DO NOTHING""",
            (r["ol_key"], r["title"], normalize(r["title"]), r["author"], r["year"], r["pages"], r["cover_url"], now),
        )
    con.commit()


def _local(con, qn: str, limit: int) -> list:
    words = qn.split()
    if not words:
        return []
    where = " AND ".join(["(title_norm LIKE ? OR lower(author) LIKE ?)"] * len(words))
    params = [p for w in words for p in (f"%{w}%", f"%{w}%")]
    rows = con.execute(f"SELECT * FROM catalog_books WHERE {where}", params).fetchall()

    def rank(r):
        t = r["title_norm"]
        return (
            0 if t == qn or t == f"the {qn}" else 1 if t.startswith(qn) or t.startswith(f"the {qn}") else 2,
            0 if r["chapter_source"] == "curated" else 1,
            -r["times_used"],
            len(t),
        )

    return sorted(rows, key=rank)[:limit]


def _cached_keys(con, qn: str):
    """(keys, rows by key) for a recent identical search whose results are all saved in *this* database;
    (None, {}) when Open Library should be asked (never searched, expired, or a different/reset database)."""
    cached = _search_cache.get(qn)
    if not cached or time.monotonic() - cached[0] > SEARCH_CACHE_SECONDS:
        return None, {}
    keys = cached[1]
    if not keys:
        return keys, {}
    placeholders = ",".join("?" * len(keys))
    rows = {r["ol_key"]: r for r in con.execute(f"SELECT * FROM catalog_books WHERE ol_key IN ({placeholders})", keys)}
    return (keys, rows) if len(rows) == len(set(keys)) else (None, {})


# --------------------------------------------------------------------------- public API
def search(con, q: str, source: "OpenLibrary | None", limit: int = SEARCH_LIMIT) -> list[dict]:
    qn = normalize(q)
    if len(qn) < 2:
        return []
    rows = _local(con, qn, limit)
    if len(rows) < limit and len(qn) >= 3 and source is not None:
        keys, remote = _cached_keys(con, qn)
        if keys is None:
            try:
                found = source.search(q)
                _save_search_results(con, found)
                _search_cache[qn] = (time.monotonic(), [f["ol_key"] for f in found])
            except Exception as e:  # offline or Open Library hiccup: local results only
                log.warning("Open Library search failed for %r: %s", q, e)
            keys, remote = _cached_keys(con, qn)
        if keys:
            seen = {r["id"] for r in rows}
            for k in keys:  # keep Open Library's relevance order after our own matches
                r = remote.get(k)
                if r is not None and r["id"] not in seen and len(rows) < limit:
                    rows.append(r)
                    seen.add(r["id"])
    return [_row_json(r) for r in rows]


CHAPTERS_SYSTEM = (
    "You provide the table of contents of published books. Return JSON only: "
    '{"known": true or false, "chapters": ["title", ...]}. '
    "Set known to true only if you are confident of the book's actual chapter titles (or, for books with "
    "untitled chapters, the correct number of chapters) in its standard edition. Untitled chapters are listed as "
    "'Chapter 1', 'Chapter 2', and so on. List chapters only: no front matter, part headings or appendices. "
    'If you are not confident, return {"known": false, "chapters": []}.'
)
SUMMARY_SYSTEM = (
    "You write a spoiler-free, back-cover style summary of a published book: 2 to 4 sentences, at most 90 words, "
    "describing only the premise and setup, never twists or the ending. Return JSON only: "
    '{"known": true, "summary": "..."}. If you do not know this book, return {"known": false, "summary": ""}.'
)


def _book_line(r) -> str:
    return f"Book: {r['title']}" + (f" by {r['author']}" if r["author"] else "") + (f" ({r['year']})" if r["year"] else "")


def details(con, catalog_id: int, source: "OpenLibrary | None", llm=None) -> dict | None:
    """Full entry. The first request for a book looks up its summary and chapters once, then saves them."""
    r = con.execute("SELECT * FROM catalog_books WHERE id = ?", (catalog_id,)).fetchone()
    if r is None:
        return None
    if r["enriched_at"] is None and r["ol_key"] and source is not None:
        _enrich(con, r, source, llm)
        r = con.execute("SELECT * FROM catalog_books WHERE id = ?", (catalog_id,)).fetchone()
    return _row_json(r, full=True)


def _enrich(con, r, source, llm) -> None:
    summary, summary_src = r["summary"], r["summary_source"]
    chapters, chapter_src = json.loads(r["chapters"] or "[]"), r["chapter_source"]
    try:
        work = source.work(r["ol_key"])
        desc = work.get("description")
        desc = desc.get("value") if isinstance(desc, dict) else desc
        if desc and summary_src == "none":
            summary, summary_src = clean_description(desc), "openlibrary"
        if chapter_src == "none":
            best = max((clean_toc(e.get("table_of_contents")) for e in source.editions(r["ol_key"])),
                       key=len, default=[])
            if len(best) >= 3:
                chapters, chapter_src = best, "openlibrary"
    except Exception as e:
        log.warning("Open Library lookup failed for %s: %s", r["ol_key"], e)
        return  # leave enriched_at empty so the next request tries again

    if llm is not None and chapter_src == "none":
        try:
            data, _ = llm.complete_json(CHAPTERS_SYSTEM, _book_line(r), temperature=0.2)
            got = [" ".join(str(c).split()) for c in data.get("chapters") or [] if str(c).strip()]
            if data.get("known") is True and 2 <= len(got) <= 300:
                chapters, chapter_src = got, "ai"
        except Exception as e:
            log.info("AI chapters unavailable for %s: %s", r["title"], e)
    if llm is not None and summary_src == "none":
        try:
            data, _ = llm.complete_json(SUMMARY_SYSTEM, _book_line(r), temperature=0.4)
            text = " ".join(str(data.get("summary") or "").split())
            if data.get("known") is True and text:
                summary, summary_src = clean_description(text, 600), "ai"
        except Exception as e:
            log.info("AI summary unavailable for %s: %s", r["title"], e)

    con.execute(
        """UPDATE catalog_books SET summary = ?, summary_source = ?, chapters = ?, chapter_source = ?,
               enriched_at = ? WHERE id = ?""",
        (summary, summary_src, json.dumps(chapters), chapter_src, utcnow(), r["id"]),
    )
    con.commit()


def mark_used(con, catalog_id: int) -> None:
    con.execute("UPDATE catalog_books SET times_used = times_used + 1 WHERE id = ?", (catalog_id,))
