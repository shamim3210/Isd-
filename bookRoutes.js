const express = require("express");
const router = express.Router();
const QRCode = require("qrcode");
const Book = require("../models/Book");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { validateBookInput } = require("../utils/validators");
const { logAction } = require("../utils/auditLogger");
const { toCsv } = require("../utils/csv");
const { toPdf } = require("../utils/pdf");
const { findCoverForBook } = require("../utils/bookCover");

// FR-01: Search for books by title, author, or ISBN, with lightweight
// autocomplete-style suggestions when the query is short.
router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const { q, category, branch, availableOnly, yearFrom, yearTo, language, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (q) filter.$text = { $search: q };
    if (category) filter.category = category;
    if (branch) filter.branch = branch;
    if (language) filter.language = language;
    if (availableOnly === "true") filter.availableCopies = { $gt: 0 };
    if (yearFrom || yearTo) {
      filter.publishedYear = {};
      if (yearFrom) filter.publishedYear.$gte = Number(yearFrom);
      if (yearTo) filter.publishedYear.$lte = Number(yearTo);
    }

    const books = await Book.find(filter)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .sort(q ? { score: { $meta: "textScore" } } : { title: 1 });

    const total = await Book.countDocuments(filter);
    res.json({ total, page: Number(page), limit: Number(limit), books });
  })
);

// New arrivals — most recently added books (for the home page)
router.get(
  "/new-arrivals",
  asyncHandler(async (req, res) => {
    const books = await Book.find().sort({ createdAt: -1 }).limit(8);
    res.json(books);
  })
);

// List all branches (multi-branch support)
router.get(
  "/branches",
  asyncHandler(async (req, res) => {
    const branches = await Book.distinct("branch");
    res.json(branches.length ? branches : ["Main Campus"]);
  })
);

// Search-as-you-type suggestions (top 6 title matches)
router.get(
  "/suggest",
  asyncHandler(async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const matches = await Book.find({ title: { $regex: q.trim(), $options: "i" } })
      .select("title author category")
      .limit(6);
    res.json(matches);
  })
);

// List all categories (for filter dropdown)
router.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const categories = await Book.distinct("category");
    res.json(categories);
  })
);

// Export the full catalog as CSV (Librarian/Admin)
router.get(
  "/export/csv",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const books = await Book.find().lean();
    const fields = ["isbn", "title", "author", "category", "publisher", "publishedYear", "totalCopies", "availableCopies", "shelfLocation"];
    const csv = toCsv(books, fields);
    res.header("Content-Type", "text/csv");
    res.attachment("libraryms_catalog.csv");
    res.send(csv);
  })
);

// Export the full catalog as PDF (Librarian/Admin)
router.get(
  "/export/pdf",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const books = await Book.find().sort({ category: 1, title: 1 }).lean();
    res.header("Content-Type", "application/pdf");
    res.attachment("libraryms_catalog.pdf");
    toPdf(res, {
      title: "LibraryMS — Full Catalog",
      columns: [
        { key: "title", label: "Title", width: 180 },
        { key: "author", label: "Author", width: 120 },
        { key: "category", label: "Category", width: 110 },
        { key: "shelfLocation", label: "Shelf", width: 70 },
        { key: "availableCopies", label: "Avail.", width: 40 },
      ],
      rows: books,
    });
  })
);

// Get single book detail
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found" });
    res.json(book);
  })
);

// QR code for a book — encodes the book's ID so a librarian's scanner (or
// any QR reader) can pull it up instantly for borrow/return at the desk.
router.get(
  "/:id/qrcode",
  asyncHandler(async (req, res) => {
    const book = await Book.findById(req.params.id).select("title isbn");
    if (!book) return res.status(404).json({ error: "Book not found" });
    const payload = JSON.stringify({ type: "libraryms_book", id: book._id.toString(), isbn: book.isbn });
    const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 240 });
    res.json({ qrDataUrl: dataUrl, title: book.title });
  })
);

// Real cover image lookup (Open Library), cached on the book after the first hit.
// Returns { coverImage: url | null } — frontend shows a colored placeholder when null.
router.get(
  "/:id/cover",
  asyncHandler(async (req, res) => {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found" });
    const coverImage = await findCoverForBook(book);
    res.json({ coverImage });
  })
);

// Librarian: manually set/replace a book's cover with an uploaded image.
// Accepts a base64 data URL (the frontend reads the chosen file client-side
// and sends it as a string) — stored directly on the document rather than
// the filesystem, since free hosts like Render wipe local files on redeploy.
router.put(
  "/:id/cover",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const { imageDataUrl } = req.body;
    if (!imageDataUrl || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(imageDataUrl)) {
      return res.status(400).json({ error: "Please upload a PNG, JPEG, or WEBP image." });
    }
    // Rough size guard — base64 is ~33% larger than the raw file; cap around 2MB raw.
    if (imageDataUrl.length > 2_800_000) {
      return res.status(400).json({ error: "Image is too large. Please use a file under ~2MB." });
    }
    const book = await Book.findByIdAndUpdate(req.params.id, { coverImage: imageDataUrl }, { new: true });
    if (!book) return res.status(404).json({ error: "Book not found" });
    await logAction(req, "book.cover_upload", "Book", book._id, `Uploaded cover for "${book.title}"`);
    res.json({ coverImage: book.coverImage });
  })
);

