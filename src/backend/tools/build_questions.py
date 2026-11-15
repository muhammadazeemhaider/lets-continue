"""Build boss-battle questions for the bundled catalogue from each book's own text (no AI).

    python tools/build_questions.py

For every book in catalog_data/books.json: download its Project Gutenberg text (cached in data/texts/, which is
git-ignored), split it into the same chapters the catalogue lists, and write three questions per chapter to
catalog_data/questions/<gutenberg id>.json. A book whose chapters don't line up exactly is skipped, never guessed.
"""
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))

import questions  # noqa: E402
import sources  # noqa: E402

BOOKS = BACKEND / "catalog_data" / "books.json"
OUT = BACKEND / "catalog_data" / "questions"
TEXTS = BACKEND / "data" / "texts"


def cached_text(gid: int) -> str:
    """The book's text, downloaded once (also used by the background AI question writer)."""
    TEXTS.mkdir(parents=True, exist_ok=True)
    path = TEXTS / f"{gid}.txt"
    # newline="" keeps the file byte-for-byte (Windows would otherwise turn \r\n into \r\r\n).
    if path.exists():
        with open(path, encoding="utf-8", newline="") as f:
            return f.read()
    text = sources.gutenberg_text(gid)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    time.sleep(1.0)  # be polite to the Gutenberg mirror
    return text


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    books = json.loads(BOOKS.read_text(encoding="utf-8"))
    total_ch = total_q = 0
    for b in books:
        gid, slug = b["gutenberg_id"], f"gutenberg:{b['gutenberg_id']}"
        parts = sources.chapter_texts(cached_text(gid))
        titles = [t for t, _ in parts]
        if titles != b["chapters"]:
            print(f"  ! {b['title']}: chapters don't match the catalogue ({len(titles)} vs {len(b['chapters'])}); skipped")
            continue
        built = questions.build_book(slug, [t for _, t in parts])
        (OUT / f"{gid}.json").write_text(json.dumps(
            {"slug": slug, "title": b["title"], "source": "text",
             "chapters": {str(n): qs for n, qs in built.items()}}, ensure_ascii=False, indent=1), encoding="utf-8")
        total_ch += len(parts)
        total_q += 3 * len(built)
        print(f"  {b['title']}: {len(built)}/{len(parts)} chapters with 3 questions")
    print(f"\n{total_q} questions for {total_q // 3} of {total_ch} chapters -> {OUT}")


if __name__ == "__main__":
    main()
