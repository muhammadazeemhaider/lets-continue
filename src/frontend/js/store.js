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
