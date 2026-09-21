// Catches errors thrown/passed to next() anywhere in the app and returns a
// consistent JSON shape instead of leaking stack traces or crashing.
function errorHandler(err, req, res, next) {
  console.error("Unhandled error:", err);

  if (err.name === "ValidationError") {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join(", ") });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(400).json({ error: `That ${field} is already in use.` });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: "Invalid ID format." });
  }

  res.status(err.status || 500).json({ error: err.message || "Something went wrong. Please try again." });
}

// Wraps an async route handler so thrown errors reach errorHandler
// instead of crashing the process or hanging the request.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
