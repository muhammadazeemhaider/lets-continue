"""Concrete, non-AI sources for catalogue data.

- Project Gutenberg: the public-domain text of a book. Chapter lists are read from the book's own headings.
- Wikipedia: the opening of a book's article, used as a summary when Open Library has no description.

Gutenberg's own "summaries" field is deliberately NOT used: Gutenberg marks those as automatically generated.
"""
import re
import time

import requests

USER_AGENT = "TowardTheLight/0.1 (reading companion; catalogue builder)"
GUTENDEX = "https://gutendex.com/books/"
GUTENBERG_TEXT = "https://gutenberg.pglaf.org/cache/epub/{id}/pg{id}.txt"  # official mirror, not the main site
GUTENBERG_PAGE = "https://www.gutenberg.org/ebooks/{id}"

_session = requests.Session()
_session.headers["User-Agent"] = USER_AGENT


# --------------------------------------------------------------------------- Gutenberg text -> chapters
_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
_WORD_NUMBERS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
    "seventeen eighteen nineteen twenty".split())}
_ORDINALS = {w: i for i, w in enumerate(
    "zeroth first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth".split())}


def roman_to_int(s: str) -> int | None:
    s = s.upper()
    if not s or not re.fullmatch(r"M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})", s):
        return None
    total = 0
    for i, ch in enumerate(s):
        v = _ROMAN[ch]
        total += -v if i + 1 < len(s) and _ROMAN[s[i + 1]] > v else v
    return total


def _number(token: str) -> int | None:
    t = token.strip(".:").lower()
    if t.isdigit():
        return int(t)
    if t in _WORD_NUMBERS:
        return _WORD_NUMBERS[t]
    if t in _ORDINALS:
        return _ORDINALS[t]
    return roman_to_int(t)


CHAPTER_WORDS = {"chapter": "Chapter", "chap": "Chapter", "letter": "Letter", "stave": "Stave"}
CONTAINER_WORDS = {"book": "Book", "part": "Part", "volume": "Volume", "vol": "Volume"}
_HEADING = re.compile(
    r"^(?P<word>chapter|chap\.?|letter|stave|book|part|volume|vol\.?)\s+(?P<num>[ivxlcdm]+|\d+|[a-z]+)\b[.:\-—]?\s*(?P<rest>.*)$",
    re.IGNORECASE,
)
_BARE_ROMAN = re.compile(r"^(?P<num>[IVXLC]{1,7})\.?(?:\s+(?P<rest>[A-Z][^a-z]{2,70}))?$")  # "I." or "I. A SCANDAL..."


def _body(text: str) -> str:
    start = re.search(r"\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n", text, re.I)
    end = re.search(r"\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK", text, re.I)
    return text[start.end() if start else 0 : end.start() if end else len(text)]


def _tidy_title(t: str) -> str:
    t = re.sub(r"[_*]", "", t).strip(" .:-—")
    t = " ".join(t.split())
    letters = [c for c in t if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) > 0.7 * len(letters):  # 'JOURNAL--continued' too
        small = {"a", "an", "and", "the", "of", "in", "on", "at", "to", "for", "with", "by", "or", "but", "from"}
        words = t.lower().split()
        t = " ".join(w if (i and w in small) else w[:1].upper() + w[1:] for i, w in enumerate(words))
    return t


_SECTION = re.compile(r"^(?P<word>epilogue|prologue)\.?$", re.IGNORECASE)


def _usable_title(t: str) -> bool:
    return bool(t) and not t.startswith(("[", "(")) and any(c.isalpha() for c in t)


def parse_chapters(text: str, min_gap: int = 1200) -> list[str]:
    """Chapter titles read from a Gutenberg text's own structure. [] if nothing reliable is found.

    1. Headings: short lines set apart by blank lines, e.g. 'CHAPTER I.', 'Chapter 3. The Ball', 'LETTER 2',
       'STAVE ONE', 'I. A SCANDAL IN BOHEMIA'. Table-of-contents entries are excluded by requiring real
       text between headings and by requiring parts/books to run in order.
    2. Otherwise the book's own Contents list, keeping only entries that really appear as headings later."""
    lines = _body(text).replace("\r\n", "\n").split("\n")
    return _from_headings(lines, len(text), min_gap) or _from_contents(lines)


