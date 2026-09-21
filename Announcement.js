const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date }, // optional auto-expiry
  },
  { timestamps: true }
);

module.exports = mongoose.model("Announcement", announcementSchema);
