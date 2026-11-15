"""LLM recaps and notification copy: spoiler-safe prompts, caching, fallbacks, and the OpenRouter client."""
import json
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import db as dbmod  # noqa: E402
import llm  # noqa: E402
import summaries  # noqa: E402
from app import create_app  # noqa: E402

CHAPTERS = ["The End", "The Beginning", "The Blue Man", "Ruby", "The Captain"]


class FakeLLM:
    """Records prompts; answers with canned JSON (or raises)."""

    models = ["fake/model:free"]

    def __init__(self, reply=None, fail=False):
        self.calls, self.fail = [], fail
        self.reply = reply or {"recap": "Eddie met the Blue Man, who showed him lives are connected.",
                               "nudge": "Ruby is waiting for you.",
                               "title": "Eddie's story is waiting", "body": "The Blue Man said no act is random. Ready for more?"}

    def complete_json(self, system, user, max_tokens=700, temperature=0.7):
        self.calls.append({"system": system, "user": user})
        if self.fail:
            raise llm.LLMError("every model failed")
        return dict(self.reply), "fake/model:free"


@pytest.fixture
def make(tmp_path):
    def _make(fake=None):
        app = create_app({"DATABASE": str(tmp_path / "l.db"), "TESTING": True, "LLM": fake,
                          "LLM_ASYNC": False,  # write checkpoint recaps inline so tests are deterministic
                          "PUSH_SENDER": lambda info, payload: "sent"})
        return app, app.test_client()
    return _make


def new_book(c):
    return c.post("/api/books", json={"title": "The Five People You Meet in Heaven", "author": "Mitch Albom",
                                      "chapters": CHAPTERS}).get_json()["id"]


def add_book(c, completed=3, note=None):
    bid = new_book(c)
    c.post(f"/api/books/{bid}/checkpoints", json={"completed": completed, "note": note or ""})
    return bid


def age(app, book_id, days):
    ts = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
    con = dbmod.connect(app.config["DATABASE"])
    con.execute("UPDATE books SET last_activity = ? WHERE id = ?", (ts, book_id))
    con.commit()
    con.close()


# ------------------------------------------------------------------ spoiler safety
def test_prompt_only_contains_chapters_already_read(make):
    fake = FakeLLM()
    app, c = make(fake)
    bid = add_book(c, completed=3, note="no random acts")
    assert c.post(f"/api/books/{bid}/recap").get_json()["source"] == "llm"
    prompt = fake.calls[0]["user"]
    assert "The Blue Man" in prompt and "no random acts" in prompt
    assert "Next chapter: 'Ruby'" in prompt  # the next title is already shown in the app
    assert "The Captain" not in prompt  # nothing beyond the next chapter is ever sent
    assert "never reveal" in fake.calls[0]["system"]


def test_personal_notes_are_labelled_and_placeholder_name_is_not_used(make):
    fake = FakeLLM()
    app, c = make(fake)
    bid = new_book(c)
    c.post(f"/api/books/{bid}/notes", json={"text": "Recommended by Dad. Read it slowly."})  # general note
    c.post(f"/api/books/{bid}/notes", json={"text": "no random acts", "chapter": 3})
    c.post(f"/api/books/{bid}/checkpoints", json={"completed": 3})
    prompt = fake.calls[-1]["user"]
    assert "(about the reader) Recommended by Dad" in prompt and "(story note, ch. 3) no random acts" in prompt
    assert "do not address them by name" in prompt  # default name "Reader" is a placeholder
    c.put("/api/user", json={"preferredName": "Azeem"})
    c.post(f"/api/books/{bid}/checkpoints", json={"completed": 4})  # the next chapter's recap uses the name
    assert "Reader's name: Azeem." in fake.calls[-1]["user"]


def test_headline_skips_placeholder_name(make):
    app, c = make(None)
    bid = add_book(c)
    assert c.get(f"/api/books/{bid}/reminder").get_json()["headline"] == "Your journey is waiting for you."
    c.put("/api/user", json={"preferredName": "Azeem"})
    assert c.get(f"/api/books/{bid}/reminder").get_json()["headline"] == "Your journey is waiting for you, Azeem."


def test_empty_reply_reports_finish_reason():
    s = FakeSession({"a:free": FakeResp(200, {"choices": [{"message": {"content": ""}, "finish_reason": "length"}]})})
    with pytest.raises(llm.LLMError, match="finish_reason=length"):
        llm.OpenRouterClient("sk-test", ["a:free"], session=s).complete_json("s", "u")


