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

CURATED = [
    {
        "ol_key": "/works/OL27448W",
        "title": "The Lord of the Rings",
        "author": "J.R.R. Tolkien",
        "year": 1954,
        "pages": 1193,
        "cover_url": "https://covers.openlibrary.org/b/id/14625765-M.jpg",
        "summary": (
            "In a quiet corner of the Shire, the hobbit Frodo Baggins inherits a plain gold ring that turns out "
            "to be the One Ring of the Dark Lord Sauron. To keep it from its maker, Frodo sets out with a small "
            "fellowship of hobbits, men, an elf, a dwarf and the wizard Gandalf on a long, perilous journey "
            "across Middle-earth, where courage, friendship and the smallest choices decide the fate of the world."
        ),
        "chapters": LORD_OF_THE_RINGS_CHAPTERS,
    },
    {
        "ol_key": "/works/OL893414W",
        "title": "Dune",
        "author": "Frank Herbert",
        "year": 1965,
        "pages": 608,
        "cover_url": "https://covers.openlibrary.org/b/id/11481354-M.jpg",
        "summary": (
            "Young Paul Atreides travels with his family to Arrakis, a desert planet that is the only source of "
            "the spice melange, the most valuable substance in the universe. As House Atreides takes control of "
            "the planet, old rivalries, a secretive sisterhood and the mysterious Fremen of the deep desert draw "
            "Paul into a struggle that will test everything he has been taught."
        ),
        "chapters": DUNE_CHAPTERS,
    },
]

assert len(LORD_OF_THE_RINGS_CHAPTERS) == 62 and len(DUNE_CHAPTERS) == 48
