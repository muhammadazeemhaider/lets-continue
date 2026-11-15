# BookQuest

A local-first reading companion with the original pixel sunrise bookshelf and a handheld-style pixel RPG adventure. Log real reading sessions to explore five fictional chapters of **The Forgotten Kingdom**, earn XP and gold, and unlock the next dungeon region.

## Run

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
python -m flask --app app seed        # first time only: The Lord of the Rings and Dune (optional)
python -m flask --app app run --port 5000

# 2) frontend ->  http://localhost:5173
cd src/frontend
npm start
```

Open http://localhost:5173. The frontend looks for the API on port 5000 of the same host (so a phone on your Wi-Fi can use `http://<your-LAN-IP>:5173`; run Flask with `--host 0.0.0.0` for that). Override with `?api=http://host:port`. If the backend is down the app shows a "server isn't answering" screen with a retry button.

All data lives in the backend's SQLite database; the browser stores nothing. Use "+ Add a book" in the app, or seed sample books.

On the original bookshelf, save a reading checkpoint inside a book to animate the traveler along the existing path while the sky and sun brighten. Walking now uses short horizontal/vertical steps, four facing directions, alternating footstep poses, and a standing pose on arrival, in the style of a classic handheld RPG. Movement happens after saving progress; chapter selection does not move the character. Reduced-motion preferences display the saved position immediately. Completing a book adds morning birds and opens the sunrise celebration after the walk.

The earlier map experiment remains at `adventure.html`, separate from the primary bookshelf; it is no longer promoted on the home screen. Its BookQuest reading sessions and state remain available there.

The build checks JavaScript syntax and copies the static application to `dist/`. Tests cover sequential access, duplicate awards, level overflow, the full five-chapter journey, malformed storage, legacy migration, and session draft recovery.

## Demo

1. Select the first chapter and choose **Start reading**.
2. Start/pause/resume the optional timer, log pages, and write notes.
3. **Save session** records activity without awarding XP. Reopen the chapter to continue.
4. **Complete chapter** asks for an explicit self-reported completion, saves the current session, awards rewards exactly once, and unlocks the next region.
5. Repeat through chapter five to see the final victory. Refresh to confirm persistence. **Reset adventure** asks for confirmation.

The reading journal contains saved pages, duration, and notes. The timer pauses when the page is hidden or left; time spent away is not counted. Drafts preserve pages and notes and restore paused. State uses `bookquest-v2`, with guarded migration from `bookquest-v1`; unavailable storage falls back to memory with a visible message.

## Main files

- `js/game/engine.js`: pure progression, validation, migration, and five fictional chapter fixtures.
- `js/bookquest.js`: dashboard, accessible native dialogs, session flow, journal, timer, persistence.
- `css/bookquest.css`: base adventure layout, focus states, and responsive controls.
- `css/sunrise.css`: sunrise theme for the adventure, warm rewards, soft indigo cards, and responsive landscape.
- `js/journey.js` and `css/journey.css`: original sunrise landscapes, environmental details, checkpoint walking and sky transitions.
- `css/bookshelf.css`: the original bookshelf polish, featured journey, reading actions, and responsive layout.
- `tests/journey.test.js`: landscape rendering, checkpoint movement, reduced-motion and completion scenery regression checks.
- `js/world.js`: interactive RPG map, six player positions along a 21-point trail, animated walking and sunrise.
- `css/gameworld.css`: map-first handheld RPG layout, pixel frames, dialogue box, trainer card and chapter travel log.
- `assets/reading-world.png`: generated pixel-art world inspired by the supplied map reference; generation notes in `assets/reading-world.md`.
- `tests/engine.test.js`: domain regression checks.
- `build.js`: dependency-free static packaging.

## Scope and limitations

P0 reading/progression behavior is implemented. Reading is self-reported; no text verification is performed. The Lantern Road includes five short original demo chapters; the older sample books contain metadata rather than ebook text. Chapter boss quizzes are implemented on the main bookshelf. AI generation and selectable equipment inventory remain future milestones. The hero’s cloak is cosmetic. Google Fonts are optional enhancements with local fallbacks; the original sunrise art is inline SVG, and the new adventure map ships as a local PNG. No remote image assets are required.