// Librarian: clear a manually-set cover so it falls back to auto-lookup / placeholder
router.delete(
  "/:id/cover",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const book = await Book.findByIdAndUpdate(req.params.id, { coverImage: null }, { new: true });
    if (!book) return res.status(404).json({ error: "Book not found" });
    res.json({ message: "Cover cleared" });
  })
);

// Batch cover lookup for a page of search results, so Browse doesn't fire
// 20 separate requests. Capped concurrency to be a polite API citizen.
router.post(
  "/covers/batch",
  asyncHandler(async (req, res) => {
    const { ids = [] } = req.body;
    const capped = ids.slice(0, 24);
    const books = await Book.find({ _id: { $in: capped } });

    const results = {};
    const CONCURRENCY = 6;
    // Covers are a nice-to-have. Stop after ~6 s so a slow Open Library can never
    // push this request past the hosting platform's time limit (Netlify: 10 s).
    const deadline = Date.now() + 6000;
    for (let i = 0; i < books.length; i += CONCURRENCY) {
      if (Date.now() > deadline) break;
      const batch = books.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (book) => {
          results[book._id.toString()] = await findCoverForBook(book);
        })
      );
    }
    res.json(results);
  })
);

// Recommendation — "frequently borrowed together" (collaborative-style) with
// a same-category fallback when there isn't enough borrow history yet.
router.get(
  "/:id/similar",
  asyncHandler(async (req, res) => {
    const Transaction = require("../models/Transaction");
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found" });

    // Find users who borrowed this book, then find other books those same
    // users borrowed — ranked by how often they co-occur.
    const coBorrowed = await Transaction.aggregate([
      { $match: { book: book._id } },
      { $group: { _id: "$user" } },
      {
        $lookup: {
          from: "transactions",
          localField: "_id",
          foreignField: "user",
          as: "otherTx",
        },
      },
      { $unwind: "$otherTx" },
      { $match: { "otherTx.book": { $ne: book._id } } },
      { $group: { _id: "$otherTx.book", coCount: { $sum: 1 } } },
      { $sort: { coCount: -1 } },
      { $limit: 6 },
      { $lookup: { from: "books", localField: "_id", foreignField: "_id", as: "book" } },
      { $unwind: "$book" },
      { $replaceRoot: { newRoot: "$book" } },
    ]);

    if (coBorrowed.length >= 3) return res.json(coBorrowed);

    // Fallback: same category, highest rated, fill remaining slots
    const needed = 6 - coBorrowed.length;
    const excludeIds = [book._id, ...coBorrowed.map((b) => b._id)];
    const sameCategory = await Book.find({ category: book.category, _id: { $nin: excludeIds } })
      .sort({ rating: -1 })
      .limit(needed);

    res.json([...coBorrowed, ...sameCategory]);
  })
);

// FR-05: Librarian adds a book
router.post(
  "/",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const errors = validateBookInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });

    if (!req.body.availableCopies) req.body.availableCopies = req.body.totalCopies || 1;
    const book = await Book.create(req.body);
    await logAction(req, "book.add", "Book", book._id, `Added "${book.title}"`);
    res.status(201).json(book);
  })
);

// FR-12: Bulk import books (accepts a JSON array parsed from CSV on the frontend)
router.post(
  "/bulk-import",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const { books } = req.body;
    if (!Array.isArray(books) || books.length === 0) {
      return res.status(400).json({ error: "Provide a non-empty array of books" });
    }
    let inserted = 0;
    try {
      const result = await Book.insertMany(books, { ordered: false });
      inserted = result.length;
    } catch (err) {
      inserted = err.insertedDocs?.length || 0;
    }
    await logAction(req, "book.bulk_import", "Book", null, `Imported ${inserted}/${books.length} books`);
    res.status(201).json({ inserted, failed: books.length - inserted, total: books.length });
  })
);

// FR-05: Librarian removes a book
router.delete(
  "/:id",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const book = await Book.findByIdAndDelete(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found" });
    await logAction(req, "book.delete", "Book", book._id, `Removed "${book.title}"`);
    res.json({ message: "Book removed" });
  })
);

// FR-05: Librarian updates a book
router.put(
  "/:id",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const book = await Book.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!book) return res.status(404).json({ error: "Book not found" });
    await logAction(req, "book.edit", "Book", book._id, `Edited "${book.title}"`);
    res.json(book);
  })
);

module.exports = router;
