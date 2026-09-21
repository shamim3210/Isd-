const nodemailer = require("nodemailer");

// Uses Gmail SMTP. In Gmail: enable 2-Step Verification, then create an
// "App Password" (Google Account → Security → App Passwords) — use that
// 16-character app password as EMAIL_PASS, not your normal Gmail password.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const FROM = process.env.EMAIL_FROM || `"LibraryMS" <${process.env.EMAIL_USER}>`;
const APP_URL = process.env.APP_URL || "http://localhost:3000"; // frontend URL for links in emails

async function sendMail({ to, subject, html }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn(`⚠️  EMAIL_USER/EMAIL_PASS not set — skipping email to ${to} ("${subject}"). Set them in .env to send real emails.`);
    return { skipped: true };
  }
  return transporter.sendMail({ from: FROM, to, subject, html });
}

function verificationEmail(token) {
  const link = `${APP_URL}/verify.html?token=${token}`;
  return {
    subject: "Verify your LibraryMS account",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#7A3B2E;">Welcome to LibraryMS</h2>
        <p>Please verify your email address to activate your account.</p>
        <p><a href="${link}" style="background:#7A3B2E;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Verify my email</a></p>
        <p style="color:#888;font-size:12px;">This link expires in 24 hours. If you didn't create this account, ignore this email.</p>
      </div>`,
  };
}

function resetPasswordEmail(token) {
  const link = `${APP_URL}/reset-password.html?token=${token}`;
  return {
    subject: "Reset your LibraryMS password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#7A3B2E;">Password reset requested</h2>
        <p>Click the button below to set a new password. This link expires in 1 hour.</p>
        <p><a href="${link}" style="background:#7A3B2E;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Reset my password</a></p>
        <p style="color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      </div>`,
  };
}

function dueDateReminderEmail(bookTitle, dueDate) {
  return {
    subject: `Reminder: "${bookTitle}" is due soon`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#7A3B2E;">Due date reminder</h2>
        <p><strong>${bookTitle}</strong> is due back on <strong>${new Date(dueDate).toLocaleDateString()}</strong>.</p>
        <p>Return or renew it on time to avoid a fine.</p>
      </div>`,
  };
}

function reservationReadyEmail(bookTitle) {
  return {
    subject: `"${bookTitle}" is now available`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#7A3B2E;">Your reserved book is ready</h2>
        <p><strong>${bookTitle}</strong> has been returned and is now available for you to borrow.</p>
      </div>`,
  };
}

function fineNoticeEmail(bookTitle, amount) {
  return {
    subject: `Fine notice: ৳${amount} for "${bookTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#B0472F;">Overdue fine</h2>
        <p>A fine of <strong>৳${amount}</strong> has been applied for the late return of <strong>${bookTitle}</strong>.</p>
        <p>Please settle it with the librarian.</p>
      </div>`,
  };
}

module.exports = {
  sendMail,
  verificationEmail,
  resetPasswordEmail,
  dueDateReminderEmail,
  reservationReadyEmail,
  fineNoticeEmail,
};