Browser QA now verifies automatic checkpoint encounters, live switching of all four character move menus, attack rendering, and on-screen Cast/Next controls at 1280×800, 375×667, and 320×568. Screenshots were inspected at desktop and phone sizes. Full keyboard and assistive-technology audits remain outside these checks.

## Chapter guardian encounters

The original bookshelf now includes **The Lantern Road**, a five-chapter original story. Existing libraries gain this demo book without losing their saved books or notes. Open a chapter to read its original text, save a checkpoint marking it read, and the guardian encounter opens automatically when the traveler arrives. Choose **Maybe later** to skip it; **Challenge guardian** remains available for returning to an encounter. Each chapter has a different guardian and battle setting: mist slime/glade, owl/woods, golem/riverbank, moth/archive, dragon/summit. Longer books use named and colored variations at later chapter stops.

Each fight has 90 HP and three questions. Pick one of your selected companion’s three attacks, select an answer, then cast (or play/use for bard/knight). All attacks deal 30 damage for a correct answer, with different effects, player movement, boss recoil, dialogue, and HP updates. Each guardian has its own idle movement and reaction. **Focus** removes two wrong options once per encounter and persists across refresh. Correct answers automatically advance after the attack animation. The previous explanation remains visible below the next question. Wrong answers stay on the current question with a retry action. Optional synthesized sound starts muted. Wrong answers provide an explanation and allow another attempt without penalizing the reader. The selected companion appears in the encounter. Encounters remain optional: leaving never changes chapter completion. On the final checkpoint, the sunrise celebration follows dismissal of the encounter. Opening is driven by the traveler’s actual arrival callback, not a guessed timer; navigating away cancels pending encounters. Cleared guardians earn one persistent chapter seal; practice replays cannot remove or duplicate that seal. Refreshing resumes a partially answered encounter. Resetting sample data also clears chapter encounters.

For the original demo story, the questions are hand-authored from the included chapter text. The other sample books do not include chapter text. Those encounters ask the user to provide a summary or excerpt from the relevant chapter with no minimum word count or sentence count; a local deterministic generator creates three exact-text fill-in-the-blank recall questions. This is passage recall, not an AI comprehension assessment. Titles alone are never used to invent questions. Pasted text and encounter progress stay in browser storage; no model provider or secret is used.

Main additions: `js/boss-fixtures.js` (original text and curated questions), `js/boss-engine.js` (pure quiz validation and answer rules), `js/boss-battle.js` (encounters, pixel creatures, persistence), `css/boss.css` (battle scenes), and `tests/boss.test.js` (damage, duplicate clicks, storage recovery, source grounding, locked encounters and library migration). Battle layout and core interactions have now been checked in Chromium; see the QA notes above.

Battle interaction checks also cover choosing an answer without dealing damage, cast locking against duplicate clicks, three explicit turns, once-per-fight Focus, reduced-motion arrival, and cancelling encounters when leaving the landscape.


## Fantasy companion roster

The character picker shows four preview cards, role descriptions, and the selected class’s move list. `js/characters.js` is the shared roster for selection, persistence validation, and battle moves; SVG sprite frames are in `js/journey.js`.

| Companion | Attacks |
| --- | --- |
| `js/journey.js` | Reusable SVG progress landscape: `Journey.render(el, {total, completed, selected, interactive, onSelect})`. Markers are placed by arc length on the curve, so any chapter count works. |
| `js/config.js` | API base URL. |
| `js/store.js` | API client + in-memory cache (`Store.*`): synchronous reads, async mutations. |
| `js/services.js` | Offline fallback for the reminder text (the backend endpoint is the primary source). |
| `js/app.js` | Hash router and views: dashboard, book detail, checkpoint sheet, reminder, completion. |

