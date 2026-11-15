"""Catalogue: curated books, search that grows the catalogue, one-time enrichment, AI gaps, book creation."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import catalog  # noqa: E402
import db as dbmod  # noqa: E402
from app import create_app  # noqa: E402


class FakeOpenLibrary:
    """Canned Open Library: two searchable works, one with a table of contents, one without."""

    def __init__(self, fail=False):
        self.fail, self.calls = fail, []
        self.works = {
            "/works/OL1W": {"description": {"value": "**A tale** of [high adventure](https://x.y) in Middle-earth.\n\n----------\nAlso contained in: Box set"}},
            "/works/OL2W": {"description": "Old money and new money on Long Island."},
        }
        self.toc = {
            "/works/OL1W": [
                {"table_of_contents": [{"title": "Contents"}, {"title": "Short"}]},
                {"table_of_contents": [
                    {"level": 0, "title": "List of Illustrations"}, {"level": 0, "title": "Note on the Text"},
                    {"level": 0, "label": "Part 1", "title": "The Journey"},
                    {"level": 1, "title": "An Unexpected Party"}, {"level": 1, "title": "Roast Mutton"},
                    {"level": 1, "title": "A Short Rest"}, {"level": 1, "title": "Over Hill and Under Hill"},
                    {"level": 0, "title": "Index"},
                ]},
            ],
            "/works/OL2W": [{"title": "no toc here"}],
        }

    def search(self, q):
        self.calls.append(("search", q))
        if self.fail:
            raise ConnectionError("offline")
        return [
            {"ol_key": "/works/OL1W", "title": "The Hobbit", "author": "J.R.R. Tolkien", "year": 1937, "pages": 310, "cover_url": None},
            {"ol_key": "/works/OL2W", "title": "The Great Gatsby", "author": "F. Scott Fitzgerald", "year": 1925, "pages": 180, "cover_url": None},
            {"ol_key": "/works/OL27448W", "title": "The Lord of the Rings", "author": "J.R.R. Tolkien", "year": 1954, "pages": 1, "cover_url": None},
        ]

    def work(self, key):
        self.calls.append(("work", key))
        if self.fail:
            raise ConnectionError("offline")
        return self.works[key]

    def editions(self, key):
        self.calls.append(("editions", key))
        return self.toc[key]

    gutenberg = {"The Great Gatsby": ([f"Chapter {i}" for i in range(1, 10)], "https://www.gutenberg.org/ebooks/64317")}
    wikipedia = {}

    def gutenberg_chapters(self, title, author):
        self.calls.append(("gutenberg", title))
        return self.gutenberg.get(title)

    def wikipedia_summary(self, title, author):
        self.calls.append(("wikipedia", title))
        return self.wikipedia.get(title)


class ExplodingLLM:
    """The catalogue must never ask an LLM for chapters or summaries."""

    models = ["fake:free"]

    def complete_json(self, *a, **kw):
        raise AssertionError("catalogue asked the LLM")


@pytest.fixture
def make(tmp_path):
    def _make(source=None, llm=None):
        app = create_app({"DATABASE": str(tmp_path / "c.db"), "TESTING": True, "CATALOG_SOURCE": source, "LLM": llm,
                          "LLM_ASYNC": False, "PUSH_SENDER": lambda i, p: "sent"})
        return app, app.test_client()
    return _make


# ------------------------------------------------------------------ curated
def test_curated_books_are_always_in_the_catalogue(make):
    app, c = make()  # no network at all
    items = c.get("/api/catalog/search?q=lord of the").get_json()["items"]
    assert items[0]["title"] == "The Lord of the Rings" and items[0]["curated"] and items[0]["chapterCount"] == 62
    entry = c.get(f"/api/catalog/{items[0]['id']}").get_json()
    assert entry["chapterSource"] == "curated" and entry["chapters"][8] == "At the Sign of the Prancing Pony"
    assert entry["author"] == "J.R.R. Tolkien" and "Frodo" in entry["summary"]
    dune = c.get("/api/catalog/search?q=dune herbert").get_json()["items"][0]
    assert dune["title"] == "Dune" and dune["chapterCount"] == 48


def test_search_ignores_case_accents_and_word_order(make):
    app, c = make()
    for q in ["LORD rings", "rings lord", "tolkien", "Dúne"]:
        assert c.get(f"/api/catalog/search?q={q}").get_json()["items"], q
    assert c.get("/api/catalog/search?q=d").get_json()["items"] == []  # too short


# ------------------------------------------------------------------ growing from Open Library
def test_unknown_books_come_from_open_library_and_are_saved(make):
    ol = FakeOpenLibrary()
    app, c = make(ol)
    items = c.get("/api/catalog/search?q=hobbit").get_json()["items"]
    titles = [i["title"] for i in items]
    assert "The Hobbit" in titles and titles.count("The Lord of the Rings") <= 1  # curated row not duplicated
    assert ("search", "hobbit") in ol.calls
    # Saved: an offline search now still finds it
    app2, c2 = make(FakeOpenLibrary(fail=True))
    assert any(i["title"] == "The Hobbit" for i in c2.get("/api/catalog/search?q=the hobbit").get_json()["items"])


def test_repeated_search_is_not_sent_again(make):
    catalog._search_cache.clear()
    ol = FakeOpenLibrary()
    app, c = make(ol)
    c.get("/api/catalog/search?q=gatsby")
    c.get("/api/catalog/search?q=Gatsby!")
    assert [x for x in ol.calls if x[0] == "search"] == [("search", "gatsby")]


def test_details_are_enriched_once_with_cleaned_summary_and_toc(make):
    ol = FakeOpenLibrary()
    app, c = make(ol)
    hobbit = next(i for i in c.get("/api/catalog/search?q=hobbit").get_json()["items"] if i["title"] == "The Hobbit")
    entry = c.get(f"/api/catalog/{hobbit['id']}").get_json()
    assert entry["summary"] == "A tale of high adventure in Middle-earth."  # markdown + appendix removed
    assert entry["chapters"] == ["An Unexpected Party", "Roast Mutton", "A Short Rest", "Over Hill and Under Hill"]
    assert entry["chapterSource"] == "openlibrary" and entry["summarySource"] == "openlibrary"
    before = len(ol.calls)
    c.get(f"/api/catalog/{hobbit['id']}")
    assert len(ol.calls) == before  # saved: no second lookup


def test_missing_toc_is_read_from_the_books_own_text_never_an_llm(make):
    ol = FakeOpenLibrary()
    app, c = make(ol, ExplodingLLM())
    gatsby = next(i for i in c.get("/api/catalog/search?q=gatsby").get_json()["items"] if i["title"] == "The Great Gatsby")
    entry = c.get(f"/api/catalog/{gatsby['id']}").get_json()
    assert entry["chapterSource"] == "gutenberg" and len(entry["chapters"]) == 9
    assert entry["chaptersUrl"] == "https://www.gutenberg.org/ebooks/64317"
    assert entry["summarySource"] == "openlibrary" and entry["summaryUrl"].endswith("/works/OL2W")


def test_no_concrete_source_leaves_fields_empty(make):
    ol = FakeOpenLibrary()
    ol.gutenberg = {}
    ol.works["/works/OL2W"] = {}
    ol.wikipedia = {}
    app, c = make(ol, ExplodingLLM())
    gatsby = next(i for i in c.get("/api/catalog/search?q=gatsby").get_json()["items"] if i["title"] == "The Great Gatsby")
    entry = c.get(f"/api/catalog/{gatsby['id']}").get_json()
    assert entry["chapters"] == [] and entry["chapterSource"] == "none"
    assert entry["summary"] == "" and entry["summarySource"] == "none"


def test_wikipedia_summary_when_open_library_has_none(make):
    ol = FakeOpenLibrary()
    ol.works["/works/OL2W"] = {}
    ol.wikipedia = {"The Great Gatsby": ("The Great Gatsby is a 1925 novel by F. Scott Fitzgerald.", "https://en.wikipedia.org/wiki/The_Great_Gatsby")}
    app, c = make(ol)
    gatsby = next(i for i in c.get("/api/catalog/search?q=gatsby").get_json()["items"] if i["title"] == "The Great Gatsby")
    entry = c.get(f"/api/catalog/{gatsby['id']}").get_json()
    assert entry["summarySource"] == "wikipedia" and entry["summaryUrl"].startswith("https://en.wikipedia.org/")


# ------------------------------------------------------------------ bundled catalogue
def test_bundled_catalogue_loads_with_sources_and_keeps_curated(tmp_path):
    import json as _json
    data = tmp_path / "books.json"
    data.write_text(_json.dumps([
        {"gutenberg_id": 1342, "ol_key": "/works/OL66554W", "title": "Pride and Prejudice", "author": "Jane Austen",
         "year": 1813, "pages": 300, "cover_url": None, "summary": "Elizabeth Bennet meets Mr. Darcy.",
         "summary_source": "openlibrary", "summary_url": "https://openlibrary.org/works/OL66554W",
         "chapters": [f"Chapter {i}" for i in range(1, 62)], "chapter_source": "gutenberg",
         "chapters_url": "https://www.gutenberg.org/ebooks/1342"},
        {"gutenberg_id": 1, "ol_key": "/works/OL27448W", "title": "The Lord of the Rings", "author": "J.R.R. Tolkien",
         "summary": "should not replace curated", "summary_source": "wikipedia", "summary_url": "",
         "chapters": ["x", "y", "z"], "chapter_source": "gutenberg", "chapters_url": ""},
    ]), encoding="utf-8")
    app = create_app({"DATABASE": str(tmp_path / "b.db"), "TESTING": True, "CATALOG_SOURCE": None})
    con = dbmod.connect(app.config["DATABASE"])
    # an AI-written row saved by an older version is cleared so it gets looked up again
    con.execute("""INSERT INTO catalog_books (ol_key, title, title_norm, author, chapters, chapter_source, summary,
                   summary_source, enriched_at, created_at) VALUES ('/works/OLAI', 'Old', 'old', 'X', '["a"]', 'ai',
                   'made up', 'ai', 'now', 'now')""")
    con.commit()
    assert catalog.ensure_bundled(con, data) == 2
    assert catalog.ensure_bundled(con, data) == 2  # idempotent
    c = app.test_client()
    pp = c.get("/api/catalog/search?q=pride prejudice").get_json()["items"]
    assert len(pp) == 1 and pp[0]["chapterCount"] == 61
    entry = c.get(f"/api/catalog/{pp[0]['id']}").get_json()
    assert entry["chapterSource"] == "gutenberg" and entry["chaptersUrl"].endswith("/1342")
    lotr = c.get("/api/catalog/search?q=lord of the rings").get_json()["items"][0]
    assert lotr["chapterCount"] == 62 and lotr["curated"]  # curated entry untouched
    old = con.execute("SELECT chapter_source, summary_source, enriched_at FROM catalog_books WHERE ol_key='/works/OLAI'").fetchone()
    assert tuple(old) == ("none", "none", None)


def test_shipped_catalogue_file_is_concrete_only():
    path = catalog.BUNDLED
    if not path.exists():
        pytest.skip("catalogue not built yet")
    import json as _json
    books = _json.loads(path.read_text(encoding="utf-8"))
    assert books
    for b in books:
        assert b["chapter_source"] in ("gutenberg", "openlibrary") and len(b["chapters"]) >= 3, b["title"]
        assert b["summary_source"] in ("openlibrary", "wikipedia") and b["summary"], b["title"]
        assert b["chapters_url"].startswith("https://") and b["summary_url"].startswith("https://"), b["title"]


def test_failed_lookup_is_retried_later(make):
    ol = FakeOpenLibrary()
    app, c = make(ol)
    hobbit = next(i for i in c.get("/api/catalog/search?q=hobbit").get_json()["items"] if i["title"] == "The Hobbit")
    ol.fail = True
    assert c.get(f"/api/catalog/{hobbit['id']}").get_json()["chapterSource"] == "none"
    ol.fail = False
    assert c.get(f"/api/catalog/{hobbit['id']}").get_json()["chapterSource"] == "openlibrary"


# ------------------------------------------------------------------ adding a book from the catalogue
def test_create_book_from_catalogue_fills_everything(make):
    app, c = make()
    lotr = c.get("/api/catalog/search?q=lord of the rings").get_json()["items"][0]
    b = c.post("/api/books", json={"catalogId": lotr["id"]}).get_json()
    assert b["title"] == "The Lord of the Rings" and b["author"] == "J.R.R. Tolkien"
    assert b["totalChapters"] == 62 and "Frodo" in b["recap"]
    edited = c.post("/api/books", json={"catalogId": lotr["id"], "title": "LOTR (my copy)", "chapterCount": 3}).get_json()
    assert edited["title"] == "LOTR (my copy)" and edited["totalChapters"] == 3  # reader's edits win
    assert c.post("/api/books", json={"catalogId": 9999}).status_code == 400
    con = dbmod.connect(app.config["DATABASE"])
    assert con.execute("SELECT times_used FROM catalog_books WHERE id = ?", (lotr["id"],)).fetchone()[0] == 2


def test_popular_books_rank_higher(make):
    ol = FakeOpenLibrary()
    app, c = make(ol)
    c.get("/api/catalog/search?q=tolkien")
    hobbit = next(i for i in c.get("/api/catalog/search?q=tolkien").get_json()["items"] if i["title"] == "The Hobbit")
    for _ in range(2):
        c.post("/api/books", json={"catalogId": hobbit["id"], "chapterCount": 3})
    assert c.get("/api/catalog/search?q=tolkien").get_json()["items"][1]["title"] == "The Hobbit"  # after curated LOTR


# ------------------------------------------------------------------ helpers
@pytest.mark.parametrize("raw,expected", [
    ([{"title": "PIRANESI"}, {"title": "THE OTHER"}, {"title": "16"}], ["Piranesi", "The Other", "16"]),
    ([{"title": "Preface"}, {"title": "One"}, {"title": "Appendix A: Maps"}, {"title": "Two"}], ["One", "Two"]),
    ([{"label": "Chapter 1"}, {"label": "Chapter 2"}], ["Chapter 1", "Chapter 2"]),
])
def test_clean_toc(raw, expected):
    assert catalog.clean_toc(raw) == expected


def test_normalize():
    assert catalog.normalize("  Lothlórien — The Mirror!  ") == "lothlorien the mirror"
