# Toward the Light

A gamified reading companion: every book is a curved pixel-art journey from night toward sunrise. See [plan.md](plan.md) for the brief.

## Monorepo layout

```
src/
  frontend/   web app (this README section)
  ...         other services will live alongside
```

## Run the frontend

No build step or dependencies (needs Node only for the optional dev server).

```
cd src/frontend
npm start            # or: node dev-server.js 5173   -> http://localhost:5173
```

Alternatives: `python -m http.server 5173` from `src/frontend`, or just open `src/frontend/index.html` in a browser.

To test on a phone, run the server and open `http://<your-computer-LAN-IP>:5173` on the same Wi-Fi.

Data is stored in `localStorage` (use "Reset sample data" on the dashboard to restore the seed books).

## Frontend structure (`src/frontend`)

| File | Role |
| --- | --- |
| `js/journey.js` | Reusable SVG progress landscape: `Journey.render(el, {total, completed, selected, interactive, onSelect})`. Markers are placed by arc length on the curve, so any chapter count works. |
| `js/data.js` | Sample books (`Seed.books()`). |
| `js/store.js` | Persistence, derived state and streaks (`Store.*`). Swap internals for API calls later. |
| `js/services.js` | `Services.reminder(book)`: the re-engagement text. Template-based now; the intended seam for an LLM. |
| `js/app.js` | Hash router and views: dashboard, book detail, checkpoint sheet, reminder, completion. |

## Streaks

A streak is the number of consecutive calendar days with any reading activity (a checkpoint or a note). It stays alive until the day ends, and a lapsed streak shows a gentle "Light a new streak today" rather than a penalty. Shown overall on the dashboard and per book. There is no XP, leaderboard or daily challenge.

## Backend (`src/backend`)

Flask + SQLite (stdlib `sqlite3`, no ORM). The schema in `schema.sql` is plain relational SQL so it can move to Postgres / Tiger Data later; only `db.py` would change.

```
cd src/backend
pip install -r requirements.txt
python -m flask --app app seed        # optional: load the sample books (add --reset to start over)
python -m flask --app app run --debug --port 5000
python -m pytest                      # tests
```

The database file is created at `src/backend/data/toward_the_light.db` (override with `DATABASE_PATH`). CORS is open in dev; set `CORS_ORIGIN` when deploying.

**Data model:** `users` (name, preferred name, email, notification prefs, paused-after-days) → `books` → `chapters`, `checkpoints`, `notes` (chapter note or general note).

**API** (JSON, camelCase, matching the frontend's data shape; single user for now via `current_user()`, the seam for auth):

| Method | Path | Purpose |
| --- | --- | --- |
| GET / PUT | `/api/user` | Profile: `name`, `preferredName`, `email`, `notificationsEnabled`, `pausedAfterDays` |
| GET / POST | `/api/books` | List books / create (`title`, `author`, `recap`, `chapters[]` or `chapterCount`) |
| GET / PATCH / DELETE | `/api/books/<id>` | Book with chapters, notes, history, streak |
| POST | `/api/books/<id>/checkpoints` | `{completed, note?}`; returns book + `justFinished` |
| POST / DELETE | `/api/books/<id>/notes[/<noteId>]` | `{text, chapter?}` (omit `chapter` for a general note) |
| GET | `/api/streak` | Overall streak (`?tz=` minutes east of UTC, e.g. `-new Date().getTimezoneOffset()`) |
| GET | `/api/books/<id>/reminder` | Re-engagement text using the preferred name; the seam for LLM generation |
