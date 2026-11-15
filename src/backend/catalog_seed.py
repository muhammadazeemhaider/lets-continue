"""Hand-curated catalogue entries. These are always available, need no network, and are what the app
starts with. Everything else is added to the catalogue on demand from Open Library (see catalog.py)."""

LORD_OF_THE_RINGS_CHAPTERS = [
    # Book I
    "A Long-expected Party", "The Shadow of the Past", "Three is Company", "A Short Cut to Mushrooms",
    "A Conspiracy Unmasked", "The Old Forest", "In the House of Tom Bombadil", "Fog on the Barrow-downs",
    "At the Sign of the Prancing Pony", "Strider", "A Knife in the Dark", "Flight to the Ford",
    # Book II
    "Many Meetings", "The Council of Elrond", "The Ring Goes South", "A Journey in the Dark",
    "The Bridge of Khazad-dûm", "Lothlórien", "The Mirror of Galadriel", "Farewell to Lórien",
    "The Great River", "The Breaking of the Fellowship",
    # Book III
    "The Departure of Boromir", "The Riders of Rohan", "The Uruk-hai", "Treebeard", "The White Rider",
    "The King of the Golden Hall", "Helm's Deep", "The Road to Isengard", "Flotsam and Jetsam",
    "The Voice of Saruman", "The Palantír",
    # Book IV
    "The Taming of Sméagol", "The Passage of the Marshes", "The Black Gate is Closed",
    "Of Herbs and Stewed Rabbit", "The Window on the West", "The Forbidden Pool", "Journey to the Cross-roads",
    "The Stairs of Cirith Ungol", "Shelob's Lair", "The Choices of Master Samwise",
    # Book V
    "Minas Tirith", "The Passing of the Grey Company", "The Muster of Rohan", "The Siege of Gondor",
    "The Ride of the Rohirrim", "The Battle of the Pelennor Fields", "The Pyre of Denethor",
    "The Houses of Healing", "The Last Debate", "The Black Gate Opens",
    # Book VI
    "The Tower of Cirith Ungol", "The Land of Shadow", "Mount Doom", "The Field of Cormallen",
    "The Steward and the King", "Many Partings", "Homeward Bound", "The Scouring of the Shire", "The Grey Havens",
]

# Dune's chapters are untitled; the novel is split into three books (22, 15 and 11 chapters).
DUNE_CHAPTERS = (
    [f"Book One: Dune · {i}" for i in range(1, 23)]
    + [f"Book Two: Muad'Dib · {i}" for i in range(1, 16)]
    + [f"Book Three: The Prophet · {i}" for i in range(1, 12)]
)

LOTR_COVER = "https://covers.openlibrary.org/b/id/{}-M.jpg"

# Each part is its own catalogue entry (its own quest). `slug` is the stable id used by shelves,
# questions and the database; `series`/`part` group the parts together.
CURATED = [
    {
        "slug": "curated:lotr-1", "series": "The Lord of the Rings", "part": 1,
        "ol_key": "/works/OL27513W", "title": "The Fellowship of the Ring", "author": "J.R.R. Tolkien",
        "year": 1954, "pages": 492, "cover_url": LOTR_COVER.format(14627060),
        "summary": (
            "In a quiet corner of the Shire, the hobbit Frodo Baggins inherits a plain gold ring that turns out to "
            "be the One Ring of the Dark Lord Sauron. To keep it from its maker, Frodo leaves home and, with a small "
            "fellowship of hobbits, men, an elf, a dwarf and the wizard Gandalf, sets out on a long and perilous "
            "journey across Middle-earth."
        ),
        "chapters": LORD_OF_THE_RINGS_CHAPTERS[:22],  # Books I and II
    },
    {
        "slug": "curated:lotr-2", "series": "The Lord of the Rings", "part": 2,
        "ol_key": "/works/OL27479W", "title": "The Two Towers", "author": "J.R.R. Tolkien",
        "year": 1954, "pages": 434, "cover_url": LOTR_COVER.format(14627564),
        "summary": (
            "The second volume of The Lord of the Rings follows the members of the fellowship along separate paths: "
            "some into the kingdom of Rohan and the gathering war against Isengard, and Frodo and Sam onward toward "
            "Mordor, guided by a creature who knows the way all too well."
        ),
        "chapters": LORD_OF_THE_RINGS_CHAPTERS[22:43],  # Books III and IV
    },
    {
        "slug": "curated:lotr-3", "series": "The Lord of the Rings", "part": 3,
        "ol_key": "/works/OL27455W", "title": "The Return of the King", "author": "J.R.R. Tolkien",
        "year": 1955, "pages": 499, "cover_url": LOTR_COVER.format(14627062),
        "summary": (
            "The final volume of The Lord of the Rings. As the shadow of Mordor falls across Gondor, the free peoples "
            "make their stand, while Frodo and Sam struggle through the last and darkest stretch of their journey."
        ),
        "chapters": LORD_OF_THE_RINGS_CHAPTERS[43:],  # Books V and VI
    },
    {
        "slug": "curated:dune-1", "series": "Dune", "part": 1,
        "ol_key": "/works/OL893414W", "title": "Dune — Book One: Dune", "author": "Frank Herbert",
        "year": 1965, "pages": 608, "cover_url": "https://covers.openlibrary.org/b/id/11481354-M.jpg",
        "summary": (
            "Young Paul Atreides travels with his family to Arrakis, a desert planet that is the only source of the "
            "spice melange, the most valuable substance in the universe. As House Atreides takes control of the "
            "planet, old rivalries, a secretive sisterhood and the mysterious Fremen of the deep desert draw Paul "
            "into a struggle that will test everything he has been taught."
        ),
        "chapters": [f"Chapter {i}" for i in range(1, 23)],
    },
    {
        "slug": "curated:dune-2", "series": "Dune", "part": 2,
        "ol_key": None, "title": "Dune — Book Two: Muad'Dib", "author": "Frank Herbert",
        "year": 1965, "pages": None, "cover_url": "https://covers.openlibrary.org/b/id/11481354-M.jpg",
        "summary": (
            "The second book of Dune. Far out in the deep desert of Arrakis, Paul and his mother Jessica must find "
            "their place among the Fremen, learning the ways of the sand, the sandworms and the people who have "
            "survived there for generations."
        ),
        "chapters": [f"Chapter {i}" for i in range(1, 16)],
    },
    {
        "slug": "curated:dune-3", "series": "Dune", "part": 3,
        "ol_key": None, "title": "Dune — Book Three: The Prophet", "author": "Frank Herbert",
        "year": 1965, "pages": None, "cover_url": "https://covers.openlibrary.org/b/id/11481354-M.jpg",
        "summary": (
            "The final book of Dune, in which the long contest for Arrakis and its spice comes to a head, and Paul "
            "must face what his visions of the future have been showing him."
        ),
        "chapters": [f"Chapter {i}" for i in range(1, 12)],
    },
]

assert len(LORD_OF_THE_RINGS_CHAPTERS) == 62 and len(DUNE_CHAPTERS) == 48
assert [len(b["chapters"]) for b in CURATED] == [22, 21, 19, 22, 15, 11]
