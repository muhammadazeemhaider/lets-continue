/* Seam for future backend / LLM integration.
 * Everything the UI needs for the re-engagement experience goes through `Services.reminder(book)`.
 * Today it is template-based; later, make it async and call an LLM with the same input/output shape.
 */
(function (global) {
  /**
   * @returns {{headline:string, lastLeft:string, recap:string, note:{text:string, chapter:number|null}|null, nudge:string}}
   */
  function reminder(book) {
    const d = Store.derive(book);
    const cur = d.current;
    const lastRead = d.done > 0 ? book.chapters[d.done - 1] : null;

    // Prefer the most recent note written near where the reader stopped, else any recent note.
    const notes = [...book.notes].sort((a, b) => new Date(b.at) - new Date(a.at));
    const near = notes.find((n) => n.chapter && n.chapter >= d.done - 1 && n.chapter <= d.done + 1);
    const note = near || notes[0] || null;

    const lastLeft = lastRead
      ? `You last left <em>${esc(book.title)}</em> around <strong>${esc(lastRead.title)}</strong>.`
      : `You haven’t begun <em>${esc(book.title)}</em> yet.`;

    return {
      headline: 'Your journey is waiting for you.',
      lastLeft,
      recap: book.recap,
      note: note ? { text: note.text, chapter: note.chapter } : null,
      nudge: cur
        ? `Perhaps it is time to continue with <strong>${esc(cur.title)}</strong>.`
        : 'Perhaps it is time to begin.',
    };
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  global.Services = { reminder, esc };
})(window);
