# Toward the Light

A gamified reading companion: every book is a curved pixel-art journey from night toward sunrise. See [plan.md](plan.md) for the brief.

## Run

No build step or dependencies. Open `index.html` directly, or serve the folder:

```
npx serve .        # or: python -m http.server
```

Data is stored in `localStorage` (use "Reset sample data" on the dashboard to restore the seed books).

## Structure

| File | Role |
| --- | --- |
| `js/journey.js` | Reusable SVG progress landscape: `Journey.render(el, {total, completed, selected, interactive, onSelect})`. Markers are placed by arc length on the curve, so any chapter count works. |
| `js/data.js` | Sample books (`Seed.books()`). |
| `js/store.js` | Persistence and derived state (`Store.*`). Swap internals for API calls later. |
| `js/services.js` | `Services.reminder(book)`: the re-engagement text. Template-based now; the intended seam for an LLM. |
| `js/app.js` | Hash router and views: dashboard, book detail, checkpoint sheet, reminder, completion. |

Per the brief's gamification section there are no streaks, XP or leaderboards; progress is purely visual.
