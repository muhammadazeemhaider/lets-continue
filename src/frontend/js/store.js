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

  /* ---------- cache ---------- */
  function upsert(b) {
    const key = String(b.id);
    const prev = byId.get(key) || { notes: [], history: [] };
    const merged = Object.assign(prev, b);
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

  async function createBook(payload) {
    const b = await api('/api/books', { method: 'POST', body: payload });
    upsert(b);
    return b;
  }

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

  global.Store = {
    init, loadBook, books, getBook, getUser, derive, bookStreak, readerStreak, relativeTime,
    addNote, addCheckpoint, createBook, updateUser, fetchReminder, writeRecap,
    notifications, refreshNotifications, markNotificationRead, markAllNotificationsRead,
    pushStatus, enablePush, disablePush, testPush,
  };
})(window);
