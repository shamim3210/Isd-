const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g. "Study Room 1"
    branch: { type: String, default: "Main Campus" },
    capacity: { type: Number, default: 4 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", roomSchema);