def _from_headings(lines: list[str], text_len: int, min_gap: int) -> list[str]:
    pos, offsets = 0, []
    for ln in lines:
        offsets.append(pos)
        pos += len(ln) + 1

    found = []  # (offset, kind, label, number, title)
    for i, raw in enumerate(lines):
        line = raw.strip()
        if not line or len(line) > 90:
            continue
        before_blank = i == 0 or not lines[i - 1].strip()
        if not before_blank:
            continue
        s = _SECTION.match(line)
        if s:
            found.append((offsets[i], "container", s.group("word").title(), None, ""))
            continue
        m = _HEADING.match(line)
        if m:
            word = m.group("word").lower().rstrip(".")
            num = _number(m.group("num"))
            if num is None:
                continue
            kind = "container" if word in CONTAINER_WORDS else "chapter"
            label = CONTAINER_WORDS.get(word) or CHAPTER_WORDS.get(word, "Chapter")
            title = m.group("rest")
            token = m.group("num").strip(".:").lower()
            style = "arabic" if token.isdigit() else "roman" if roman_to_int(token) else "word"
        else:
            m = _BARE_ROMAN.match(line)
            if not m or (roman_to_int(m.group("num")) is None):
                continue
            kind, label, num, title = "roman", "Chapter", roman_to_int(m.group("num")), m.group("rest") or ""
            style = "roman"
        title = _tidy_title(title or "")
        if not title:
            # Title on the next line ('CHAPTER I' / 'JONATHAN HARKER'S JOURNAL'), if short and set apart.
            j = i + 1
            while j < len(lines) and j <= i + 2 and not lines[j].strip():
                j += 1
            nxt = lines[j].strip() if j < len(lines) else ""
            after = lines[j + 1].strip() if j + 1 < len(lines) else ""
            if nxt and len(nxt) <= 70 and not after and len(nxt.split()) <= 10 and not nxt.endswith((",", ";")) \
                    and not _HEADING.match(nxt) and not _BARE_ROMAN.match(nxt) and _usable_title(nxt):
                title = _tidy_title(nxt)
        if not _usable_title(title):
            title = ""
        found.append((offsets[i], kind, label, num, title, style))

    if not found:
        return []
    # Choose the chapter-level kind: explicit chapter words win over bare roman numerals.
    chapter_kind = "chapter" if any(f[1] == "chapter" for f in found) else "roman"
    chapters = [f for f in found if f[1] == chapter_kind]
    # Mixed numeral styles (Moby-Dick's 'CHAPTER 32' vs the 'CHAPTER I.' of its whale classification):
    # the real chapters use the dominant style.
    styles = [f[5] for f in chapters]
    if styles:
        dominant = max(set(styles), key=styles.count)
        chapters = [f for f in chapters if f[5] == dominant]
    if chapter_kind == "roman":
        # Story collections: 'I. A SCANDAL IN BOHEMIA' are the stories, bare 'I.' 'II.' are sections inside them.
        titled = [f for f in chapters if f[4]]
        if len(titled) >= 3 and len(titled) < len(chapters):
            chapters = titled
    containers = [f for f in found if f[1] == "container"]

    # Drop table-of-contents entries: a real chapter is followed by prose before the next heading.
    # (Long gap, or at least a few full-width prose lines: Moby-Dick has chapters only a page long.)
    body = "\n".join(lines)
    kept = []
    for k, f in enumerate(chapters):
        nxt = chapters[k + 1][0] if k + 1 < len(chapters) else len(body)
        between = body[f[0]:nxt]
        prose_lines = sum(1 for ln in between.split("\n") if len(ln.strip()) >= 55)
        if nxt - f[0] >= min_gap or prose_lines >= 3 or k + 1 == len(chapters):
            kept.append(f)

    def parent(f):
        return next((c for c in reversed(containers) if c[0] < f[0]), None)

    # Parts/books must run in order; anything before the sequence restarts belongs to the contents page.
    def part_no(f):
        p = parent(f)
        return 0 if p is None else (10_000 if p[3] is None else p[3])  # Epilogue sorts last

    cut = 0
    for k in range(1, len(kept)):
        # Contents pages sit at the front; a 'restart' deep in the text is the book's own structure.
        if part_no(kept[k]) < part_no(kept[k - 1]) and kept[k][0] < 0.15 * text_len:
            cut = k
    kept = kept[cut:]
    # A trailing contents entry can survive without parts; start at the first chapter numbered 1.
    first = next((k for k, f in enumerate(kept) if f[3] == 1), 0)
    kept = kept[first:]
    # Same number twice in a row with no part between: the first one is a contents entry.
    deduped = []
    for k, f in enumerate(kept):
        nxt = kept[k + 1] if k + 1 < len(kept) else None
        if nxt and nxt[3] == f[3] and parent(nxt) is parent(f):
            continue
        deduped.append(f)
    kept = deduped
    if len(kept) < 3:
        return []
    # Parts/books that only appear in the contents page must not label the real chapters.
    containers = [c for c in containers if c[0] >= kept[0][0] - 3000]

    # Numbering must be sane: mostly +1 steps, resets to 1 allowed (new book/part).
    steps = [b[3] - a[3] for a, b in zip(kept, kept[1:])]
    good = sum(1 for s, b in zip(steps, kept[1:]) if s == 1 or b[3] == 1)
    if good < 0.85 * len(steps):
        return []
    resets = sum(1 for b in kept[1:] if b[3] == 1)
    titles = [f[4] for f in kept if f[4]]
    repeated = {t for t in titles if titles.count(t) > 1}

    out = []
    prologue = next((c for c in containers if c[3] is None and c[2] == "Prologue" and c[0] < kept[0][0]), None)
    if prologue:
        out.append("Prologue")
    for f in kept:
        offset, _, label, num, title, _style = f
        prefix = ""
        p = parent(f)
        if resets and p:
            prefix = f"{p[2]} {p[3]} · " if p[3] is not None else f"{p[2]} · "
        if not title:
            name = f"{label} {num}"
        elif title in repeated:  # e.g. Dracula's many 'Jonathan Harker's Journal' chapters
            name = f"{label} {num}: {title}"
        else:
            name = title
        out.append(prefix + name)
    # An unnumbered Epilogue after the last chapter is a reading unit of its own.
    if any(c[3] is None and c[2] == "Epilogue" and c[0] > kept[-1][0] for c in containers) \
            and not any(parent(f) and parent(f)[2] == "Epilogue" for f in kept):
        out.append("Epilogue")
    return out[:400]


