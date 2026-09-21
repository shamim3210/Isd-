const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const Payment = require("../models/Payment");
const PaymentRequest = require("../models/PaymentRequest");
const PaymentIntent = require("../models/PaymentIntent");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { isBkashConfigured, createPayment, executePayment } = require("../utils/bkash");
const { createNotification } = require("../utils/notify");

// Total unpaid fines for the logged-in student
router.get(
  "/my-balance",
  requireAuth,
  asyncHandler(async (req, res) => {
    const unpaid = await Transaction.find({ user: req.user.id, fineAmount: { $gt: 0 }, finePaid: { $ne: true } });
    const total = unpaid.reduce((sum, t) => sum + t.fineAmount, 0);
    res.json({ total, count: unpaid.length, bkashAvailable: isBkashConfigured() });
  })
);

// Students can ask the library desk to collect an outstanding fine when
// online payment is unavailable.
router.post(
  "/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    const unpaid = await Transaction.find({
      user: req.user.id,
      fineAmount: { $gt: 0 },
      finePaid: { $ne: true },
    }).select("_id fineAmount");
    if (!unpaid.length) return res.status(400).json({ error: "You have no outstanding fines." });

    const existing = await PaymentRequest.findOne({ user: req.user.id, status: "pending" });
    if (existing) return res.status(409).json({ error: "You already have a pending payment request." });

    const request = await PaymentRequest.create({
      user: req.user.id,
      transactions: unpaid.map((transaction) => transaction._id),
      amount: unpaid.reduce((sum, transaction) => sum + transaction.fineAmount, 0),
    });
    await createNotification(req.user.id, "fine", "Your payment request was sent to the library desk.");
    res.status(201).json({ message: "Payment request sent to the library desk.", request });
  })
);

router.get(
  "/requests/pending",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const requests = await PaymentRequest.find({ status: "pending" })
      .populate("user", "name email studentId")
      .populate("transactions", "fineAmount book")
      .sort({ createdAt: 1 });
    res.json(requests);
  })
);

router.patch(
  "/requests/:id/approve",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const request = await PaymentRequest.findOne({ _id: req.params.id, status: "pending" });
    if (!request) return res.status(404).json({ error: "Pending payment request not found." });

    const unpaid = await Transaction.find({
      _id: { $in: request.transactions },
      user: request.user,
      fineAmount: { $gt: 0 },
      finePaid: { $ne: true },
    });
    if (!unpaid.length) {
      request.status = "paid";
      request.handledBy = req.user.id;
      request.note = "No unpaid fines remained.";
      await request.save();
      return res.status(400).json({ error: "These fines have already been paid." });
    }

    await Transaction.updateMany(
      { _id: { $in: unpaid.map((transaction) => transaction._id) } },
      { finePaid: true }
    );
    await Payment.insertMany(
      unpaid.map((transaction) => ({
        transaction: transaction._id,
        user: request.user,
        amount: transaction.fineAmount,
        method: "cash",
        recordedBy: req.user.id,
        note: "Collected at library desk from payment request",
      }))
    );
    request.status = "paid";
    request.handledBy = req.user.id;
    request.amount = unpaid.reduce((sum, transaction) => sum + transaction.fineAmount, 0);
    await request.save();
    await createNotification(request.user, "fine", "Your payment request was received and your fines are cleared.");
    res.json({ message: "Payment received and recorded.", request });
  })
);

// Start a bKash payment for all outstanding fines. Requires BKASH_* env vars
// (see utils/bkash.js) — otherwise returns a clear "not configured" error so
// the frontend can point the student to the librarian instead.
router.post(
  "/bkash/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isBkashConfigured()) {
      return res.status(503).json({
        error: "Online payment isn't set up yet. Please settle your fine with the librarian at the desk.",
      });
    }

    const unpaid = await Transaction.find({ user: req.user.id, fineAmount: { $gt: 0 }, finePaid: { $ne: true } });
    const total = unpaid.reduce((sum, t) => sum + t.fineAmount, 0);
    if (total <= 0) return res.status(400).json({ error: "You have no outstanding fines." });

    const invoiceNumber = `LMS-${req.user.id}-${Date.now()}`;
    const callbackURL = `${process.env.APP_URL || "http://localhost:3000"}/payment-callback.html`;

    const payment = await createPayment({ amount: total, invoiceNumber, callbackURL });
    await PaymentIntent.create({
      paymentID: payment.paymentID,
      user: req.user.id,
      transactions: unpaid.map((transaction) => transaction._id),
      amount: total,
    });
    res.json({ paymentID: payment.paymentID, bkashURL: payment.bkashURL, amount: total });
  })
);

// bKash redirects the user back here after they approve/cancel in the bKash
// app/web flow; the frontend calls this to finalize and mark fines paid.
router.post(
  "/bkash/execute",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { paymentID } = req.body;
    if (!paymentID) return res.status(400).json({ error: "Missing paymentID" });

    const intent = await PaymentIntent.findOne({ paymentID, user: req.user.id });
    if (!intent) return res.status(404).json({ error: "Payment session not found for this account." });
    if (intent.status === "completed") {
      return res.json({ message: "Payment already confirmed. Your fines are cleared.", trxID: intent.trxID });
    }

    const result = await executePayment(paymentID);
    if (result.transactionStatus !== "Completed") {
      return res.status(400).json({ error: "Payment was not completed.", detail: result.statusMessage });
    }

    const existingPayment = await Payment.findOne({
      method: "bkash",
      note: `bKash transaction ${result.trxID}`,
    });
    if (existingPayment) {
      intent.status = "completed";
      intent.trxID = result.trxID;
      await intent.save();
      return res.json({ message: "Payment already confirmed. Your fines are cleared.", trxID: result.trxID });
    }

    const unpaid = await Transaction.find({ user: req.user.id, fineAmount: { $gt: 0 }, finePaid: { $ne: true } });
    await Transaction.updateMany(
      { user: req.user.id, fineAmount: { $gt: 0 }, finePaid: { $ne: true } },
      { finePaid: true }
    );
    await Payment.insertMany(
      unpaid.map((transaction) => ({
        transaction: transaction._id,
        user: req.user.id,
        amount: transaction.fineAmount,
        method: "bkash",
        recordedBy: req.user.id,
        note: `bKash transaction ${result.trxID}`,
      }))
    );
    intent.status = "completed";
    intent.trxID = result.trxID;
    await intent.save();
    await createNotification(req.user.id, "fine", `Payment received — your fines are cleared. (bKash txn: ${result.trxID})`);

    res.json({ message: "Payment successful. Your fines are cleared.", trxID: result.trxID });
  })
);

module.exports = router;
