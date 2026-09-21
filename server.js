require("dotenv").config();
require("express-async-errors");
const express = require("express");
const path = require("path");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const { errorHandler } = require("./middleware/errorHandler");

const bookRoutes = require("./routes/bookRoutes");
const userRoutes = require("./routes/userRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const reportRoutes = require("./routes/reportRoutes");
const authRoutes = require("./routes/authRoutes");
const roomRoutes = require("./routes/roomRoutes");
const suggestionRoutes = require("./routes/suggestionRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const contactRoutes = require("./routes/contactRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const corsOrigins = allowedOrigins.length
  ? allowedOrigins
  : process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5000", "http://127.0.0.1:5000"];
app.use(
  cors({
    // Never reflect every origin in a production deployment.  An explicit
    // allow-list is also safer when Authorization headers are used.
    origin: corsOrigins,
    credentials: false,
  })
);
app.use(express.json({ limit: "4mb" })); // raised for base64 book cover uploads

// Serve the frontend locally so the complete app runs from one server.
app.use(
  express.static(path.join(__dirname, "../frontend"), {
    etag: true,
    maxAge: 0,
    setHeaders: (res, filePath) => {
      if (/\.(html|js|css|json)$/.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  })
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

async function healthCheck(req, res) {
  // Try to (re)connect first so a cold start reports the real state.
  try {
    await connectDB();
  } catch {
    /* reported below */
  }
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    message: ready ? "📚 LibraryMS API is running" : "Database unavailable",
    database: ready ? "connected" : "disconnected",
  });
}
app.get("/health", healthCheck);
app.get("/api/health", healthCheck);

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/users", userRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/suggestions", suggestionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/payments", paymentRoutes);

// 404 for unknown API routes
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Centralized error handler — must be registered last
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 5000;

async function start() {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in production.");
    }
    if (!allowedOrigins.length) throw new Error("FRONTEND_URL must be set in production.");
  }
  await connectDB();
  const server = app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  const shutdown = async () => {
    server.close();
    await mongoose.connection.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error("❌ Server startup failed:", err.message);
    process.exit(1);
  });
}

module.exports = { app, start };
