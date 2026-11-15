/* Offline fallback for the re-engagement text. The real source is the backend
 * (GET /api/books/<id>/reminder), which is the seam for LLM generation; this mirrors its shape (plain text). */
(function (global) {
  function reminder(book) {
    const d = Store.derive(book);
    const lastRead = d.done > 0 ? book.chapters[d.done - 1] : null;
    const notes = [...(book.notes || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
    const near = notes.find((n) => n.chapter && n.chapter >= d.done - 1 && n.chapter <= d.done + 1);
    const note = near || notes[0] || null;
    const name = (Store.getUser() || {}).preferredName;
    const who = name && name.trim().toLowerCase() !== 'reader' ? name : ''; // "Reader" is the placeholder
    return {
      headline: `Your journey is waiting for you${who ? ', ' + who : ''}.`,
      lastLeft: lastRead ? `You last left ${book.title} around ${lastRead.title}.` : `You haven't begun ${book.title} yet.`,
      recap: book.recap,
      note: note ? { text: note.text, chapter: note.chapter } : null,
      nudge: d.current ? `Perhaps it is time to continue with ${d.current.title}.` : 'Perhaps it is time to begin.',
    };
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  global.Services = { reminder, esc };
})(window);