# ------------------------------------------------------------------ recap endpoint + cache
def test_recap_is_written_at_checkpoint_and_shown_the_same_every_time(make):
    fake = FakeLLM()
    app, c = make(fake)
    bid = new_book(c)
    r = c.post(f"/api/books/{bid}/checkpoints", json={"completed": 3}).get_json()
    assert r["recapPending"] is True and len(fake.calls) == 1  # written when the chapter is marked done
    expected = {"source": "llm", "recap": fake.reply["recap"], "nudge": fake.reply["nudge"], "model": "fake/model:free"}
    for _ in range(3):  # every visit shows the same saved recap, without new requests
        g = c.get(f"/api/books/{bid}/reminder").get_json()
        assert g["source"] == "llm" and g["recap"] == fake.reply["recap"] and g["llmPending"] is False
        assert c.post(f"/api/books/{bid}/recap").get_json() == expected
    assert len(fake.calls) == 1


def test_notes_keep_the_saved_recap_and_the_next_checkpoint_writes_a_new_one(make):
    fake = FakeLLM()
    app, c = make(fake)
    bid = add_book(c, completed=3)
    c.post(f"/api/books/{bid}/notes", json={"text": "Ruby built the pier", "chapter": 3})
    c.put("/api/user", json={"preferredName": "Azeem"})
    g = c.get(f"/api/books/{bid}/reminder").get_json()
    assert g["source"] == "llm" and g["llmPending"] is False and len(fake.calls) == 1  # unchanged
    c.post(f"/api/books/{bid}/checkpoints", json={"completed": 4})
    assert len(fake.calls) == 2 and "Ruby built the pier" in fake.calls[1]["user"]  # note carried into the next one
    c.post(f"/api/books/{bid}/checkpoints", json={"completed": 3})  # going back: chapter 3's recap is reused
    assert len(fake.calls) == 2


def test_no_recap_for_nothing_read_or_finished_books(make):
    fake = FakeLLM()
    app, c = make(fake)
    bid = new_book(c)
    assert c.post(f"/api/books/{bid}/checkpoints", json={"completed": 0}).get_json()["recapPending"] is False
    assert c.get(f"/api/books/{bid}/reminder").get_json()["llmPending"] is False
    done = c.post(f"/api/books/{bid}/checkpoints", json={"completed": len(CHAPTERS)}).get_json()
    assert done["recapPending"] is False and done["justFinished"] is True and fake.calls == []


