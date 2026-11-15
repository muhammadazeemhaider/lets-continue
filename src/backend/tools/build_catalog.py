"""Build the bundled catalogue (catalog_data/books.json) from concrete sources only. No AI anywhere.

    python tools/build_catalog.py --target 120

For each of Project Gutenberg's most-downloaded English fiction titles:
  - chapters: read from the book's own text (sources.parse_chapters)
  - summary:  Open Library work description, else the opening of the book's Wikipedia article
  - author/year/cover/pages: Open Library (falls back to Gutenberg's catalogue)
A book is kept only if it has BOTH a chapter list and a summary. Progress is saved after every book,
so the script can be stopped and resumed.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import catalog  # noqa: E402
import sources  # noqa: E402

OUT = HERE.parent / "catalog_data" / "books.json"
SKIP_TITLE = re.compile(r"\b(complete works|collected|works of|anthology|index of|volume \d|vol\.? \d|"
                        r"selected|omnibus|poems|poetry|letters of|plays|bibliography)\b", re.I)


def short_title(t: str) -> str:
    t = sources._tidy_title(t)  # 'A CHRISTMAS CAROL in prose' -> 'A Christmas Carol in Prose'
    t = t.split(";")[0]
    t = re.split(r":\s", t)[0]
    t = re.sub(r",\s*or,.*$", "", t, flags=re.I)
    return " ".join(t.split()).strip(" .,")


def open_library(ol: catalog.OpenLibrary, title: str, author: str) -> dict | None:
    data = ol.get("/search.json", {"title": title, "author": author, "limit": 3,
                                   "fields": "key,title,author_name,first_publish_year,cover_i,number_of_pages_median"})
    want = catalog.normalize(title)
    surname = catalog.normalize(author).split(" ")[-1]
    for d in data.get("docs", []):
        have = catalog.normalize(d.get("title", ""))
        authors = catalog.normalize(" ".join(d.get("author_name") or []))
        # Same book AND the real author among its credits (not a translator-only record).
        if (have == want or have.startswith(want) or want.startswith(have)) and surname and surname in authors:
            return d
    return None


def candidates(max_pages: int):
    """Book ids, most popular first: Gutenberg's own Top lists, then (if reachable) Gutendex's English fiction."""
    seen = set()
    try:
        for gid in sources.gutenberg_top_ids():
            seen.add(gid)
            yield gid
    except Exception as e:
        print(f"Gutenberg top list unavailable ({e})")
    for page in range(1, max_pages + 1):
        try:
            listing = sources.gutendex({"languages": "en", "topic": "fiction", "copyright": "false", "page": page}, timeout=45)
        except Exception as e:
            print(f"Gutendex page {page} unavailable ({e}); stopping there")
            return
        for g in listing.get("results", []):
            if g["id"] not in seen:
                seen.add(g["id"])
                yield g["id"]


def build(target: int, max_pages: int) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    books = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else []
    done_ids = {b["gutenberg_id"] for b in books}
    skipped = {}
    seen_titles = {catalog.normalize(b["title"]) + "|" + catalog.normalize(b["author"]).split(" ")[-1] for b in books}
    ol = catalog.OpenLibrary(timeout=20)
    print(f"starting with {len(books)} books already built")

    for gid in candidates(max_pages):
        if len(books) >= target:
            break
        if gid in done_ids or gid in skipped:
            continue
        try:
            text = sources.gutenberg_text(gid)
            time.sleep(1.0)  # be polite to the Gutenberg mirror
            head = sources.text_header(text)
            if head.get("language", "").lower() != "english":
                skipped[gid] = f"not English ({head.get('language', '?')})"
                continue
            title = short_title(head.get("title", ""))
            author = sources.author_display(head.get("author", "").split(" and ")[0].split(";")[0])
            key = catalog.normalize(title) + "|" + (catalog.normalize(author).split(" ") or [""])[-1]
            if not title or not author or SKIP_TITLE.search(head.get("title", "")) or key in seen_titles:
                skipped[gid] = "collection, duplicate or missing title/author"
                continue
            if True:  # (kept as a block so each step can `continue`)
                chapters = sources.parse_chapters(text)
                if not 3 <= len(chapters) <= 400:
                    skipped[gid] = f"no reliable chapter list ({len(chapters)})"
                    print(f"  - {title}: {skipped[gid]}")
                    continue
                meta = open_library(ol, title, author)
                summary = summary_src = summary_url = ""
                if meta:
                    work = ol.work(meta["key"])
                    desc = work.get("description")
                    desc = desc.get("value") if isinstance(desc, dict) else desc
                    if desc:
                        summary, summary_src, summary_url = catalog.clean_description(desc), "openlibrary", f"https://openlibrary.org{meta['key']}"
                if not summary:
                    wiki = sources.wikipedia_summary(title, author)
                    if wiki:
                        summary, summary_url = catalog.clean_description(wiki[0]), wiki[1]
                        summary_src = "wikipedia"
                if not summary:
                    skipped[gid] = "no summary from Open Library or Wikipedia"
                    print(f"  - {title}: {skipped[gid]}")
                    continue
                entry = {
                    "gutenberg_id": gid,
                    "ol_key": meta["key"] if meta else None,
                    # Title and author from the book's own Gutenberg header: Open Library edition records
                    # carry translators, original-script names and labels like '[3/5]'.
                    "title": title,
                    "author": author,
                    "year": meta.get("first_publish_year") if meta else None,
                    "pages": meta.get("number_of_pages_median") if meta else None,
                    "cover_url": (f"https://covers.openlibrary.org/b/id/{meta['cover_i']}-M.jpg"
                                  if meta and meta.get("cover_i")
                                  else f"https://www.gutenberg.org/cache/epub/{gid}/pg{gid}.cover.medium.jpg"),
                    "summary": summary,
                    "summary_source": summary_src,
                    "summary_url": summary_url,
                    "chapters": chapters,
                    "chapter_source": "gutenberg",
                    "chapters_url": sources.GUTENBERG_PAGE.format(id=gid),
                }
                books.append(entry)
                done_ids.add(gid)
                seen_titles.add(key)
                OUT.write_text(json.dumps(books, ensure_ascii=False, indent=1), encoding="utf-8")
                print(f"[{len(books):>3}] {entry['title']} - {entry['author']}: {len(chapters)} chapters, summary from {summary_src}")
        except Exception as e:
            skipped[gid] = f"error: {type(e).__name__}: {e}"[:160]
            print(f"  - #{gid}: {skipped[gid]}")
    print(f"\nDone: {len(books)} books in {OUT} ({len(skipped)} candidates skipped)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=20)
    ap.add_argument("--max-pages", type=int, default=12)
    args = ap.parse_args()
    build(args.target, args.max_pages)
