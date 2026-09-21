/**
 * sendReminders.js
 * Sends email reminders for books due within 2 days, and notifies students
 * whose reserved book has become available.
 *
 * Run manually:  node scripts/sendReminders.js
 * Or schedule it (e.g. a daily cron job, or a free scheduler like
 * cron-job.org hitting a protected endpoint) — see README for options.
 */
require("dotenv").config();
const connectDB = require("../config/db");
const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const { sendMail, dueDateReminderEmail, fineNoticeEmail } = require("../config/mailer");
const { createNotification } = require("../utils/notify");

async function run() {
  await connectDB();

  const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

  // Due-date reminders
  const dueSoon = await Transaction.find({
    status: "borrowed",
    dueDate: { $lte: twoDaysFromNow, $gte: new Date() },
    fineNotified: false,
  }).populate("book user");

  for (const tx of dueSoon) {
    if (!tx.user?.email) continue;
    const { subject, html } = dueDateReminderEmail(tx.book.title, tx.dueDate);
    await sendMail({ to: tx.user.email, subject, html });
    await createNotification(tx.user._id, "due_soon", `"${tx.book.title}" is due ${new Date(tx.dueDate).toLocaleDateString()}.`);
    console.log(`Reminder sent to ${tx.user.email} for "${tx.book.title}"`);
  }

  // Overdue fine notices (send once per transaction)
  const newlyFined = await Transaction.find({
    fineAmount: { $gt: 0 },
    fineNotified: false,
  }).populate("book user");

  for (const tx of newlyFined) {
    if (!tx.user?.email) continue;
    const { subject, html } = fineNoticeEmail(tx.book.title, tx.fineAmount);
    await sendMail({ to: tx.user.email, subject, html });
    await createNotification(tx.user._id, "fine", `You have a ৳${tx.fineAmount} fine for "${tx.book.title}".`);
    tx.fineNotified = true;
    await tx.save();
    console.log(`Fine notice sent to ${tx.user.email} for "${tx.book.title}"`);
  }

  console.log(`Done. ${dueSoon.length} reminders, ${newlyFined.length} fine notices.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("sendReminders failed:", err);
  process.exit(1);
});
