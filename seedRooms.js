/**
 * seedRooms.js — creates a handful of default study rooms if none exist yet.
 * Run manually: node scripts/seedRooms.js
 */
require("dotenv").config();
const connectDB = require("../config/db");
const mongoose = require("mongoose");
const Room = require("../models/Room");

const DEFAULT_ROOMS = [
  { name: "Study Room 1", branch: "Main Campus", capacity: 4 },
  { name: "Study Room 2", branch: "Main Campus", capacity: 4 },
  { name: "Group Discussion Room", branch: "Main Campus", capacity: 8 },
  { name: "Quiet Pod A", branch: "Main Campus", capacity: 1 },
  { name: "Quiet Pod B", branch: "Main Campus", capacity: 1 },
];

async function run() {
  await connectDB();
  const existing = await Room.countDocuments();
  if (existing > 0) {
    console.log(`${existing} room(s) already exist — skipping seed.`);
  } else {
    await Room.insertMany(DEFAULT_ROOMS);
    console.log(`Created ${DEFAULT_ROOMS.length} default rooms.`);
  }
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("seedRooms failed:", err);
  process.exit(1);
});
