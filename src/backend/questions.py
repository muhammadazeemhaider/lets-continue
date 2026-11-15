"""Boss-battle questions: three per chapter.

Two kinds, both checkable against the book itself:
  * 'text'    - made by rules from the chapter's own text (no AI): "which of these happens in this chapter?"
                (a real sentence from this chapter vs. real sentences from other chapters) and
                fill-in-the-missing-name (a sentence from the chapter with a character's name removed).
  * 'ai-text' - written by an AI from the chapter's text only, kept only if every answer comes with an
                exact quote that really appears in that chapter (see `validate_ai`).
  * 'ai-knowledge' - for books without a public text (e.g. Dune): written from the model's knowledge, labelled.
"""
import hashlib
import json
import random
import re
from collections import Counter

from db import utcnow

QUESTIONS_PER_CHAPTER = 3

# --------------------------------------------------------------------------- text helpers
_SENTENCE = re.compile(r"[^.!?\"“”]*?[A-Z][^.!?]{35,220}[.!?]")
_WORD = re.compile(r"[A-Za-z][A-Za-z'’-]+")
_NOT_NAMES = set("""I A An The And But Or If In On At To For Of By With From As It He She They We You His Her Their Our
Its This That These Those There Here Then When Where What Who Why How Which While After Before Upon Into Over Under
Mr Mrs Miss Ms Dr Sir Madam Lady Lord Chapter Book Part Volume Letter Stave Yes No Oh Ah Well Now So Not Nor Yet
Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September
October November December God Heaven English French One Two Three Four Five Six Seven Eight Nine Ten All Some Every
Each Do Did Does Have Had Has Be Been Was Were Is Are Will Would Could Should Shall May Might Must Let Pray Indeed
Perhaps Only Even Still Just Very Much More Most Such Many Few Both Neither Either Why Whom Whose My Me Your Him Them
Us Mine Yours Theirs Hers Ours Thus Thou Thee Thy Thine Ye Street Square Road Lane Hall House Park Church Court
Place Majesty Highness Excellency Honour Doctor Colonel Major Captain Professor Inspector Sergeant""".split())
_PERSON_CUE = re.compile(
    r"\b(?:Mr|Mrs|Miss|Ms|Dr|Lady|Sir|Lord|Madame|Monsieur|Mademoiselle|Captain|Colonel|Uncle|Aunt|Count|Countess)\.?\s+([A-Z][a-z]{2,})"
    r"|\b([A-Z][a-z]{2,})\s+(?:said|replied|cried|asked|answered|whispered|exclaimed|shouted|thought|smiled|laughed)\b"
    r"|\b(?:said|replied|cried|asked|answered|whispered|exclaimed)\s+([A-Z][a-z]{2,})\b")


