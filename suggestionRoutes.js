const express = require("express");
const router = express.Router();
const BookSuggestion = require("../models/BookSuggestion");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { logAction } = require("../utils/auditLogger");
const { createNotification } = require("../utils/notify");

// Student: suggest a book
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { title, author, reason } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "Title is required." });

    const suggestion = await BookSuggestion.create({
      title: title.trim(),
      author,
      reason,
      suggestedBy: req.user.id,
    });
    res.status(201).json(suggestion);
  })
);

// My suggestions
router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const suggestions = await BookSuggestion.find({ suggestedBy: req.user.id }).sort({ createdAt: -1 });
    res.json(suggestions);
  })
);

// Librarian: list all suggestions
router.get(
  "/",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const suggestions = await BookSuggestion.find(filter).populate("suggestedBy", "name email").sort({ createdAt: -1 });
    res.json(suggestions);
  })
);

// Librarian: approve/reject a suggestion
router.patch(
  "/:id",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const { status, librarianNote } = req.body;
    const suggestion = await BookSuggestion.findByIdAndUpdate(
      req.params.id,
      { status, librarianNote },
      { new: true }
    );
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found" });

    await logAction(req, `suggestion.${status}`, "BookSuggestion", suggestion._id, suggestion.title);
    await createNotification(suggestion.suggestedBy, "suggestion_update", `Your suggestion "${suggestion.title}" was ${status}.`);

    res.json(suggestion);
  })
);

module.exports = router;
