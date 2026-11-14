/* Persistence + domain helpers. localStorage today; replace internals with API calls later. */
(function (global) {
  const KEY = 'toward-the-light.v1';
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
    b.lastActivity = at;
    const text = (noteText || '').trim();
    b.history.push({ id: uid(), at, type: 'checkpoint', chapter: completed, completedAfter: completed, text });
    if (text) b.notes.push({ id: uid(), at, chapter: completed || null, text });
    save();
    return { was, now: completed, justFinished: was < total && completed >= total };
  }

  function reset() {
    state = { books: Seed.books() };
    save();
  }

  global.Store = { books, getBook, derive, relativeTime, addNote, addCheckpoint, reset, PAUSED_AFTER_DAYS };
})(window);
