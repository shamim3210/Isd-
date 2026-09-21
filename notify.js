const Notification = require("../models/Notification");

async function createNotification(userId, type, message) {
  try {
    await Notification.create({ user: userId, type, message });
  } catch (err) {
    console.error("Failed to create notification:", err.message);
  }
}

module.exports = { createNotification };
