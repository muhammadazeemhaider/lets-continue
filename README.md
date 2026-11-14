# Toward the Light

A gamified reading companion: every book is a curved pixel-art journey from night toward sunrise. See [plan.md](plan.md) for the brief.

## Monorepo layout

```
src/
  frontend/   web app (this README section)
  ...         other services will live alongside
```

## Run the whole app

Two terminals (the frontend talks to the backend over HTTP, so both must be running):

```
# 1) backend  ->  http://localhost:5000
cd src/backend
pip install -r requirements.txt
python -m flask --app app seed        # first time only: sample books (optional)
python -m flask --app app run --port 5000

# 2) frontend ->  http://localhost:5173
cd src/frontend
npm start
```

Open http://localhost:5173. The frontend looks for the API on port 5000 of the same host (so a phone on your Wi-Fi can use `http://<your-LAN-IP>:5173`; run Flask with `--host 0.0.0.0` for that). Override with `?api=http://host:port`. If the backend is down the app shows a "server isn't answering" screen with a retry button.

All data lives in the backend's SQLite database; the browser stores nothing. Use "+ Add a book" in the app, or seed sample books.

## Frontend structure (`src/frontend`)

| File | Role |
| --- | --- |
| `js/journey.js` | Reusable SVG progress landscape: `Journey.render(el, {total, completed, selected, interactive, onSelect})`. Markers are placed by arc length on the curve, so any chapter count works. |
| `js/config.js` | API base URL. |
| `js/store.js` | API client + in-memory cache (`Store.*`): synchronous reads, async mutations. |
| `js/services.js` | Offline fallback for the reminder text (the backend endpoint is the primary source). |
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

## Reminder notifications

When a book you have not finished goes quiet, the app sends a small, warm reminder. The ladder, measured from the book's last reading activity (a checkpoint or a note), is **2 days, 1 week, 2 weeks, 1 month, 6 months**. Rules:

- Each step is sent once per absence. Any new activity resets the ladder, so the 2-day nudge can fire again next time.
- If the server was off for a long time, only the latest step is sent (no burst of backlog reminders).
- Finished books and readers who turned reminders off get nothing.
- Every reminder lands in the in-app inbox (the bell on the dashboard). If the reader enabled notifications on a device, it is also delivered as a **Web Push** notification, which appears on the phone's lock screen even when the app is closed.

**What runs it:** `flask run` starts a background check every 30 minutes (change with `NOTIFY_INTERVAL_MINUTES`, `0` disables). You can also run it by hand or from cron / Task Scheduler:

```
python -m flask --app app notify               # one pass
python -m flask --app app notify --loop 30     # keep checking every 30 minutes
```

**Phones.** Web Push needs a secure origin (HTTPS, or `localhost`). Android Chrome works once the reader taps "Enable on this device". On iPhone/iPad (iOS 16.4+) the app must first be added to the Home Screen (Share, then Add to Home Screen), and notifications are enabled from the installed app. A plain `http://192.168.x.x` address cannot receive push; use an HTTPS tunnel (for example Cloudflare Tunnel or ngrok) for phone testing, or deploy.

Server keys: a VAPID key pair is generated on first use at `src/backend/data/vapid.json` (git-ignored). Keep it stable in production, because changing it invalidates every device's subscription. Set `VAPID_SUBJECT` (a `mailto:` address) in production.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/notifications` | Inbox: `{unread, items[]}` |
| POST | `/api/notifications/<id>/read`, `/api/notifications/read-all` | Mark read |
| POST | `/api/notifications/check` | Run a reminder pass now (idempotent) |
| GET | `/api/push/public-key` | VAPID public key for the browser to subscribe with |
| POST | `/api/push/subscribe`, `/api/push/unsubscribe` | Register or remove this device |
| POST | `/api/push/test` | Send a test push to the reader's devices |

## Testing on a phone (HTTPS tunnel)

`npm start` proxies `/api` to Flask, so the browser only talks to one origin and one tunnel covers both. Cloudflare's free "quick tunnel" needs no account:

```
winget install --id Cloudflare.cloudflared      # once
# terminal 1 (use a throwaway database so the public URL never exposes real data)
cd src/backend
$env:DATABASE_PATH = "data/tunnel_test.db"      # PowerShell; bash: export DATABASE_PATH=data/tunnel_test.db
python -m flask --app app seed                  # first time only
python -m flask --app app run --port 5000
# terminal 2
cd src/frontend ; npm start
# terminal 3
cloudflared tunnel --url http://localhost:5173  # prints https://<random>.trycloudflare.com
```

Open that URL on the phone. On iPhone, Share, then Add to Home Screen, and open it from the Home Screen. Then tap the gear, then "Enable on this device", then "Send a test".

To watch a real reminder arrive: `python -m flask --app app backdate <book id> 8` (pretend it was last read 8 days ago), then `python -m flask --app app notify` (or wait for the scheduler).

The URL is public and the app has no login yet: share it with nobody, use test data only, and stop `cloudflared` when finished. The URL changes every time it restarts, and a changed URL needs the app re-added/re-enabled on the phone.
