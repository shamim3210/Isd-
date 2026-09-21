const mongoose = require("mongoose");

const paymentRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    transactions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Transaction", required: true }],
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["pending", "paid", "rejected"], default: "pending" },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

paymentRequestSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model("PaymentRequest", paymentRequestSchema);
