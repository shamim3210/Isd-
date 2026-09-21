const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, LevelFormat, convertInchesToTwip,
  PageBreak, Header, Footer, PageNumber, TableOfContents,
} = require("docx");

const NAVY = "1F2937";
const TEAL = "0F766E";
const PURPLE = "6D28D9";
const ORANGE = "C2410C";
const LIGHTGREY = "F3F4F6";
const WHITE = "FFFFFF";

function h1(text, color = NAVY) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, color, size: 32 })],
  });
}
function h2(text, color = TEAL) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, color, size: 26 })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 22, ...opts })],
  });
}
function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22 })],
  });
}

function cell(text, opts = {}) {
  const { bold = false, color = "000000", shade = null, width } = opts;
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold, color, size: 20 })] })],
  });
}

function makeTable(headerRow, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headerRow.map((h, i) => cell(h, { bold: true, color: WHITE, shade: NAVY, width: colWidths[i] })),
      }),
      ...rows.map(
        (r, idx) =>
          new TableRow({
            children: r.map((v, i) => cell(String(v), { width: colWidths[i], shade: idx % 2 ? LIGHTGREY : null })),
          })
      ),
    ],
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Calibri" } } },
  },
  numbering: {
    config: [
      {
        reference: "bullet-list",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT }],
      },
    ],
  },
  sections: [
    {
      properties: { page: { size: { width: 12240, height: 15840 } } }, // US Letter
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "LibraryMS — Requirement Analysis", size: 16, color: "888888" })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "Page ", size: 16, color: "888888" }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "888888" }),
              ],
            }),
          ],
        }),
      },
      children: [
        // TITLE PAGE
        new Paragraph({ spacing: { before: 1800 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "LibraryMS", bold: true, size: 64, color: NAVY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 400 },
          children: [new TextRun({ text: "Online Library Management System", size: 30, color: TEAL, italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [new TextRun({ text: "Requirement Analysis & Software Design Document", size: 24, color: "555555" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 800 },
          children: [new TextRun({ text: "CSE 346 — Information Systems Design & Software Engineering", size: 20 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100 },
          children: [new TextRun({ text: "Southeast University, Department of CSE", size: 20 })],
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // TABLE OF CONTENTS (static list since TOC field needs Word to refresh)
        h1("Table of Contents"),
        bullet("1. Project Overview & Scope"),
        bullet("2. Stakeholders & Users"),
        bullet("3. Functional Requirements"),
        bullet("4. Functional Modules"),
        bullet("5. Non-Functional Requirements"),
        bullet("6. Data Requirements (Entities & Schema)"),
        bullet("7. Book Catalog — Categories & Scale"),
        bullet("8. User Stories"),
        bullet("9. Use Case Overview"),
        bullet("10. Requirement Priorities (MoSCoW)"),
        bullet("11. Constraints & Technology Stack"),
        bullet("12. Assumptions & Dependencies"),
        bullet("13. Risk Analysis"),
        bullet("14. Traceability Matrix"),
        bullet("15. Glossary"),
        new Paragraph({ children: [new PageBreak()] }),

        // 1. OVERVIEW
        h1("1. Project Overview & Scope"),
        body(
          "A university wants to build a web-based library system. Students can search for books, borrow and return them, and receive overdue fine notifications. Librarians can add or remove books, manage members, and generate reports. The system must respond fast, be available 24/7, and keep student data secure."
        ),
        h2("App Summary"),
        makeTable(
          ["Field", "Detail"],
          [
            ["App Name", "LibraryMS — Online Library Management System"],
            ["Users", "Students, Librarians, Admin"],
            ["Platform", "Web-based (browser accessible), 24/7 availability"],
            ["Purpose", "Automate book search, borrowing, returns, and library administration"],
            ["Scale Target", "30,000+ book titles, 500+ concurrent users"],
            ["Database", "MongoDB (NoSQL, document-oriented)"],
          ],
          [3000, 6500]
        ),

        // 2. STAKEHOLDERS
        h1("2. Stakeholders & Users"),
        makeTable(
          ["Role", "Description", "Primary Goals"],
          [
            ["Student", "Registered university student borrowing books", "Search, borrow, return, track fines"],
            ["Librarian", "Staff managing the catalog and members", "Add/remove books, manage members, run reports"],
            ["Admin", "System administrator", "User roles, system configuration, backups, audit logs"],
            ["University IT", "Maintains infrastructure", "Uptime, security, integration with student DB"],
          ],
          [2200, 3800, 3500]
        ),

        // 3. FUNCTIONAL REQUIREMENTS
        h1("3. Functional Requirements"),
        body("Functional requirements describe the specific things the system must be able to do."),
        makeTable(
          ["ID", "Role", "Action", "Detail"],
          [
            ["FR-01", "Student", "Search for books", "Search by title, author, ISBN, or category"],
            ["FR-02", "Student", "Borrow a book", "Request borrow; system records due date"],
            ["FR-03", "Student", "Return a book", "Mark book as returned; update availability"],
            ["FR-04", "Student", "Receive fine alert", "Get notification if book is overdue"],
            ["FR-05", "Librarian", "Add/Remove books", "Update the book catalog"],
            ["FR-06", "Librarian", "Manage members", "Register or deactivate student accounts"],
            ["FR-07", "Librarian", "Generate reports", "View borrowed books, fines, inventory"],
            ["FR-08", "Admin", "Manage user roles", "Promote/demote Librarian/Student/Admin roles"],
            ["FR-09", "Admin", "System configuration", "Set fine rate, loan period, category list"],
            ["FR-10", "Student", "Reserve a book", "Place a hold on a currently borrowed book"],
            ["FR-11", "Student", "Rate & review a book", "Leave a rating (1–5) and short review"],
            ["FR-12", "Librarian", "Bulk import books", "Upload CSV/Excel to add many books at once"],
            ["FR-13", "System", "Renew a loan", "Student can renew if no reservation is pending"],
            ["FR-14", "Admin", "View audit log", "Track who added/removed/edited catalog records"],
          ],
          [1400, 1800, 2800, 3500]
        ),

        // 4. MODULES
        h1("4. Functional Modules"),
        body("Related functional requirements are grouped into cohesive modules:"),
        h2("Book Search Module", TEAL),
        bullet("FR-01: Search by title / author / ISBN / category"),
        bullet("Display availability status and shelf location"),
        bullet("Show book details, cover image, and rating"),
        h2("Borrowing & Return Module", "1D4ED8"),
        bullet("FR-02: Borrow a book"),
        bullet("FR-03: Return a book"),
        bullet("FR-10: Reserve a book"),
        bullet("FR-13: Renew a loan"),
        bullet("Track borrow history per student"),
        h2("Notification Module", PURPLE),
        bullet("FR-04: Send overdue fine alerts"),
        bullet("Due-date reminder emails"),
        bullet("Reservation-ready notifications"),
        bullet("System announcements"),
        h2("Admin / Librarian Module", NAVY),
        bullet("FR-05: Add/remove books"),
        bullet("FR-06: Manage member accounts"),
        bullet("FR-07: Generate reports"),
        bullet("FR-12: Bulk import books"),
        h2("System Administration Module", ORANGE),
        bullet("FR-08: Manage user roles"),
        bullet("FR-09: System configuration"),
        bullet("FR-14: Audit log"),

        // 5. NFR
        h1("5. Non-Functional Requirements"),
        body("Non-functional requirements describe the quality attributes of the system — how well it does what it does."),
        makeTable(
          ["ID", "Type", "Clue in Scenario", "Requirement Statement"],
          [
            ["NFR-01", "Performance", "\"respond fast\"", "The system shall load any search result within 2 seconds."],
            ["NFR-02", "Availability", "\"available 24/7\"", "The system shall maintain 99.9% uptime."],
            ["NFR-03", "Security", "\"keep student data secure\"", "Student data shall be encrypted at rest and in transit; access restricted by role."],
            ["NFR-04", "Scalability", "\"university library system\"", "The system shall support 500+ concurrent users without degradation."],
            ["NFR-05", "Usability", "\"students can use it easily\"", "A new student shall complete search-and-borrow within 3 minutes, unaided."],
            ["NFR-06", "Reliability", "\"fine notifications\"", "Notification delivery failure rate shall not exceed 0.1% per day."],
            ["NFR-07", "Maintainability", "modular design", "New book categories or modules shall be addable without redeploying the core system."],
            ["NFR-08", "Portability", "multi-device access", "The UI shall render correctly on desktop, tablet, and mobile browsers."],
            ["NFR-09", "Data Integrity", "30,000+ records", "No two books shall share the same ISBN; referential integrity enforced across collections."],
            ["NFR-10", "Compliance", "student privacy", "The system shall comply with institutional data-protection policy for personal data."],
          ],
          [1300, 1800, 2400, 4000]
        ),

        // 6. DATA REQUIREMENTS
        h1("6. Data Requirements (Entities & Schema)"),
        body("The system is backed by a MongoDB (NoSQL, document-oriented) database with the following core collections:"),
        h2("Book Collection"),
        makeTable(
          ["Field", "Type", "Notes"],
          [
            ["isbn", "String", "Unique, indexed"],
            ["title", "String", "Indexed, text-searchable"],
            ["author", "String", "Indexed, text-searchable"],
            ["category", "String (enum)", "One of 30 subject categories"],
            ["publisher", "String", ""],
            ["publishedYear", "Number", ""],
            ["totalCopies / availableCopies", "Number", "Tracks inventory"],
            ["shelfLocation", "String", "Physical location code"],
            ["rating", "Number (0–5)", "Aggregated from reviews (FR-11)"],
          ],
          [3000, 2200, 4300]
        ),
        h2("User Collection"),
        makeTable(
          ["Field", "Type", "Notes"],
          [
            ["name / email / password", "String", "Password hashed with bcrypt"],
            ["role", "String (enum)", "student / librarian / admin"],
            ["studentId / department", "String", "For students"],
            ["isActive", "Boolean", "FR-06 deactivation"],
            ["fineBalance", "Number", "Running total in taka"],
          ],
          [3000, 2200, 4300]
        ),
        h2("Transaction Collection"),
        makeTable(
          ["Field", "Type", "Notes"],
          [
            ["book / user", "ObjectId (ref)", "Links to Book & User"],
            ["borrowDate / dueDate / returnDate", "Date", "FR-02, FR-03"],
            ["status", "String (enum)", "borrowed / returned / overdue / lost"],
            ["fineAmount", "Number", "Auto-calculated on late return"],
          ],
          [3000, 2200, 4300]
        ),

        // 7. CATALOG SCALE
        h1("7. Book Catalog — Categories & Scale"),
        body("To reflect a real university library, the catalog spans 30 subject categories with 30,000+ total titles:"),
        makeTable(
          ["Category", "Category", "Category"],
          [
            ["Computer Science", "Engineering", "Mathematics"],
            ["Physics", "Chemistry", "Biology"],
            ["Business & Economics", "Law", "Medical & Pharmacy"],
            ["English Literature", "Bangla Literature", "History"],
            ["Philosophy", "Religion & Theology", "Psychology"],
            ["Sociology", "Political Science", "Fiction"],
            ["Science Fiction & Fantasy", "Biography & Memoir", "Self-Help"],
            ["Art & Design", "Architecture", "Environmental Science"],
            ["Journalism & Media", "Poetry", "Children's Books"],
            ["Reference & Encyclopedia", "Textbook", "Thesis & Research Paper"],
          ],
          [2830, 2830, 2830]
        ),
        body(""),
        body("Each category holds approximately 1,000+ titles, giving a realistic, browsable catalog rather than a token sample set."),

        // 8. USER STORIES
        h1("8. User Stories"),
        makeTable(
          ["ID", "User Story"],
          [
            ["US-01", "As a student, I want to search books by title or author, so that I can quickly find what I need."],
            ["US-02", "As a student, I want to reserve a book that's checked out, so that I get it as soon as it's returned."],
            ["US-03", "As a student, I want to receive a reminder before my due date, so that I avoid a fine."],
            ["US-04", "As a librarian, I want to bulk-upload new arrivals via CSV, so that I don't add them one by one."],
            ["US-05", "As a librarian, I want to see overdue reports, so that I can follow up with students."],
            ["US-06", "As an admin, I want to configure the fine rate, so that policy changes don't need a code change."],
            ["US-07", "As a student, I want to rate a book after returning it, so that other students get guidance."],
          ],
          [1300, 8200]
        ),

        // 9. USE CASE
        h1("9. Use Case Overview"),
        body("Primary actors: Student, Librarian, Admin. Key use cases:"),
        bullet("Search Catalog → (extends) View Book Details → (extends) Reserve Book"),
        bullet("Borrow Book → (includes) Check Availability → (includes) Update Due Date"),
        bullet("Return Book → (includes) Calculate Fine → (includes) Notify Student"),
        bullet("Manage Catalog (Librarian) → Add Book / Remove Book / Bulk Import"),
        bullet("Manage Members (Librarian) → Register / Deactivate Member"),
        bullet("Generate Report (Librarian/Admin) → Inventory / Borrowed / Fines Report"),
        bullet("Configure System (Admin) → Set Fine Rate / Loan Period / Manage Roles"),

        // 10. MOSCOW
        h1("10. Requirement Priorities (MoSCoW)"),
        makeTable(
          ["Priority", "Requirements"],
          [
            ["Must Have", "FR-01, FR-02, FR-03, FR-05, FR-06, NFR-01, NFR-02, NFR-03"],
            ["Should Have", "FR-04, FR-07, FR-08, FR-09, NFR-04, NFR-05"],
            ["Could Have", "FR-10, FR-11, FR-12, NFR-07, NFR-08"],
            ["Won't Have (this phase)", "FR-13 auto-renewal automation, FR-14 full audit UI"],
          ],
          [2600, 6900]
        ),

        // 11. CONSTRAINTS
        h1("11. Constraints & Technology Stack"),
        makeTable(
          ["Layer", "Technology", "Reason"],
          [
            ["Database", "MongoDB", "Flexible schema for varied book metadata; scales to 30,000+ docs easily"],
            ["Backend", "Node.js + Express", "Fast REST API development, large ecosystem"],
            ["Frontend", "HTML/CSS/JS (or React)", "Lightweight, works on all devices"],
            ["Auth", "JWT + bcrypt", "Stateless auth, secure password storage"],
            ["Hosting", "MongoDB Atlas + Render/Netlify", "Free-tier friendly for a university project"],
          ],
          [1800, 2800, 4900]
        ),
        h2("Constraints"),
        bullet("Must run within free-tier cloud limits (MongoDB Atlas free tier: 512MB)."),
        bullet("Must be demoable within a university lab environment (no paid licenses)."),
        bullet("Timeline: single semester project."),

        // 12. ASSUMPTIONS
        h1("12. Assumptions & Dependencies"),
        bullet("Students already have a university-issued email for registration."),
        bullet("The university has stable internet infrastructure for 24/7 access."),
        bullet("Fine payment itself (money transfer) is out of scope — only fine tracking is in scope."),
        bullet("Depends on MongoDB Atlas or a self-hosted MongoDB instance being available."),

        // 13. RISK
        h1("13. Risk Analysis"),
        makeTable(
          ["Risk", "Impact", "Mitigation"],
          [
            ["Search becomes slow at 30,000+ records", "Violates NFR-01", "Use MongoDB text indexes and pagination"],
            ["Duplicate ISBN entries during bulk import", "Data integrity issue", "Enforce unique index + validation on import"],
            ["Notification service downtime", "Violates NFR-06", "Add retry queue and logging for failed sends"],
            ["Unauthorized catalog edits", "Security breach", "Role-based access control (RBAC) on all write routes"],
          ],
          [2800, 2200, 4300]
        ),

        // 14. TRACEABILITY
        h1("14. Traceability Matrix"),
        makeTable(
          ["Requirement", "Module", "Priority"],
          [
            ["FR-01", "Book Search Module", "Must Have"],
            ["FR-02, FR-03", "Borrowing & Return Module", "Must Have"],
            ["FR-04", "Notification Module", "Should Have"],
            ["FR-05, FR-06, FR-07", "Admin / Librarian Module", "Must / Should"],
            ["FR-08, FR-09, FR-14", "System Administration Module", "Should / Won't (phase 1)"],
            ["FR-10, FR-11, FR-12", "Borrowing & Return / Admin", "Could Have"],
          ],
          [2200, 4400, 2700]
        ),

        // 15. GLOSSARY
        h1("15. Glossary"),
        makeTable(
          ["Term", "Definition"],
          [
            ["FR", "Functional Requirement — what the system must do"],
            ["NFR", "Non-Functional Requirement — how well the system must do it"],
            ["ISBN", "International Standard Book Number, a unique book identifier"],
            ["RBAC", "Role-Based Access Control"],
            ["MoSCoW", "Prioritization method: Must/Should/Could/Won't have"],
            ["Uptime", "Percentage of time a system is operational and accessible"],
          ],
          [2200, 6900]
        ),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  require("fs").writeFileSync("/home/claude/LibraryMS/docs/LibraryMS_Requirement_Analysis.docx", buffer);
  console.log("✅ Document created");
});
