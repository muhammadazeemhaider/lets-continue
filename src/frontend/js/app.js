/* App shell: hash router + views. */
(function () {
  const { esc } = Services;
  const $app = document.getElementById('app');
  const $overlay = document.getElementById('overlay-root');
  const $toast = document.getElementById('toast');
  let overlayTrigger = null;
  let overlayOnClose = null;

  /* ---------- helpers ---------- */
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => $toast.classList.remove('show'), 2600);
  }

  function characterPicker(){
    const selected=Journey.getCharacterInfo();
    return `<fieldset class="character-picker"><legend>${Journey.getWorld()==='scifi'?'Choose your space crew':Journey.getWorld()==='pirates'?'Choose your pirate crew':'Choose your adventurer'}</legend><div class="companion-roster">${Journey.getCharacters().map(c=>`<button type="button" data-character="${c.id}" aria-pressed="${Journey.getCharacter()===c.id}" style="--companion-accent:${c.accent}"><svg class="journey character-preview" viewBox="-11 -12 25 29" aria-hidden="true" shape-rendering="crispEdges"><g class="landscape-explorer" data-direction="down" data-frame="0">${Journey.characterSprite(c.id)}</g></svg><span><b>${c.name}</b><small>${c.attacks[0].name} · ${c.attacks[1].name}</small></span></button>`).join('')}</div><p class="companion-description"><b>${selected.name}</b> · ${selected.role}<span>${selected.attacks.map(a=>`${a.symbol} ${a.name}`).join(' &nbsp; · &nbsp; ')}<small>Correct answers power every attack · 30 damage each</small></span></p></fieldset>`;
  }
  function bindCharacterPicker(refresh,bookId){
    $app.querySelectorAll('[data-character]').forEach(button=>button.addEventListener('click',()=>{
      const position=window.scrollY,key=button.dataset.character;
      Journey.setCharacter(key);
      if(bookId)Store.setBookCompanion(bookId,key);
      refresh();
      window.scrollTo(0,position);
      $app.querySelector(`[data-character="${key}"]`)?.focus({preventScroll:true});
    }));
  }

  function worldPicker(book){
    const world=Characters.normalizeWorld(book.world);
    return `<section class="book-world-switch" aria-label="World for this book"><div><span class="eyebrow">THIS BOOK’S WORLD</span><p>The same story. A different universe.</p></div><div class="world-choices" role="group" aria-label="Choose a world"><button data-world-choice="fantasy" aria-pressed="${world==='fantasy'}"><span>✦</span><b>Fantasy</b><small>Lanterns, magic & guardians</small></button><button data-world-choice="scifi" aria-pressed="${world==='scifi'}"><span>◎</span><b>Sci-fi</b><small>Starfields, androids & machines</small></button><button data-world-choice="pirates" aria-pressed="${world==='pirates'}"><span>⚓</span><b>Pirates</b><small>Island voyages & a guiding lighthouse</small></button></div></section>`;
  }

  function statusLine(d) {
    if (d.isComplete) return 'You reached the light.';
    if (d.isPaused) return 'Your story is waiting.';
    return 'Continue your journey';
  }

  function closeOverlay() {
    const wasOpen = Boolean($overlay.firstElementChild);
    $overlay.innerHTML = '';
    if (wasOpen && overlayTrigger?.isConnected) overlayTrigger.focus();
    const afterClose = overlayOnClose;
    overlayOnClose = null;
    document.body.style.overflow = '';
    if(wasOpen)afterClose?.();
  }
  function openOverlay(html, cls = '', onClose = null) {
    if($overlay.firstElementChild)closeOverlay();
    overlayOnClose = onClose;
    overlayTrigger = document.activeElement;
    $overlay.innerHTML = `<div class="scrim ${cls}" data-close>${html}</div>`;
    document.body.style.overflow = 'hidden';
    const scrim = $overlay.firstElementChild;
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) closeOverlay();
    });
    const focusable = () => [...scrim.querySelectorAll('button, a[href], textarea, select, input, [tabindex="0"]')].filter(el => !el.disabled);
    scrim.addEventListener('keydown', e => {
      if(e.key !== 'Tab') return;
      const elements = focusable(), first = elements[0], last = elements[elements.length-1];
      if(!scrim.contains(document.activeElement)){e.preventDefault();first?.focus();}
      else if(e.shiftKey && document.activeElement === first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey && document.activeElement === last){e.preventDefault();first?.focus();}
    });
    requestAnimationFrame(() => focusable()[0]?.focus());
    return scrim;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlay();
  });

  /* ---------- streaks (warm, never punishing: a lapsed streak just invites a fresh start) ---------- */
  function streakChip(s) {
    if (!s.alive)
      return `<div class="streak idle"><span class="ember" aria-hidden="true">✶</span><span>Light a new streak today</span></div>`;
    return `<div class="streak${s.activeToday ? ' lit' : ''}"><span class="ember" aria-hidden="true">🔥</span>
      <span><b>${s.count}-day streak</b> · ${s.activeToday ? 'you read today' : 'read today to keep it glowing'}</span></div>`;
  }

  /* ---------- dashboard ---------- */
  function dashboard() {
    Journey.useBook(null);
    document.body.dataset.world='fantasy';
    const books = [...Store.books()].sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    const paused = books.filter((b) => Store.derive(b).isPaused).sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity));

    $app.innerHTML = `
<main class="page bookshelf-page">
  <nav class="library-nav" aria-label="Bookshelf"><a href="#/" class="library-brand"><span aria-hidden="true">✦</span> toward the light</a><span class="library-note">A LITTLE READING. A LITTLE LIGHT.</span></nav>
  <header class="masthead">
    <div class="eyebrow">YOUR OWN LITTLE WORLDS</div>
    <h1>Every story has a sunrise.</h1>
    <p>Pick up where you left off. The light is waiting.</p>
    ${streakChip(Store.readerStreak())}
  </header>

  ${paused.length ? `
  <button class="waiting" data-remind="${paused[0].id}">
    <span class="spark" aria-hidden="true">✨</span>
    <span><b>${paused.length === 1 ? 'A story is waiting for you' : `${paused.length} stories are waiting for you`}</b>
    <small>Remind me where I left off in “${esc(paused[0].title)}”</small></span>
  </button>` : ''}

  ${characterPicker()}
  <div class="shelf-heading"><h2>Your journeys</h2><span>${books.filter(b => !Store.derive(b).isComplete).length} in progress <i>·</i> ${books.filter(b => Store.derive(b).isComplete).length} sunrise reached</span></div>
  <section class="grid">
    ${books.map((book, index) => card(book, index === 0)).join('')}
  </section>

  <div class="shelf-footer"><span aria-hidden="true">✧</span><p>There’s no rush. The sun rises one page at a time.</p><button class="btn quiet small" id="reset">Reset sample data</button></div>
</main>`;

    bindCharacterPicker(dashboard);
    books.forEach((b) => {
      const d = Store.derive(b);
      Journey.render($app.querySelector(`[data-scene="${b.id}"]`), {
        total: d.total,
        completed: d.done,
        world:b.world||'fantasy',character:Journey.characterForBook(b),
        label: `${b.title}: ${d.done} of ${d.total} chapters completed`,
      });
    });

    $app.querySelector('[data-remind]')?.addEventListener('click', (e) => showReminder(e.currentTarget.dataset.remind));
    $app.querySelector('#reset').addEventListener('click', () => {
      if (confirm('Reset to the original sample books? Your changes on this device will be lost.')) {
        Store.reset();
        dashboard();
        toast('Sample data restored');
      }
    });
  }

  function card(b, featured = false) {
    const d = Store.derive(b);
    return `
<article class="card${featured ? ' featured' : ''}${d.isPaused ? ' paused' : ''}">
  <div class="scene-wrap"><div class="scene" data-scene="${b.id}"></div>
    <a class="overlay-link" href="#/book/${b.id}" aria-label="Open ${esc(b.title)}"></a>
    <span class="scene-phase">${b.world==='pirates'?(d.isComplete?'⚓ LIGHTHOUSE RESTORED':'⚓ SAILING TOWARD THE LIGHT'):b.world==='scifi'?(d.isComplete?'☾ MOONRISE REACHED':d.percent>=60?'☾ MOONLIGHT RISING':'✧ LUNAR FRONTIER'):(d.isComplete ? '☀ SUNRISE REACHED' : d.percent >= 60 ? '✧ FIRST LIGHT' : d.percent >= 30 ? '☾ THE SKY IS WAKING' : '☾ UNDER THE STARS')}</span>
    <span class="scene-caption">${d.isComplete ? 'You brought this world to life.' : 'A little further toward the light.'}</span>
  </div>
  <div class="body">
    <div class="book-kicker"><span class="book-world-label">${b.world==='scifi'?'◎ SCI-FI':b.world==='pirates'?'⚓ PIRATES':'✦ FANTASY'}</span> ${featured ? 'PICK UP WHERE YOU LEFT OFF' : d.isComplete ? 'A JOURNEY TO KEEP' : 'YOUR NEXT QUIET MOMENT'}</div>
    <div class="titles"><h2><a href="#/book/${b.id}">${esc(b.title)}</a></h2><p>${esc(b.author)}</p></div>
    <div class="stats">
      <span><b>${d.done}</b> of <b>${d.total}</b> chapters</span>
      <span>${d.isComplete ? 'Finished' : `Now: <b>${esc(d.current.title)}</b>`}</span>
      ${(() => { const s = Store.bookStreak(b); return s.count >= 2 ? `<span class="mini-streak">🔥 ${s.count} days</span>` : ''; })()}
      <span class="pct">${d.percent}%</span>
    </div>
    <div class="book-meter" role="progressbar" aria-label="Reading progress" aria-valuenow="${d.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${d.percent}%"></span></div>
    <div class="foot"><span class="last">Last read ${Store.relativeTime(b.lastActivity)}</span><a class="btn ${d.isComplete ? 'quiet' : 'primary'}" href="#/book/${b.id}">${d.isComplete ? 'Revisit this journey' : 'Continue reading'} <span aria-hidden="true">→</span></a></div>
  </div>
</article>`;
  }

  /* ---------- book detail ---------- */
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  function noteItem(n, book) {
    const ch = n.chapter ? book.chapters[n.chapter - 1] : null;
    return `<li class="note"><p>${esc(n.text)}</p><small>${ch ? `Chapter ${ch.n} · ${esc(ch.title)}` : 'General'} · ${fmtDate(n.at)}</small></li>`;
  }

  function chapterActions(id,index){
    const book=Store.getBook(id),chapter=book.chapters[index];
    if(!chapter)return;
    const scroll=window.scrollY;
    bookPage(id,index);
    window.scrollTo(0,scroll);
    const accessible=Store.canAccessChapter(book,chapter.n),canFight=Store.canChallengeChapter(book,chapter.n),cleared=BossBattle.load(id,chapter.n)?.defeated;
    const scrim=openOverlay(`<section class="sheet chapter-actions" role="dialog" aria-modal="true" aria-label="Chapter actions"><span class="eyebrow">CHAPTER ${chapter.n} · ${accessible?'YOUR JOURNEY':'STILL AHEAD'}</span><h2>${esc(chapter.title)}</h2><p>${accessible?'Return to this part of the story or revisit its guardian.':'Read the earlier chapters to unlock this part of the trail.'}</p><button class="chapter-action" id="start-from-chapter" ${accessible?'':'disabled'}><span>↶</span><span><b>Start from here</b><small>Make chapter ${chapter.n} your current chapter. Keep notes and earned guardian seals.</small></span></button><button class="chapter-action" id="chapter-boss" ${canFight?'':'disabled'}><span>⚔</span><span><b>${cleared?'Replay boss battle':canFight?'Challenge or resume boss':'Boss unlocks after reading'}</b><small>${cleared?'Begin a fresh practice fight. Your seal stays earned.':'Your reading position stays where it is.'}</small></span></button><div class="actions"><button class="btn quiet" id="chapter-cancel">Back to the journey</button></div></section>`);
    scrim.querySelector('#chapter-cancel').onclick=closeOverlay;
    scrim.querySelector('#start-from-chapter').onclick=()=>{
      const result=Store.startFromChapter(id,chapter.n);
      if(!result)return;
      closeOverlay();bookPage(id,index,result.was);toast(`Continuing from chapter ${chapter.n}. Notes and guardian seals kept.`);
    };
    scrim.querySelector('#chapter-boss').onclick=()=>{
      closeOverlay();BossBattle.open(book,chapter.n,{openOverlay,closeOverlay,replay:cleared,onVictory:()=>bookPage(id,index),onClose:()=>{if(location.hash===`#/book/${id}`)bookPage(id,index);}});
    };
  }

  function resetBook(id){
    const book=Store.getBook(id);
    const scrim=openOverlay(`<section class="sheet" role="dialog" aria-modal="true" aria-label="Reset book progress"><h2>Restart this journey?</h2><p class="sub">Reset reading progress and all boss encounters for <em>${esc(book.title)}</em>. Your notes, reading history, character choice, and other books are kept.</p><div class="actions"><button class="btn quiet" id="cancel-book-reset">Keep my progress</button><button class="btn primary" id="confirm-book-reset">Reset book progress</button></div></section>`);
    scrim.querySelector('#cancel-book-reset').onclick=closeOverlay;
    scrim.querySelector('#confirm-book-reset').onclick=()=>{
      const result=Store.resetBookProgress(id);
      closeOverlay();bookPage(id,0,result.was);toast('Book progress reset. Your notes are still here.');
    };
  }

  function bookPage(id, selected, previousCompleted, onArrival) {
    const b = Store.getBook(id);
    Journey.useBook(b);
    document.body.dataset.world=Journey.getWorld();
    const d = Store.derive(b);
    if (selected == null) selected = Number.isFinite(previousCompleted) && d.done > previousCompleted ? d.done - 1 : d.currentIndex;
    const sel = b.chapters[selected];
    const selState = selected < d.done ? 'done' : selected === d.currentIndex && !d.isComplete ? 'cur' : 'todo';
    const selLabel = { done: 'Completed', cur: 'Current chapter', todo: sel.n<=Math.max(b.completed,b.furthestCompleted||0)?'Previously reached':'Upcoming' }[selState];
    const chNotes = b.notes.filter((n) => n.chapter === sel.n);
    const boss = BossBattle.profile(sel.n,b.world);
    const bossDefeated = BossBattle.load(id,sel.n)?.defeated;
    const canFight = Store.canChallengeChapter(b,sel.n);
    const demoChapter = id==='lantern-road' ? BossFixtures[sel.n-1] : null;
    const allNotes = [...b.notes].sort((a, b2) => new Date(b2.at) - new Date(a.at));
    const hist = [...b.history].sort((a, b2) => new Date(b2.at) - new Date(a.at));

    $app.innerHTML = `
<main class="page">
  <div class="topbar">
    <a class="back" href="#/">← All books</a>
    <button class="btn quiet small" id="reset-book">Reset book progress</button>
    ${d.isPaused ? `<button class="btn small" id="remind">Where was I?</button>` : ''}
  </div>
  <header class="book-head"><h1>${esc(b.title)}</h1><p>${esc(b.author)}</p></header>
  ${worldPicker(b)}
  ${characterPicker()}
  <div class="hero" id="hero"></div>
  <div class="summary">
    <span><b>${d.done}</b> of <b>${d.total}</b> chapters</span>
    <span>${d.isComplete ? 'Finished' : `Now: <b>${esc(d.current.title)}</b>`}</span>
    <span>Last read ${Store.relativeTime(b.lastActivity)}</span>
    ${(() => { const s = Store.bookStreak(b); return s.count >= 2 ? `<span class="mini-streak">🔥 ${s.count}-day streak</span>` : ''; })()}
    <span class="boss-summary">✦ ${b.chapters.filter(c=>BossBattle.load(id,c.n)?.defeated).length} / ${d.total} guardians befriended</span>
    <span class="pct">${d.percent}%</span>
  </div>

  <div class="columns">
    <div>
      <section class="panel chapter-focus" aria-live="polite">
        <h3>Chapter ${sel.n}</h3>
        <span class="badge ${selState}">${selLabel}</span>
        <h2>${esc(sel.title)}</h2>
        ${demoChapter?`<details class="chapter-excerpt" open><summary>Read the original chapter</summary><p>${esc(demoChapter.text)}</p></details>`:''}
        ${chNotes.length ? `<ul class="notes">${chNotes.map((n) => noteItem(n, b)).join('')}</ul>` : '<p class="empty">No notes for this chapter yet.</p>'}
        <form class="note-form" data-chapter="${sel.n}">
          <textarea name="text" placeholder="A thought or memory for this chapter…" aria-label="Note for chapter ${sel.n}"></textarea>
          <div class="row"><button class="btn small" type="submit">Save chapter note</button></div>
        </form>
      </section>

      <section class="panel boss-invitation">
        <div class="boss-invite-art">${BossBattle.preview(sel.n,b.world)}</div>
        <div><span class="boss-kicker">CHAPTER ${sel.n} GUARDIAN · OPTIONAL</span><h2>${boss.name}</h2><p>${bossDefeated?'You earned this guardian’s seal. Return any time to practice.':canFight?'Answer three questions from this chapter to light the way.':'Mark this chapter read to unlock its guardian encounter.'}</p></div>
        <button class="btn ${canFight?'primary':''}" id="fight-boss" ${!canFight?'disabled':''}>${bossDefeated?'Replay boss battle':canFight?'Challenge guardian →':'Finish chapter first'}</button>
      </section>

      <section class="panel">
        <h3>Notes &amp; memories</h3>
        ${allNotes.length ? `<ul class="notes">${allNotes.map((n) => noteItem(n, b)).join('')}</ul>` : '<p class="empty">Nothing saved yet.</p>'}
        <form class="note-form" data-chapter="">
          <textarea name="text" placeholder="Something to remember about this book…" aria-label="General note"></textarea>
          <div class="row">
            <select name="chapter" aria-label="Attach to">
              <option value="">General</option>
              ${b.chapters.map((c) => `<option value="${c.n}">Chapter ${c.n} · ${esc(c.title)}</option>`).join('')}
            </select>
            <button class="btn small" type="submit">Save note</button>
          </div>
        </form>
      </section>
    </div>

    <div>
      <section class="panel">
        <h3>The path</h3>
        <ul class="chapters">
          ${b.chapters.map((c, i) => {
            const st = i < d.done ? 'done' : i === d.currentIndex && !d.isComplete ? 'cur' : 'todo';
            return `<li><button class="${st}${i === selected ? ' sel' : ''}" data-ch="${i}"><span class="dot"></span><span class="num">${c.n}</span><span>${esc(c.title)}</span><span class="ico">${st === 'cur' ? 'You are here' : c.n<=Math.max(b.completed,b.furthestCompleted||0) ? BossBattle.load(id,c.n)?.defeated ? '✦ Guardian cleared' : '⚔ Guardian ready' : ''}</span></button></li>`;
          }).join('')}
        </ul>
      </section>
      <section class="panel">
        <h3>Reading history</h3>
        ${hist.length ? `<ul class="timeline">${hist.map((h) => {
          const ch = h.chapter ? b.chapters[h.chapter - 1] : null;
          const title = h.type === 'checkpoint'
            ? (h.completedAfter >= d.total ? 'Reached the light' : h.completedAfter === 0 ? 'Checkpoint: back to the start' : `Finished through ${esc(ch ? ch.title : 'chapter ' + h.chapter)}`)
            : `Note${ch ? ` on ${esc(ch.title)}` : ''}`;
          return `<li class="${h.type}"><b>${title}</b><small>${fmtDate(h.at)} · ${Store.relativeTime(h.at)}</small>${h.text ? `<p>${esc(h.text)}</p>` : ''}</li>`;
        }).join('')}</ul>` : '<p class="empty">Your reading history will appear here.</p>'}
      </section>
    </div>
  </div>

  <div class="dock"><button class="btn primary" id="checkpoint">✶ Save a reading checkpoint</button></div>
</main>`;

    $app.querySelector('#fight-boss').addEventListener('click',()=>BossBattle.open(b,sel.n,{openOverlay,closeOverlay,replay:bossDefeated,onVictory:()=>bookPage(id,selected),onClose:()=>{if(location.hash===`#/book/${id}`)bookPage(id,selected);}}));
    $app.querySelector('#reset-book').onclick=()=>resetBook(id);
    $app.querySelectorAll('[data-world-choice]').forEach(button=>button.onclick=()=>{
      const scroll=window.scrollY;Store.setBookWorld(id,button.dataset.worldChoice);bookPage(id,selected);window.scrollTo(0,scroll);
      $app.querySelector(`[data-world-choice="${button.dataset.worldChoice}"]`)?.focus({preventScroll:true});
    });
    bindCharacterPicker(()=>bookPage(id,selected),id);
    Journey.render(document.getElementById('hero'), {
      total: d.total,
      completed: d.done,
      world:b.world||'fantasy',character:Journey.characterForBook(b),
      selected,
      previousCompleted,
      onArrival,
      interactive: true,
      label: `${b.title}: ${d.done} of ${d.total} chapters completed`,
      onSelect: (i) => {
        chapterActions(id,i);
      },
    });

    $app.querySelectorAll('[data-ch]').forEach((btn) =>
      btn.addEventListener('click', () => {
        chapterActions(id,Number(btn.dataset.ch));
      })
    );
    $app.querySelectorAll('.note-form').forEach((f) =>
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = f.text.value;
        if (!text.trim()) return;
        const chap = f.dataset.chapter || (f.chapter && f.chapter.value) || null;
        Store.addNote(id, chap ? Number(chap) : null, text);
        const y = window.scrollY;
        bookPage(id, selected);
        window.scrollTo(0, y);
        toast('Note saved');
      })
    );
    $app.querySelector('#checkpoint').addEventListener('click', () => checkpointSheet(id));
    $app.querySelector('#remind')?.addEventListener('click', () => showReminder(id));
  }

  /* ---------- checkpoint sheet ---------- */
  function checkpointSheet(id) {
    const b = Store.getBook(id);
    const d = Store.derive(b);
    let n = Math.min(d.total, d.done + 1);
    const scrim = openOverlay(`
<form class="sheet" role="dialog" aria-modal="true" aria-label="Save a reading checkpoint">
  <h2>Save a checkpoint</h2>
  <p class="sub">Where are you in <em>${esc(b.title)}</em>?</p>
  <div class="stepper">
    <button type="button" data-step="-1" aria-label="One chapter fewer">−</button>
    <div class="val" aria-live="polite"><b></b><span></span></div>
    <button type="button" data-step="1" aria-label="One chapter more">+</button>
  </div>
  <textarea name="note" aria-label="Checkpoint note (optional)" placeholder="A note for future you (optional) — what do you want to remember?"></textarea>
  <div class="actions">
    <button type="button" class="btn" data-cancel>Cancel</button>
    <button type="submit" class="btn primary">Save checkpoint</button>
  </div>
</form>`);
    const form = scrim.querySelector('form');
    const paint = () => {
      form.querySelector('.val b').textContent = n;
      const c = n > 0 ? b.chapters[n - 1].title : 'Not started';
      form.querySelector('.val span').textContent = n === 0 ? 'Not started' : `chapters finished · ${c}`;
    };
    paint();
    form.querySelectorAll('[data-step]').forEach((btn) =>
      btn.addEventListener('click', () => {
        n = Math.max(0, Math.min(d.total, n + Number(btn.dataset.step)));
        paint();
      })
    );
    form.querySelector('[data-cancel]').addEventListener('click', closeOverlay);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const res = Store.addCheckpoint(id, n, form.note.value);
      closeOverlay();
      const arrival = res.now > res.was ? () => {
        if(location.hash !== `#/book/${id}` || $overlay.firstElementChild)return;
        BossBattle.open(b,res.now,{openOverlay,closeOverlay,onVictory:()=>bookPage(id,res.now-1),onClose:()=>{
          bookPage(id,res.now-1);
          if(res.justFinished)requestAnimationFrame(()=>{if(location.hash === `#/book/${id}` && !$overlay.firstElementChild)finale(id);});
        }});
      } : undefined;
      bookPage(id, undefined, res.was, arrival);
      if (!res.justFinished) {
        const s = Store.readerStreak();
        toast(s.count >= 2 ? `Checkpoint saved · ${s.count}-day streak` : 'Checkpoint saved. The sky brightens.');
      }
    });
    form.querySelector('textarea').focus({ preventScroll: true });
  }

  /* ---------- re-engagement ---------- */
  function showReminder(id) {
    const b = Store.getBook(id);
    const d = Store.derive(b);
    const r = Services.reminder(b);
    const scrim = openOverlay(`
<div class="sheet" role="dialog" aria-modal="true" aria-label="Your journey is waiting">
  <div class="scene" id="rscene"></div>
  <div class="content">
    <h2>${r.headline}</h2>
    <p>${r.lastLeft}</p>
    <p class="recap">${esc(r.recap)}</p>
    ${r.note ? `<div class="quote"><small>Your note${r.note.chapter ? ` · Chapter ${r.note.chapter}` : ''}</small>${esc(r.note.text)}</div>` : ''}
    <p>${r.nudge}</p>
    <div class="actions">
      <button class="btn quiet" data-later>Not right now</button>
      <button class="btn primary" data-go>Continue Reading</button>
    </div>
  </div>
</div>`, 'reminder');
    Journey.render(scrim.querySelector('#rscene'), {
      total: d.total,
      completed: d.done,
      world:b.world||'fantasy',character:Journey.characterForBook(b),
      label: `Your current position in ${b.title}`,
    });
    scrim.querySelector('[data-later]').addEventListener('click', closeOverlay);
    scrim.querySelector('[data-go]').addEventListener('click', () => {
      closeOverlay();
      if (location.hash !== `#/book/${id}`) location.hash = `#/book/${id}`;
      else bookPage(id);
      toast(`Enjoy ${d.current ? d.current.title : 'your book'}.`);
    });
  }

  /* ---------- completion ---------- */
  function finale(id) {
    const b = Store.getBook(id);
    const d = Store.derive(b);
    const scrim = openOverlay(`
<div class="sheet" role="dialog" aria-modal="true" aria-label="Book complete">
  <div class="scene" id="fscene"></div>
  <div class="content">
    <h2>${b.world==='scifi'?'You reached the moonlight.':b.world==='pirates'?'You lit the lighthouse.':'You reached the light.'}</h2>
    <p>You finished <em>${esc(b.title)}</em>. Every chapter along the way is still glowing.</p>
    <div class="actions"><button class="btn primary" data-done>Beautiful</button></div>
  </div>
</div>`, 'finale');
    Journey.render(scrim.querySelector('#fscene'), {
      world:b.world||'fantasy',character:Journey.characterForBook(b),
      total: d.total, completed: d.total - 1, animateSun: false, label: b.world==='scifi'?'Moonrise':b.world==='pirates'?'Lighthouse shining':'Sunrise',
    });
    // Start at the last step and let the final chapter bring the sun fully up.
    requestAnimationFrame(() =>
      Journey.render(scrim.querySelector('#fscene'), { world:b.world||'fantasy',character:Journey.characterForBook(b), total: d.total, completed: d.total, animateSun: true, label: `${b.title} complete: ${b.world==='scifi'?'the moon':'the sun'} has risen` })
    );
    scrim.querySelector('[data-done]').addEventListener('click', closeOverlay);
  }

  /* first visit of a session: gently remind about the book that has waited longest */
  function maybeWelcomeBack() {
    let seen = false;
    try { seen = sessionStorage.getItem('ttl.welcomed') === '1'; sessionStorage.setItem('ttl.welcomed', '1'); } catch (e) {}
    if (seen) return;
    const paused = Store.books().filter((b) => Store.derive(b).isPaused)
      .sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity));
    if (paused.length && !location.hash.startsWith('#/book/')) setTimeout(() => showReminder(paused[0].id), 600);
  }

  /* ---------- router ---------- */
  function route() {
    closeOverlay();
    const m = location.hash.match(/^#\/book\/([\w-]+)/);
    if (m && Store.getBook(m[1])) bookPage(m[1]);
    else dashboard();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
  // Reminders are available on demand; keep the bookshelf visible on arrival.
})();
