const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const router = express.Router();
const User = require("../models/User");
const { validateRegisterInput, isValidEmail, isStrongEnoughPassword, resolveRegistrationRole } = require("../utils/validators");
const { sendMail, verificationEmail, resetPasswordEmail } = require("../config/mailer");
const { asyncHandler } = require("../middleware/errorHandler");
const { requireAuth } = require("../middleware/auth");

const JWT_SECRET = process.env.JWT_SECRET;
const emailVerificationEnabled = () =>
  process.env.EMAIL_VERIFICATION_ENABLED === "true" &&
  Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

function signToken(user) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured.");
  return jwt.sign({ id: user._id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Register (student by default; librarian is also available through the
// public registration form. Admin can never be self-assigned.)
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password, studentId, department, role, librarianCode } = req.body;

    const errors = validateRegisterInput({ name, email, password });
    if (errors.length) return res.status(400).json({ error: errors.join(" ") });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: "Email already registered" });

    // Decide the actual role server-side — never trust the client's role field.
    const roleResult = resolveRegistrationRole(role, librarianCode, process.env.LIBRARIAN_SIGNUP_CODE);
    if (roleResult.error) return res.status(403).json({ error: roleResult.error });
    const finalRole = roleResult.role;
    // Note: "admin" is intentionally never settable here. Promote a user to
    // admin directly in the database, or via PATCH /api/users/:id/role
    // (admin-only route).

    const requiresEmailVerification = emailVerificationEnabled();
    const verificationToken = requiresEmailVerification ? makeToken() : undefined;
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      studentId,
      department,
      role: finalRole,
      emailVerified: !requiresEmailVerification,
      verificationToken,
      verificationExpires: requiresEmailVerification ? Date.now() + 24 * 60 * 60 * 1000 : undefined,
    });

    if (requiresEmailVerification) {
      const { subject, html } = verificationEmail(verificationToken);
      await sendMail({ to: user.email, subject, html });
    }

    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified },
      message: requiresEmailVerification
        ? "Account created. Check your email to verify your account."
        : "Account created successfully. You can log in now.",
    });
  })
);

// Verify email via token from the emailed link
router.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Missing verification token" });

    const user = await User.findOne({ verificationToken: token, verificationExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: "This verification link is invalid or has expired." });

    user.emailVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save();

    res.json({ message: "Email verified successfully. You can now log in." });
  })
);

// Resend verification email
router.post(
  "/resend-verification",
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase().trim() });
    // Don't reveal whether the account exists
    if (!user || user.emailVerified) {
      return res.json({ message: "If that account exists and isn't verified yet, a new email has been sent." });
    }
    user.verificationToken = makeToken();
    user.verificationExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();
    const { subject, html } = verificationEmail(user.verificationToken);
    await sendMail({ to: user.email, subject, html });
    res.json({ message: "If that account exists and isn't verified yet, a new email has been sent." });
  })
);

// Login
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, identifier, password, twoFactorToken } = req.body;
    const loginIdentifier = String(identifier || email || "").trim();
    if (!loginIdentifier || !password) {
      return res.status(400).json({ error: "Enter your email or student ID and password." });
    }

    const user = isValidEmail(loginIdentifier)
      ? await User.findOne({ email: loginIdentifier.toLowerCase() })
      : await User.findOne({ studentId: loginIdentifier });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    if (!user.isActive) return res.status(403).json({ error: "Account is deactivated. Contact the librarian." });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: "Invalid email or password" });
    if (!user.emailVerified && emailVerificationEnabled()) {
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        emailVerificationRequired: true,
      });
    }

    if (user.twoFactorEnabled) {
      if (!twoFactorToken) {
        return res.status(200).json({ twoFactorRequired: true, message: "Enter your 6-digit authenticator code." });
      }
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: twoFactorToken,
        window: 1,
      });
      if (!verified) return res.status(401).json({ error: "Invalid authenticator code." });
    }

    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        fineBalance: user.fineBalance,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  })
);

// 2FA — start setup: generate a secret and a QR code for an authenticator app
router.post(
  "/2fa/setup",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    const secret = speakeasy.generateSecret({ name: `LibraryMS (${user.email})` });
    user.twoFactorSecret = secret.base32;
    user.twoFactorEnabled = false; // not enabled until confirmed
    await user.save();
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ qrDataUrl, manualEntryKey: secret.base32 });
  })
);

// 2FA — confirm setup with a code from the authenticator app
router.post(
  "/2fa/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    const user = await User.findById(req.user.id);
    if (!user.twoFactorSecret) return res.status(400).json({ error: "Start 2FA setup first." });

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token,
      window: 1,
    });
    if (!verified) return res.status(400).json({ error: "Incorrect code. Try again." });

    user.twoFactorEnabled = true;
    await user.save();
    res.json({ message: "Two-factor authentication enabled." });
  })
);

// 2FA — disable
router.post(
  "/2fa/disable",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await user.save();
    res.json({ message: "Two-factor authentication disabled." });
  })
);

// Forgot password — request a reset link by email
router.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase().trim() });
    // Always return the same message so we don't leak which emails are registered
    const genericMsg = { message: "If that email is registered, a reset link has been sent." };
    if (!user) return res.json(genericMsg);

    user.resetToken = makeToken();
    user.resetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const { subject, html } = resetPasswordEmail(user.resetToken);
    await sendMail({ to: user.email, subject, html });
    res.json(genericMsg);
  })
);

// Reset password using the emailed token
router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !isStrongEnoughPassword(newPassword)) {
      return res.status(400).json({ error: "Invalid request. Password must be at least 6 characters." });
    }
    const user = await User.findOne({ resetToken: token, resetExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: "This reset link is invalid or has expired." });

    user.password = newPassword; // pre-save hook re-hashes it
    user.resetToken = undefined;
    user.resetExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successfully. You can now log in with your new password." });
  })
);

// Get current user from token
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("-password -verificationToken -verificationExpires -resetToken -resetExpires -twoFactorSecret");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  })
);

module.exports = router;
