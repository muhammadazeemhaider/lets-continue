-- Toward the Light: relational schema (SQLite now; kept to portable SQL so it can move to Postgres / Tiger Data later).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT    NOT NULL,
    preferred_name        TEXT    NOT NULL,            -- what the app and notifications call the reader
    email                 TEXT    UNIQUE,
    notifications_enabled INTEGER NOT NULL DEFAULT 1,  -- 0/1
    paused_after_days     INTEGER NOT NULL DEFAULT 14, -- when a book counts as "waiting"
    created_at            TEXT    NOT NULL
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
    push_status    TEXT    NOT NULL DEFAULT 'none',     -- none | sent | failed | no_subscription
    UNIQUE (book_id, milestone_days, activity_at)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

-- Web Push subscriptions (one per browser/device that opted in).
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   TEXT    NOT NULL UNIQUE,
    p256dh     TEXT    NOT NULL,
    auth       TEXT    NOT NULL,
    created_at TEXT    NOT NULL
);
