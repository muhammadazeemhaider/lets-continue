# BookQuest

A local-first reading companion with the original pixel sunrise bookshelf and a handheld-style pixel RPG adventure. Log real reading sessions to explore five fictional chapters of **The Forgotten Kingdom**, earn XP and gold, and unlock the next dungeon region.

## Run

```sh
cd src/frontend
npm install
npm start
```

Open http://localhost:5173. The original sunrise bookshelf is the home screen. Its landscapes now include a pixel traveler, clouds, fireflies, completed-checkpoint flowers, and a small campsite. The most recent book is featured with a clear **Continue reading** action. Choose a **Sage**, **Bard**, **Knight**, or **Lantern keeper** in the companion picker. Your choice is saved independently from book progress and used for walking and battle scenes. Every companion has four-direction walking poses and faces the reader when stationary. Reminders open on demand rather than covering the bookshelf automatically. No runtime dependencies or API credentials are required. The existing vanilla JavaScript app has been retained rather than replacing it with the React stack assumed by the supplied specification. The original **Toward the Light** tracker is the main experience (`index.html`, also available at `library.html`), with its data untouched.

## Checks and build

```sh
cd src/frontend
npm test
npm run build
```

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
| Sage | Rune bolt, Moon nova, Elder roots |
| Bard | Echo melody, Thunder chord, Dawn anthem |
| Knight | Dawn slash, Shield bash, Star lance |
| Lantern keeper | Lantern spark, Ember flare, Firefly dance |

Attacks use class-specific effects: rune rings, moonlight, rising roots, flying notes, sound waves, sunrise rays, slashes, shield charges and lances. All deal 30 damage on a correct answer; abilities named Insight/Perfect pitch/Battle focus/etc. retain the same once-per-encounter two-answer elimination. These are presentation choices, not different difficulty settings. Existing Classic Reader selections migrate to Lantern Keeper; supported selections persist under the same `ttl.character` key. Switching characters preserves chapter progress and guardian seals. Tests cover all twelve move-to-effect paths, distinct sprite frames, and selection restoration for all four characters.


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
