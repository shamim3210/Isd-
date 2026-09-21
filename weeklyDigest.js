/**
 * weeklyDigest.js
 * Emails all active students a summary of new arrivals and trending books
 * from the past 7 days. Meant to be run weekly (e.g. a scheduled job).
 *
 * Run manually:  node scripts/weeklyDigest.js
 */
require("dotenv").config();
const connectDB = require("../config/db");
const mongoose = require("mongoose");
const Book = require("../models/Book");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { sendMail } = require("../config/mailer");

function digestEmailHtml(newArrivals, trending) {
  const arrivalsHtml = newArrivals
    .map((b) => `<li>${b.title} <span style="color:#888;">— ${b.category}</span></li>`)
    .join("");
  const trendingHtml = trending
    .map((t) => `<li>${t.title} <span style="color:#888;">(${t.count} borrows this week)</span></li>`)
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;">
      <h2 style="color:#7A3B2E;">Your weekly LibraryMS digest</h2>
      ${newArrivals.length ? `<h3>📚 New arrivals this week</h3><ul>${arrivalsHtml}</ul>` : ""}
      ${trending.length ? `<h3>🔥 Trending right now</h3><ul>${trendingHtml}</ul>` : ""}
      ${!newArrivals.length && !trending.length ? "<p>No new activity this week — check back soon!</p>" : ""}
      <p style="color:#888;font-size:12px;margin-top:24px;">
        You're receiving this because you have a LibraryMS account. Manage your preferences in your profile.
      </p>
    </div>`;
}

async function run() {
  await connectDB();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const newArrivals = await Book.find({ createdAt: { $gte: oneWeekAgo } }).limit(8).lean();

  const trendingAgg = await Transaction.aggregate([
    { $match: { createdAt: { $gte: oneWeekAgo } } },
    { $group: { _id: "$book", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $lookup: { from: "books", localField: "_id", foreignField: "_id", as: "book" } },
    { $unwind: "$book" },
    { $project: { title: "$book.title", count: 1 } },
  ]);

  if (!newArrivals.length && !trendingAgg.length) {
    console.log("Nothing new this week — skipping digest.");
    await mongoose.disconnect();
    return process.exit(0);
  }

  const students = await User.find({ role: "student", isActive: true, emailVerified: true });
  const html = digestEmailHtml(newArrivals, trendingAgg);

  for (const student of students) {
    await sendMail({ to: student.email, subject: "📚 Your weekly LibraryMS digest", html });
    console.log(`Digest sent to ${student.email}`);
  }

  console.log(`Done. Sent to ${students.length} students.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("weeklyDigest failed:", err);
  process.exit(1);
});