Attacks use class-specific effects: rune rings, moonlight, rising roots, flying notes, sound waves, sunrise rays, slashes, shield charges and lances. All deal 30 damage on a correct answer; abilities named Insight/Perfect pitch/Battle focus/etc. retain the same once-per-encounter two-answer elimination. These are presentation choices, not different difficulty settings. Existing Classic Reader selections migrate to Lantern Keeper; supported selections persist under the same `ttl.character` key. Switching characters preserves chapter progress and guardian seals. Tests cover all twelve move-to-effect paths, distinct sprite frames, and selection restoration for all four characters.

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

### Android on the same Wi-Fi (no tunnel)

If a tunnel domain is blocked on your network, Android Chrome can treat your PC's LAN address as secure:

1. Run backend and frontend as above (`npm start` listens on all interfaces; Flask stays on localhost and is reached through the proxy).
2. Find the PC's IPv4 address (`ipconfig`), e.g. `10.0.0.244`.
3. On the phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enable it, add `http://10.0.0.244:5173`, and tap Relaunch.
4. Open `http://10.0.0.244:5173`, tap the gear, then "Enable on this device".

If the page does not load, Windows Firewall may be blocking inbound port 5173 (allow Node.js on your network profile), or the router may isolate Wi-Fi clients from each other. iPhones cannot do this and need real HTTPS.

### Troubleshooting notifications

- **"Send a test" says why.** The toast shows the push service's own answer (for example `410: ...`), and the settings sheet shows a diagnostics line.
- **"Notifications are blocked for this site".** Chrome is set to block notifications (or you once clicked Block), so it will not ask. Open `chrome://settings/content/siteDetails?site=http%3A%2F%2Flocalhost%3A5173` and set Notifications to Allow. The settings sheet has a button that copies this address.
- **"Almost ready: ... try again in a minute".** Right after notifications are turned off and on again, Google's push service briefly reports the new subscription as expired. The server keeps it for 10 minutes instead of deleting it, and pushes work again within seconds.
- **Run only one backend.** On Windows, two Flask servers could previously share port 5000 silently, splitting requests between them at random. A second `flask run` on a busy port now fails with "Port 5000 is in use by another program". Stop the old one first.

## AI recaps and reminder copy (Gemini)

When a reader comes back, "Where was I?" shows a short, spoiler-safe recap of the story so far, woven with their own notes. Reminder notifications are also written by the model. Without a key everything falls back to the template text.

**Setup:** put your key in `src/backend/.env` (git-ignored, loaded automatically):

```
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-google-ai-studio-key
# optional: comma-separated Gemini models in fallback order
GEMINI_MODELS=gemini-3.5-flash-lite
LLM_TIMEOUT_SECONDS=20
LLM_WARM_PER_PASS=3
```

`GET /api/health` shows whether the LLM is enabled and which models it will try.

**Provider:** Gemini is called directly from the backend using Google's [generateContent API](https://ai.google.dev/api/generate-content). Obtain a key in [Google AI Studio](https://aistudio.google.com/apikey), put it in the backend `.env`, and restart Flask. No key goes into frontend files. The default model is `gemini-3.5-flash-lite`; change `GEMINI_MODELS` to models available to your account. Models are tried in order, with the existing 2-minute cooldown after rate limiting. Quotas and billing depend on your Google project.

