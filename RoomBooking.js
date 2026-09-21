const mongoose = require("mongoose");

const roomBookingSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    startHour: { type: Number, required: true }, // 0-23, library hours e.g. 8-20
    durationHours: { type: Number, default: 1, min: 1, max: 3 },
    status: { type: String, enum: ["booked", "cancelled"], default: "booked" },
  },
  { timestamps: true }
);

roomBookingSchema.index({ room: 1, date: 1, startHour: 1 });

module.exports = mongoose.model("RoomBooking", roomBookingSchema);
