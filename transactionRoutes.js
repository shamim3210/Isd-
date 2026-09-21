const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Transaction = require("../models/Transaction");
const Payment = require("../models/Payment");
const Book = require("../models/Book");
const User = require("../models/User");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendMail, reservationReadyEmail } = require("../config/mailer");
const { createNotification } = require("../utils/notify");

const FINE_PER_DAY = 5; // taka
const LOAN_DAYS = 14;

// FR-10: Reserve a book that's currently checked out
router.post("/reserve", requireAuth, async (req, res) => {
  try {
    const { bookId } = req.body;
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: "Book not found" });

    const already = await Transaction.findOne({ book: bookId, user: req.user.id, status: "reserved" });
    if (already) return res.status(400).json({ error: "You already have a reservation on this book" });

    const tx = await Transaction.create({
      book: bookId,
      user: req.user.id,
      dueDate: new Date(),
      status: "reserved",
      reservedAt: new Date(),
    });

    const position = await Transaction.countDocuments({
      book: bookId,
      status: "reserved",
      reservedAt: { $lte: tx.reservedAt },
    });

    res.status(201).json({ ...tx.toObject(), queuePosition: position });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Check your queue position for a reservation
router.get("/reserve/:id/position", requireAuth, async (req, res) => {
  const tx = await Transaction.findOne({ _id: req.params.id, user: req.user.id, status: "reserved" });
  if (!tx) return res.status(404).json({ error: "Reservation not found" });
  const position = await Transaction.countDocuments({
    book: tx.book,
    status: "reserved",
    reservedAt: { $lte: tx.reservedAt },
  });
  res.json({ queuePosition: position });
});

// FR-13: Renew a loan — extends the due date by another loan period, as
// long as nobody else is waiting for the book.
router.post("/:id/renew", requireAuth, async (req, res) => {
  const tx = await Transaction.findOne({ _id: req.params.id, user: req.user.id, status: "borrowed" }).populate("book");
  if (!tx) return res.status(404).json({ error: "Active loan not found" });

  const MAX_RENEWALS = 1;
  if (tx.renewCount >= MAX_RENEWALS) {
    return res.status(400).json({ error: "This loan has already been renewed the maximum number of times." });
  }

  const hasWaitingReservation = await Transaction.exists({ book: tx.book._id, status: "reserved" });
  if (hasWaitingReservation) {
    return res.status(400).json({ error: "Can't renew — another student is waiting for this book." });
  }

  const newDueDate = new Date(tx.dueDate);
  newDueDate.setDate(newDueDate.getDate() + LOAN_DAYS);
  tx.dueDate = newDueDate;
  tx.renewCount += 1;
  await tx.save();

  res.json({ message: `Renewed. New due date: ${newDueDate.toLocaleDateString()}`, transaction: tx });
});

// Cancel a reservation
router.post("/reserve/:id/cancel", requireAuth, async (req, res) => {
  const tx = await Transaction.findOne({ _id: req.params.id, user: req.user.id, status: "reserved" });
  if (!tx) return res.status(404).json({ error: "Reservation not found" });
  await tx.deleteOne();
  res.json({ message: "Reservation cancelled" });
});

// FR-11: Rate & review a book after returning it
router.post("/:id/review", requireAuth, async (req, res) => {
  const { rating, review } = req.body;
  const tx = await Transaction.findOne({ _id: req.params.id, user: req.user.id, status: "returned" });
  if (!tx) return res.status(404).json({ error: "You can only review a book you've returned" });

  tx.rating = rating;
  tx.review = review;
  await tx.save();

  // Recalculate the book's aggregate rating
  const allRated = await Transaction.find({ book: tx.book, rating: { $ne: null } });
  const avg = allRated.reduce((s, t) => s + t.rating, 0) / allRated.length;
  await Book.findByIdAndUpdate(tx.book, { rating: Math.round(avg * 10) / 10 });

  res.json(tx);
});

// FR-02: Borrow a book
router.post("/borrow", requireAuth, async (req, res) => {
  try {
    const { bookId } = req.body;
    const userId = req.user.id;
    const book = await Book.findById(bookId);
    if (!book) return res.status(404).json({ error: "Book not found" });

    // Prevent duplicate borrowing — don't let the same user hold two active
    // loans of the same title at once.
    const alreadyBorrowed = await Transaction.findOne({ book: bookId, user: userId, status: "borrowed" });
    if (alreadyBorrowed) return res.status(400).json({ error: "You already have this book borrowed and haven't returned it yet." });

    // Fine cap — block new borrows once unpaid fines pass a threshold, same
    // policy most real university libraries enforce.
    const FINE_CAP = 100; // taka
    const unpaidFines = await Transaction.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId), fineAmount: { $gt: 0 }, finePaid: { $ne: true } } },
      { $group: { _id: null, total: { $sum: "$fineAmount" } } },
    ]);
    const owed = unpaidFines[0]?.total || 0;
    if (owed >= FINE_CAP) {
      return res.status(403).json({ error: `Borrowing is blocked — you owe ৳${owed} in unpaid fines (limit ৳${FINE_CAP}). Please settle up with the librarian first.` });
    }

    // Atomic, condition-guarded decrement: two simultaneous borrow requests for
    // the last remaining copy can no longer both succeed (previous version did
    // book.availableCopies -= 1; book.save(), which is a classic read-then-write
    // race condition under concurrent requests).
    const updatedBook = await Book.findOneAndUpdate(
      { _id: bookId, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } },
      { new: true }
    );
    if (!updatedBook) return res.status(400).json({ error: "No copies available" });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + LOAN_DAYS);

    let tx;
    try {
      tx = await Transaction.create({
        book: bookId,
        user: userId,
        dueDate,
        status: "borrowed",
      });
    } catch (createErr) {
      // Roll back the copy decrement if the transaction record couldn't be created,
      // so a mid-failure never permanently "loses" an available copy.
      await Book.findByIdAndUpdate(bookId, { $inc: { availableCopies: 1 } });
      throw createErr;
    }

    await createNotification(userId, "system", `You borrowed "${updatedBook.title}". Due back ${dueDate.toLocaleDateString()}.`);

    res.status(201).json(tx);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// FR-03: Return a book
