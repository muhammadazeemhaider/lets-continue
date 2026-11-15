"""Book catalogue: type a title, get author, summary and chapters filled in. Concrete sources only, no AI.

Layers, in order of trust:
  1. Hand-curated entries (catalog_seed.py): The Lord of the Rings, Dune.
  2. The bundled catalogue (catalog_data/books.json, built by tools/build_catalog.py): 100+ books whose
     chapters were read from their own text on Project Gutenberg and whose summaries come from Open Library
     or Wikipedia, each with its source URL.
  3. Grows on demand (a bit like Shazam's catalogue): search asks Open Library when we have too few matches
     and saves what it finds. The first time a book is opened its summary and chapters are looked up once
     (Open Library description / best table of contents; then Project Gutenberg's text and Wikipedia) and
     saved for every later reader. If no concrete source has it, the field stays empty for the reader.
"""
import json
import logging
import re
import time
import unicodedata
from pathlib import Path

import requests

import sources
from catalog_seed import CURATED
from db import utcnow

BUNDLED = Path(__file__).with_name("catalog_data") / "books.json"

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

    # Concrete fallbacks when Open Library has no table of contents / description.
    def gutenberg_chapters(self, title: str, author: str) -> tuple[list[str], str] | None:
        """Chapters read from the book's own public-domain text, with the Gutenberg page as source."""
        match = sources.find_on_gutenberg(title, author)
        if not match:
            return None
        chapters = sources.parse_chapters(sources.gutenberg_text(match["id"]))
        return (chapters, sources.GUTENBERG_PAGE.format(id=match["id"])) if len(chapters) >= 3 else None

    def wikipedia_summary(self, title: str, author: str) -> tuple[str, str] | None:
        return sources.wikipedia_summary(title, author)


# --------------------------------------------------------------------------- storage
def _row_json(r, full: bool = False) -> dict:
    chapters = json.loads(r["chapters"] or "[]")
    out = {
        "id": r["id"], "title": r["title"], "author": r["author"], "year": r["year"], "pages": r["pages"],
        "coverUrl": r["cover_url"], "chapterCount": len(chapters), "curated": r["chapter_source"] == "curated",
        "slug": r["slug"] if "slug" in r.keys() else None,
        "series": r["series"] if "series" in r.keys() else None,
        "part": r["part"] if "part" in r.keys() else None,
    }
    if full:
        src = json.loads(r["sources"] or "{}") if "sources" in r.keys() else {}
        out.update(summary=r["summary"], summarySource=r["summary_source"], chapters=chapters,
                   chapterSource=r["chapter_source"], summaryUrl=src.get("summary_url"),
                   chaptersUrl=src.get("chapters_url"))
    return out


def ensure_bundled(con, path: Path = BUNDLED) -> int:
    """Load the bundled, source-attributed catalogue (idempotent). Never overrides curated entries.
    Also removes any AI-written catalogue data saved by earlier versions, so it is looked up again."""
    con.execute("""UPDATE catalog_books SET chapters = '[]', chapter_source = 'none', enriched_at = NULL
                   WHERE chapter_source = 'ai'""")
    con.execute("""UPDATE catalog_books SET summary = '', summary_source = 'none', enriched_at = NULL
                   WHERE summary_source = 'ai'""")
    if not path.exists():
        con.commit()
        return 0
    books = json.loads(path.read_text(encoding="utf-8"))
    now = utcnow()
    for b in books:
        slug = f"gutenberg:{b['gutenberg_id']}"
        existing = con.execute("SELECT chapter_source FROM catalog_books WHERE slug = ? OR (ol_key IS NOT NULL AND ol_key = ?)",
                               (slug, b.get("ol_key"))).fetchone()
        if existing is not None and existing["chapter_source"] == "curated":
            continue
        _upsert(con, slug, b.get("ol_key"), {
            "title": b["title"], "author": b["author"], "year": b.get("year"), "pages": b.get("pages"),
            "cover_url": b.get("cover_url"), "summary": b["summary"], "summary_source": b["summary_source"],
            "chapters": json.dumps(b["chapters"]), "chapter_source": b["chapter_source"],
            "sources": json.dumps({"summary_url": b.get("summary_url"), "chapters_url": b.get("chapters_url")}),
            "enriched_at": now,
        })
    con.commit()
    return len(books)


