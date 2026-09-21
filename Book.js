const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema(
  {
    isbn: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, index: true },
    author: { type: String, required: true, index: true },
    category: {
      type: String,
      required: true,
      index: true,
      enum: [
        "Computer Science",
        "Engineering",
        "Mathematics",
        "Physics",
        "Chemistry",
        "Biology",
        "Business & Economics",
        "Law",
        "Medical & Pharmacy",
        "English Literature",
        "Bangla Literature",
        "History",
        "Philosophy",
        "Religion & Theology",
        "Psychology",
        "Sociology",
        "Political Science",
        "Fiction",
        "Science Fiction & Fantasy",
        "Biography & Memoir",
        "Self-Help",
        "Art & Design",
        "Architecture",
        "Environmental Science",
        "Journalism & Media",
        "Poetry",
        "Children's Books",
        "Reference & Encyclopedia",
        "Textbook",
        "Thesis & Research Paper",
      ],
    },
    publisher: { type: String },
    publishedYear: { type: Number },
    language: { type: String, default: "English" },
    edition: { type: String, default: "1st" },
    totalCopies: { type: Number, required: true, default: 1 },
    availableCopies: { type: Number, required: true, default: 1 },
    shelfLocation: { type: String }, // e.g. "CSE-A3-12"
    coverImage: { type: String },
    description: { type: String },
    tags: [{ type: String }],
    rating: { type: Number, min: 0, max: 5, default: 0 },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Librarian who added it (FR-05)
    branch: { type: String, default: "Main Campus", index: true }, // multi-branch support
  },
  { timestamps: true }
);

// Text index for fast title/author/ISBN search (FR-01, NFR-01 <2s search)
// MongoDB treats the field named `language` as the text-index language
// override by default. The catalog stores human-readable values such as
// "Bangla", which MongoDB does not accept as a text-search language. Use a
// separate, absent override field so all catalog language values remain valid.
bookSchema.index(
  { title: "text", author: "text", isbn: "text" },
  { default_language: "english", language_override: "languageCode" }
);

module.exports = mongoose.model("Book", bookSchema);
