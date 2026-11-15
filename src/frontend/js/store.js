if (!window.TTL_CONFIG) {
/* Persistence + domain helpers. localStorage today; replace internals with API calls later. */
(function (global) {
  const KEY = 'toward-the-light.v2';
  const PAUSED_AFTER_DAYS = 14;
  let state = null;

  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  function load() {
    if (state) return state;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = JSON.parse(raw);
    } catch (e) {
      /* storage unavailable: fall through to seed */
    }
    if (!state || !Array.isArray(state.books)) state = { books: Seed.books() };
    if (!state.books.some(b=>b.id==='lantern-road')) state.books.push(Seed.books().find(b=>b.id==='lantern-road'));
    state.books.forEach(b=>{b.furthestCompleted=Math.max(b.completed,Number.isInteger(b.furthestCompleted)?Math.min(b.chapters.length,Math.max(0,b.furthestCompleted)):0);});
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* in-memory only */
    }
  }

  const books = () => load().books;
  const getBook = (id) => books().find((b) => b.id === id);

  /* ---- derived values (pure) ---- */
  function daysSince(iso) {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }
  function derive(book) {
    const total = book.chapters.length;
    const done = book.completed;
    const isComplete = done >= total;
    const currentIndex = isComplete ? total - 1 : done; // zero-based
    const days = daysSince(book.lastActivity);
    return {
      total,
      done,
      isComplete,
      currentIndex,
      current: book.chapters[currentIndex],
      percent: Math.round((done / total) * 100),
      daysAway: days,
      isPaused: !isComplete && days >= PAUSED_AFTER_DAYS,
    };
  }

  /* ---- streaks: consecutive calendar days with any reading activity (checkpoint or note) ---- */
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  function streakFromDates(isoDates) {
    const days = new Set(isoDates.map((iso) => dayKey(new Date(iso))));
    const cursor = new Date();
    const activeToday = days.has(dayKey(cursor));
    if (!activeToday) cursor.setDate(cursor.getDate() - 1); // a streak stays alive until the day is over
    let count = 0;
    while (days.has(dayKey(cursor))) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { count, activeToday, alive: count > 0 };
  }
  const bookStreak = (book) => streakFromDates(book.history.map((h) => h.at));
  const readerStreak = () => streakFromDates(books().flatMap((b) => b.history.map((h) => h.at)));

  function relativeTime(iso) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    const d = Math.floor(hrs / 24);
    if (d === 1) return 'yesterday';
    if (d < 14) return `${d} days ago`;
    if (d < 60) return `${Math.round(d / 7)} weeks ago`;
    return `${Math.round(d / 30)} months ago`;
  }

  /* ---- mutations ---- */
  function addNote(bookId, chapter, text) {
    const b = getBook(bookId);
    text = (text || '').trim();
    if (!b || !text) return null;
    const note = { id: uid(), at: new Date().toISOString(), chapter: chapter || null, text };
    b.notes.push(note);
    b.history.push({ id: uid(), at: note.at, type: 'note', chapter: note.chapter, text, completedAfter: b.completed });
    b.lastActivity = note.at;
    save();
    return note;
  }

  /** Save a checkpoint: the reader has finished `completed` chapters. */
  function addCheckpoint(bookId, completed, noteText) {
    const b = getBook(bookId);
    if (!b) return null;
    const total = b.chapters.length;
    const was = b.completed;
    completed = Math.max(0, Math.min(total, Math.round(completed)));
    const at = new Date().toISOString();
    b.completed = completed;
    b.furthestCompleted = Math.max(b.furthestCompleted || 0, was, completed);
    b.lastActivity = at;
    const text = (noteText || '').trim();
    b.history.push({ id: uid(), at, type: 'checkpoint', chapter: completed, completedAfter: completed, text });
    if (text) b.notes.push({ id: uid(), at, chapter: completed || null, text });
    save();
    return { was, now: completed, justFinished: was < total && completed >= total };
  }

  function setBookWorld(id,world){
    const book=getBook(id);if(!book||!['fantasy','scifi','pirates'].includes(world))return false;
    book.world=world;save();return true;
  }
  function setBookCompanion(id,character){
    const book=getBook(id);if(!book)return false;
    const world=['scifi','pirates'].includes(book.world)?book.world:'fantasy';
    if(!global.Characters?.forWorld(world).some(c=>c.id===character))return false;
    book.companions={...(book.companions||{}),[world]:character};save();return true;
  }

  function canAccessChapter(book,n){
    return Boolean(book)&&Number.isInteger(n)&&n>=1&&n<=book.chapters.length&&n<=Math.max(book.completed,book.furthestCompleted||0)+1;
  }
  function canChallengeChapter(book,n){
    return canAccessChapter(book,n)&&n<=Math.max(book.completed,book.furthestCompleted||0);
  }
  function startFromChapter(bookId,n){
    const book=getBook(bookId);
    if(!canAccessChapter(book,n))return null;
    const result=addCheckpoint(bookId,n-1,'');
    book.history[book.history.length-1].text=`Continuing from chapter ${n}.`;
    save();
    return result;
  }
  function resetBookProgress(bookId){
    const book=getBook(bookId);
    if(!book)return null;
    const was=book.completed;
    global.BossBattle?.resetBook(bookId);
    book.completed=0;
    book.furthestCompleted=0;
    const at=new Date().toISOString();
    book.history.push({id:uid(),at,type:'checkpoint',chapter:0,completedAfter:0,text:'Book progress reset.'});
    book.lastActivity=at;
    save();
    return {was,now:0};
  }

  function reset() {
    global.BossBattle?.reset();
    state = { books: Seed.books() };
    save();
  }

  global.Store = { books, getBook, derive, bookStreak, readerStreak, relativeTime, addNote, addCheckpoint, setBookWorld, setBookCompanion, canAccessChapter, canChallengeChapter, startFromChapter, resetBookProgress, reset, PAUSED_AFTER_DAYS };
})(window);

} else {
/* API-backed store. Reads are synchronous from an in-memory cache; every mutation goes to the
 * Flask backend first and then refreshes the cache, so the server is the single source of truth. */
(function (global) {
  const BASE = (global.TTL_CONFIG && global.TTL_CONFIG.apiBase) || '';
  const DEFAULT_PAUSED_AFTER = 14;

  let user = null;
  let streak = { count: 0, activeToday: false, alive: false };
  const byId = new Map(); // id (string) -> book

  const tz = () => -new Date().getTimezoneOffset(); // minutes east of UTC

  /* ---------- HTTP ---------- */
  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      const err = new Error('Cannot reach the Toward the Light server.');
      err.network = true;
      throw err;
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      if (res.status === 502 || res.status === 504) err.network = true; // dev proxy could not reach Flask
      throw err;
    }
    return data;
  }


  // Journey appearance and unlocked checkpoints stay on this device, like boss seals.
  const journeyKey = 'ttl.api.journeys.v1';
  let journeyState = {};
  try { journeyState = JSON.parse(localStorage.getItem(journeyKey) || '{}'); } catch {}
  const saveJourney = () => localStorage.setItem(journeyKey, JSON.stringify(journeyState));
  function journeyMeta(book) {
    const meta = journeyState[book.id] || (journeyState[book.id] = {});
    meta.furthestCompleted = Math.max(meta.furthestCompleted || 0, book.completed);
    return meta;
  }
  function setBookWorld(id, world) {
    const book = getBook(id);
    if (!book || !['fantasy','scifi','pirates'].includes(world)) return false;
    journeyMeta(book).world = book.world = world; saveJourney(); return true;
  }
  function setBookCompanion(id, character) {
    const book = getBook(id); if (!book) return false;
    const world = Characters.normalizeWorld(book.world);
    if (!Characters.forWorld(world).some(c => c.id === character)) return false;
    book.companions = {...book.companions, [world]: character};
    journeyMeta(book).companions = book.companions; saveJourney(); return true;
  }
  function canAccessChapter(book, n) {
    return !!book && Number.isInteger(n) && n >= 1 && n <= book.chapters.length && n <= Math.max(book.completed, book.furthestCompleted || 0) + 1;
  }
  const canChallengeChapter = (book, n) => canAccessChapter(book, n) && n <= Math.max(book.completed, book.furthestCompleted || 0);
  async function startFromChapter(id, n) {
    if (!canAccessChapter(getBook(id), n)) return null;
    return addCheckpoint(id, n - 1, '');
  }
  async function resetBookProgress(id) {
    if (!getBook(id)) return null;
    const result = await addCheckpoint(id, 0, '');
    BossBattle.resetBook(id);
    journeyMeta(getBook(id)).furthestCompleted = getBook(id).furthestCompleted = 0;
    saveJourney(); return result;
  }

  /* ---------- cache ---------- */
  function upsert(b) {
    const key = String(b.id);
    const prev = byId.get(key) || { notes: [], history: [] };
    const merged = Object.assign(prev, b);
    Object.assign(merged, journeyMeta(merged));
    saveJourney();
    byId.set(key, merged);
    return merged;
  }
  async function refreshList() {
    const list = await api(`/api/books?tz=${tz()}`);
    const seen = new Set(list.map((b) => String(b.id)));
    [...byId.keys()].forEach((k) => !seen.has(k) && byId.delete(k));
    list.forEach(upsert);
  }
  const refreshStreak = async () => { streak = await api(`/api/streak?tz=${tz()}`); };

  /** Load everything the dashboard needs. Throws (err.network) if the backend is down. */
  async function init() {
    [user] = await Promise.all([api('/api/user'), refreshList(), refreshStreak(), refreshNotifications()]);
  }
  /** Load a book's notes + history (the list endpoint only carries summaries). */
  async function loadBook(id) {
    return upsert(await api(`/api/books/${id}?tz=${tz()}`));
  }

  /* ---------- reads ---------- */
  const books = () => [...byId.values()];
  const getBook = (id) => byId.get(String(id));
  const getUser = () => user;
  const readerStreak = () => streak;
  const bookStreak = (b) => b.streak || { count: 0, activeToday: false, alive: false };

  function daysSince(iso) {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }
  function derive(book) {
    const total = book.chapters.length;
    const done = book.completed;
    const isComplete = done >= total;
    const currentIndex = isComplete ? total - 1 : done; // zero-based
    const days = daysSince(book.lastActivity);
    const pausedAfter = (user && user.pausedAfterDays) || DEFAULT_PAUSED_AFTER;
    return {
      total,
      done,
      isComplete,
      currentIndex,
      current: book.chapters[currentIndex],
      percent: Math.round((done / total) * 100),
      daysAway: days,
      isPaused: !isComplete && days >= pausedAfter,
    };
  }

  function relativeTime(iso) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    const d = Math.floor(hrs / 24);
    if (d === 1) return 'yesterday';
    if (d < 14) return `${d} days ago`;
    if (d < 60) return `${Math.round(d / 7)} weeks ago`;
    return `${Math.round(d / 30)} months ago`;
  }

  /* ---------- mutations ---------- */
  async function addNote(bookId, chapter, text) {
    await api(`/api/books/${bookId}/notes`, { method: 'POST', body: { text, chapter: chapter || null } });
    await Promise.all([loadBook(bookId), refreshStreak()]);
  }

  /** Save a checkpoint: the reader has finished `completed` chapters. */
  async function addCheckpoint(bookId, completed, note) {
    const was = getBook(bookId).completed;
    const res = await api(`/api/books/${bookId}/checkpoints`, { method: 'POST', body: { completed, note: note || '' } });
    upsert(res);
    await refreshStreak();
    return { was, now: res.completed, justFinished: res.justFinished, recapPending: !!res.recapPending };
  }

  async function deleteBook(id) {
    await api(`/api/books/${id}`, {method: 'DELETE'});
    global.BossBattle?.resetBook(id);
    byId.delete(String(id));
    delete journeyState[id];
    try { saveJourney(); } catch {}
    await Promise.allSettled([refreshStreak(), refreshNotifications()]);
  }

  async function createBook(payload) {
    const b = await api('/api/books', { method: 'POST', body: payload });
    upsert(b);
    return b;
  }

  /* ---------- book catalogue ---------- */
  const searchCatalog = (q) =>
    api(`/api/catalog/search?q=${encodeURIComponent(q)}`).then((r) => r.items).catch(() => []);
  const catalogEntry = (id) => api(`/api/catalog/${id}`).catch(() => null);
  const recommendBooks = preferences => api('/api/catalog/recommendations', {method:'POST', body:preferences});

  async function updateUser(patch) {
    user = await api('/api/user', { method: 'PUT', body: patch });
    return user;
  }

  /* ---------- notification inbox ---------- */
  let inbox = { unread: 0, items: [] };
  async function refreshNotifications() {
    try {
      inbox = await api('/api/notifications');
    } catch (e) {
      /* the inbox is non-essential; keep the last known state */
    }
    return inbox;
  }
  const notifications = () => inbox;
  async function markNotificationRead(id) {
    await api(`/api/notifications/${id}/read`, { method: 'POST' });
    await refreshNotifications();
  }
  async function markAllNotificationsRead() {
    await api('/api/notifications/read-all', { method: 'POST' });
    await refreshNotifications();
  }

  /* ---------- Web Push (this device) ---------- */
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function pushSupport() {
    if (!window.isSecureContext)
      return { ok: false, reason: `Phone notifications need a secure (HTTPS) address. On Android Chrome you can allow this exact address in chrome://flags/#unsafely-treat-insecure-origin-as-secure: ${location.origin} (then Relaunch Chrome).` };
    if (isIOS && !isStandalone())
      return { ok: false, reason: 'On iPhone and iPad, first add this app to your Home Screen (Share → Add to Home Screen), then open it from there to turn on notifications.' };
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
      return { ok: false, reason: 'This browser does not support push notifications.' };
    return { ok: true };
  }

  const swReady = () => navigator.serviceWorker.ready;
  const toKey = (b64) => {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  async function pushStatus() {
    const s = pushSupport();
    if (!s.ok) return { supported: false, reason: s.reason };
    const sub = await (await swReady()).pushManager.getSubscription();
    return { supported: true, permission: Notification.permission, subscribed: !!sub };
  }

  async function enablePush() {
    const perm = await Notification.requestPermission(); // must be called from a user gesture
    if (perm !== 'granted') throw new Error('Notifications are blocked. You can allow them in your browser or phone settings.');
    const { publicKey } = await api('/api/push/public-key');
    const reg = await swReady();
    const sub = (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
    await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
  }

  async function disablePush() {
    const sub = await (await swReady()).pushManager.getSubscription();
    if (!sub) return;
    await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }

  const testPush = () => api('/api/push/test', { method: 'POST' });

  /** Re-engagement text from the backend (the LLM seam); null if unavailable. */
  const fetchReminder = (bookId) => api(`/api/books/${bookId}/reminder`).catch(() => null);
  /** Have the backend write an LLM recap (slow on free models). Resolves {source, recap, nudge, model} or null. */
  const writeRecap = (bookId) => api(`/api/books/${bookId}/recap`, { method: 'POST' }).catch(() => null);
  /** The catalogue's three boss questions for a chapter: {available, source, questions[]}; null when offline. */
  const chapterQuestions = (bookId, n) =>
    api(`/api/books/${bookId}/chapters/${n}/questions`).catch(() => null);

  global.Store = {
    init, loadBook, books, getBook, getUser, derive, bookStreak, readerStreak, relativeTime,
    setBookWorld, setBookCompanion, canAccessChapter, canChallengeChapter, startFromChapter, resetBookProgress,
    addNote, addCheckpoint, createBook, deleteBook, updateUser, fetchReminder, writeRecap, searchCatalog, catalogEntry, recommendBooks,
    chapterQuestions,
    notifications, refreshNotifications, markNotificationRead, markAllNotificationsRead,
    pushStatus, enablePush, disablePush, testPush,
  };
})(window);

}
