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
