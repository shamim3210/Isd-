const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["student", "librarian", "admin"],
      default: "student",
    },
    studentId: { type: String }, // only for students
    department: { type: String },
    phone: { type: String },
    isActive: { type: Boolean, default: true }, // FR-06: activate/deactivate
    fineBalance: { type: Number, default: 0 }, // taka

    // Email verification
    emailVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationExpires: { type: Date },

    // Password reset
    resetToken: { type: String },
    resetExpires: { type: Date },

    // Two-factor authentication (TOTP)
    twoFactorSecret: { type: String },
    twoFactorEnabled: { type: Boolean, default: false },

    // Multi-branch support
    branch: { type: String, default: "Main Campus" },

    // i18n preference
    preferredLanguage: { type: String, enum: ["en", "bn"], default: "en" },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", userSchema);
