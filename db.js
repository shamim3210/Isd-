const mongoose = require("mongoose");

// MongoDB connection string.
// Local MongoDB:      mongodb://127.0.0.1:27017/libraryms
// MongoDB Atlas (cloud, free tier): mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/libraryms
//
// connectDB() is safe to call many times: it reuses an open connection and shares
// one in-flight attempt. That matters on Netlify Functions, where the same warm
// container handles many requests and must not open a new connection each time.
let connecting = null;

const connectDB = async () => {
  const state = mongoose.connection.readyState; // 0 off, 1 on, 2 connecting, 3 closing
  if (state === 1) return mongoose.connection;
  if (state === 2 && connecting) return connecting;

  const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/libraryms";
  connecting = mongoose
    .connect(MONGO_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10,
    })
    .then(() => {
      console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);
      return mongoose.connection;
    })
    .catch((err) => {
      connecting = null;
      console.error("❌ MongoDB connection failed:", err.message);
      throw err;
    });
  return connecting;
};

module.exports = connectDB;
