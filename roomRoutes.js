const express = require("express");
const router = express.Router();
const Room = require("../models/Room");
const RoomBooking = require("../models/RoomBooking");
const { requireAuth, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const { logAction } = require("../utils/auditLogger");

const LIBRARY_OPEN_HOUR = 8;
const LIBRARY_CLOSE_HOUR = 20;

// List rooms
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const rooms = await Room.find({ isActive: true }).sort({ name: 1 });
    res.json(rooms);
  })
);

// Librarian/Admin: add a room
router.post(
  "/",
  requireAuth,
  requireRole("librarian", "admin"),
  asyncHandler(async (req, res) => {
    const room = await Room.create(req.body);
    await logAction(req, "room.add", "Room", room._id, room.name);
    res.status(201).json(room);
  })
);

// Get availability for a room on a given date — returns which hours are free
router.get(
  "/:id/availability",
  asyncHandler(async (req, res) => {
    const { date } = req.query; // "YYYY-MM-DD"
    if (!date) return res.status(400).json({ error: "date query param is required (YYYY-MM-DD)" });

    const bookings = await RoomBooking.find({ room: req.params.id, date, status: "booked" });
    const bookedHours = new Set();
    bookings.forEach((b) => {
      for (let h = b.startHour; h < b.startHour + b.durationHours; h++) bookedHours.add(h);
    });

    const slots = [];
    for (let h = LIBRARY_OPEN_HOUR; h < LIBRARY_CLOSE_HOUR; h++) {
      slots.push({ hour: h, available: !bookedHours.has(h) });
    }
    res.json({ date, slots });
  })
);

// Book a slot
router.post(
  "/:id/book",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { date, startHour, durationHours = 1 } = req.body;
    if (!date || startHour === undefined) return res.status(400).json({ error: "date and startHour are required" });
    if (startHour < LIBRARY_OPEN_HOUR || startHour + durationHours > LIBRARY_CLOSE_HOUR) {
      return res.status(400).json({ error: `Rooms can only be booked between ${LIBRARY_OPEN_HOUR}:00 and ${LIBRARY_CLOSE_HOUR}:00.` });
    }

    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Check for overlap
    const existing = await RoomBooking.find({ room: room._id, date, status: "booked" });
    const overlap = existing.some(
      (b) => startHour < b.startHour + b.durationHours && startHour + durationHours > b.startHour
    );
    if (overlap) return res.status(400).json({ error: "That time slot is already booked." });

    // One active booking per student per day, to keep rooms fairly shared
    const myBookingsToday = await RoomBooking.countDocuments({ user: req.user.id, date, status: "booked" });
    if (myBookingsToday >= 1 && req.user.role === "student") {
      return res.status(400).json({ error: "You already have a room booked today. Cancel it first to book another." });
    }

    const booking = await RoomBooking.create({
      room: room._id,
      user: req.user.id,
      date,
      startHour,
      durationHours,
    });
    res.status(201).json(booking);
  })
);

// My room bookings
router.get(
  "/bookings/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const bookings = await RoomBooking.find({ user: req.user.id, status: "booked" })
      .populate("room")
      .sort({ date: 1, startHour: 1 });
    res.json(bookings);
  })
);

// Cancel a booking
router.post(
  "/bookings/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await RoomBooking.findOne({ _id: req.params.id, user: req.user.id });
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    booking.status = "cancelled";
    await booking.save();
    res.json({ message: "Booking cancelled" });
  })
);

module.exports = router;
