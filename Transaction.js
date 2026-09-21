const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    borrowDate: { type: Date, default: Date.now }, // FR-02
    dueDate: { type: Date, required: true }, // FR-02
    returnDate: { type: Date }, // FR-03
    status: {
      type: String,
      enum: ["borrowed", "returned", "overdue", "lost", "reserved"],
      default: "borrowed",
    },
    fineAmount: { type: Number, default: 0 }, // FR-04
    finePaid: { type: Boolean, default: false }, // librarian marks fines paid
    fineNotified: { type: Boolean, default: false }, // FR-04
    reservedAt: { type: Date }, // FR-10
    rating: { type: Number, min: 1, max: 5 }, // FR-11
    review: { type: String }, // FR-11
    renewCount: { type: Number, default: 0 }, // FR-13
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
