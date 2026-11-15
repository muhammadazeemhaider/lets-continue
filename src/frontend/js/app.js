/* App shell: hash router + views. */
(function () {
  const { esc } = Services;
  const $app = document.getElementById('app');
  const $overlay = document.getElementById('overlay-root');
  const $toast = document.getElementById('toast');

  /* ---------- helpers ---------- */
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => $toast.classList.remove('show'), 2600);
  }

  function statusLine(d) {
    if (d.isComplete) return 'You reached the light.';
    if (d.isPaused) return 'Your story is waiting.';
    return 'Continue your journey';
  }

  function closeOverlay() {
    $overlay.innerHTML = '';
    document.body.style.overflow = '';
  }
  function openOverlay(html, cls = '') {
    $overlay.innerHTML = `<div class="scrim ${cls}" data-close>${html}</div>`;
    document.body.style.overflow = 'hidden';
    const scrim = $overlay.firstElementChild;
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) closeOverlay();
    });
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
    const books = [...Store.books()].sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    const paused = books.filter((b) => Store.derive(b).isPaused).sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity));

    $app.innerHTML = `
<main class="page">
  <header class="masthead">
    <button class="bell" id="bell" aria-label="Reminders${Store.notifications().unread ? ` (${Store.notifications().unread} unread)` : ''}">🔔<span class="badge-dot" ${Store.notifications().unread ? '' : 'hidden'}>${Store.notifications().unread}</span></button>
    <button class="gear" id="settings" aria-label="Profile and settings">⚙</button>
    <div class="eyebrow">${esc(greeting())}</div>
    <h1>Getting to the Light</h1>
    <p>Every chapter brings the sunrise a little closer.</p>
    ${streakChip(Store.readerStreak())}
  </header>

  ${paused.length ? `
  <button class="waiting" data-remind="${paused[0].id}">
    <span class="spark" aria-hidden="true">✨</span>
    <span><b>${paused.length === 1 ? 'A story is waiting for you' : `${paused.length} stories are waiting for you`}</b>
    <small>Remind me where I left off in “${esc(paused[0].title)}”</small></span>
  </button>` : ''}

  ${books.length ? `<section class="grid">${books.map(card).join('')}</section>` : `
  <section class="empty-state">
    <p>No books yet. Every journey starts with one.</p>
    <p class="hint">Tip: <code>python -m flask --app app seed</code> in <code>src/backend</code> loads sample books.</p>
  </section>`}

  <div class="footer-actions"><button class="btn primary" id="add-book">+ Add a book</button></div>
</main>`;

    books.forEach((b) => {
      const d = Store.derive(b);
      Journey.render($app.querySelector(`[data-scene="${b.id}"]`), {
        total: d.total,
        completed: d.done,
        label: `${b.title}: ${d.done} of ${d.total} chapters completed`,
      });
    });

    $app.querySelector('[data-remind]')?.addEventListener('click', (e) => showReminder(e.currentTarget.dataset.remind));
    $app.querySelector('#add-book').addEventListener('click', addBookSheet);
    $app.querySelector('#settings').addEventListener('click', settingsSheet);
    $app.querySelector('#bell').addEventListener('click', notificationsSheet);
  }

  /* ---------- reminders inbox ---------- */
  function updateBellBadge() {
    const dot = document.querySelector('#bell .badge-dot');
    if (!dot) return;
    const n = Store.notifications().unread;
    dot.textContent = n;
    dot.hidden = !n;
  }

  function notificationsSheet() {
    const render = () => {
      const { items, unread } = Store.notifications();
      return `
<div class="sheet" role="dialog" aria-modal="true" aria-label="Reminders">
  <h2>Reminders</h2>
  <p class="sub">Gentle nudges, never pressure.</p>
  ${items.length ? `<ul class="inbox">${items.map((n) => `
    <li><button class="inbox-item${n.read ? '' : ' unread'}" data-nid="${n.id}" data-book="${n.bookId}">
      <b>${esc(n.title)}</b><span>${esc(n.body)}</span><small>${Store.relativeTime(n.createdAt)}</small>
    </button></li>`).join('')}</ul>`
    : '<p class="empty">No reminders yet. If a book goes quiet, we’ll send a small hello.</p>'}
  <div class="actions">
    ${unread ? '<button class="btn" data-readall>Mark all read</button>' : ''}
    <button class="btn primary" data-close>Close</button>
  </div>
</div>`;
    };
    const scrim = openOverlay(render());
    const bind = () => {
      scrim.querySelector('[data-close]').addEventListener('click', closeOverlay);
      scrim.querySelector('[data-readall]')?.addEventListener('click', async () => {
        await Store.markAllNotificationsRead();
        scrim.innerHTML = render();
        bind();
        updateBellBadge();
      });
      scrim.querySelectorAll('[data-nid]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          Store.markNotificationRead(btn.dataset.nid).then(updateBellBadge).catch(() => {});
          closeOverlay();
          location.hash = `#/book/${btn.dataset.book}`;
        })
      );
    };
    bind();
  }

  /** The "this device" block inside the settings sheet. */
  async function paintPushSection(root) {
    const box = root.querySelector('[data-push]');
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ supported: false, reason: 'The notification service is still starting. Reload the page and try again.' }), 5000)
    );
    const st = await Promise.race([Store.pushStatus(), timeout]).catch((e) => ({ supported: false, reason: e.message }));
    if (!st.supported) {
      box.innerHTML = `<p class="hint">${esc(st.reason)}</p>`;
      return;
    }
    if (st.permission === 'denied') {
      box.innerHTML = `<p class="hint">Notifications are blocked for this site, so the browser will not even ask. To allow them in Chrome:</p>
        <ol class="hint steps">
          <li>Open a new tab and paste: <code class="copy">chrome://settings/content/siteDetails?site=${esc(encodeURIComponent(location.origin))}</code></li>
          <li>Set <b>Notifications</b> to <b>Allow</b>.</li>
          <li>Come back here and reload the page.</li>
        </ol>
        <button type="button" class="btn small" data-copy>Copy that address</button>`;
      box.querySelector('[data-copy]').addEventListener('click', async () => {
        const text = `chrome://settings/content/siteDetails?site=${encodeURIComponent(location.origin)}`;
        try {
          await navigator.clipboard.writeText(text);
          toast('Copied. Paste it into a new tab.');
        } catch (e) {
          toast(text);
        }
      });
      return;
    }
    box.innerHTML = st.subscribed
      ? `<p class="hint ok">✓ Notifications are on for this device.</p>
         <div class="row"><button type="button" class="btn small" data-push-test>Send a test</button>
         <button type="button" class="btn small quiet" data-push-off>Turn off here</button></div>`
      : `<p class="hint">Get a small reminder here when a book has been quiet for a while.</p>
         <button type="button" class="btn small primary" data-push-on>Enable on this device</button>`;
    const act = (sel, fn, msg) =>
      box.querySelector(sel)?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try {
          const r = await fn();
          toast(typeof msg === 'function' ? msg(r) : msg);
        } catch (err) {
          toast(err.message);
        }
        paintPushSection(root);
      });
    act('[data-push-on]', Store.enablePush, 'Notifications enabled');
    act('[data-push-off]', Store.disablePush, 'Notifications turned off here');
    act('[data-push-test]', Store.testPush, (r) => {
      if (r.status === 'sent') return 'Test sent, check your notifications';
      const reason = (r.devices || []).map((d) => d.reason).find(Boolean);
      if (r.status === 'pending') return `Almost ready: ${reason}`;
      return `Test not delivered${reason ? `: ${reason}` : ` (${r.status})`}`;
    });
  }

  function greeting() {
    const u = Store.getUser();
    return u && u.preferredName && u.preferredName !== 'Reader' ? `Welcome back, ${u.preferredName}` : 'Toward the Light';
  }

  /* ---------- profile & add-book sheets ---------- */
  function errorBox(form) {
    let el = form.querySelector('.form-error');
    if (!el) {
      el = document.createElement('p');
      el.className = 'form-error';
      el.setAttribute('role', 'alert');
      form.querySelector('.actions').before(el);
    }
    return el;
  }
  /** Run an async save; keep the sheet open and show the message on failure. */
  async function submitWith(form, fn) {
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await fn();
    } catch (err) {
      errorBox(form).textContent = err.message;
      btn.disabled = false;
    }
  }

  function settingsSheet() {
    const u = Store.getUser();
    const scrim = openOverlay(`
<form class="sheet" role="dialog" aria-modal="true" aria-label="Profile and settings">
  <h2>Your profile</h2>
  <p class="sub">How the app and its reminders should address you.</p>
  <label class="field">Name<input name="name" required maxlength="80" value="${esc(u.name)}"></label>
  <label class="field">Preferred name<input name="preferredName" required maxlength="40" value="${esc(u.preferredName)}"></label>
  <label class="field">Email (optional)<input name="email" type="email" value="${esc(u.email || '')}"></label>
  <label class="field">Consider a book “waiting” after
    <span class="inline"><input name="pausedAfterDays" type="number" min="1" max="365" value="${u.pausedAfterDays}"> days</span></label>
  <label class="check"><input name="notificationsEnabled" type="checkbox" ${u.notificationsEnabled ? 'checked' : ''}> Gentle reminders for paused books</label>
  <p class="hint">Reminders arrive after 2 days, then 1 week, 2 weeks, 1 month and 6 months without reading.</p>
  <div class="push-box" data-push><p class="hint">Checking this device…</p></div>
  <p class="hint diag" data-diag></p>
  <div class="actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">Save</button></div>
</form>`);
    const form = scrim.querySelector('form');
    paintPushSection(form);
    form.querySelector('[data-diag]').textContent = [
      `address: ${location.origin}`,
      `secure context: ${window.isSecureContext}`,
      `service worker: ${'serviceWorker' in navigator}`,
      `push: ${'PushManager' in window}`,
      `permission: ${'Notification' in window ? Notification.permission : 'n/a'}`,
      `installed app: ${window.matchMedia('(display-mode: standalone)').matches}`,
      `browser: ${(navigator.userAgent.match(/(Chrome|Firefox|SamsungBrowser|EdgA?)\/[\d.]+/) || ['unknown'])[0]}`,
    ].join(' · ');
    form.querySelector('[data-cancel]').addEventListener('click', closeOverlay);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitWith(form, async () => {
        await Store.updateUser({
          name: form.name.value,
          preferredName: form.preferredName.value,
          email: form.email.value.trim() || null,
          pausedAfterDays: Number(form.pausedAfterDays.value),
          notificationsEnabled: form.notificationsEnabled.checked,
        });
        closeOverlay();
        dashboard();
        toast('Profile saved');
      });
    });
  }

  function addBookSheet() {
    const scrim = openOverlay(`
<form class="sheet" role="dialog" aria-modal="true" aria-label="Add a book">
  <h2>Add a book</h2>
  <p class="sub">Each chapter becomes a point on its path toward the light.</p>
  <label class="field">Title<input name="title" required maxlength="200"></label>
  <label class="field">Author<input name="author" maxlength="200"></label>
  <label class="field">Chapters
    <textarea name="chapters" placeholder="Either a number (e.g. 24) or one chapter title per line"></textarea></label>
  <label class="field">Short recap (optional)<textarea name="recap" placeholder="What is this book about? Used in your reminders."></textarea></label>
  <div class="actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">Add book</button></div>
</form>`);
    const form = scrim.querySelector('form');
    form.querySelector('[data-cancel]').addEventListener('click', closeOverlay);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitWith(form, async () => {
        const raw = form.chapters.value.trim();
        const payload = { title: form.title.value, author: form.author.value, recap: form.recap.value };
        if (/^\d+$/.test(raw)) payload.chapterCount = Number(raw);
        else payload.chapters = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const b = await Store.createBook(payload);
        closeOverlay();
        location.hash = `#/book/${b.id}`;
        toast('Book added');
      });
    });
    form.title.focus({ preventScroll: true });
  }

  function card(b) {
    const d = Store.derive(b);
    return `
<article class="card${d.isPaused ? ' paused' : ''}">
  <div class="scene" data-scene="${b.id}">
    <a class="overlay-link" href="#/book/${b.id}" aria-label="Open ${esc(b.title)}"></a>
    ${d.isPaused ? '<span class="ribbon">Paused</span>' : d.isComplete ? '<span class="ribbon done">Complete</span>' : ''}
  </div>
  <div class="body">
    <div class="titles"><h2><a href="#/book/${b.id}">${esc(b.title)}</a></h2><p>${esc(b.author)}</p></div>
    <div class="stats">
      <span><b>${d.done}</b> of <b>${d.total}</b> chapters</span>
      <span>${d.isComplete ? 'Finished' : `Now: <b>${esc(d.current.title)}</b>`}</span>
      ${(() => { const s = Store.bookStreak(b); return s.count >= 2 ? `<span class="mini-streak">🔥 ${s.count} days</span>` : ''; })()}
      <span class="pct">${d.percent}%</span>
    </div>
    <div class="foot">
      <span class="status">${statusLine(d)}</span>
      <span class="last">Last read ${Store.relativeTime(b.lastActivity)}</span>
    </div>
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

  function bookPage(id, selected) {
    const b = Store.getBook(id);
    const d = Store.derive(b);
    if (selected == null) selected = d.currentIndex;
    const sel = b.chapters[selected];
    const selState = selected < d.done ? 'done' : selected === d.currentIndex && !d.isComplete ? 'cur' : 'todo';
    const selLabel = { done: 'Completed', cur: 'Current chapter', todo: 'Upcoming' }[selState];
    const chNotes = b.notes.filter((n) => n.chapter === sel.n);
    const general = b.notes.filter((n) => !n.chapter);
    const allNotes = [...b.notes].sort((a, b2) => new Date(b2.at) - new Date(a.at));
    const hist = [...b.history].sort((a, b2) => new Date(b2.at) - new Date(a.at));

    $app.innerHTML = `
<main class="page">
  <div class="topbar">
    <a class="back" href="#/">← All books</a>
    ${!d.isComplete && d.done > 0 ? `<button class="btn small${d.isPaused ? ' glow' : ''}" id="remind">Where was I?</button>` : ''}
  </div>
  <header class="book-head"><h1>${esc(b.title)}</h1><p>${esc(b.author)}</p></header>
  <div class="hero" id="hero"></div>
  <div class="summary">
    <span><b>${d.done}</b> of <b>${d.total}</b> chapters</span>
    <span>${d.isComplete ? 'Finished' : `Now: <b>${esc(d.current.title)}</b>`}</span>
    <span>Last read ${Store.relativeTime(b.lastActivity)}</span>
    ${(() => { const s = Store.bookStreak(b); return s.count >= 2 ? `<span class="mini-streak">🔥 ${s.count}-day streak</span>` : ''; })()}
    <span class="pct">${d.percent}%</span>
  </div>

  <div class="columns">
    <div>
      <section class="panel chapter-focus" aria-live="polite">
        <h3>Chapter ${sel.n}</h3>
        <span class="badge ${selState}">${selLabel}</span>
        <h2>${esc(sel.title)}</h2>
        ${chNotes.length ? `<ul class="notes">${chNotes.map((n) => noteItem(n, b)).join('')}</ul>` : '<p class="empty">No notes for this chapter yet.</p>'}
        <form class="note-form" data-chapter="${sel.n}">
          <textarea name="text" placeholder="A thought or memory for this chapter…" aria-label="Note for chapter ${sel.n}"></textarea>
          <div class="row"><button class="btn small" type="submit">Save chapter note</button></div>
        </form>
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
            return `<li><button class="${st}${i === selected ? ' sel' : ''}" data-ch="${i}"><span class="dot"></span><span class="num">${c.n}</span><span>${esc(c.title)}</span><span class="ico">${st === 'done' ? '✓' : st === 'cur' ? 'You are here' : ''}</span></button></li>`;
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

    Journey.render(document.getElementById('hero'), {
      total: d.total,
      completed: d.done,
      selected,
      interactive: true,
      label: `${b.title}: ${d.done} of ${d.total} chapters completed`,
      onSelect: (i) => {
        const y = window.scrollY;
        bookPage(id, i);
        window.scrollTo(0, y);
      },
    });

    $app.querySelectorAll('[data-ch]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const y = window.scrollY;
        bookPage(id, Number(btn.dataset.ch));
        window.scrollTo(0, y);
      })
    );
    $app.querySelectorAll('.note-form').forEach((f) =>
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = f.text.value;
        if (!text.trim()) return;
        const chap = f.dataset.chapter || (f.chapter && f.chapter.value) || null;
        Store.addNote(id, chap ? Number(chap) : null, text)
          .then(() => {
            const y = window.scrollY;
            bookPage(id, selected);
            window.scrollTo(0, y);
            toast('Note saved');
          })
          .catch((err) => toast(err.message));
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
  <textarea name="note" placeholder="A note for future you (optional) — what do you want to remember?"></textarea>
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
      submitWith(form, async () => {
        const res = await Store.addCheckpoint(id, n, form.note.value);
        closeOverlay();
        bookPage(id);
        if (res.justFinished) finale(id);
        else {
          const s = Store.readerStreak();
          toast(s.count >= 2 ? `Checkpoint saved · ${s.count}-day streak` : 'Checkpoint saved. The sky brightens.');
        }
      });
    });
    form.querySelector('textarea').focus({ preventScroll: true });
  }

  /* ---------- re-engagement ---------- */
  async function showReminder(id) {
    const b = Store.getBook(id);
    const d = Store.derive(b);
    if (!b.history.length) await Store.loadBook(id).catch(() => {}); // fallback needs notes
    const r = (await Store.fetchReminder(id)) || Services.reminder(b);
    const story = (text, fromLLM) =>
      !text ? '' : `<p class="recap${fromLLM ? ' ai' : ''}">${esc(text)}</p>` +
        (fromLLM ? '<small class="ai-note">✨ Recap written by AI from your progress and notes · may be imperfect</small>' : '');
    const scrim = openOverlay(`
<div class="sheet" role="dialog" aria-modal="true" aria-label="Your journey is waiting">
  <div class="scene" id="rscene"></div>
  <div class="content">
    <h2>${esc(r.headline)}</h2>
    <p>${esc(r.lastLeft)}</p>
    <div class="story" data-story aria-live="polite">${
      r.llmPending ? '<p class="recap loading">Remembering your story…</p>' : story(r.recap, r.source === 'llm')
    }</div>
    ${r.note ? `<div class="quote"><small>Your note${r.note.chapter ? ` · Chapter ${r.note.chapter}` : ''}</small>${esc(r.note.text)}</div>` : ''}
    <p data-nudge>${esc(r.nudge)}</p>
    <div class="actions">
      <button class="btn quiet" data-later>Not right now</button>
      <button class="btn primary" data-go>Continue Reading</button>
    </div>
  </div>
</div>`, 'reminder');
    Journey.render(scrim.querySelector('#rscene'), {
      total: d.total,
      completed: d.done,
      label: `Your current position in ${b.title}`,
    });
    if (r.llmPending) {
      // Ask the backend to write a recap (a few seconds on free models), then swap it in if still open.
      Store.writeRecap(id).then((w) => {
        if (!scrim.isConnected) return;
        const box = scrim.querySelector('[data-story]');
        box.innerHTML = w && w.source === 'llm' ? story(w.recap, true) : story(r.recap, false);
        box.classList.add('fade-in');
        if (w && w.nudge) scrim.querySelector('[data-nudge]').textContent = w.nudge;
      });
    }
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
    <h2>You reached the light.</h2>
    <p>You finished <em>${esc(b.title)}</em>. Every chapter along the way is still glowing.</p>
    <div class="actions"><button class="btn primary" data-done>Beautiful</button></div>
  </div>
</div>`, 'finale');
    Journey.render(scrim.querySelector('#fscene'), {
      total: d.total, completed: d.total - 1, animateSun: false, label: 'Sunrise',
    });
    // Start at the last step and let the final chapter bring the sun fully up.
    requestAnimationFrame(() =>
      Journey.render(scrim.querySelector('#fscene'), { total: d.total, completed: d.total, animateSun: true, label: `${b.title} complete: the sun has risen` })
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

  /* ---------- router & boot ---------- */
  function fatal(err) {
    $app.innerHTML = `
<main class="page"><section class="empty-state">
  <h2>${err.network ? 'The server isn’t answering' : 'Something went wrong'}</h2>
  <p>${esc(err.message)}</p>
  ${err.network ? `<p class="hint">Start the backend: <code>cd src/backend &amp;&amp; python -m flask --app app run --port 5000</code><br>Looking for it at <code>${esc(TTL_CONFIG.apiBase || location.origin + '/api')}</code></p>` : ''}
  <button class="btn primary" id="retry">Try again</button>
</section></main>`;
    document.getElementById('retry').addEventListener('click', boot);
  }

  let routeSeq = 0;
  async function route() {
    const seq = ++routeSeq;
    closeOverlay();
    const m = location.hash.match(/^#\/book\/(\d+)/);
    try {
      if (m) {
        await Store.loadBook(m[1]);
        if (seq !== routeSeq) return; // a newer navigation won
        bookPage(m[1]);
      } else {
        if (Store.getUser()) await Store.init(); // dashboard shows fresh data
        if (seq !== routeSeq) return;
        dashboard();
      }
    } catch (err) {
      if (seq !== routeSeq) return;
      if (m && !err.network) { location.hash = '#/'; return; } // unknown book
      fatal(err);
      return;
    }
    window.scrollTo(0, 0);
  }

  async function boot() {
    $app.innerHTML = '<main class="page"><p class="loading">Waking the sunrise…</p></main>';
    try {
      await Store.init();
    } catch (err) {
      return fatal(err);
    }
    window.addEventListener('hashchange', route);
    await route();
    maybeWelcomeBack();
    setupServiceWorker();
  }

  /* Service worker: required for push. Tapping a notification while the app is open lands here. */
  function setupServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'navigate') {
        if (location.hash === e.data.hash) route();
        else location.hash = e.data.hash;
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') Store.refreshNotifications().then(updateBellBadge);
    });
  }
  boot();
})();