def _upsert(con, slug: str, ol_key: str | None, fields: dict) -> None:
    """Insert or update a catalogue row found by slug, else by Open Library key (rows saved by searches)."""
    row = con.execute("SELECT id FROM catalog_books WHERE slug = ?", (slug,)).fetchone()
    if row is None and ol_key:
        row = con.execute("SELECT id FROM catalog_books WHERE ol_key = ?", (ol_key,)).fetchone()
    cols = {**fields, "slug": slug, "ol_key": ol_key, "title_norm": normalize(fields["title"])}
    if row is None:
        cols["created_at"] = utcnow()
        con.execute(f"INSERT INTO catalog_books ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                    list(cols.values()))
    else:
        con.execute(f"UPDATE catalog_books SET {', '.join(f'{k} = ?' for k in cols)} WHERE id = ?",
                    [*cols.values(), row["id"]])


def ensure_curated(con) -> None:
    """Make sure the hand-curated books exist and carry their curated data (idempotent).
    Multi-part books are separate entries (Dune 1-3, The Lord of the Rings 1-3)."""
    now = utcnow()
    slugs = [b["slug"] for b in CURATED]
    # Retire curated rows from before the split (the single-volume 'The Lord of the Rings' and 'Dune').
    con.execute(f"""DELETE FROM catalog_books WHERE chapter_source = 'curated'
                    AND (slug IS NULL OR slug NOT IN ({', '.join('?' * len(slugs))}))""", slugs)
    for b in CURATED:
        _upsert(con, b["slug"], b["ol_key"], {
            "title": b["title"], "author": b["author"], "year": b["year"], "pages": b["pages"],
            "cover_url": b["cover_url"], "summary": b["summary"], "summary_source": "curated",
            "chapters": json.dumps(b["chapters"]), "chapter_source": "curated", "enriched_at": now,
            "series": b["series"], "part": b["part"],
        })
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


def approved_slugs() -> set[str]:
    """Only entries shipped with Book Quest, never rows cached from external searches."""
    slugs = {b['slug'] for b in CURATED}
    if BUNDLED.exists():
        slugs.update(f"gutenberg:{b['gutenberg_id']}" for b in json.loads(BUNDLED.read_text(encoding='utf-8')))
    return slugs


def approved_rows(con) -> list:
    """Shipped books whose every chapter already has a complete three-question encounter."""
    slugs = sorted(approved_slugs())
    marks = ','.join('?' for _ in slugs)
    rows = con.execute(f'SELECT * FROM catalog_books WHERE slug IN ({marks})', slugs).fetchall()
    coverage = {}
    for q in con.execute(f"""SELECT catalog_slug, chapter_number FROM chapter_questions
                            WHERE catalog_slug IN ({marks}) GROUP BY catalog_slug, chapter_number HAVING COUNT(*) = 3""", slugs):
        coverage.setdefault(q['catalog_slug'], set()).add(q['chapter_number'])
    ready = []
    for row in rows:
        chapters = json.loads(row['chapters'] or '[]')
        if chapters and all(n in coverage.get(row['slug'], set()) for n in range(1, len(chapters) + 1)):
            ready.append(row)
    return ready


def _local(con, qn: str, limit: int, catalog_only: bool = False) -> list:
    words = qn.split()
    if not words:
        return []
    # A word may match the title, the author or the series ('lord of the rings' finds all three volumes).
    where = " AND ".join(["(title_norm LIKE ? OR lower(author) LIKE ? OR lower(coalesce(series, '')) LIKE ?)"] * len(words))
    params = [p for w in words for p in (f"%{w}%", f"%{w}%", f"%{w}%")]
    if catalog_only:
        rows = [r for r in approved_rows(con) if all(word in r['title_norm'] or word in r['author'].lower() for word in words)]
    else:
        rows = con.execute(f"SELECT * FROM catalog_books WHERE {where}", params).fetchall()

    def rank(r):
        t = r["title_norm"]
        return (
            0 if t == qn or t == f"the {qn}" else 1 if t.startswith(qn) or t.startswith(f"the {qn}") else 2,
            0 if r["chapter_source"] == "curated" else 1,
            r["series"] or "",            # keep the parts of a series together...
            r["part"] or 0,               # ...and in reading order
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
def search(con, q: str, source: "OpenLibrary | None", limit: int = SEARCH_LIMIT, catalog_only: bool = False) -> list[dict]:
    qn = normalize(q)
    if len(qn) < 2:
        return []
    rows = _local(con, qn, limit, catalog_only)
    if not catalog_only and len(rows) < limit and len(qn) >= 3 and source is not None:
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


def details(con, catalog_id: int, source: "OpenLibrary | None", llm=None, catalog_only: bool = False) -> dict | None:
    """Full entry. The first request for a book looks up its summary and chapters once, then saves them.
    Only concrete sources are used (`llm` is accepted for API compatibility and ignored)."""
    r = con.execute("SELECT * FROM catalog_books WHERE id = ?", (catalog_id,)).fetchone()
    if r is None or (catalog_only and r['id'] not in {row['id'] for row in approved_rows(con)}):
        return None
    if not catalog_only and r["enriched_at"] is None and r["ol_key"] and source is not None:
        _enrich(con, r, source)
        r = con.execute("SELECT * FROM catalog_books WHERE id = ?", (catalog_id,)).fetchone()
    return _row_json(r, full=True)


def _enrich(con, r, source) -> None:
    summary, summary_src = r["summary"], r["summary_source"]
    chapters, chapter_src = json.loads(r["chapters"] or "[]"), r["chapter_source"]
    src = json.loads(r["sources"] or "{}") if "sources" in r.keys() else {}
    try:
        work = source.work(r["ol_key"])
        desc = work.get("description")
        desc = desc.get("value") if isinstance(desc, dict) else desc
        if desc and summary_src == "none":
            summary, summary_src = clean_description(desc), "openlibrary"
            src["summary_url"] = f"https://openlibrary.org{r['ol_key']}"
        if chapter_src == "none":
            best = max((clean_toc(e.get("table_of_contents")) for e in source.editions(r["ol_key"])),
                       key=len, default=[])
            if len(best) >= 3:
                chapters, chapter_src = best, "openlibrary"
                src["chapters_url"] = f"https://openlibrary.org{r['ol_key']}"
    except Exception as e:
        log.warning("Open Library lookup failed for %s: %s", r["ol_key"], e)
        return  # leave enriched_at empty so the next request tries again

    # Concrete fallbacks: the book's own text on Project Gutenberg, and Wikipedia. Never an AI.
    if chapter_src == "none":
        try:
            found = source.gutenberg_chapters(r["title"], r["author"])
            if found:
                chapters, chapter_src, src["chapters_url"] = found[0], "gutenberg", found[1]
        except Exception as e:
            log.info("Gutenberg lookup failed for %s: %s", r["title"], e)
    if summary_src == "none":
        try:
            found = source.wikipedia_summary(r["title"], r["author"])
            if found:
                summary, summary_src, src["summary_url"] = clean_description(found[0]), "wikipedia", found[1]
        except Exception as e:
            log.info("Wikipedia lookup failed for %s: %s", r["title"], e)

    con.execute(
        """UPDATE catalog_books SET summary = ?, summary_source = ?, chapters = ?, chapter_source = ?, sources = ?,
               enriched_at = ? WHERE id = ?""",
        (summary, summary_src, json.dumps(chapters), chapter_src, json.dumps(src), utcnow(), r["id"]),
    )
    con.commit()


def mark_used(con, catalog_id: int) -> None:
    con.execute("UPDATE catalog_books SET times_used = times_used + 1 WHERE id = ?", (catalog_id,))
