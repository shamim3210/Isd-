// Looks up a real cover image for a book via the Open Library API
// (https://openlibrary.org/dev/docs/api/covers — free, no API key needed).
// Since a lot of the catalog is synthetically generated for course-project
// scale, most lookups won't find a real match — that's expected and fine;
// the frontend falls back to a colored initials cover when this returns null.
//
// Results are cached on the Book document (coverImage field) so we only
// ever hit the external API once per book, not on every page view.

async function findCoverForBook(book) {
  if (book.coverImage) return book.coverImage; // already cached

  try {
    const query = encodeURIComponent(`${book.title} ${book.author}`);
    const searchUrl = `https://openlibrary.org/search.json?q=${query}&limit=1&fields=cover_i`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(searchUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    const coverId = data.docs?.[0]?.cover_i;
    if (!coverId) return null;

    const coverUrl = `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
    book.coverImage = coverUrl;
    await book.save();
    return coverUrl;
  } catch (err) {
    // Network hiccup or no match — not a real error, just no cover available.
    return null;
  }
}

module.exports = { findCoverForBook };
