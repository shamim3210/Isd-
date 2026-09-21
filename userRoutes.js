const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { requireAuth, requireRole } = require("../middleware/auth");
const { logAction } = require("../utils/auditLogger");

// FR-06: List / manage members (Librarian/Admin) — use /api/auth/register for self sign-up
router.get("/", requireAuth, requireRole("librarian", "admin"), async (req, res) => {
  const { role, q } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { studentId: { $regex: q, $options: "i" } },
    ];
  }
  const users = await User.find(filter).select("-password").sort({ createdAt: -1 });
  res.json(users);
});

// Member detail — WHO borrowed WHAT, full history, fines (answers "কে কোন বই নিয়েছে")
router.get("/:id/detail", requireAuth, requireRole("librarian", "admin"), async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (!user) return res.status(404).json({ error: "Member not found" });

  const history = await Transaction.find({ user: user._id }).populate("book").sort({ createdAt: -1 });
  const currentlyBorrowed = history.filter((t) => t.status === "borrowed" || t.status === "overdue");
  const lostBooks = history.filter((t) => t.status === "lost");

  // Bug fix: this used to sum fineAmount across ALL transactions, including ones
  // already marked finePaid — so a member who'd paid up still showed an outstanding
  // balance to the librarian. Now it reports paid and unpaid separately, and lists
  // the actual unpaid fine transactions so the dashboard can offer "mark as paid" per fine.
  const unpaidFineTxns = history.filter((t) => t.fineAmount > 0 && !t.finePaid);
  const unpaidFines = unpaidFineTxns.reduce((sum, t) => sum + t.fineAmount, 0);
  const totalFinesEverCharged = history.reduce((sum, t) => sum + (t.fineAmount || 0), 0);

  res.json({
    user,
    history,
    currentlyBorrowed,
    lostBooks,
    unpaidFines,
    unpaidFineTxns,
    totalFinesEverCharged,
    totalFines: unpaidFines, // kept for backward compatibility with any existing caller
    totalBorrowedEver: history.length,
  });
});

// FR-06: Deactivate / reactivate a member
router.patch("/:id/status", requireAuth, requireRole("librarian", "admin"), async (req, res) => {
  const { isActive } = req.body;
  const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true }).select("-password");
  if (!user) return res.status(404).json({ error: "Member not found" });
  await logAction(req, isActive ? "user.reactivate" : "user.deactivate", "User", user._id, user.name);
  res.json(user);
});

// Admin-only: change a member's role. This is the ONLY way to grant admin —
// it can never be self-assigned through /auth/register, and only an
// existing admin (not a librarian) can call this.
router.patch("/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
  const { role } = req.body;
  if (!["student", "librarian", "admin"].includes(role)) {
    return res.status(400).json({ error: "Role must be student, librarian, or admin." });
  }
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password");
  if (!user) return res.status(404).json({ error: "Member not found" });
  await logAction(req, "user.role_change", "User", user._id, `${user.name} → ${role}`);
  res.json(user);
});

// User profile: view / update own profile
router.get("/me/profile", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

router.put("/me/profile", requireAuth, async (req, res) => {
  const { name, department, phone } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { name, department, phone },
    { new: true, runValidators: true }
  ).select("-password");
  res.json(user);
});

module.exports = router;
