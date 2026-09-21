const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String },
    action: { type: String, required: true }, // e.g. "book.add", "book.delete", "user.deactivate"
    targetType: { type: String }, // "Book" | "User" | "Transaction"
    targetId: { type: mongoose.Schema.Types.ObjectId },
    details: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
