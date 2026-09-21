const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { sendMail } = require("../config/mailer");
const { asyncHandler } = require("../middleware/errorHandler");

// Anyone (logged in or not) can send a question to the librarians.
// Fans out to every librarian/admin's email at once.
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, email, message } = req.body;
    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return res.status(400).json({ error: "Name, email, and message are all required." });
    }
    if (message.length > 2000) return res.status(400).json({ error: "Message is too long." });

    const librarians = await User.find({ role: { $in: ["librarian", "admin"] }, isActive: true }).select("email");
    if (!librarians.length) {
      return res.status(503).json({ error: "No librarian is set up to receive messages yet. Please try again later." });
    }

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;">
        <h2 style="color:#7A3B2E;">New message from LibraryMS</h2>
        <p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
        <p style="white-space:pre-wrap;border-left:3px solid #C9C0A8;padding-left:12px;">${escapeHtml(message)}</p>
      </div>`;

    await Promise.all(
      librarians.map((lib) => sendMail({ to: lib.email, subject: `LibraryMS — question from ${name}`, html }))
    );

    res.json({ message: "Your message has been sent to the library team." });
  })
);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}

module.exports = router;
