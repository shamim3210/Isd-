const mongoose = require("mongoose");

const paymentIntentSchema = new mongoose.Schema(
  {
    paymentID: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    transactions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Transaction", required: true }],
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["pending", "completed"], default: "pending" },
    trxID: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PaymentIntent", paymentIntentSchema);
