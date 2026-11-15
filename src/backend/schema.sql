-- Toward the Light: relational schema (SQLite now; kept to portable SQL so it can move to Postgres / Tiger Data later).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT    NOT NULL,
    preferred_name        TEXT    NOT NULL,            -- what the app and notifications call the reader
    email                 TEXT    UNIQUE,
    notifications_enabled INTEGER NOT NULL DEFAULT 1,  -- 0/1
    paused_after_days     INTEGER NOT NULL DEFAULT 14, -- when a book counts as "waiting"
    created_at            TEXT    NOT NULL,
    token_hash            TEXT,                        -- SHA-256 of the device's private key (sign-up)
    signed_up_at          TEXT                         -- NULL until the reader completes sign-up
);

CREATE TABLE IF NOT EXISTS books (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT    NOT NULL,
    author        TEXT    NOT NULL DEFAULT '',
    recap         TEXT    NOT NULL DEFAULT '',          -- short story-so-far context used by re-engagement
    completed     INTEGER NOT NULL DEFAULT 0,           -- chapters finished (kept in sync by checkpoints)
    created_at    TEXT    NOT NULL,
    last_activity TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);

CREATE TABLE IF NOT EXISTS chapters (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    number  INTEGER NOT NULL,                           -- 1-based position
    title   TEXT    NOT NULL,
    UNIQUE (book_id, number)
);

-- "Reading checkpoints": the reader says they have finished `completed` chapters.
CREATE TABLE IF NOT EXISTS checkpoints (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    completed  INTEGER NOT NULL,
    note       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checkpoints_book ON checkpoints(book_id, created_at);

-- Notes & memories. chapter_number NULL = a general note about the book.
CREATE TABLE IF NOT EXISTS notes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_number INTEGER,
    text           TEXT    NOT NULL,
    created_at     TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_book ON notes(book_id, created_at);

-- Reminder notifications. One row per (book, milestone, activity timestamp), so each milestone is
-- sent once per "absence"; any new reading activity changes books.last_activity and resets the ladder.
CREATE TABLE IF NOT EXISTS notifications (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id        INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    milestone_days INTEGER NOT NULL,                    -- 2, 7, 14, 30, 180
    activity_at    TEXT    NOT NULL,                    -- books.last_activity this reminder was for
    title          TEXT    NOT NULL,
    body           TEXT    NOT NULL,
    created_at     TEXT    NOT NULL,
    read_at        TEXT,
    push_status    TEXT    NOT NULL DEFAULT 'none',     -- none | sent | pending | failed | no_subscription
    UNIQUE (book_id, milestone_days, activity_at)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

-- LLM-written text (kind = 'recap' | 'notification'), cached per reading position: cache_key hashes
-- everything the prompt used (chapters read, notes, name...), so new progress or notes regenerate it.
CREATE TABLE IF NOT EXISTS llm_summaries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    kind       TEXT    NOT NULL,
    cache_key  TEXT    NOT NULL,
    content    TEXT    NOT NULL,                        -- JSON
    model      TEXT,
    created_at TEXT    NOT NULL,
    UNIQUE (book_id, kind, cache_key)
);

-- Shared book catalogue. Starts with hand-curated entries and grows as readers search: results from
-- Open Library are saved here, then enriched once (summary, chapters) and reused by everyone after.
CREATE TABLE IF NOT EXISTS catalog_books (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ol_key         TEXT    UNIQUE,                      -- Open Library work key, e.g. /works/OL27448W
    title          TEXT    NOT NULL,
    title_norm     TEXT    NOT NULL,                    -- lower-case, accents/punctuation stripped, for search
    author         TEXT    NOT NULL DEFAULT '',
    year           INTEGER,
    pages          INTEGER,
    cover_url      TEXT,
    summary        TEXT    NOT NULL DEFAULT '',
    summary_source TEXT    NOT NULL DEFAULT 'none',     -- curated | openlibrary | wikipedia | none
    chapters       TEXT    NOT NULL DEFAULT '[]',       -- JSON list of chapter titles
    chapter_source TEXT    NOT NULL DEFAULT 'none',     -- curated | openlibrary | gutenberg | none
    sources        TEXT    NOT NULL DEFAULT '{}',       -- JSON: summary_url, chapters_url (attribution)
    slug           TEXT,                                -- stable id: curated:dune-1, gutenberg:1342 (unique index in db.py)
    series         TEXT,                                -- multi-part books: 'Dune', 'The Lord of the Rings'
    part           INTEGER,
    times_used     INTEGER NOT NULL DEFAULT 0,          -- how often readers added it (ranks search)
    enriched_at    TEXT,                                -- when summary/chapters were looked up
    created_at     TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_catalog_title ON catalog_books(title_norm);

-- Boss-battle questions: three per chapter of a catalogue book.
--   source 'text'         : made by rules from the chapter's own text (no AI); every answer is in the text
--   source 'ai-text'      : written by an AI from the chapter's text only; `evidence` is a verified quote from it
--   source 'ai-knowledge' : written by an AI from its knowledge of the book (no public text, e.g. Dune)
CREATE TABLE IF NOT EXISTS chapter_questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_slug   TEXT    NOT NULL,
    chapter_number INTEGER NOT NULL,
    position       INTEGER NOT NULL,                    -- 0, 1, 2
    prompt         TEXT    NOT NULL,
    options        TEXT    NOT NULL,                    -- JSON list of 4 strings
    correct_index  INTEGER NOT NULL,
    explanation    TEXT    NOT NULL DEFAULT '',
    evidence       TEXT    NOT NULL DEFAULT '',
    source         TEXT    NOT NULL,
    model          TEXT,
    created_at     TEXT    NOT NULL,
    UNIQUE (catalog_slug, chapter_number, position)
);

-- Chapters the AI question writer could not do (so they are not retried on every pass).
CREATE TABLE IF NOT EXISTS question_attempts (
    catalog_slug   TEXT    NOT NULL,
    chapter_number INTEGER NOT NULL,
    failures       INTEGER NOT NULL DEFAULT 0,
    last_at        TEXT    NOT NULL,
    PRIMARY KEY (catalog_slug, chapter_number)
);

-- Daily count of background AI requests (free tiers allow only so many per day).
CREATE TABLE IF NOT EXISTS llm_usage (
    day      TEXT PRIMARY KEY,                          -- YYYY-MM-DD (UTC)
    requests INTEGER NOT NULL DEFAULT 0
);

-- Web Push subscriptions (one per browser/device that opted in).
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT    NOT NULL UNIQUE,
    p256dh     TEXT    NOT NULL,
    auth       TEXT    NOT NULL,
    created_at TEXT    NOT NULL
);
