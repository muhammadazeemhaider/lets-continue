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

  /* ---------- dashboard ---------- */
  function dashboard() {
    const books = [...Store.books()].sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    const paused = books.filter((b) => Store.derive(b).isPaused).sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity));

    $app.innerHTML = `
<main class="page">
  <header class="masthead">
    <div class="eyebrow">Toward the Light</div>
    <h1>Getting to the Light</h1>
    <p>Every chapter brings the sunrise a little closer.</p>
  </header>

  ${paused.length ? `
  <button class="waiting" data-remind="${paused[0].id}">
    <span class="spark" aria-hidden="true">✨</span>
    <span><b>${paused.length === 1 ? 'A story is waiting for you' : `${paused.length} stories are waiting for you`}</b>
    <small>Remind me where I left off in “${esc(paused[0].title)}”</small></span>
  </button>` : ''}

  <section class="grid">
    ${books.map(card).join('')}
  </section>

  <div class="footer-actions"><button class="btn quiet small" id="reset">Reset sample data</button></div>
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
    $app.querySelector('#reset').addEventListener('click', () => {
      if (confirm('Reset to the original sample books? Your changes on this device will be lost.')) {
        Store.reset();
        dashboard();
        toast('Sample data restored');
      }
    });
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
      <span class="pct">${d.percent}%</span>
    </div>
    <div class="foot">
      <span class="status">${statusLine(d)}</span>
      <span class="last">Last read ${Store.relativeTime(b.lastActivity)}</span>
    </div>
  </div>
</article>`;
  }

  /* ---------- stubs filled in by later commits ---------- */
  function showReminder() {}
  function bookPage(id) {
    $app.innerHTML = `<main class="page"><a class="back" href="#/">← All books</a><p>${esc(id)}</p></main>`;
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
})();