router.post("/return", requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.body;
    const tx = await Transaction.findById(transactionId).populate("book");
    if (!tx) return res.status(404).json({ error: "Transaction not found" });

    // Authorization: a student may only return their own loan; librarians/admins
    // may process a return for any member at the desk. Previously this endpoint
    // only required *some* valid login, so any student could return (or re-return)
    // anyone else's transaction by guessing/passing an arbitrary transactionId.
    const isOwner = tx.user.toString() === req.user.id;
    const isStaff = ["librarian", "admin"].includes(req.user.role);
    if (!isOwner && !isStaff) return res.status(403).json({ error: "You can only return your own loans." });

    // Guard against double-processing: only an active loan can be returned.
    // Without this, calling /return twice on the same transaction (or on one
    // that's still "reserved") would double-credit availableCopies and re-apply
    // a fine calculation.
    if (tx.status !== "borrowed") {
      return res.status(400).json({ error: `This loan is already "${tx.status}" and can't be returned again.` });
    }

    tx.returnDate = new Date();
    tx.status = "returned";

    if (tx.returnDate > tx.dueDate) {
      const lateDays = Math.ceil((tx.returnDate - tx.dueDate) / (1000 * 60 * 60 * 24));
      tx.fineAmount = lateDays * FINE_PER_DAY;
    }
    await tx.save();

    // Atomic increment (see the matching note in /borrow above).
    const book = await Book.findByIdAndUpdate(tx.book._id, { $inc: { availableCopies: 1 } }, { new: true });

    // Notify the earliest reservation holder, if any, that the book is available (FR-10 notification)
    const nextReservation = await Transaction.findOne({ book: book._id, status: "reserved" })
      .sort({ reservedAt: 1 })
      .populate("user");
    if (nextReservation?.user?.email) {
      const { subject, html } = reservationReadyEmail(tx.book.title);
      await sendMail({ to: nextReservation.user.email, subject, html });
      await createNotification(nextReservation.user._id, "reservation_ready", `"${tx.book.title}" is now available — you're next in line!`);
    }

    if (tx.fineAmount > 0) {
      await createNotification(tx.user, "fine", `You have a ৳${tx.fineAmount} fine for returning "${tx.book.title}" late.`);
    }

    res.json(tx);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// FR-04: Get overdue transactions (to trigger fine alerts / notifications)
router.get("/overdue", requireAuth, requireRole("librarian", "admin"), async (req, res) => {
  const now = new Date();
  const overdue = await Transaction.find({
    status: "borrowed",
    dueDate: { $lt: now },
  }).populate("book").populate("user", "name email studentId role branch");
  res.json(overdue);
});

// Librarian: mark a fine as paid (clears it from the borrower's fine cap total)
router.patch("/:id/mark-paid", requireAuth, requireRole("librarian", "admin"), async (req, res) => {
  const tx = await Transaction.findById(req.params.id).populate("book user");
  if (!tx) return res.status(404).json({ error: "Transaction not found" });
  if (!tx.fineAmount) return res.status(400).json({ error: "This transaction has no fine." });
  if (tx.finePaid) return res.status(400).json({ error: "This fine is already paid." });
  const method = req.body?.method || "cash";
  if (method !== "cash") return res.status(400).json({ error: "Desk payments must use the cash method." });
  tx.finePaid = true;
  await tx.save();
  const payment = await Payment.create({
    transaction: tx._id,
    user: tx.user._id,
    amount: tx.fineAmount,
    method,
    recordedBy: req.user.id,
    note: req.body?.note || "Recorded at library desk",
  });
  res.json({ transaction: tx, payment });
});

// Student: report a borrowed book as lost — stops the fine clock, charges a
// replacement cost instead, and keeps the copy out of circulation.
router.post("/:id/report-lost", requireAuth, async (req, res) => {
  const tx = await Transaction.findOne({ _id: req.params.id, user: req.user.id, status: "borrowed" }).populate("book");
  if (!tx) return res.status(404).json({ error: "Active loan not found" });

  const REPLACEMENT_COST = 500; // taka, flat fee — a real system might use the book's price
  tx.status = "lost";
  tx.fineAmount = REPLACEMENT_COST;
  await tx.save();

  const book = await Book.findById(tx.book._id);
  if (book.totalCopies > 0) book.totalCopies -= 1; // remove the lost copy from circulation
  await book.save();

  await createNotification(req.user.id, "fine", `You reported "${tx.book.title}" as lost. A ৳${REPLACEMENT_COST} replacement fee has been added.`);
  res.json({ message: `Reported lost. A ৳${REPLACEMENT_COST} replacement fee has been applied.`, transaction: tx });
});

// FR-07: Borrow history / reports for the logged-in user
router.get("/my-history", requireAuth, async (req, res) => {
  const history = await Transaction.find({ user: req.user.id }).populate("book").sort({ createdAt: -1 });

  // Enrich reserved entries with their live queue position, since the
  // frontend shows "#2 in line" etc. on the My Loans page.
  const enriched = await Promise.all(
    history.map(async (tx) => {
      if (tx.status !== "reserved") return tx;
      const position = await Transaction.countDocuments({
        book: tx.book._id,
        status: "reserved",
        reservedAt: { $lte: tx.reservedAt },
      });
      return { ...tx.toObject(), queuePosition: position };
    })
  );

  res.json(enriched);
});

// FR-07: Borrow history for any user (librarian/admin lookup)
router.get("/history/:userId", requireAuth, requireRole("librarian", "admin"), async (req, res) => {
  const history = await Transaction.find({ user: req.params.userId }).populate("book");
  res.json(history);
});

module.exports = router;
