"""Boss questions: rule-based from text, AI validation against the chapter, loading, the API, the AI writer."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db as dbmod  # noqa: E402
import question_writer  # noqa: E402
import questions as Q  # noqa: E402
from app import create_app  # noqa: E402

NAMES = ["Alice", "Rabbit", "Hatter", "Duchess", "Queen", "Gryphon", "Turtle", "Mouse"]


def chapter(i: int) -> str:
    """A synthetic chapter with distinct sentences and recurring characters."""
    a, b = NAMES[i % len(NAMES)], NAMES[(i + 3) % len(NAMES)]
    lines = [
        f"On the morning of day {i} the travellers met beside the old stone bridge, and {a} said nothing at all.",
        f"Later that afternoon the wind turned cold, so {b} replied that they should shelter in the barn number {i}.",
        f"Everyone agreed that {a} asked the strangest questions whenever the lanterns of village {i} were lit.",
        f"By evening the river had risen, and {b} whispered that the boats of harbour {i} would never make it home.",
        f"It was then that {a} cried out, pointing at the shape of tower {i} rising out of the fog beyond the hill.",
        f"Nobody slept that night, because {b} answered every knock at the door of cottage {i} with a lantern raised.",
    ]
    return "\n".join(lines * 2)


BOOK = [chapter(i) for i in range(8)]


# ------------------------------------------------------------------ rule-based questions
def test_every_chapter_gets_three_valid_questions_grounded_in_its_text():
    built = Q.build_book("test:book", BOOK)
    assert sorted(built) == list(range(1, 9))
    for n, qs in built.items():
        assert len(qs) == 3
        for q in qs:
            assert len(q["options"]) == 4 and len(set(q["options"])) == 4 and 0 <= q["correct_index"] <= 3
            assert q["evidence"] and Q.normalize_space(q["evidence"]) in Q.normalize_space(BOOK[n - 1])
        which = qs[0]
        assert which["prompt"].startswith("Which of these")
        assert which["options"][which["correct_index"]].rstrip("…") in BOOK[n - 1]
        for q in qs[1:]:
            missing = q["options"][q["correct_index"]]
            assert q["prompt"].count("_____") == 1
            assert Q.normalize_space(q["prompt"].split("“", 1)[1].rstrip("”").replace("_____", missing)
                                     .rstrip("…")) in Q.normalize_space(BOOK[n - 1])


def test_questions_are_deterministic_and_answers_are_spread_out():
    a, b = Q.build_book("test:book", BOOK), Q.build_book("test:book", BOOK)
    assert a == b
    positions = {q["correct_index"] for qs in a.values() for q in qs}
    assert len(positions) >= 3  # not always option A


def test_too_short_chapter_gets_no_questions():
    assert Q.build_book("t", ["Too short.", *BOOK[1:]]).get(1) is None


def test_heading_lines_are_stripped():
    assert Q.strip_heading("CHAPTER II.\n\nDown the Hole\n\n" + "x" * 80 + "\nmore").startswith("x")


# ------------------------------------------------------------------ AI output validation
TEXT = "Mira reached Mossfall at dusk. The gatekeeper offered her a bright silver key or a small ember wrapped in moss. Mira chose the ember."


def ai_q(evidence, options=("The ember", "The key", "A map", "A sword"), idx=0):
    return {"question": "What did Mira choose?", "options": list(options), "answer_index": idx,
            "explanation": "She chose the ember.", "evidence": evidence}


def test_validate_ai_requires_a_real_quote_from_the_chapter():
    good = Q.validate_ai({"questions": [ai_q("Mira chose the ember.")]}, TEXT)
    assert len(good) == 1 and good[0]["correct_index"] == 0
    assert Q.validate_ai({"questions": [ai_q("Mira chose the golden sword.")]}, TEXT) == []  # invented quote
    assert Q.validate_ai({"questions": [ai_q("ember")]}, TEXT) == []  # too short to prove anything
    assert Q.validate_ai({"questions": [ai_q("Mira chose the ember.", options=("a", "a", "b", "c"))]}, TEXT) == []
    assert Q.validate_ai({"questions": [ai_q("Mira chose the ember.", idx=7)]}, TEXT) == []
    # curly quotes and spacing differences still match
    assert Q.validate_ai({"questions": [ai_q("Mira  reached Mossfall at dusk.")]}, TEXT)
    # knowledge questions (no text) need no quote
    assert len(Q.validate_ai({"questions": [ai_q("")]}, None)) == 1


# ------------------------------------------------------------------ storage, loading, API
@pytest.fixture
def app(tmp_path):
    return create_app({"DATABASE": str(tmp_path / "q.db"), "TESTING": True, "CATALOG_SOURCE": None, "LLM": None,
                       "PUSH_SENDER": lambda i, p: "sent"})


def test_bundled_questions_load_and_never_overwrite_ai(app, tmp_path):
    folder = tmp_path / "questions"
    folder.mkdir()
    built = Q.build_book("gutenberg:99", BOOK)
    (folder / "99.json").write_text(json.dumps({"slug": "gutenberg:99", "chapters": {str(k): v for k, v in built.items()}}))
    con = dbmod.connect(app.config["DATABASE"])
    assert Q.ensure_bundled(con, folder) == 8
    assert Q.for_chapter(con, "gutenberg:99", 1)["source"] == "text"
    ai = [{"prompt": f"AI {i}", "options": ["a", "b", "c", "d"], "correct_index": 1, "explanation": "x", "evidence": "y"}
          for i in range(3)]
    assert Q.store(con, "gutenberg:99", 1, ai, "ai-text", "m")
    con.execute("DELETE FROM chapter_questions WHERE catalog_slug='gutenberg:99' AND chapter_number=2")  # force reload
    Q.ensure_bundled(con, folder)
    assert Q.for_chapter(con, "gutenberg:99", 1)["source"] == "ai-text"  # kept
    assert Q.for_chapter(con, "gutenberg:99", 2)["source"] == "text"  # restored
    assert not Q.store(con, "gutenberg:99", 1, built[1], "text")


def test_questions_endpoint_for_shelf_books(app):
    c = app.test_client()
    con = dbmod.connect(app.config["DATABASE"])
    lotr = c.get("/api/catalog/search?q=fellowship").get_json()["items"][0]
    book = c.post("/api/books", json={"catalogId": lotr["id"]}).get_json()
    assert c.get(f"/api/books/{book['id']}/chapters/1/questions").get_json() == {"available": False, "questions": [], "source": None}
    qs = [{"prompt": f"Who left the Shire {i}?", "options": ["Frodo", "Sam", "Merry", "Pippin"], "correct_index": 0,
           "explanation": "Frodo.", "evidence": ""} for i in range(3)]
    Q.store(con, "curated:lotr-1", 1, qs, "ai-knowledge", "m")
    con.commit()
    got = c.get(f"/api/books/{book['id']}/chapters/1/questions").get_json()
    assert got["available"] and got["source"] == "ai-knowledge" and len(got["questions"]) == 3
    q = got["questions"][0]
    assert set(q) == {"id", "prompt", "options", "correctIndex", "explanation", "evidence"} and q["correctIndex"] == 0
    # a book added before slugs existed is matched by title + author, once
    old = c.post("/api/books", json={"title": "The Fellowship of the Ring", "author": "J.R.R. Tolkien", "chapterCount": 22}).get_json()
    assert c.get(f"/api/books/{old['id']}/chapters/1/questions").get_json()["available"]
    assert con.execute("SELECT catalog_slug FROM books WHERE id = ?", (old["id"],)).fetchone()[0] == "curated:lotr-1"
    assert c.get("/api/books/999/chapters/1/questions").status_code == 404


# ------------------------------------------------------------------ AI writer
class FakeLLM:
    models = ["fake:free"]

    def __init__(self, mode="good"):
        self.mode, self.calls = mode, []

    def complete_json(self, system, user, max_tokens=1500, temperature=0.7):
        self.calls.append(user)
        if "Return JSON only: {\"known\"" in system or "well-known novel" in system:
            if self.mode == "unknown":
                return {"known": False}, "fake:free"
            return {"known": True, "questions": [ai_q("") for _ in range(3)]}, "fake:free"
        chapters = [int(x.split(":")[0]) for x in user.split("=== Chapter ")[1:]]
        out = []
        for n in chapters:
            first = [l for l in user.split(f"=== Chapter {n}:")[1].split("\n") if len(l) > 60][0].strip()
            ev = first if self.mode == "good" else "This sentence is not in the chapter at all, I made it up."
            out.append({"chapter": n, "questions": [ai_q(ev, options=(f"A{k}", "B", "C", "D")) for k in range(3)]})
        return {"chapters": out}, "fake:free"


@pytest.fixture
def writer_env(app, tmp_path, monkeypatch):
    """A Gutenberg-style catalogue entry whose text is served from a temp cache."""
    con = dbmod.connect(app.config["DATABASE"])
    text = "*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\n\n" + "".join(
        f"\n\n\nCHAPTER {i + 1}\n\n{BOOK[i]}\n" for i in range(8)) + "\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***"
    import sources
    titles = [t for t, _ in sources.chapter_texts(text)]
    assert len(titles) == 8
    con.execute("""INSERT INTO catalog_books (slug, title, title_norm, author, chapters, chapter_source, created_at)
                   VALUES ('gutenberg:4242', 'Test Book', 'test book', 'Ann Author', ?, 'gutenberg', 'now')""",
                (json.dumps(titles),))
    con.commit()
    texts = tmp_path / "texts"
    texts.mkdir()
    (texts / "4242.txt").write_text(text, encoding="utf-8")
    monkeypatch.setattr(question_writer, "TEXTS", texts)
    monkeypatch.setenv("QUESTION_REQUESTS_PER_DAY", "100")
    return con


def test_writer_upgrades_with_verified_quotes_and_prioritises_the_readers_chapter(app, writer_env):
    con = writer_env
    c = app.test_client()
    book = c.post("/api/books", json={"title": "Test Book", "author": "Ann Author", "chapterCount": 8}).get_json()
    c.get(f"/api/books/{book['id']}/chapters/1/questions")  # links the book to gutenberg:4242
    c.post(f"/api/books/{book['id']}/checkpoints", json={"completed": 5})
    fake = FakeLLM()
    report = question_writer.run(con, fake, max_requests=1)
    assert report["requests"] == 1
    assert ("gutenberg:4242", 6) in report["upgraded"]  # the next chapter to fight comes first
    assert Q.for_chapter(con, "gutenberg:4242", 6)["source"] == "ai-text"


def test_writer_rejects_invented_quotes_and_gives_up_after_two_tries(app, writer_env):
    con = writer_env
    con.execute("DELETE FROM catalog_books WHERE slug LIKE 'curated:%'")  # only the test book is left to work on
    con.commit()
    fake = FakeLLM("bad")
    for _ in range(3):
        question_writer.run(con, fake, max_requests=1)
    assert Q.for_chapter(con, "gutenberg:4242", 1) is None  # nothing invented was stored
    failures = con.execute("SELECT failures FROM question_attempts WHERE catalog_slug='gutenberg:4242' AND chapter_number=1").fetchone()[0]
    assert failures == 2
    assert all(n != 1 for _, n in question_writer.next_jobs(con, 50) if _ == "gutenberg:4242")


def test_writer_respects_the_daily_budget(app, writer_env, monkeypatch):
    monkeypatch.setenv("QUESTION_REQUESTS_PER_DAY", "2")
    report = question_writer.run(writer_env, FakeLLM(), max_requests=10)
    assert report["requests"] == 2 and question_writer.used_today(writer_env) == 2
    assert question_writer.run(writer_env, FakeLLM(), max_requests=10)["requests"] == 0


def test_knowledge_questions_for_books_without_text(app, writer_env):
    con = writer_env
    con.execute("DELETE FROM catalog_books WHERE slug = 'gutenberg:4242'")
    con.commit()
    report = question_writer.run(con, FakeLLM(), max_requests=1)
    slug, n = report["upgraded"][0]
    assert slug.startswith("curated:") and Q.for_chapter(con, slug, n)["source"] == "ai-knowledge"
    report = question_writer.run(con, FakeLLM("unknown"), max_requests=1)
    assert report["upgraded"] == [] and report["skipped"]  # 'I don't know this chapter' stores nothing


def test_no_llm_means_no_requests(writer_env):
    assert question_writer.run(writer_env, None)["requests"] == 0