Existing deployments with only `OPENROUTER_API_KEY` continue to use OpenRouter. Set `LLM_PROVIDER=gemini` to explicitly switch; a missing Gemini key then uses template text rather than sending requests to OpenRouter. Legacy OpenRouter settings remain `LLM_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, and `LLM_MODELS`. Gemini ignores the OpenRouter model list.

Previously cached recaps remain unchanged; a new uncached chapter checkpoint uses the selected provider. Boss battle questions still use the local quiz generator and are independent of the recap provider.

**How it behaves:**

- **Spoiler safety.** The prompt only includes chapter titles the reader has finished (plus the next title, which the app already shows), and tells the model never to go past them.
- **Notes.** Chapter notes are passed as story notes. General notes are labelled "about the reader" so things like "Recommended by Dad" are never turned into plot.
- **Written when a chapter is finished.** Saving a checkpoint starts a background job that writes the "Where was I?" recap for the new position. Saving stays instant, and the recap is usually ready a few seconds later.
- **The same every time.** The recap is stored per reading position (`llm_summaries`) and shown unchanged on every visit until the next checkpoint. Notes added in between go into the next chapter's recap. Going back to an earlier chapter reuses that chapter's recap. Nothing is written for 0 chapters or for finished books.
- **Speed and no duplicates.** `GET /api/books/<id>/reminder` never waits for the model. If the recap is still being written (`llmPending`), the app calls `POST /api/books/<id>/recap`, which waits for the background job instead of sending a second request. The scheduler also backfills recaps for waiting books that have none (`LLM_WARM_PER_PASS` per pass). This matters on free tiers, which allow only a small number of requests per day.
- **Fallback.** If every model fails or returns nothing usable, the template text is used.

**Privacy.** Book titles, chapter titles and the reader's notes are sent to the configured provider (Google for Gemini, or OpenRouter for legacy deployments). Provider data handling depends on your account and service terms. The UI labels AI recaps as AI-written.

## Book catalogue

Adding a book only needs its title. As you type, the app suggests matching books (cover, author, year). Pick one and the **author, summary and chapter list fill themselves in**. Everything stays editable.

**Where the data comes from, in order:**

1. **Built-in books** (`src/backend/catalog_seed.py`): The Lord of the Rings (62 chapters across its six books) and Dune (48 chapters in three books), with hand-written spoiler-free summaries. Always available, no network needed. `flask seed` puts these two on the shelf.
2. **Our saved catalogue** (`catalog_books` table): every book anyone has searched for before. Instant.
3. **Open Library** (free, public): asked only when we have too few matches. Results are saved, so the catalogue grows as people use it, a bit like Shazam's song catalogue. The first time a book is opened, its summary and chapters are looked up once and saved for everyone:
   - **Summary:** the Open Library description, cleaned of links and markup.
   - **Chapters:** the best table of contents across all its editions, with front and back matter (preface, maps, index…) removed.
   - **Gaps:** if there is no table of contents (or no description), the AI fills it in, but only when it says it knows the book. The list is labelled "AI-suggested, check against your copy". Otherwise the reader enters the number of chapters.

Popular picks rank higher in suggestions. API: `GET /api/catalog/search?q=`, `GET /api/catalog/<id>`, and `POST /api/books` with `{"catalogId": id}` (any field the reader typed overrides the catalogue).


## Battle visibility and live class switching

The encounter has its own **Adventurer** selector. Changing it immediately updates the move names, player sprite, Focus ability label, and available attack animations, while keeping chapter quiz and guardian progress intact. The choice is saved back to the shared companion selection. Switching is disabled while an attack resolves.

The desktop dialog places the arena beside the questions. Phone layouts pin the arena above the questions. The Cast/Next footer remains visible in both; only long question text and the optional source excerpt scroll. The active attack name is displayed in the arena during casting. All twelve moves have distinct animation definitions, including separate ember and firefly effects for Lantern Keeper. Versioned battle asset URLs avoid mixing older scripts/styles with the updated layout.

Desktop QA at 1280×800 verifies the four-character roster, migration of a saved Classic Reader selection to Lantern Keeper, and creating three recall questions from a eight-word single-sentence summary. Empty or content-poor input asks for a few concrete chapter details, with no word-count threshold.


## Returning to chapters and resetting a book

Click a chapter marker on the landscape or a chapter in **The path** to open its action menu:

- **Start from here** makes that chapter current (`completed = chapter - 1`). Notes, history, previously unlocked chapters and earned guardian seals are preserved. The traveler walks back along the path; future chapters that have never been reached remain locked.
- **Replay boss battle** immediately starts a fresh practice encounter for a cleared guardian, keeping the earned seal. Read but uncleared chapters offer challenge/resume instead. Replaying does not move the reading position.
- **Reset book progress**, beside **All books**, asks for confirmation and resets only that book’s reading position, chapter unlocks and boss encounters/seals. Notes, reading history, character choice and other books are kept.

The store persists `furthestCompleted` separately from the current reading position so rewinding does not remove access to already reached encounters. A full book reset sets both to zero and clears that book’s encounter records. Desktop browser QA at 1280×800 covered map chapter selection, rewind, direct replay after rewind, cancellation/confirmation of reset, notes preservation, future chapter locking, refresh persistence and browser errors (none). Regression tests are in `tests/book-progress.test.js` and `tests/battle-turns.test.js`.

## Per-book Fantasy and Sci-fi worlds

Open a book and use **This book’s world** to choose **Fantasy** or **Sci-fi**. The choice is stored on that book, independently of other books. Chapter progress, notes, question sources, unlocked chapters, boss HP rules, earned seals, checkpoint arrival popups, rewind, replay and reset all use the same existing mechanics and storage records. Changing worlds never resets or duplicates rewards.

Each book remembers a separate companion for each world. Fantasy keeps Sage, Bard, Knight and Lantern Keeper. Sci-fi offers:

| Crew | Attacks |
| --- | --- |
| Sentinel | Laser burst, Plasma bomb, Micro missiles |
| Technomancer | Tesla arc, Gravity well, Nanite swarm |
| Star pilot | Rail shot, Drone wing, Warp strike |
| Android | Ion fist, EMP wave, Overclock |

The sci-fi landscape uses a ringed planet, lunar outposts, relay beacons, crystal deposits, landing pods and a white cratered moon that rises as chapters are completed. Sci-fi encounters replace fantasy creatures and terrain with Survey Drone/Lunar Relay, Scrap Walker/Wreckage Field, Prism Sentinel/Crystal Reactor, Nebula Ray/Orbital Archive and Mooncore Titan/Lunar Crown. Longer books get named/color variations as before. Questions always remain about the book’s supplied chapter text, regardless of the chosen world.

`js/space-world.js` contains the code-native pixel environment. `js/characters.js` now supplies two separate four-character rosters (24 distinct moves/effects total), and `js/journey.js` provides directional sprite poses for both. The per-book `world` and `companions` fields are optional and backward compatible; existing books default to Fantasy. Desktop Chromium QA at 1280×800 verified per-book independence, saved crew choices across world changes and reload, automatic sci-fi boss arrival, all twelve sci-fi animations, visible Next controls, and preserved progress/seals when returning to Fantasy, with no browser errors.


## Sci-fi moonrise and silhouette update

Sci-fi now uses a cool, starry night palette and a white pixel moon with five visible crater groups. The moon rises along the same progress-driven animation as the fantasy sun; fantasy retains its original sunrise. Sci-fi completion labels say moonrise, and encounter skies include a small white cratered moon.

The space crew have distinct silhouettes: wide armored Sentinel with a heavy rifle, slender long-coated Technomancer with a floating crystal, human Pilot with goggles/scarf/jetpack, and compact Android with twin antennas and a cable tail. The five sci-fi boss forms are a flat survey saucer, four-legged cannon walker, floating prism with separate shards, winged cyber-ray with tendrils, and a ring-shaped orbital titan. Their idle animations also differ. All directional walking frames, class attacks, stored selections and battle mechanics are preserved.

## Pirates world and interactive boss victory

**Pirates** is the third per-book world. It has a clean turquoise sea, small checkpoint islands, and a boat carrying the selected crew member. A fixed lighthouse grows brighter as reading progresses, replacing the Fantasy sun and Sci-fi moon. World selection and crew choices remain independent per book; reading progress, questions and earned seals remain shared across all three worlds.

| Pirate crew | Attacks |
| --- | --- |
| Captain | Cutlass sweep, Flintlock shot, Cannon volley |
| Navigator | Compass beam, Star chart, Whirlpool |
| Deckhand | Anchor slam, Rope snare, Powder keg |
| Sea Witch | Ghost tide, Coral curse, Spectral crew |

Pirate enemies are **Clawback Crab**, **The Powder Captain**, **Siren of the Shoals**, **The Drowned Admiral**, and **The Ink-Crowned Kraken**, with shipwreck, rival-cove, reef, lantern-wreck and abyss settings. The 12 pirate attacks have distinct effects. `js/pirate-world.js` contains the coastal environment, progress-powered lighthouse, boat transport, directional crew sprites, boss silhouettes and encounter scenery. There are now three four-person rosters and 36 distinct attacks/effects in total.

The final correct answer now automatically starts the victory sequence for every world: one soft light flash, a large VICTORY banner, the defeated guardian, and an interactive chapter seal. Collecting the seal lights it up and enables **Continue the journey**. A previously earned seal is already collected on replay. The earned seal is saved when the boss is defeated, so closing or refreshing before the collection animation never loses it; the animation does not award duplicate rewards. Reduced-motion mode omits the flash/cinematic and shows the static victory panel instead. There is no extra “See victory” click after the final strike.

Desktop Chromium QA at 1280×800 verified Pirate-world persistence, all twelve maritime attack animations, automatic victory after the third correct answer, seal collection, an on-screen Continue button, shared progress/seals, and reduced-motion behavior, with no browser errors. Victory and coastal screenshots were visually inspected. Unit/controller tests cover the three rosters, per-book selection, pirate sprite frames, all boss forms, final-hit transitions and duplicate collection protection.


## Cleaner Pirate map, boat travel and lighthouse

Pirate chapter stops are now small islands positioned along the existing route, with a separate starting harbor, fewer water ripples, and sparse palms/treasure details. The heavy boardwalk has been replaced with a light dotted sea route. During checkpoint movement the selected character rides in a boat, with a seated sprite pose, bobbing hull and a trailing wake. The passenger faces the viewer on arrival; walking sprites and boss battle controls are unchanged for the other worlds.

The ghost ship has been removed. The lighthouse stays at a fixed location away from the route. Its beam opacity, glow radius, lantern brightness and power strip increase with chapter progress, including during the sailing animation, and rewind/reset restores the corresponding earlier light level. Completion text says **Lighthouse restored**. Desktop Chromium checks at 1280×800 verified island counts, boat movement, seated travel/front-facing arrival, increasing beam strength at 0/20/60/100% progress, stationary lighthouse position, preserved reading progress and no browser errors. The simplified map and fully lit lighthouse were visually inspected.

## Fresh encounters after reset or checkpoint revisits

Progress resets now clear encounter records inside `Store.resetBookProgress` / `Store.reset` themselves, so UI callers cannot accidentally reset only the reading position. Reopening a cleared encounter (including automatic arrival at a reread checkpoint) starts a fresh 90-HP practice battle at question one rather than displaying the previous victory screen. Rewind/replay still preserves an earned seal; a full reset removes it. Victory is shown only after defeating the boss in the current attempt.

Correct-answer auto-advance is shared by all worlds: the attack animation finishes, then question 2/3 appears automatically; the final correct answer triggers victory directly. Desktop QA verifies the wrong-answer retry, preserved attack animation, automatic progression without a Next click, and final victory.

## Readable numbers

`css/readability.css` keeps the original pixel headings and artwork while using a clear system font with aligned digits for percentages, chapter counts, checkpoint values, boss HP, question counters and damage numbers. Numeric labels are slightly larger and have stronger contrast. This stylesheet loads last so older decorative font rules cannot override the data labels.

## Find my next quest

The bookshelf's discovery guide asks six questions about mood, genre, preferred length, reading difficulty, favorite books, and themes to avoid. The last two questions are optional. `POST /api/catalog/recommendations` uses the configured LLM to choose up to three IDs from saved catalogue entries with summaries and chapters, excluding titles already on the reader's shelf. Titles, authors, chapter lists, and covers always come from the catalogue; recommendations do not modify catalogue metadata. Unknown and duplicate IDs are discarded. If generation fails or no provider is configured, the results are explicitly labelled catalogue suggestions rather than personalized matches.

Readers review an editable, prefilled Add Book form before saving a recommendation. The questionnaire answers are sent to the configured AI provider; they are not stored in the database. Matching is limited to the saved catalogue and may not find a close fit for every preference.

## Boss questions from the catalogue

Every chapter's boss fight uses **3 questions from the catalogue** automatically. Pasting your own summary or excerpt remains available ("Use my own summary instead") and is the fallback when a chapter has none yet.

**Multi-part books are separate entries.** Dune is split into Book One: Dune (22 chapters), Book Two: Muad'Dib (15) and Book Three: The Prophet (11). The Lord of the Rings is split into The Fellowship of the Ring (22), The Two Towers (21) and The Return of the King (19). Searching "dune" or "lord of the rings" lists the parts in order. `flask seed` puts The Fellowship of the Ring and Dune Book One on the shelf.

**Where the questions come from (labelled in the battle):**

| Source | What it is | Coverage today |
| --- | --- | --- |
| `text` | Made by rules from the chapter's own public-domain text, with no AI: "Which of these moments happens in this chapter?" (a real line from it against lines from other chapters) and fill-in-the-missing-name (people against people, places against places). Every answer is in the chapter. | 3,342 questions, 1,114 of 1,119 chapters of the 20 classics (`catalog_data/questions/`) |
| `ai-text` | Written by a free AI model from that chapter's text only. Each answer must come with an exact quote from the chapter, otherwise it is discarded. Replaces `text` questions over time. | grows daily |
| `ai-knowledge` | Dune and The Lord of the Rings have no public text, so the AI writes from its knowledge of the book, only when it says it knows that chapter. Labelled "AI questions from the book". | grows daily (110 chapters) |

**The AI writer** runs in the background scheduler within a daily budget (`QUESTION_REQUESTS_PER_DAY`, default 35, leaving room for recaps and reminders on a free key; `QUESTION_REQUESTS_PER_PASS`, default 3). It works on the chapters readers are about to fight first. A chapter it fails twice is skipped. To run it by hand: `python -m flask --app app questions --requests 5`.

Rebuilding the bundled questions: `python tools/build_questions.py`. It downloads each book's text once into the git-ignored `data/texts/` cache. API: `GET /api/books/<id>/chapters/<n>/questions` returns `{available, source, model, questions[]}`.

## Hosted database (Tiger Data) and sign-up



The backend runs on **SQLite** locally and on **PostgreSQL** in production. Tiger Data (Tiger Cloud, the company behind TimescaleDB) is hosted Postgres. Setting `DATABASE_URL` switches it over; no other change is needed.



**Set up Tiger Data**



1. Create a free service at https://console.cloud.timescale.com and copy its **Service URL**, which looks like `postgres://tsdbadmin:<password>@<id>.tsdb.cloud.timescale.com:<port>/tsdb?sslmode=require`.

