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
    return `<div class="streak${s.activeToday ? ' lit' : ''}"><span class="ember" aria-hidden="true">${rewardIcon('flame')}</span>
      <span><b>${s.count}-day streak</b> · ${s.activeToday ? 'you read today' : 'read today to keep it glowing'}</span></div>`;
  }

  let shelfView = 'active';
  function readerRewards(books) {
    const chapters = books.reduce((sum, b) => sum + Math.max(b.completed, b.furthestCompleted || 0), 0);
    const seals = books.reduce((sum, b) => sum + b.chapters.filter(c => BossBattle.load(b.id, c.n)?.defeated).length, 0);
    const finished = books.filter(b => Store.derive(b).isComplete).length;
    const xp = chapters * 25 + seals * 50 + finished * 100;
    const badges = [
      {id:'wanderer',icon:'compass',name:'Page Wanderer',description:'Begin your Book Quest adventure.',earned:true},
      {id:'spark',icon:'flame',name:'First Spark',description:'Complete your first chapter.',earned:chapters>=1},
      {id:'guardian',icon:'shield',name:'Guardian Friend',description:'Earn your first boss seal.',earned:seals>=1},
      {id:'trailblazer',icon:'mountain',name:'Trailblazer',description:'Explore 10 chapters.',earned:chapters>=10},
      {id:'starlight',icon:'star',name:'Story Keeper',description:'Finish your first book.',earned:finished>=1},
      {id:'legend',icon:'crown',name:'Quest Legend',description:'Collect 10 guardian seals.',earned:seals>=10},
    ];
    const counts={wanderer:1,spark:chapters,guardian:seals,trailblazer:chapters,starlight:finished,legend:seals};
    const targets={wanderer:1,spark:1,guardian:1,trailblazer:10,starlight:1,legend:10};
    badges.forEach(b=>{b.current=Math.min(counts[b.id],targets[b.id]);b.target=targets[b.id];});
    let equipped='wanderer';
    try { equipped=localStorage.getItem('ttl.reader.title') || equipped; } catch {}
    const title=badges.find(b=>b.id===equipped&&b.earned)||badges[0];
    let favorites=[];
    try {const saved=JSON.parse(localStorage.getItem('ttl.reader.showcase')||'null');if(Array.isArray(saved))favorites=saved.filter(id=>badges.some(b=>b.id===id&&b.earned)).slice(0,3);else favorites=badges.filter(b=>b.earned).slice(0,3).map(b=>b.id);}catch{}
    const showcase=favorites.map(id=>badges.find(b=>b.id===id));
    const nextBadge=badges.find(b=>!b.earned);
    return {showcase,favorites,nextBadge,chapters,seals,finished,xp,level:Math.floor(xp/250)+1,intoLevel:xp%250,badges,title};
  }
  function rewardIcon(kind) {
    const paths={
      bell:'M12 4h8v4h4v12h4v4H4v-4h4V8h4z M12 26h8v4h-8z',
      gear:'M12 2h8v4h4v4h4v12h-4v4h-4v4h-8v-4H8v-4H4V10h4V6h4z M12 12v8h8v-8z',
      compass:'M12 2h8v4h4v4h4v8h-4v4h-4v4h-8v-4H8v-4H4v-8h4V6h4z M18 8l-8 12 12-8z',
      flame:'M16 2h4v8h4v4h4v8h-4v6H12v-4H8V12h4v6h4z',
      shield:'M6 4h20v14h-4v6h-4v4h-4v-4h-4v-6H6z M12 12v4h4v-4h4v-4h-4v4z',
      mountain:'M2 26l10-20 6 10 4-6 10 16z M8 20h8l-4-8z',
      star:'M14 2h4v8h10v4h-4v4h-4v10h-4v-6h-4v6H8V18H4v-4H0v-4h14z',
      crown:'M4 8h4v4h4V4h8v8h4V8h4v18H4z M8 20h16v2H8z',
    };
    return `<svg viewBox="0 0 32 32" aria-hidden="true" shape-rendering="crispEdges"><path d="${paths[kind]||paths.star}" fill="currentColor" fill-rule="evenodd"/></svg>`;
  }
  function badgeArt(id) {
    const art={
      wanderer:'<circle cx="16" cy="16" r="12" fill="#e9b766"/><circle cx="16" cy="16" r="9" fill="#286b89"/><path d="M16 5v4M16 23v4M5 16h4M23 16h4" stroke="#fff0b0" stroke-width="2"/><path d="M21 10l-3 9-8 3 3-9z" fill="#ffe6ae"/><path d="M21 10l-8 3 5 6z" fill="#ed827f"/><rect x="15" y="15" width="3" height="3" fill="#f7f0cb"/>',
      spark:'<path d="M15 1h5v7h4v5h4v10h-4v6H9v-4H5V14h4v5h3V9h3z" fill="#e77845"/><path d="M17 8h3v8h4v8h-4v3h-8v-4H9v-6h4v3h3z" fill="#ffb84f"/><path d="M16 17h4v10h-7v-6h3z" fill="#fff2a4"/>',
      guardian:'<path d="M5 3h22v15h-4v6h-4v5h-6v-5H9v-6H5z" fill="#d8e4ed"/><path d="M8 6h16v12h-4v5h-4v3l-4-4v-4H8z" fill="#32ac91"/><path d="M16 6h8v12h-4v5h-4z" fill="#197b79"/><path d="M10 13h4v4h3v-4h5V9h-8v4z" fill="#e7fbc8"/>',
      trailblazer:'<path d="M2 4h28v24H2z" fill="#6855ad"/><path d="M2 26L12 7l6 11 5-8 9 18H2z" fill="#35a7b5"/><path d="M12 7l6 11h-5l-3-2-3 1z" fill="#e3f5ee"/><path d="M15 28l8-18 9 18z" fill="#218a9b"/><path d="M23 10l4 8h-4l-2-3z" fill="#c6e8ee"/><rect x="22" y="5" width="3" height="3" fill="#f6d986"/>',
      starlight:'<path d="M3 11h11l2 3 2-3h11v17H18l-2 2-2-2H3z" fill="#3e82c0"/><path d="M5 12h9l2 3 2-3h9v12h-9l-2 3-2-3H5z" fill="#ffe6a1"/><path d="M16 15v12M8 16h5M19 16h5M8 20h5M19 20h5" stroke="#c39258" stroke-width="1"/><path d="M15 1h2v3h3v2h-3v3h-2V6h-3V4h3z" fill="#82d9fa"/>',
      legend:'<path d="M3 8h5v5h5V3h6v10h5V8h5v21H3z" fill="#e9ae4d"/><path d="M6 15h5v4h10v-4h5v9H6z" fill="#9c6ae2"/><path d="M6 25h20v3H6z" fill="#ffe8a2"/><path d="M14 16h4v6h-4z" fill="#ed6786"/><rect x="14" y="2" width="4" height="4" fill="#fff0a8"/><rect x="3" y="7" width="4" height="4" fill="#f5d383"/><rect x="25" y="7" width="4" height="4" fill="#f5d383"/>',
    };
    return `<svg viewBox="0 0 32 32" aria-hidden="true" shape-rendering="crispEdges">${art[id]||art.wanderer}</svg>`;
  }
  function trophyJournal() {
    const rewards=readerRewards(Store.books());
    let seen=[];
    try {seen=JSON.parse(localStorage.getItem('ttl.reader.badgesSeen')||'[]');if(!Array.isArray(seen))seen=[];}catch{}
    const fresh=rewards.badges.filter(b=>b.earned&&!seen.includes(b.id)).map(b=>b.id);
    try {localStorage.setItem('ttl.reader.badgesSeen',JSON.stringify(rewards.badges.filter(b=>b.earned).map(b=>b.id)));}catch{}
    const scrim=openOverlay(`<section class="sheet trophy-journal" role="dialog" aria-modal="true" aria-label="Trophy journal"><span class="eyebrow">YOUR ADVENTURE, COLLECTED</span><h2>Trophy journal</h2><p class="sub">Earn colorful badges, wear their titles, and pin up to three favorites to your profile.</p><div class="trophy-grid">${rewards.badges.map(b=>`<article data-badge="${b.id}" class="trophy-item ${b.earned?'earned':'locked'} ${fresh.includes(b.id)?'badge-reveal':''}"><span class="badge-rarity">${b.id==='legend'?'LEGENDARY':b.id==='starlight'?'EPIC':'MILESTONE'}${fresh.includes(b.id)?' · NEW':''}</span><span class="trophy-icon">${badgeArt(b.id)}${!b.earned?'<span class="badge-lock" aria-label="Locked">▣</span>':''}</span><h3>${b.name}</h3><p>${b.description}</p><div class="badge-progress"><span>${b.earned?'Unlocked':`${b.current} / ${b.target}`}</span><progress aria-label="${b.name} progress" max="${b.target}" value="${b.current}"></progress></div><div class="badge-actions"><button class="btn quiet small" data-equip-title="${b.id}" ${!b.earned?'disabled':''}>${!b.earned?'Locked':rewards.title.id===b.id?'Equipped':'Equip title'}</button>${b.earned?`<button class="badge-pin" data-pin-badge="${b.id}" aria-pressed="${rewards.favorites.includes(b.id)}" aria-label="${rewards.favorites.includes(b.id)?'Unpin':'Pin'} ${b.name}">${rewards.favorites.includes(b.id)?'★ Pinned':'☆ Pin'}</button>`:''}</div></article>`).join('')}</div><p class="reward-footnote">25 XP per reached chapter · 50 per guardian seal · 100 per finished book.<br>Rewards reflect your journeys; replaying a battle adds no duplicate XP.</p><div class="actions"><button class="btn primary" data-journal-close>Back to your quest</button></div></section>`);
    scrim.querySelectorAll('[data-pin-badge]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.pinBadge;
      const next=rewards.favorites.includes(id)?rewards.favorites.filter(value=>value!==id):[...rewards.favorites,id];
      if(next.length>3){toast('Unpin a badge first. Your showcase has three spaces.');return;}
      try {localStorage.setItem('ttl.reader.showcase',JSON.stringify(next));}catch{toast('Your browser could not save this showcase.');return;}
      closeOverlay();dashboard();trophyJournal();
    });
    scrim.querySelector('[data-journal-close]').onclick=closeOverlay;
    scrim.querySelectorAll('[data-equip-title]').forEach(button=>button.onclick=()=>{
      try {localStorage.setItem('ttl.reader.title',button.dataset.equipTitle);}catch{toast('Your browser could not save this title.');return;}
      closeOverlay();dashboard();trophyJournal();
    });
  }

  /* ---------- dashboard ---------- */
  function dashboard() {
    Journey.useBook(null);
    document.body.dataset.world='fantasy';
    const books = [...Store.books()].sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    const paused = books.filter((b) => Store.derive(b).isPaused).sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity));

    const activeBook = books.find(book => !Store.derive(book).isComplete);
    const chaptersRead = books.reduce((total, book) => total + book.completed, 0);
    const finishedBooks = books.filter(book => Store.derive(book).isComplete).length;
    const rewards=readerRewards(books);
    const reader=Store.getUser();
    const savedName=reader?.preferredName||reader?.name;
    const readerName=!savedName||savedName==='Reader'?'Adventurer':savedName;
    const portrait=activeBook ? Journey.characterForBook(activeBook) : 'lantern';
    const visibleBooks=books.filter(book=>shelfView==='all'||(shelfView==='complete'?Store.derive(book).isComplete:!Store.derive(book).isComplete));
    const readToday=Store.readerStreak().activeToday;
    const heroProgress=activeBook ? Store.derive(activeBook).percent/100 : finishedBooks ? 1 : .18;

    $app.innerHTML = `
<main class="page bookshelf-page">
  <nav class="library-nav" aria-label="Bookshelf"><a href="#/" class="library-brand"><span class="quest-logo" aria-hidden="true">▥<i>✦</i></span><span>BOOK QUEST<small>ONE MORE CHAPTER. ONE MORE ADVENTURE.</small></span></a><div class="quest-nav-actions"><span class="library-note">YOUR NEXT ADVENTURE IS A PAGE AWAY</span><button class="bell" id="bell" aria-label="Reminders${Store.notifications().unread ? ` (${Store.notifications().unread} unread)` : ''}">${rewardIcon('bell')}<span class="badge-dot" ${Store.notifications().unread ? '' : 'hidden'}>${Store.notifications().unread}</span></button><button class="gear" id="settings" aria-label="Profile and settings">${rewardIcon('gear')}</button></div></nav>
  <header class="masthead quest-banner">
    <div class="quest-banner-copy">
      ${greetingLine(books.length > 0)}
      <div class="eyebrow">YOUR BOOK. YOUR WORLD. YOUR QUEST.</div>
      <h1>Great adventures<br>begin with a page.</h1>
      <p>Read a chapter. Walk a little further. Face its guardian.<br>Turn your reading list into a world worth returning to.</p>
      <div class="quest-banner-actions">${activeBook ? `<a class="btn primary" href="#/book/${activeBook.id}">Continue your quest <span aria-hidden="true">→</span></a>` : '<button class="btn primary" data-add-book>Start your first quest <span aria-hidden="true">→</span></button>'}<a class="quest-shelf-link" href="#your-journeys" data-browse-journeys>Explore your bookshelf ↓</a></div>
      ${streakChip(Store.readerStreak())}
    </div>
    <div class="quest-banner-art" aria-hidden="true"><div id="quest-banner-scene"></div><span class="quest-art-label">A NEW CHAPTER. A LITTLE MORE LIGHT.</span></div>
  </header>
  <section class="quest-hub" aria-label="Your adventurer and current quest">
    <article class="reader-profile"><div class="hub-label"><span>ADVENTURER</span><span class="reader-level">LV. ${rewards.level}</span></div><div class="reader-identity"><div class="reader-portrait"><svg class="journey" viewBox="-16 -17 34 39" aria-hidden="true" shape-rendering="crispEdges"><g class="landscape-explorer" data-direction="down" data-frame="0">${Journey.characterSprite(portrait)}</g></svg></div><div><h2>${esc(readerName)}</h2><span class="reader-title">${rewards.title.name}</span></div></div><div class="reader-xp-label"><span>Adventure XP</span><b>${rewards.intoLevel} / 250</b></div><div class="reader-xp" role="progressbar" aria-label="Progress to next reader level" aria-valuemin="0" aria-valuemax="250" aria-valuenow="${rewards.intoLevel}"><span style="width:${rewards.intoLevel/250*100}%"></span></div><div class="reader-milestones"><span><b>${rewards.chapters}</b> chapters</span><span><b>${rewards.seals}</b> guardian seals</span></div><button class="profile-showcase" id="profile-showcase" aria-label="Edit badge showcase"><span class="showcase-label">YOUR BADGES</span><span class="showcase-slots">${[0,1,2].map(i=>rewards.showcase[i]?`<span class="mini-medal earned" data-badge="${rewards.showcase[i].id}" title="${rewards.showcase[i].name}">${badgeArt(rewards.showcase[i].id)}</span>`:'<span class="mini-medal empty" aria-label="Empty badge slot">+</span>').join('')}</span></button></article>
    <article class="daily-quest"><div class="hub-label"><span>TODAY’S QUEST</span><span class="quest-status ${readToday?'complete':''}">${readToday?'✓ READING COMPLETE':'A LITTLE ADVENTURE'}</span></div><div class="daily-quest-body"><span class="daily-quest-icon">${rewardIcon(readToday?'flame':'compass')}</span><div><h2>${readToday?'You kept the story glowing.':activeBook?'One chapter. A new horizon.':'Your first adventure awaits.'}</h2><p>${readToday?'Your reading activity is saved for today. Explore another chapter whenever you like.':activeBook?`Continue <em>${esc(activeBook.title)}</em> and discover what lies beyond the next checkpoint.`:'Choose a book, pick a world, and take your first step into the story.'}</p></div></div><div class="daily-quest-footer"><span class="quest-reward">${readToday?'✦ Every page counts':'+25 XP / new chapter'}</span>${activeBook?`<a class="btn primary small" href="#/book/${activeBook.id}">${readToday?'Keep exploring':'Accept the quest'} →</a>`:'<button class="btn primary small" data-quest-add>Choose a book →</button>'}</div></article>
    <button class="journal-preview" id="open-trophies"><div class="hub-label"><span>TROPHY JOURNAL</span><span>${rewards.badges.filter(b=>b.earned).length} / ${rewards.badges.length}</span></div><div class="journal-medals">${rewards.badges.slice(0,3).map(b=>`<span data-badge="${b.id}" class="mini-medal ${b.earned?'earned':'locked'}">${badgeArt(b.id)}</span>`).join('')}</div><h2>Make a little history.</h2><p>${rewards.nextBadge?`Next: ${rewards.nextBadge.name} · ${rewards.nextBadge.current}/${rewards.nextBadge.target}`:'Every badge earned. What a journey.'}</p><span class="journal-link">Open your collection <span>↗</span></span></button>
  </section>


  ${paused.length ? `
  <button class="waiting" data-remind="${paused[0].id}">
    <span class="spark" aria-hidden="true">✨</span>
    <span><b>${paused.length === 1 ? 'A story is waiting for you' : `${paused.length} stories are waiting for you`}</b>
    <small>Remind me where I left off in “${esc(paused[0].title)}”</small></span>
  </button>` : ''}

  <section class="discovery-invitation"><span class="discovery-icon" aria-hidden="true">${rewardIcon('compass')}</span><div><span class="eyebrow">LET CURIOSITY PICK THE PATH</span><h2>Not sure what to read next?</h2><p>Answer a few quick questions. Find an adventure from our catalogue.</p></div><button class="btn" id="find-next-quest">Find my next quest ✦</button></section>
  <div class="shelf-heading" id="your-journeys"><div><span class="eyebrow">THE QUEST LOG</span><h2>Your journeys <span class="shelf-count">${books.length}</span></h2></div><div class="shelf-tabs" role="group" aria-label="Filter journeys">${[['active','In progress'],['complete','Completed'],['all','All books']].map(([key,label])=>`<button data-shelf-view="${key}" aria-pressed="${shelfView===key}">${label}</button>`).join('')}</div></div>
  <section class="grid">
    ${visibleBooks.map((book, index) => card(book, index === 0)).join('') || `<div class="quest-empty"><span>${rewardIcon('compass')}</span><h3>${shelfView==='complete'?'Your legends are still being written.':'A new adventure is waiting.'}</h3><p>${shelfView==='complete'?'Finished books will find their home here.':'Add a book to begin a new quest, or revisit a completed journey.'}</p></div>`}
  </section>

  <div class="shelf-footer"><span aria-hidden="true">✧</span><p>There’s no rush. The sun rises one page at a time.</p></div>

  <div class="footer-actions"><button class="btn primary" id="add-book">+ Add a book</button></div>
</main>`;

    Journey.render($app.querySelector('#quest-banner-scene'), {total: 100, completed: Math.round(heroProgress*100), world: 'fantasy', character: portrait, label: 'A sunrise over your next adventure'});
    $app.querySelector('[data-browse-journeys]').addEventListener('click', e => { e.preventDefault(); $app.querySelector('#your-journeys').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); });
    $app.querySelector('[data-add-book]')?.addEventListener('click', addBookSheet);
    $app.querySelector('#open-trophies').onclick=trophyJournal;
    $app.querySelector('#find-next-quest').onclick=recommendationGuide;
    $app.querySelector('#profile-showcase').onclick=trophyJournal;
    $app.querySelector('[data-quest-add]')?.addEventListener('click',addBookSheet);
    $app.querySelectorAll('[data-shelf-view]').forEach(button=>button.onclick=()=>{const scroll=window.scrollY;shelfView=button.dataset.shelfView;dashboard();window.scrollTo(0,scroll);$app.querySelector(`[data-shelf-view="${shelfView}"]`)?.focus({preventScroll:true});});
    visibleBooks.forEach((b) => {
      const d = Store.derive(b);
      Journey.render($app.querySelector(`[data-scene="${b.id}"]`), {
        total: d.total,
        completed: d.done,
        world:b.world||'fantasy',character:Journey.characterForBook(b),
        label: `${b.title}: ${d.done} of ${d.total} chapters completed`,
      });
    });

    $app.querySelector('[data-remind]')?.addEventListener('click', (e) => showReminder(e.currentTarget.dataset.remind));
    $app.querySelectorAll('[data-remove-book]').forEach(button=>button.onclick=()=>removeBook(button.dataset.removeBook));
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

  /** 'Welcome back, Azeem' for returning readers (by the name they asked to be called). */
  function greetingLine(returning) {
    const u = Store.getUser();
    const name = u && u.preferredName && u.preferredName.trim().toLowerCase() !== 'reader' ? u.preferredName : '';
    if (!name) return '';
    return `<p class="quest-greeting">${returning ? 'Welcome back' : 'Welcome'}, <b>${esc(name)}</b>.</p>`;
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

  function recommendationGuide() {
    const answers={mood:'',genre:'',length:'',difficulty:'',favorites:'',avoid:''};
    let step=0;
    const questions=[
      {key:'mood',title:'What kind of escape are you after?',hint:'Pick the feeling you want your next book to leave you with.',options:[['cozy','A cozy escape','Warm, gentle, and comforting'],['adventurous','A grand adventure','New worlds and a sense of wonder'],['thoughtful','Something thoughtful','Ideas and characters to sit with'],['mysterious','A little mystery','Secrets, suspense, and curiosity'],['surprise','Surprise me','I’m open to something different']]},
      {key:'genre',title:'Which shelf draws you in?',hint:'Your reading genre can be different from your game world.',options:[['fantasy','Fantasy & folklore','Magic, myths, and imagined worlds'],['scifi','Science fiction','Future worlds and big possibilities'],['mystery','Mystery & suspense','Puzzles, secrets, and investigations'],['romance','Romance & relationships','Connection, love, and human stories'],['classics','Classics & literary fiction','Distinctive voices and enduring stories'],['any','Open to any genre','Find something that fits my mood']]},
      {key:'length',title:'How big should this adventure be?',hint:'A quick journey or a world to settle into?',options:[['short','A shorter read','Prefer books with fewer pages'],['long','A longer journey','Happy to spend time in a bigger story'],['any','Either is good','Let the story decide']]},
      {key:'difficulty',title:'How much of a challenge sounds fun?',hint:'Choose the reading experience you want right now.',options:[['easy','Easy to settle into','Accessible language and a clear story'],['moderate','A little depth','Some complexity, with room to reflect'],['challenging','Challenge me','Dense prose, layered ideas, or an intricate plot'],['any','No preference','I’m happy to try anything']]},
      {key:'favorites',title:'What do you already love?',hint:'A favorite book or author helps your guide understand your taste. Optional.',label:'Books or authors you enjoy',placeholder:'I loved The Hobbit and Anne of Green Gables.'},
      {key:'avoid',title:'Anything you’d rather leave out?',hint:'Tell us about themes or story elements you don’t enjoy. Optional. Matches are based on catalogue summaries, which may not list every theme.',label:'Things to avoid',placeholder:'For example: horror, graphic violence, or bleak endings.'},
    ];
    const scrim=openOverlay('<section class="sheet recommendation-guide" role="dialog" aria-modal="true" aria-label="Find my next quest"></section>');
    const panel=scrim.firstElementChild;
    function paint(){
      const q=questions[step];
      panel.innerHTML=`<span class="eyebrow">THE BOOK QUEST GUIDE · ${step+1} / ${questions.length}</span><div class="guide-steps" aria-hidden="true">${questions.map((_,i)=>`<span class="${i<=step?'filled':''}"></span>`).join('')}</div><h2>${q.title}</h2><p class="sub">${q.hint}</p><form><div class="guide-options">${q.options?q.options.map(([value,label,hint])=>`<label class="guide-option"><input type="radio" name="choice" value="${value}" ${answers[q.key]===value?'checked':''} required><span><b>${label}</b><small>${hint}</small></span></label>`).join(''):`<label class="field">${q.label}<textarea name="${q.key}" maxlength="500" placeholder="${q.placeholder}">${esc(answers[q.key])}</textarea></label>`}</div><p class="guide-privacy">Your answers are sent to the configured AI provider to match books in our catalogue.</p><div class="actions"><button type="button" class="btn quiet" data-guide-back>${step?'← Back':'Cancel'}</button><button class="btn primary" type="submit">${step===questions.length-1?'Find my next quest ✦':'Next →'}</button></div></form>`;
      const form=panel.querySelector('form');
      const remember=()=>{if(q.options)answers[q.key]=form.querySelector('input:checked')?.value||'';else answers[q.key]=form.querySelector('textarea').value;};
      panel.querySelector('[data-guide-back]').onclick=()=>{remember();if(step){step--;paint();}else closeOverlay();};
      form.onsubmit=async e=>{
        e.preventDefault();remember();
        if(step<questions.length-1){step++;paint();return;}
        panel.innerHTML='<span class="eyebrow">SEARCHING THE CATALOGUE</span><h2>Finding your next adventure…</h2><p class="sub" role="status">Your guide is matching your answers with books on our shelves.</p><div class="guide-loading" aria-hidden="true">✦ · ✧ · ✦</div><div class="actions"><button class="btn quiet" data-guide-cancel>Cancel</button></div>';
        panel.querySelector('[data-guide-cancel]').onclick=closeOverlay;
        try {
          const result=await Store.recommendBooks(answers);
          if(!scrim.isConnected)return;
          panel.innerHTML=`<span class="eyebrow">${result.personalized?'AI PICKS · FROM OUR CATALOGUE':'EXPLORE OUR CATALOGUE'}</span><h2>${result.items.length?'Your next chapter could be here.':'You’ve explored our current shelves.'}</h2><p class="sub">${result.personalized?'A few possible adventures, chosen around your answers. Books already on your shelf are excluded.':'Personalized matching is unavailable, or no unread catalogue books remain. These are catalogue suggestions, not AI matches.'}</p><div class="recommendation-results">${result.items.map((book,i)=>`<article class="recommendation-book"><span class="recommendation-cover">${book.coverUrl?`<img src="${esc(book.coverUrl)}" alt="" loading="lazy">`:rewardIcon('star')}</span><div><span class="recommendation-rank">PICK ${i+1} · ${book.chapterCount} CHAPTERS${book.pages?` · ${book.pages} PAGES`:''}</span><h3>${esc(book.title)}</h3><span class="recommendation-author">${esc(book.author)}</span><p>${esc(book.reason)}</p><button class="btn small" data-review-pick="${i}">Review & add →</button></div></article>`).join('')}</div><div class="actions"><button class="btn quiet" data-guide-retry>Refine my answers</button><button class="btn primary" data-guide-done>Back to bookshelf</button></div>`;
          panel.querySelectorAll('[data-review-pick]').forEach(button=>button.onclick=()=>addBookSheet(result.items[Number(button.dataset.reviewPick)]));
          panel.querySelector('[data-guide-retry]').onclick=()=>{step=0;paint();};
          panel.querySelector('[data-guide-done]').onclick=closeOverlay;
          panel.querySelector('button')?.focus();
        }catch(err){
          if(!scrim.isConnected)return;
          panel.innerHTML=`<h2>Your guide couldn’t connect.</h2><p class="sub" role="alert">${esc(err.message)}</p><div class="actions"><button class="btn quiet" data-guide-dismiss>Close</button><button class="btn primary" data-guide-again>Try again</button></div>`;
          panel.querySelector('[data-guide-dismiss]').onclick=closeOverlay;
          panel.querySelector('[data-guide-again]').onclick=paint;
        }
      };
      panel.querySelector('input,textarea,button')?.focus();
    }
    paint();
  }

  function addBookSheet(initialEntry) {
    const scrim = openOverlay(`
<form class="sheet" role="dialog" aria-modal="true" aria-label="Add a book" autocomplete="off">
  <h2>Add a book</h2>
  <p class="sub">Start typing the title. Pick it from the list and the rest fills itself in.</p>
  <label class="field">Title
    <input name="title" required maxlength="200" placeholder="e.g. The Hobbit" role="combobox"
           aria-autocomplete="list" aria-controls="suggest" aria-expanded="false"></label>
  <ul class="suggest" id="suggest" role="listbox" hidden></ul>
  <p class="hint catalog-status" data-status aria-live="polite"></p>
  <label class="field">Author<input name="author" maxlength="200"></label>
  <label class="field">Chapters <span class="count" data-count></span>
    <textarea name="chapters" placeholder="Either a number (e.g. 24) or one chapter title per line"></textarea></label>
  <label class="field">Summary (optional)<textarea name="recap" placeholder="What is this book about? Used in your recaps and reminders."></textarea></label>
  <div class="actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">Add book</button></div>
</form>`);
    const form = scrim.querySelector('form');
    const list = form.querySelector('#suggest');
    const status = form.querySelector('[data-status]');
    const countEl = form.querySelector('[data-count]');
    let picked = null; // {id, title} of the catalogue entry the reader chose
    let items = [];
    let active = -1;
    let seq = 0;
    let timer;

    const updateCount = () => {
      const raw = form.chapters.value.trim();
      const n = /^\d+$/.test(raw) ? Number(raw) : raw.split(/\r?\n/).filter((l) => l.trim()).length;
      countEl.textContent = n ? `· ${n}` : '';
    };
    const close = () => { list.hidden = true; form.title.setAttribute('aria-expanded', 'false'); active = -1; };
    const render = () => {
      if (!items.length) return close();
      list.innerHTML = items.map((it, i) => `
        <li role="option" id="opt-${i}" aria-selected="${i === active}" data-i="${i}" class="${i === active ? 'active' : ''}">
          ${it.coverUrl ? `<img src="${esc(it.coverUrl)}" alt="" loading="lazy">` : '<span class="nocover">\u{1F4D6}</span>'}
          <span class="meta"><b>${esc(it.title)}</b><small>${esc([it.author, it.year].filter(Boolean).join(' · '))}</small></span>
          ${it.chapterCount ? `<span class="pill">${it.chapterCount} ch.</span>` : ''}
        </li>`).join('');
      list.hidden = false;
      form.title.setAttribute('aria-expanded', 'true');
    };

    async function pick(it) {
      close();
      picked = { id: it.id, title: it.title };
      form.title.value = it.title;
      form.author.value = it.author || '';
      status.className = 'hint catalog-status loading';
      status.textContent = 'Filling in the summary and chapters…';
      const mine = ++seq;
      const entry = await Store.catalogEntry(it.id);
      if (mine !== seq || !picked || picked.id !== it.id) return; // the reader moved on
      status.classList.remove('loading');
      if (!entry) {
        status.textContent = 'Could not load the details right now. You can fill them in yourself.';
        return;
      }
      form.author.value = entry.author || form.author.value;
      if (entry.summary) form.recap.value = entry.summary;
      if (entry.chapters.length) form.chapters.value = entry.chapters.join('\n');
      updateCount();
      const chaptersFrom = {
        curated: '✓ Chapters from our catalogue',
        gutenberg: '✓ Chapters from the book’s text (Project Gutenberg)',
        openlibrary: 'Chapters from Open Library (check against your copy)',
        none: 'No chapter list found. Enter the number of chapters (or their titles)',
      }[entry.chapterSource] || '';
      const summaryFrom = { openlibrary: 'summary from Open Library', wikipedia: 'summary from Wikipedia' }[entry.summarySource];
      status.textContent = chaptersFrom + (summaryFrom && entry.chapterSource !== 'curated' ? ` · ${summaryFrom}` : '') + '.';
      if (!entry.chapters.length) form.chapters.focus();
    }

    form.title.addEventListener('input', () => {
      if (picked && form.title.value !== picked.title) { picked = null; status.textContent = ''; }
      clearTimeout(timer);
      const q = form.title.value.trim();
      if (q.length < 2) { items = []; return close(); }
      timer = setTimeout(async () => {
        const mine = ++seq;
        const found = await Store.searchCatalog(q);
        if (mine !== seq) return; // a newer keystroke already searched
        items = found;
        active = -1;
        render();
      }, 300);
    });
    form.title.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        render();
        form.title.setAttribute('aria-activedescendant', `opt-${active}`);
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        pick(items[active]);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    });
    list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
    list.addEventListener('click', (e) => {
      const li = e.target.closest('[data-i]');
      if (li) pick(items[Number(li.dataset.i)]);
    });
    form.title.addEventListener('blur', () => setTimeout(close, 150));
    form.chapters.addEventListener('input', updateCount);

    form.querySelector('[data-cancel]').addEventListener('click', closeOverlay);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitWith(form, async () => {
        const raw = form.chapters.value.trim();
        const payload = { title: form.title.value, author: form.author.value, recap: form.recap.value };
        if (picked) payload.catalogId = picked.id;
        if (/^\d+$/.test(raw)) payload.chapterCount = Number(raw);
        else if (raw) payload.chapters = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        else if (!picked) throw new Error('Add the number of chapters, or pick the book from the list.');
        const b = await Store.createBook(payload);
        closeOverlay();
        location.hash = `#/book/${b.id}`;
        toast('Book added');
      });
    });
    if(initialEntry?.id){
      picked={id:initialEntry.id,title:initialEntry.title};
      form.title.value=initialEntry.title;
      form.author.value=initialEntry.author||'';
      form.chapters.value=(initialEntry.chapters||[]).join('\n');
      form.recap.value=initialEntry.summary||'';
      updateCount();
      status.textContent='Catalogue details filled in. Review them before adding your book.';
    }
    form.title.focus({ preventScroll: true });
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
    <button class="card-remove-book" data-remove-book="${b.id}" aria-label="Remove ${esc(b.title)} from bookshelf">Remove book</button>
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
    scrim.querySelector('#start-from-chapter').onclick=async()=>{
      const result=await Store.startFromChapter(id,chapter.n);
      if(!result)return;
      closeOverlay();bookPage(id,index,result.was);toast(`Continuing from chapter ${chapter.n}. Notes and guardian seals kept.`);
    };
    scrim.querySelector('#chapter-boss').onclick=()=>{
      closeOverlay();BossBattle.open(book,chapter.n,{openOverlay,closeOverlay,replay:cleared,onVictory:()=>bookPage(id,index),onClose:()=>{if(location.hash===`#/book/${id}`)bookPage(id,index);}});
    };
  }

  function removeBook(id) {
    const book=Store.getBook(id);
    if(!book)return;
    const scrim=openOverlay(`<form class="sheet remove-book-sheet" role="dialog" aria-modal="true" aria-label="Remove book"><span class="eyebrow">REMOVE FROM YOUR BOOKSHELF</span><h2>Leave this adventure?</h2><p class="sub">Remove <strong>${esc(book.title)}</strong> from your bookshelf? Its reading progress, notes, history, reminders, and saved boss battles will be deleted. This cannot be undone.</p><p class="remove-book-hint">The book stays in the catalogue, so you can add it again as a fresh journey.</p><div class="actions"><button class="btn quiet" type="button" data-keep-book>Keep this book</button><button class="btn danger" type="submit">Remove book</button></div></form>`);
    const form=scrim.querySelector('form');
    form.querySelector('[data-keep-book]').onclick=closeOverlay;
    form.onsubmit=e=>{
      e.preventDefault();
      submitWith(form,async()=>{
        await Store.deleteBook(id);
        if(scrim.isConnected)closeOverlay();
        if(location.hash===`#/book/${id}`)location.hash='#/';
        else if(!location.hash||location.hash==='#/')dashboard();
        toast('Book removed from your bookshelf.');
      });
    };
    form.querySelector('[data-keep-book]').focus();
  }

  function resetBook(id){
    const book=Store.getBook(id);
    const scrim=openOverlay(`<section class="sheet" role="dialog" aria-modal="true" aria-label="Reset book progress"><h2>Restart this journey?</h2><p class="sub">Reset reading progress and all boss encounters for <em>${esc(book.title)}</em>. Your notes, reading history, character choice, and other books are kept.</p><div class="actions"><button class="btn quiet" id="cancel-book-reset">Keep my progress</button><button class="btn primary" id="confirm-book-reset">Reset book progress</button></div></section>`);
    scrim.querySelector('#cancel-book-reset').onclick=closeOverlay;
    scrim.querySelector('#confirm-book-reset').onclick=async()=>{
      const result=await Store.resetBookProgress(id);
      closeOverlay();bookPage(id,0,result.was);toast('Book progress reset. Your notes are still here.');
    };
  }

  function bookPage(id, selected, previousCompleted, onArrival) {
    const b = Store.getBook(id);
    Journey.useBook(b);
    document.body.dataset.world=Journey.getWorld();
    const d = Store.derive(b);
    if (selected == null) selected = Number.isFinite(previousCompleted) && d.done > previousCompleted ? d.done - 1 : d.currentIndex;
    const stretch = Journey.chapterStretch(d.total, selected);
    const oldHero = $app.querySelector('#hero');
    const oldStretch = Number(oldHero?.dataset.stretch);
    const slideMap = oldHero?.dataset.book === String(id) && oldStretch !== stretch.index && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const outgoingMap = slideMap ? oldHero.querySelector('svg.journey')?.cloneNode(true) : null;
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
    <div class="book-management"><button class="btn quiet small" id="reset-book">Reset book progress</button><button class="btn quiet small remove-book-link" data-remove-book="${id}">Remove book</button></div>
        ${!d.isComplete && d.done > 0 ? `<button class="btn small${d.isPaused ? ' glow' : ''}" id="remind">Where was I?</button>` : ''}
  </div>
  <header class="book-head"><h1>${esc(b.title)}</h1><p>${esc(b.author)}</p></header>
  ${worldPicker(b)}
  ${characterPicker()}
  ${stretch.count > 1 ? `<nav class="journey-stretches" aria-label="Journey stretches"><div><span class="eyebrow">STRETCH ${stretch.index + 1} OF ${stretch.count}</span><p>Chapters <b>${stretch.start + 1}–${stretch.end}</b> <span>of ${d.total}</span></p></div><div class="stretch-actions"><button class="btn quiet small" data-stretch="${stretch.index - 1}" ${stretch.index === 0 ? 'disabled' : ''}>← Previous</button><button class="btn quiet small" id="current-stretch">Your position</button><button class="btn quiet small" data-stretch="${stretch.index + 1}" ${stretch.index === stretch.count - 1 ? 'disabled' : ''}>Next →</button></div></nav>` : ''}
  <div class="hero" id="hero" data-book="${id}" data-stretch="${stretch.index}"></div>
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
    $app.querySelector('[data-remove-book]').onclick=()=>removeBook(id);
    $app.querySelectorAll('[data-stretch]').forEach(button => button.onclick = () => {
      const scroll = window.scrollY;
      bookPage(id, Journey.stretchAt(d.total, Number(button.dataset.stretch)).start);
      window.scrollTo(0, scroll);
      $app.querySelector(`[data-stretch="${button.dataset.stretch}"]`)?.focus({preventScroll:true});
    });
    $app.querySelector('#current-stretch')?.addEventListener('click', () => {
      const scroll = window.scrollY;
      bookPage(id);
      window.scrollTo(0, scroll);
      $app.querySelector('#current-stretch')?.focus({preventScroll:true});
    });
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

    if (outgoingMap) {
      const hero = $app.querySelector('#hero');
      const incomingMap = hero.firstElementChild;
      const direction = stretch.index > oldStretch ? 1 : -1;
      hero.querySelectorAll('.journey-outgoing').forEach(el => el.remove());
      outgoingMap.classList.add('journey-outgoing');
      outgoingMap.setAttribute('aria-hidden', 'true');
      outgoingMap.querySelectorAll('[tabindex]').forEach(el => el.removeAttribute('tabindex'));
      hero.append(outgoingMap);
      const timing = {duration: 520, easing: 'cubic-bezier(.22,.75,.25,1)'};
      incomingMap.animate([{transform: `translateX(${direction * 100}%)`}, {transform: 'translateX(0)'}], timing);
      const exit = outgoingMap.animate([{transform: 'translateX(0)'}, {transform: `translateX(${-direction * 100}%)`}], timing);
      exit.onfinish = () => outgoingMap.remove();
      exit.oncancel = () => outgoingMap.remove();
    }

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
      submitWith(form, async () => {
      const res = await Store.addCheckpoint(id, n, form.note.value);
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
      world:b.world||'fantasy',character:Journey.characterForBook(b),
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
      if (err.auth) { signupScreen(); return; } // signed out on this device
      if (m && !err.network) { location.hash = '#/'; return; } // unknown book
      fatal(err);
      return;
    }
    window.scrollTo(0, 0);
  }

  /* ---------- sign-up: name, what to call you, optional email ---------- */
  function signupScreen() {
    closeOverlay();
    $app.innerHTML = `
<main class="page signup-page">
  <header class="signup-brand library-brand"><span class="quest-logo" aria-hidden="true">▥<i>✦</i></span><span>BOOK QUEST<small>ONE MORE CHAPTER. ONE MORE ADVENTURE.</small></span></header>
  <form class="sheet signup-card" id="signup" autocomplete="on" novalidate>
    <h2>Welcome, traveller</h2>
    <p class="sub">A few quick questions before your journey begins.</p>
    <label class="field">What’s your name?
      <input name="name" autocomplete="name" required maxlength="80" placeholder="e.g. Azeem Haider"></label>
    <label class="field">What should we call you?
      <input name="preferredName" autocomplete="nickname" required maxlength="40" placeholder="e.g. Azeem">
      <small class="hint">This is how the app greets you, like “Welcome back, Azeem”.</small></label>
    <label class="field">Email (optional)
      <input name="email" type="email" autocomplete="email" maxlength="200" placeholder="you@example.com"></label>
    <div class="actions"><button type="submit" class="btn primary">Begin my journey →</button></div>
  </form>
</main>`;
    const form = document.getElementById('signup');
    let preferredTouched = false;
    form.preferredName.addEventListener('input', () => { preferredTouched = true; });
    form.name.addEventListener('input', () => {
      if (!preferredTouched) form.preferredName.value = form.name.value.trim().split(/\s+/)[0] || '';
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.name.value.trim()) { errorBox(form).textContent = 'Please tell us your name.'; form.name.focus(); return; }
      if (!form.preferredName.value.trim()) { errorBox(form).textContent = 'What should we call you?'; form.preferredName.focus(); return; }
      submitWith(form, async () => {
        const user = await Store.signUp({
          name: form.name.value.trim(), preferredName: form.preferredName.value.trim(), email: form.email.value.trim(),
        });
        await boot();
        toast(`Welcome, ${user.preferredName}!`);
      });
    });
    form.name.focus({ preventScroll: true });
  }

  let started = false;
  async function boot() {
    if (!Store.isSignedIn()) return signupScreen();
    $app.innerHTML = '<main class="page"><p class="loading">Waking the sunrise…</p></main>';
    try {
      await Store.init();
    } catch (err) {
      return err.auth ? signupScreen() : fatal(err);
    }
    if (!started) {
      started = true;
      window.addEventListener('hashchange', route);
      setupServiceWorker();
    }
    await route();
    maybeWelcomeBack();
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
