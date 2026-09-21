const express = require("express");
const router = express.Router();
const Announcement = require("../models/Announcement");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { logAction } = require("../utils/auditLogger");

// Everyone: current active announcements (shown on the home page)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const announcements = await Announcement.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .sort({ createdAt: -1 })
      .limit(5);
    res.json(announcements);
  })
);

// Librarian/Admin: post a new announcement
router.post(
  "/",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const { title, message, expiresAt } = req.body;
    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: "Title and message are required." });
    }
    const announcement = await Announcement.create({
      title: title.trim(),
      message: message.trim(),
      postedBy: req.user.id,
      expiresAt: expiresAt || undefined,
    });
    await logAction(req, "announcement.post", "Announcement", announcement._id, title);
    res.status(201).json(announcement);
  })
);

// Librarian/Admin: list all (including inactive) for management
router.get(
  "/all",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json(announcements);
  })
);

// Librarian/Admin: take an announcement down
router.delete(
  "/:id",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const announcement = await Announcement.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!announcement) return res.status(404).json({ error: "Announcement not found" });
    await logAction(req, "announcement.remove", "Announcement", announcement._id, announcement.title);
    res.json({ message: "Announcement taken down" });
  })
);

module.exports = router;