2. Put it in `src/backend/.env` (git-ignored): `DATABASE_URL=postgres://...`

3. Install the driver: `pip install -r src/backend/requirements.txt` (adds `psycopg`).

4. Move your existing local data across, keeping all ids and links:

   ```

   cd src/backend

   python tools/migrate_to_postgres.py          # refuses if the target already has data; --replace to overwrite

   ```

5. Start the backend as usual. Tables, the catalogue and the boss questions are created automatically on first start.



`db.py` keeps the app's SQL portable: `?` placeholders, `cur.lastrowid` (via `RETURNING id`) and `row["col"]` work on both engines. The whole test suite runs against Postgres with `TEST_POSTGRES_URL=postgresql://... python -m pytest`, and all tests pass on both engines.



**Sign-up and accounts**



- **First visit:** the app asks *What's your name?*, *What should we call you?* (filled in with your first name until you change it) and an optional email. These are saved to your profile and can be edited later under the gear icon.

- **Greeting:** the dashboard greets returning readers by preferred name ("Welcome back, Azeem"), and so do "Where was I?" reminders and notifications.

- **Device key:** sign-up gives the device a private key, sent as `Authorization: Bearer <key>`. Only its SHA-256 hash is stored. Every reader sees only their own books. The catalogue and health check are public.

- **Existing data:** the first sign-up takes over the profile that existed before accounts, so existing books and progress are kept.

- **Single-user mode:** `AUTH_REQUIRED=0` keeps the old single-user behaviour (handy for local experiments; tests use it by default).

- **Not yet supported:** signing in on a second device. That needs email sign-in, which is planned. Until then, each device that signs up is a separate reader.



API: `POST /api/signup {name, preferredName, email?}` returns `{token, user}`. `GET /api/user` now includes `signedUp`.