def _from_contents(lines: list[str]) -> list[str]:
    """Use the book's own Contents list; keep entries that reappear later as standalone headings."""
    limit = max(200, len(lines) // 6)
    start = next((i for i, l in enumerate(lines[:limit]) if l.strip().lower().rstrip(".:") in
                  ("contents", "table of contents", "content")), None)
    if start is None:
        return []
    entries, i = [], start + 1
    while i < len(lines) and len(entries) < 400:
        s = lines[i].strip()
        i += 1
        if not s:
            continue
        if len(s) > 80 or (entries and _norm(s) == _norm(entries[0][1])):
            break  # prose started, or the first entry repeats as the first real heading
        clean = re.sub(r"^(chapter|chap\.?)\s+[ivxlcdm\d]+[.:\s]*", "", s, flags=re.I)
        clean = re.sub(r"^[ivxlcdm]+\.\s+", "", clean, flags=re.I)
        clean = re.sub(r"[\s.]*\d+$", "", clean).strip(" .")
        if _usable_title(clean):
            entries.append((i - 1, clean))
    if len(entries) < 3:
        return []
    body_from = entries[-1][0] + 1
    standalone = {}
    for j in range(body_from, len(lines)):
        s = lines[j].strip()
        if s and len(s) <= 90 and (not lines[j - 1].strip()):
            standalone.setdefault(_norm(s), j)
    found, last = [], body_from
    for _, title in entries:
        j = standalone.get(_norm(title))
        if j is not None and j >= last:
            found.append(_tidy_title(title))
            last = j
    return found if len(found) >= 3 and len(found) >= 0.7 * len(entries) else []


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower().replace("’", "'")).strip()


