const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// My notifications (most recent first)
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const notifications = await Notification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(30);
    const unreadCount = await Notification.countDocuments({ user: req.user.id, read: false });
    res.json({ notifications, unreadCount });
  })
);

// Mark one as read
router.patch(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ error: "Notification not found" });
    res.json(notif);
  })
);

// Mark all as read
router.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ user: req.user.id, read: false }, { read: true });
    res.json({ message: "All notifications marked as read" });
  })
);

module.exports = router;
