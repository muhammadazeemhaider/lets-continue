/* Sample book data. Swap this for a backend later: Store only needs `Seed.books()`. */
(function (global) {
  const DAY = 86400000;
  const ago = (days, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600000).toISOString();

  const titled = (titles) => titles.map((title, i) => ({ n: i + 1, title }));
  const numbered = (count, prefix = 'Chapter') =>
    Array.from({ length: count }, (_, i) => ({ n: i + 1, title: `${prefix} ${i + 1}` }));

  /* Checkpoints walking back from the latest one, a few chapters at a time. */
  function history(completed, lastDaysAgo, step = 3, gap = 2) {
    const out = [];
    let c = completed;
    let d = lastDaysAgo;
    let id = 0;
    while (c > 0) {
      out.push({ id: `h${id++}`, at: ago(d, id % 5), type: 'checkpoint', chapter: c, completedAfter: c, text: '' });
      c -= step;
      d += gap;
    }
    return out;
  }

  function books() {
    const fivePeople = {
      id: 'five-people',
      title: 'The Five People You Meet in Heaven',
      author: 'Mitch Albom',
      recap:
        'Eddie, an old maintenance man at a seaside amusement park, dies trying to save a child. In the afterlife he meets five people who each explain a piece of his life.',
      chapters: titled([
        'The End',
        'The Beginning',
        'Eddie’s Birthday',
        'The Blue Man',
        'Ruby',
        'The Pier',
        'The Captain',
        'Marguerite',
        'The War',
        'Tala',
        'The Last Lesson',
        'Home',
      ]),
      completed: 4,
      lastActivity: ago(23),
      notes: [
        {
          id: 'n1',
          at: ago(23, 2),
          chapter: 4,
          text: 'The Blue Man’s explanation of how our lives are interconnected — “there are no random acts.” I want to keep this in mind when Ruby shows up.',
        },
        { id: 'n2', at: ago(30), chapter: null, text: 'Recommended by Dad. Read it slowly, one chapter at night.' },
      ],
      history: history(4, 23, 2, 3),
    };

    const piranesi = {
      id: 'piranesi',
      title: 'Piranesi',
      author: 'Susanna Clarke',
      recap:
        'Piranesi lives in a House of endless halls, tides and statues. He keeps careful journals — until signs appear that someone else is in the House.',
      chapters: numbered(14, 'Entry'),
      completed: 9,
      lastActivity: ago(1, 4),
      notes: [
        { id: 'n3', at: ago(2), chapter: 5, text: 'The Other is not as kind as he seems. Note the dates in the journals.' },
        { id: 'n4', at: ago(1, 4), chapter: 9, text: 'Who is 16? The numbering doesn’t add up.' },
      ],
      history: history(9, 1, 3, 2),
    };

    const dune = {
      id: 'dune',
      title: 'Dune',
      author: 'Frank Herbert',
      recap:
        'Young Paul Atreides arrives on the desert planet Arrakis, the only source of the spice — and the House Atreides is about to be betrayed.',
      chapters: numbered(22, 'Part'),
      completed: 3,
      lastActivity: ago(61),
      notes: [
        { id: 'n5', at: ago(61), chapter: 3, text: 'The gom jabbar test. Fear is the mind-killer — re-read the litany.' },
      ],
      history: history(3, 61, 1, 4),
    };

    const littlePrince = {
      id: 'little-prince',
      title: 'The Little Prince',
      author: 'Antoine de Saint-Exupéry',
      recap: 'A pilot stranded in the desert meets a small prince who has travelled from planet to planet.',
      chapters: numbered(27),
      completed: 27,
      lastActivity: ago(9),
      notes: [
        { id: 'n6', at: ago(9), chapter: 21, text: '“What is essential is invisible to the eye.” The fox chapter. Gift this to Sara.' },
      ],
      history: history(27, 9, 9, 1),
    };

    return [fivePeople, piranesi, dune, littlePrince];
  }

  global.Seed = { books };
})(window);