def test_opening_while_the_recap_is_being_written_waits_instead_of_asking_twice(make):
    class SlowLLM(FakeLLM):
        def complete_json(self, *a, **kw):
            time.sleep(0.3)
            return super().complete_json(*a, **kw)

    slow = SlowLLM()
    app, c = make(None)  # create the book without generating anything
    bid = add_book(c, completed=3)
    results = []

    def ask():
        con = dbmod.connect(app.config["DATABASE"])
        results.append(summaries.get_recap(con, bid, slow))
        con.close()

    threads = [threading.Thread(target=ask) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(slow.calls) == 1 and all(r and r["recap"] == slow.reply["recap"] for r in results)


def test_checkpoint_writes_recap_in_the_background(tmp_path):
    class SlowLLM(FakeLLM):
        def complete_json(self, *a, **kw):
            time.sleep(0.3)
            return super().complete_json(*a, **kw)

    app = create_app({"DATABASE": str(tmp_path / "bg.db"), "TESTING": True, "LLM": SlowLLM(),
                      "PUSH_SENDER": lambda i, p: "sent"})  # LLM_ASYNC defaults to True
    c = app.test_client()
    bid = new_book(c)
    t = time.monotonic()
    assert c.post(f"/api/books/{bid}/checkpoints", json={"completed": 2}).get_json()["recapPending"] is True
    assert time.monotonic() - t < 0.25  # saving the checkpoint does not wait for the model
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and c.get(f"/api/books/{bid}/reminder").get_json()["source"] != "llm":
        time.sleep(0.05)
    assert c.get(f"/api/books/{bid}/reminder").get_json()["source"] == "llm"


def test_llm_failure_falls_back_to_template(make):
    app, c = make(FakeLLM(fail=True))
    bid = add_book(c)
    assert c.post(f"/api/books/{bid}/recap").get_json()["source"] == "template"
    r = c.get(f"/api/books/{bid}/reminder").get_json()
    assert r["source"] == "template" and r["recap"] == "" and "Ruby" in r["nudge"]


def test_no_llm_configured_means_template_and_not_pending(make):
    app, c = make(None)
    bid = add_book(c)
    r = c.get(f"/api/books/{bid}/reminder").get_json()
    assert r["source"] == "template" and r["llmPending"] is False
    assert c.post(f"/api/books/{bid}/recap").get_json()["source"] == "template"


def test_overlong_or_empty_model_output_is_cleaned(make):
    app, c = make(FakeLLM(reply={"recap": "word " * 200, "nudge": "  spaced   out  "}))
    bid = add_book(c)
    out = c.post(f"/api/books/{bid}/recap").get_json()
    assert len(out["recap"]) <= 421 and out["recap"].endswith("…") and out["nudge"] == "spaced out"
    app2, c2 = make(FakeLLM(reply={"recap": "   "}))
    assert c2.post(f"/api/books/{add_book(c2)}/recap").get_json()["source"] == "template"


def test_cache_keeps_only_a_few_rows_per_book(make):
    fake = FakeLLM()
    app, c = make(fake)
    bid = add_book(c, completed=0)
    for n in range(1, 6):
        c.post(f"/api/books/{bid}/checkpoints", json={"completed": n % 5})
        c.post(f"/api/books/{bid}/notes", json={"text": f"note {n}"})
        c.post(f"/api/books/{bid}/recap")
    for _ in range(3):
        c.post(f"/api/books/{bid}/notes", json={"text": "more"})
        c.post(f"/api/books/{bid}/recap")
    con = dbmod.connect(app.config["DATABASE"])
    assert con.execute("SELECT COUNT(*) FROM llm_summaries WHERE book_id = ?", (bid,)).fetchone()[0] <= 5


# ------------------------------------------------------------------ notifications
def test_due_reminder_uses_llm_copy(make):
    fake = FakeLLM()
    app, c = make(fake)
    bid = add_book(c, note="no random acts")
    age(app, bid, 8)
    made = c.post("/api/notifications/check").get_json()["created"]
    assert made[0]["title"] == fake.reply["title"] and made[0]["body"] == fake.reply["body"]
    notify = [call for call in fake.calls if "push notification" in call["system"]]
    assert len(notify) == 1 and "about a week" in notify[0]["user"] and "no random acts" in notify[0]["user"]


def test_reminder_falls_back_to_template_when_llm_fails(make):
    app, c = make(FakeLLM(fail=True))
    bid = add_book(c)
    age(app, bid, 3)
    made = c.post("/api/notifications/check").get_json()["created"]
    assert made[0]["title"] == "A small nudge"  # the template


def test_warm_recaps_prewrites_for_waiting_books_only(make):
    """Backfill for books whose recap was never written (e.g. older data or the model was down at checkpoint)."""
    fake = FakeLLM()
    app, c = make(None)  # checkpoints without an LLM: no recaps yet
    waiting, fresh = add_book(c), add_book(c)
    age(app, waiting, 5)
    con = dbmod.connect(app.config["DATABASE"])
    assert summaries.warm_recaps(con, fake, limit=3) == 1
    assert summaries.cached_recap(con, waiting) and summaries.cached_recap(con, fresh) is None
    assert summaries.warm_recaps(con, fake, limit=3) == 0  # already cached: no new calls
    assert len(fake.calls) == 1


# ------------------------------------------------------------------ OpenRouter client
class FakeResp:
    def __init__(self, status, payload):
        self.status_code, self._p, self.text = status, payload, json.dumps(payload)

    def json(self):
        return self._p


class FakeSession:
    def __init__(self, script):
        self.script, self.models_called = script, []

    def post(self, url, headers=None, json=None, timeout=None):
        self.models_called.append(json["model"])
        assert headers["Authorization"] == "Bearer sk-test" and json["reasoning"]["exclude"] is True
        return self.script[json["model"]]


def ok(content):
    return FakeResp(200, {"choices": [{"message": {"content": content}}]})


def test_client_falls_back_across_models_and_cools_down_rate_limited():
    s = FakeSession({
        "a:free": FakeResp(429, {"error": {"code": 429, "message": "rate-limited"}}),
        "b:free": ok(""),  # reasoning model that produced no answer
        "c:free": ok('Sure!\n```json\n{"recap": "hi", "nudge": "go"}\n```'),
    })
    client = llm.OpenRouterClient("sk-test", ["a:free", "b:free", "c:free"], session=s)
    data, model = client.complete_json("sys", "user")
    assert data == {"recap": "hi", "nudge": "go"} and model == "c:free"
    client.complete_json("sys", "user")
    assert s.models_called == ["a:free", "b:free", "c:free", "b:free", "c:free"]  # a skipped while cooling down


def test_client_raises_when_every_model_fails():
    s = FakeSession({"a:free": FakeResp(500, {"error": {"message": "boom"}})})
    with pytest.raises(llm.LLMError, match="boom"):
        llm.OpenRouterClient("sk-test", ["a:free"], session=s).complete_json("s", "u")


@pytest.mark.parametrize("text", ['{"a": 1}', '```json\n{"a": 1}\n```', 'Here you go: {"a": 1} hope it helps'])
def test_parse_json_object_tolerates_chatter(text):
    assert llm.parse_json_object(text) == {"a": 1}


def test_client_from_env(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    assert llm.client_from_env() is None
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-x")
    monkeypatch.setenv("LLM_MODELS", "x:free, y:free")
    assert llm.client_from_env().models == ["x:free", "y:free"]
