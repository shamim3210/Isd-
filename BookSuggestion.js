const mongoose = require("mongoose");

const bookSuggestionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    author: { type: String },
    reason: { type: String },
    suggestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    librarianNote: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BookSuggestion", bookSuggestionSchema);
