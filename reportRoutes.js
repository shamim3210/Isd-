const express = require("express");
const router = express.Router();
const Book = require("../models/Book");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Payment = require("../models/Payment");
const { requireAuth, requireRole } = require("../middleware/auth");
const { toCsv } = require("../utils/csv");
const { toPdf } = require("../utils/pdf");
const { asyncHandler } = require("../middleware/errorHandler");

// Trending this week — public, lightweight version for the home page.
// Registered BEFORE the auth wall below so it stays accessible to everyone.
router.get("/trending", asyncHandler(async (req, res) => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const trending = await Transaction.aggregate([
    { $match: { createdAt: { $gte: oneWeekAgo } } },
    { $group: { _id: "$book", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 8 },
    { $lookup: { from: "books", localField: "_id", foreignField: "_id", as: "book" } },
    { $unwind: "$book" },
    { $replaceRoot: { newRoot: "$book" } },
  ]);
  res.json(trending);
}));

router.use(requireAuth, requireRole("librarian", "admin"));

// FR-07: Generate report - inventory summary
router.get("/inventory", asyncHandler(async (req, res) => {
  const totalBooks = await Book.countDocuments();
  const totalCopies = await Book.aggregate([{ $group: { _id: null, sum: { $sum: "$totalCopies" } } }]);
  const byCategory = await Book.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  res.json({
    totalTitles: totalBooks,
    totalCopies: totalCopies[0]?.sum || 0,
    byCategory,
  });
}));

// FR-07: Currently borrowed books report
router.get("/borrowed", asyncHandler(async (req, res) => {
  const borrowed = await Transaction.find({ status: "borrowed" }).populate("book user");
  res.json({ count: borrowed.length, borrowed });
}));

router.get("/lost", asyncHandler(async (req, res) => {
  const lost = await Transaction.find({ status: "lost" }).populate("book user").sort({ updatedAt: -1 });
  res.json({ count: lost.length, lost });
}));

router.get("/payments", asyncHandler(async (req, res) => {
  const payments = await Payment.find().populate("user recordedBy transaction").sort({ createdAt: -1 });
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  res.json({ count: payments.length, totalPaid, payments });
}));

// FR-07: Fines report
router.get("/fines", asyncHandler(async (req, res) => {
  const fines = await Transaction.find({ fineAmount: { $gt: 0 } }).populate("book user");
  const totalFines = fines.reduce((sum, t) => sum + t.fineAmount, 0);
  res.json({ totalFines, records: fines });
}));

// Analytics — most borrowed books, category demand, top readers
router.get("/analytics", asyncHandler(async (req, res) => {
  const mostBorrowed = await Transaction.aggregate([
    { $group: { _id: "$book", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $lookup: { from: "books", localField: "_id", foreignField: "_id", as: "book" } },
    { $unwind: "$book" },
    { $project: { title: "$book.title", category: "$book.category", count: 1 } },
  ]);

  const categoryDemand = await Transaction.aggregate([
    { $lookup: { from: "books", localField: "book", foreignField: "_id", as: "book" } },
    { $unwind: "$book" },
    { $group: { _id: "$book.category", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 8 },
  ]);

  const topReaders = await Transaction.aggregate([
    { $group: { _id: "$user", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
    { $unwind: "$user" },
    { $project: { name: "$user.name", count: 1 } },
  ]);

  res.json({ mostBorrowed, categoryDemand, topReaders });
}));

// Export fines as CSV
router.get("/fines/export", asyncHandler(async (req, res) => {
  const fines = await Transaction.find({ fineAmount: { $gt: 0 } }).populate("book user").lean();
  const rows = fines.map((f) => ({
    book: f.book?.title || "—",
    borrower: f.user?.name || "—",
    email: f.user?.email || "—",
    fineAmount: f.fineAmount,
    dueDate: new Date(f.dueDate).toLocaleDateString(),
  }));
  const csv = toCsv(rows, ["book", "borrower", "email", "fineAmount", "dueDate"]);
  res.header("Content-Type", "text/csv");
  res.attachment("libraryms_fines.csv");
  res.send(csv);
}));

// Export fines as PDF
router.get("/fines/export-pdf", asyncHandler(async (req, res) => {
  const fines = await Transaction.find({ fineAmount: { $gt: 0 } }).populate("book user").lean();
  const rows = fines.map((f) => ({
    book: f.book?.title || "—",
    borrower: f.user?.name || "—",
    fineAmount: "৳" + f.fineAmount,
    dueDate: new Date(f.dueDate).toLocaleDateString(),
  }));
  res.header("Content-Type", "application/pdf");
  res.attachment("libraryms_fines.pdf");
  toPdf(res, {
    title: "LibraryMS — Outstanding Fines",
    columns: [
      { key: "book", label: "Book", width: 180 },
      { key: "borrower", label: "Borrower", width: 140 },
      { key: "fineAmount", label: "Fine", width: 70 },
      { key: "dueDate", label: "Due date", width: 90 },
    ],
    rows,
  });
}));

router.get("/payments/export", asyncHandler(async (req, res) => {
  const payments = await Payment.find().populate("user recordedBy transaction").sort({ createdAt: -1 }).lean();
  const rows = payments.map((p) => ({
    date: new Date(p.createdAt).toLocaleString(),
    borrower: p.user?.name || "—",
    amount: p.amount,
    method: p.method,
    recordedBy: p.recordedBy?.name || "—",
    note: p.note || "",
  }));
  const csv = toCsv(rows, ["date", "borrower", "amount", "method", "recordedBy", "note"]);
  res.header("Content-Type", "text/csv");
  res.attachment("libraryms_payment_report.csv");
  res.send(csv);
}));

// Export inventory summary as PDF
router.get("/inventory/export-pdf", asyncHandler(async (req, res) => {
  const byCategory = await Book.aggregate([
    { $group: { _id: "$category", titles: { $sum: 1 }, copies: { $sum: "$totalCopies" } } },
    { $sort: { titles: -1 } },
  ]);
  const rows = byCategory.map((c) => ({ category: c._id, titles: c.titles, copies: c.copies }));
  res.header("Content-Type", "application/pdf");
  res.attachment("libraryms_inventory.pdf");
  toPdf(res, {
    title: "LibraryMS — Inventory Summary",
    columns: [
      { key: "category", label: "Category", width: 220 },
      { key: "titles", label: "Titles", width: 80 },
      { key: "copies", label: "Total copies", width: 100 },
    ],
    rows,
  });
}));

// Audit log — who did what, when (activity trail for admins)
router.get("/audit-log", asyncHandler(async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200);
  res.json(logs);
}));

module.exports = router;
