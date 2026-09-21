const AuditLog = require("../models/AuditLog");

async function logAction(req, action, targetType, targetId, details = "") {
  try {
    await AuditLog.create({
      actor: req.user?.id,
      actorName: req.user?.name,
      action,
      targetType,
      targetId,
      details,
    });
  } catch (err) {
    console.error("Audit log failed:", err.message);
  }
}

module.exports = { logAction };