def normalize_space(s: str) -> str:
    return " ".join(s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').split())


def sentences(text: str) -> list[str]:
    flat = " ".join(text.split())
    out = []
    for m in _SENTENCE.finditer(flat):
        s = m.group(0).strip(" \"'“”")
        if 50 <= len(s) <= 200 and "_" not in s and "[" not in s and not s.isupper():
            out.append(s)
    return out


def book_names(chapter_texts: list[str]) -> list[str]:
    """Character/place names: capitalised words that appear mid-sentence at least 3 times in the book."""
    counts = Counter()
    for text in chapter_texts:
        for m in re.finditer(r"(?<=[a-z,;] )([A-Z][a-z]{2,})\b", " ".join(text.split())):
            w = m.group(1)
            if w not in _NOT_NAMES:
                counts[w] += 1
    return [w for w, c in counts.most_common() if c >= 3]


def people(chapter_texts: list[str], names: list[str]) -> set[str]:
    """The subset of names used like people: after Mr./Miss/Lady..., or next to said/replied/asked..."""
    cues = Counter()
    for text in chapter_texts:
        for m in _PERSON_CUE.finditer(" ".join(text.split())):
            cues[next(g for g in m.groups() if g)] += 1
    return {n for n in names if cues[n] >= 2}


def strip_heading(text: str) -> str:
    """Drop the chapter's heading lines ('CHAPTER II.', its title) so they don't leak into sentences."""
    lines = text.split("\n")
    k = 0
    while k < len(lines) and k < 8 and len(lines[k].strip()) < 70:
        k += 1
    return "\n".join(lines[k:]) if k < len(lines) else text


def _rng(*parts) -> random.Random:
    return random.Random(int(hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()[:12], 16))


def _shuffle(correct: str, wrong: list[str], rng: random.Random) -> tuple[list[str], int]:
    options = [correct, *wrong]
    rng.shuffle(options)
    return options, options.index(correct)


def _short(s: str, limit: int = 150) -> str:
    return s if len(s) <= limit else s[: limit - 1].rsplit(" ", 1)[0] + "…"


# --------------------------------------------------------------------------- rule-based questions
def text_questions(slug: str, chapters: list[str], index: int, names: list[str],
                   persons: set[str] | None = None, split: list[list[str]] | None = None) -> list[dict]:
    """Three questions for chapter `index` (0-based) built only from the book's text. [] if the chapter
    is too short to make three good ones (the boss battle then falls back to the reader's own excerpt).
    `split` is each chapter's sentences, precomputed once per book (War and Peace has 365 chapters)."""
    rng = _rng(slug, index)
    persons = persons or set()
    split = split if split is not None else [sentences(t) for t in chapters]
    mine = split[index]
    if len(mine) < 3:
        return []
    out = []

    # 1. Which of these happens in this chapter? (a real line from here vs. real lines from other chapters)
    others = [s for k, ss in enumerate(split) if abs(k - index) > 1 for s in ss[:40]]
    candidates = [s for s in mine if not s.startswith(("I ", "But ", "And "))] or mine
    if len(others) >= 3:
        pick = candidates[len(candidates) // 3] if len(candidates) > 3 else rng.choice(candidates)
        wrong = rng.sample(others, 3)
        options, correct = _shuffle(_short(pick), [_short(w) for w in wrong], rng)
        if len(set(options)) == 4:
            out.append({
                "prompt": "Which of these moments happens in this chapter?",
                "options": options, "correct_index": correct,
                "explanation": f"This line is from this chapter: “{pick}”",
                "evidence": pick,
            })

    # 2-3. Fill in the missing name.
    name_set = set(names)
    used_sentences = {out[0]["evidence"]} if out else set()
    used_names = set()
    for s in sorted(mine, key=lambda x: -len(x)):
        if len(out) == QUESTIONS_PER_CHAPTER:
            break
        if s in used_sentences:
            continue
        present = [w for w in _WORD.findall(s) if w in name_set]
        # Prefer blanking a person; their distractors are other people (never 'England' for 'Watson').
        present.sort(key=lambda w: w not in persons)
        target = next((w for w in present if w not in used_names and s.count(w) == 1), None)
        if not target:
            continue
        same_kind = [n for n in names[:60] if (n in persons) == (target in persons)]
        pool = [n for n in same_kind if n != target and n not in s]
        if len(pool) < 3:
            continue
        wrong = rng.sample(pool[:15] if len(pool) >= 15 else pool, 3)
        options, correct = _shuffle(target, wrong, rng)
        out.append({
            "prompt": f"Fill in the missing name: “{_short(s.replace(target, '_____', 1), 220)}”",
            "options": options, "correct_index": correct,
            "explanation": f"The line reads: “{s}”",
            "evidence": s,
        })
        used_sentences.add(s)
        used_names.add(target)

    # Not enough names (e.g. an essay-like chapter): fill in a distinctive word instead.
    for s in mine:
        if len(out) == QUESTIONS_PER_CHAPTER:
            break
        if s in used_sentences:
            continue
        words = [w for w in _WORD.findall(s) if len(w) >= 7 and w.lower() == w and s.count(w) == 1]
        if not words:
            continue
        target = max(words, key=len)
        vocab = sorted({w.lower() for t in chapters for w in _WORD.findall(t[:4000])
                        if len(w) >= 7 and w.lower() not in s.lower()})
        if len(vocab) < 3:
            continue
        wrong = rng.sample(vocab, 3)
        options, correct = _shuffle(target, wrong, rng)
        out.append({
            "prompt": f"Fill in the missing word: “{_short(s.replace(target, '_____', 1), 220)}”",
            "options": options, "correct_index": correct,
            "explanation": f"The line reads: “{s}”",
            "evidence": s,
        })
        used_sentences.add(s)
    return out if len(out) == QUESTIONS_PER_CHAPTER else []


def build_book(slug: str, chapter_texts: list[str]) -> dict[int, list[dict]]:
    """{chapter number (1-based): [3 questions]} for every chapter where three good questions exist."""
    chapter_texts = [strip_heading(t) for t in chapter_texts]
    names = book_names(chapter_texts)
    persons = people(chapter_texts, names)
    split = [sentences(t) for t in chapter_texts]
    result = {}
    for i in range(len(chapter_texts)):
        qs = text_questions(slug, chapter_texts, i, names, persons, split)
        if qs:
            result[i + 1] = qs
    return result


# --------------------------------------------------------------------------- validating AI questions
def validate_ai(raw, chapter_text: str | None) -> list[dict]:
    """Keep only well-formed questions. With a chapter text, each must carry an exact quote from it."""
    items = raw.get("questions") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        return []
    haystack = normalize_space(chapter_text).lower() if chapter_text else None
    good = []
    for q in items:
        if not isinstance(q, dict):
            continue
        prompt = " ".join(str(q.get("question") or q.get("prompt") or "").split())
        options = [" ".join(str(o).split()) for o in (q.get("options") or [])]
        correct = q.get("answer_index", q.get("correct_index"))
        evidence = " ".join(str(q.get("evidence") or "").split())
        if not prompt or len(options) != 4 or len({o.lower() for o in options}) != 4 or not all(options):
            continue
        if not isinstance(correct, int) or not 0 <= correct <= 3:
            continue
        if any(len(o) > 160 for o in options) or len(prompt) > 300:
            continue
        if haystack is not None:
            # The proof must really be in this chapter (at least 20 characters, matched exactly).
            if len(evidence) < 20 or normalize_space(evidence).lower() not in haystack:
                continue
        good.append({
            "prompt": prompt, "options": options, "correct_index": correct,
            "explanation": " ".join(str(q.get("explanation") or "").split())[:400]
            or (f"The chapter says: “{evidence}”" if evidence else ""),
            "evidence": evidence,
        })
    return good


# --------------------------------------------------------------------------- storage
def store(con, slug: str, chapter: int, qs: list[dict], source: str, model: str | None = None,
          replace_ai: bool = False) -> bool:
    """Save three questions for a chapter. Rule-based ('text') questions never overwrite AI-written ones
    unless `replace_ai`; AI questions replace whatever was there."""
    if len(qs) != QUESTIONS_PER_CHAPTER:
        return False
    if source == "text" and not replace_ai:
        existing = con.execute("SELECT source FROM chapter_questions WHERE catalog_slug = ? AND chapter_number = ? LIMIT 1",
                               (slug, chapter)).fetchone()
        if existing and existing[0] != "text":
            return False
    now = utcnow()
    con.executemany(
        """INSERT INTO chapter_questions (catalog_slug, chapter_number, position, prompt, options, correct_index,
               explanation, evidence, source, model, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(catalog_slug, chapter_number, position) DO UPDATE SET prompt = excluded.prompt,
               options = excluded.options, correct_index = excluded.correct_index, explanation = excluded.explanation,
               evidence = excluded.evidence, source = excluded.source, model = excluded.model,
               created_at = excluded.created_at""",
        [(slug, chapter, i, q["prompt"], json.dumps(q["options"]), q["correct_index"], q["explanation"],
          q.get("evidence", ""), source, model, now) for i, q in enumerate(qs)],
    )
    return True


def for_chapter(con, slug: str, chapter: int) -> dict | None:
    rows = con.execute(
        """SELECT * FROM chapter_questions WHERE catalog_slug = ? AND chapter_number = ? ORDER BY position""",
        (slug, chapter),
    ).fetchall()
    if len(rows) != QUESTIONS_PER_CHAPTER:
        return None
    return {
        "source": rows[0]["source"],
        "model": rows[0]["model"],
        "questions": [{
            "id": f"{slug}:{chapter}:{r['position']}",
            "prompt": r["prompt"], "options": json.loads(r["options"]), "correctIndex": r["correct_index"],
            "explanation": r["explanation"], "evidence": r["evidence"],
        } for r in rows],
    }


def ensure_bundled(con, directory) -> int:
    """Load the bundled rule-based questions (catalog_data/questions/*.json). Never replaces AI-written ones.
    Returns the number of chapters available."""
    from pathlib import Path
    directory = Path(directory)
    if not directory.exists():
        return 0
    total = 0
    for path in sorted(directory.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        slug, chapters = data["slug"], data["chapters"]
        total += len(chapters)
        have = con.execute("SELECT COUNT(*) FROM chapter_questions WHERE catalog_slug = ?", (slug,)).fetchone()[0]
        if have >= QUESTIONS_PER_CHAPTER * len(chapters):
            continue  # already loaded (or upgraded)
        for n, qs in chapters.items():
            store(con, slug, int(n), qs, "text")
    con.commit()
    return total