GUTENBERG_TOP = "https://www.gutenberg.org/browse/scores/top"


def gutenberg_top_ids(timeout: float = 30) -> list[int]:
    """Project Gutenberg's own most-downloaded list (yesterday / 7 days / 30 days), in rank order."""
    r = _session.get(GUTENBERG_TOP, timeout=timeout)
    r.raise_for_status()
    ids = []
    for m in re.finditer(r'href="/ebooks/(\d+)"', r.text):
        i = int(m.group(1))
        if i not in ids:
            ids.append(i)
    return ids


def text_header(text: str) -> dict:
    """Title / Author / Language from the header of a Gutenberg text file."""
    head = text[:6000]
    out = {}
    for field in ("Title", "Author", "Language"):
        m = re.search(rf"^{field}:\s*(.+?)\s*$", head, re.M)
        if m:
            out[field.lower()] = m.group(1).strip()
    return out


def gutenberg_text(book_id: int, timeout: float = 60) -> str:
    r = _session.get(GUTENBERG_TEXT.format(id=book_id), timeout=timeout)
    r.raise_for_status()
    r.encoding = "utf-8"
    return r.text


# --------------------------------------------------------------------------- Gutendex (catalogue search)
def gutendex(params: dict, timeout: float = 60) -> dict:
    r = _session.get(GUTENDEX, params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()


def author_display(name: str) -> str:
    """'Austen, Jane' -> 'Jane Austen'; 'Doyle, Arthur Conan' -> 'Arthur Conan Doyle'; drops '(Lucy Maud)'."""
    name = re.sub(r"\s*\([^)]*\)", "", name or "").strip()
    if "," in name:
        last, first = [p.strip() for p in name.split(",", 1)]
        name = f"{first} {last}"
    return " ".join(name.split())


def find_on_gutenberg(title: str, author: str = "", timeout: float = 30) -> dict | None:
    """Best public-domain English match for a title (used when other sources have no chapter list)."""
    data = gutendex({"search": f"{title} {author}".strip(), "languages": "en"}, timeout=timeout)
    want = re.sub(r"[^a-z0-9 ]", "", title.lower())
    for b in data.get("results", []):
        have = re.sub(r"[^a-z0-9 ]", "", b["title"].lower())
        if have.startswith(want) or want.startswith(have.split(";")[0].strip()):
            return b
    return None


# --------------------------------------------------------------------------- Wikipedia summaries
WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"


def wikipedia_summary(title: str, author: str = "", timeout: float = 20) -> tuple[str, str] | None:
    """(extract, page_url) for the book's Wikipedia article, verified to be about this book. None otherwise."""
    surname = author.split()[-1] if author else ""
    r = _session.get(WIKI_API, params={
        "action": "query", "list": "search", "format": "json", "srlimit": 5,
        "srsearch": f'intitle:"{title}" {surname} novel',
    }, timeout=timeout)
    r.raise_for_status()
    for hit in r.json().get("query", {}).get("search", []):
        page = hit["title"]
        s = _session.get(WIKI_SUMMARY.format(title=page.replace(" ", "_")), timeout=timeout)
        if s.status_code != 200:
            continue
        d = s.json()
        text = d.get("extract") or ""
        if d.get("type") != "standard" or not text:
            continue
        lowered = text.lower()
        # Must be about a book by this author, not a film or a person.
        if surname and surname.lower() not in lowered:
            continue
        if not re.search(r"\b(novel|novella|book|story|stories|collection|fiction|tale|play|poem)\b", lowered):
            continue
        return text, d.get("content_urls", {}).get("desktop", {}).get("page", "")
    return None


def polite_pause(seconds: float = 1.0) -> None:
    time.sleep(seconds)
