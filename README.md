# LibraryMS — Online Library Management System

A full university library project: requirement analysis document, MongoDB database with 50,000+ books across 30 subject categories, an Express REST API with real login/auth, and a **fully responsive web app** — one app that works on your laptop and your phone, no separate mobile build needed.

## ✨ What the web app can do

- **Home** — live catalog stats, department browser, quick search
- **Browse & search** — filter by category, paginated results, colorful book covers, tap any book for full detail
- **Login / Register** — real accounts (Student or Librarian), JWT-secured; email verification is optional and activates only when SMTP is configured
- **Protected Librarian sign-up** — creating a Librarian account requires a secret access code set by the project owner (`LIBRARIAN_SIGNUP_CODE` in `.env`); students can't just pick "Librarian" from the dropdown and get in. Admin accounts can never be self-registered at all — only an existing admin can promote someone via `PATCH /api/users/:id/role`
- **Forgot / Reset password** — real email flow via Gmail SMTP
- **Real book cover images** — looked up automatically via the free Open Library API and cached, with a colorful initials-based cover as fallback for the (many) synthetically-generated catalog entries that don't match a real published book
- **Ask a librarian** — a direct contact form sends questions to the library team by email
- **Borrow / Return / Reserve** — borrow or reserve a book from its detail card, return it from My Loans, fines calculate automatically for late returns, reservation holders get emailed when a book becomes available
- **Ratings & recommendations** — rate a book you've returned; "You might also like" suggests similar titles
- **My Loans** — see everything you've borrowed, due dates, overdue warnings, outstanding fines
- **Fine payments** — pay through bKash when configured, or send a desk-payment request that a librarian/admin can receive and record from the dashboard
- **Librarian dashboard** (visible only to librarian/admin accounts):
  - Inventory & fines reports, with **CSV export**
  - Currently-borrowed table
  - Add a book, or **bulk import via CSV**
  - **Member directory with search** — click any member to see their full borrow history, current loans, and fines ("যে কোনো ছাত্র কী বই নিয়েছে" — answered directly)
  - **Analytics** — most-borrowed books, demand by department, top readers (bar charts)
  - **Activity log** — an audit trail of every add/edit/delete/deactivate action, who did it and when
- **Dark mode** toggle, **accessibility** (skip link, focus outlines, `aria-live` status regions, reduced-motion support)
- **Mobile-first** — bottom tab bar on phones, top nav on desktop, same single codebase, same server

## 🔒 Advanced features (all real, not stubs)

- **Two-factor authentication (2FA)** — TOTP-based, works with Google Authenticator/Authy; opt-in from the account settings (gear icon next to your name)
- **QR codes** — every book has a scannable QR on its detail page; librarians can scan it (Admin → Scan) to look a book up instantly at the desk
- **Multi-branch support** — books and members can belong to a branch (e.g. "Main Campus", "City Campus"), with a branch filter in Browse
- **Bangla/English toggle** — switch languages from the top bar; preference is remembered
- **PWA / installable** — has a manifest and service worker, so it can be "installed" to a phone's home screen; the app shell (UI) loads even with no connection, though book data always needs a live connection to the backend (there's no offline data cache — being upfront about that limit)
- **Smarter recommendations** — "You might also like" now uses real co-borrowing data ("students who borrowed this also borrowed…") when there's enough history, falling back to same-category matching for newer books
- **PDF exports** — catalog, fines, and inventory reports can be downloaded as PDF (in addition to CSV)
- **Automated tests** — `npm test` in `/backend` runs the unit tests (validators, CSV export, seed-data generator) using Node's built-in test runner, no extra dependency needed
- **Manual QA checklist** — see `TESTING.md` for everything that needs a human pass (live DB, real email, camera, screen readers)
- **Study room booking** — students can book an hourly slot in any study room from the Rooms tab; librarians manage the room list from Admin → Rooms
- **Book suggestions** — students can request a book that's missing from the catalog (My Loans → Suggest a book); librarians approve/reject from Admin → Suggestions
- **In-app notifications** — a bell icon with unread count shows updates (reservation ready, due-date reminders, fine notices, suggestion decisions)
- **Library announcements** — librarians can post notices that show as a banner on the home page (Admin → Announcements)
- **Ask a librarian** — a contact form (linked from the home page) that emails every active librarian at once
- **Fine cap** — borrowing is blocked once a student's unpaid fines reach ৳100, same policy most real university libraries enforce; librarians can mark fines as paid to lift the block
- **Report a lost book** — students can report a borrowed book lost from My Loans; this charges a flat replacement fee and pulls the copy out of circulation
- **Loan renewal** — one renewal allowed per loan, blocked automatically if someone else has reserved the book
- **New Arrivals & Trending shelves** — horizontally-scrolling rows on the home page, pulled from real data (most recently added books, most borrowed this week)

## 🆕 Changes in this pass

- **Home page now shows the actual catalog.** Previously the home view only had stats/new-arrivals/trending shelves with no way to browse books without clicking into "Browse". Added a paginated, infinite-scrolling "All books in the library" grid directly on the home page (`loadHomeCatalog()` in `app.js`), reusing the existing indexed `/books/search` endpoint 24 at a time — never loads all 50,000 at once.
- **Catalog scaled from ~30,000 to ~50,000 books** (`scripts/seedBooks.js` — `TOTAL_BOOKS`, overridable via `SEED_BOOK_COUNT` env var for faster local testing).
- **Fixed a borrow race condition**: `POST /transactions/borrow` used to read `availableCopies` then write it back separately, so two simultaneous requests for the last copy could both succeed. Now uses an atomic `findOneAndUpdate` with a `$gt: 0` guard, with rollback if the transaction record fails to create.
- **Fixed a return authorization/double-processing gap**: `POST /transactions/return` previously let *any* logged-in student return *any* transaction ID (not just their own), and calling it twice on the same loan would double-credit `availableCopies` and reapply the fine. Now checks ownership (or librarian/admin) and that the loan is still `"borrowed"` before processing, and increments the copy count atomically.
- **Duplicate-borrow prevention**: a user can no longer borrow a title they already have an active loan on.
- **Split registration into two fully separate forms.** Previously there was one Register form with a role dropdown (Student/Librarian) that revealed a librarian-code field when switched — functionally safe, but easy to misread as "one form, pick a role." Now there are two independent tabs/forms: **Student Registration** (no librarian code field exists in it at all) and **Librarian Registration** (always requires the access code, no student fields). Both still call the same backend `/auth/register` endpoint, which independently re-verifies the code server-side either way — the split is a UI clarity fix, not a new security boundary (the security was already correct).
- **Added a "Books" tab to the dashboard.** Previously the dashboard could add a book and see aggregate counts in Reports, but there was no way to actually see, search, edit, or delete the catalog from inside the dashboard — the backend already had working `PUT /books/:id` and `DELETE /books/:id` routes, they just had no frontend hooked up to them. Now there's a searchable, paginated table with working Edit (reuses the Add-a-book form in an edit mode) and Delete buttons.
- **Wired up cash fine payments — this had no UI at all.** The backend's `PATCH /transactions/:id/mark-paid` route already existed and was correctly librarian/admin-gated, but nothing in the frontend ever called it — a librarian had no way to actually record a cash payment. Now the member-detail modal (Admin → Members → click a member) lists their unpaid fines individually with a "Mark as paid (cash)" button per fine.
- **Fixed a real fine-total bug**: `GET /users/:id/detail` used to sum a member's fine amount across *all* their transactions ever, including ones already marked paid — so a member who'd settled up still showed an outstanding balance to the librarian. Now it correctly reports only unpaid fines (and separately exposes lifetime-charged total if ever needed).
- **Added a "Process return" button** in the same member-detail modal, next to each currently-borrowed book, so a librarian can process a return right from a member's profile — not just from the student's own My Loans page.
- **Fixed a silent data-loss bug**: the "Add a book" form had a Branch field that was collected but never actually sent to the backend — every book saved with the default branch regardless of what was typed. Now included in the payload.

## ⚠️ About "verified working" — please read

I fixed and traced every flow above at the code level (request → route → model → response,
matched against what the frontend actually calls), but **I could not run this application
end-to-end in my own environment** — the sandbox I work in has no network access, so `npm
install` fails immediately (`403 Forbidden` from the npm registry) and there's no way to start
a real MongoDB-backed server here to click through it myself. Every fix above was verified by:
reading the exact request the frontend sends, matching it against the exact route/model logic
on the backend, and syntax-checking every changed file (`node --check`) — not by literally
running the app and clicking buttons. Please run it locally (see Setup below) and tell me
specifically what breaks, if anything — that's the fastest way to catch anything a pure code
read can't (e.g. a typo only Mongo itself would reject, or an env var you haven't set).

## 🔒 What's still not included

Being upfront about the remaining gap from the original wishlist:
- Offline **data** browsing (the PWA caches the app shell, not the book catalog itself)
- Deep learning / embedding-based recommendations (current one is collaborative co-borrow + category fallback, no trained ML model)
- Book cover lookups only succeed for titles that actually exist in Open Library — most of the 50,000+ synthetically-generated catalog entries will show the designed fallback cover instead of a real photo, which is expected given the scale needed for a course project


## 📁 What's in this project

```
LibraryMS/
├── docs/
│   ├── LibraryMS_Requirement_Analysis.docx   ← full requirement doc (15 sections)
│   └── build_doc.js                          ← regenerates the .docx above
├── backend/
│   ├── server.js                             ← Express app entry point
│   ├── config/
│   │   ├── db.js                             ← MongoDB connection
│   │   └── mailer.js                         ← Nodemailer (Gmail SMTP) + email templates
│   ├── models/                               ← Book, User, Transaction, Room, RoomBooking,
│   │                                            BookSuggestion, Notification, Announcement, AuditLog
│   ├── routes/                                ← one file per feature area: auth, books, users,
│   │                                            transactions, reports, rooms, suggestions,
│   │                                            notifications, announcements, contact
│   ├── middleware/                           ← JWT auth/role guards, centralized error handler
│   ├── utils/                                ← validators, CSV/PDF writers, audit logger,
│   │                                            notification helper, Open Library cover lookup
│   ├── scripts/
│   │   ├── seedBooks.js                      ← generates 50,000+ books into MongoDB
│   │   ├── seedRooms.js                      ← creates default study rooms
│   │   ├── sendReminders.js                  ← due-date & fine emails (run manually or schedule)
│   │   └── weeklyDigest.js                   ← new-arrivals/trending email digest
│   └── tests/                                ← 15 unit tests (`npm test`)
└── frontend/
    ├── index.html                            ← the whole app (all views live here)
    ├── app.js                                ← all app logic
    ├── style.css
    ├── i18n.js                               ← English/Bangla dictionary
    ├── manifest.json / service-worker.js     ← PWA install + offline app shell
    ├── icons/                                ← app icons for PWA install
    ├── verify.html                           ← landing page for the emailed verification link
    ├── reset-password.html                   ← landing page for the emailed reset link
    └── api-config.js                          ← frontend API endpoint configuration
```

## 🚀 How to run it

### 1. Install MongoDB

Two options:

**Option A — MongoDB Atlas (cloud, free, easiest):**
1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account
2. Create a free (M0) cluster
3. Get your connection string (looks like `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/libraryms`)

**Option B — Local MongoDB:**
Install MongoDB Community Server on your machine: https://www.mongodb.com/try/download/community

### 2. Configure environment

```bash
cd backend
cp .env.example .env
# edit .env and paste your MONGO_URI
```

**To let people register as Librarian (important — do this before your demo):**
1. In `.env`, set `LIBRARIAN_SIGNUP_CODE` to any secret phrase, e.g. `LIBRARIAN_SIGNUP_CODE=seu-lib-2026`
2. Share this code privately (in person, or however you like) with whoever should get a Librarian account — during registration they pick "Librarian" and must enter this exact code, or the request is rejected
3. Leave it blank to disable Librarian self-registration entirely — you can still promote a student to Librarian or Admin later by calling `PATCH /api/users/:id/role` as an existing admin
4. There is no way to self-register as Admin at all, by design — promote someone via that same role-change route, or set it directly in the database

**To enable real emails (verification, password reset, due-date reminders):**
1. Turn on 2-Step Verification on your Gmail account: https://myaccount.google.com/security
2. Go to https://myaccount.google.com/apppasswords and create an app password for "Mail"
3. In `.env`, set:
   ```
   EMAIL_USER=youraddress@gmail.com
   EMAIL_PASS=<the 16-character app password, not your real Gmail password>
   APP_URL=http://localhost:3000
   ```
4. If you skip this, the app still works — it just logs a warning and skips sending the email instead of failing.

**About book cover images:** the app automatically looks up a real cover for each book via the free Open Library API the first time it's viewed, and caches the result so it's instant after that. Since most of the 50,000+ catalog entries are synthetically generated for course-project scale (not real published books), many won't have a real match — those fall back to a colorful cover with the book's initials, which is expected and by design, not a bug.

**To send due-date reminders and fine notices**, run this whenever you like (or schedule it — e.g. a free cron service like cron-job.org calling a small wrapper endpoint once a day):
```bash
node scripts/sendReminders.js
```

**To send the weekly new-arrivals/trending digest** to verified students:
```bash
node scripts/weeklyDigest.js
```

### Running tests

```bash
cd backend
npm test
```

Runs 15 unit tests covering input validation, CSV export, and the seed-data generator — no live database needed. For everything that does need a live database, real email, or a camera (2FA, QR scanning, borrow/return flows), see `TESTING.md` for a manual checklist to run through before a demo.

### 3. Install dependencies & seed the database

```bash
npm install
npm run seed
npm run seed:rooms
```

This inserts **50,000+ book records** across 30 categories (Computer Science, Engineering, Literature, Law, Medical, Fiction, etc.), spread across two branches (Main Campus, City Campus) — takes 1–3 minutes. `seed:rooms` adds five default study rooms so the Rooms tab has something to book.

### 4. Start the backend

```bash
npm start
```

Server runs at `http://localhost:5000`.

### 5. Open the frontend

**On your computer:** just open `frontend/index.html` in a browser (double-click it, or serve it with any static server). It talks to `http://localhost:5000` by default.

**On your phone (or any other device):**
1. Make sure your phone and computer are on the **same Wi-Fi**.
2. Find your computer's local IP address:
   - Windows: `ipconfig` → look for "IPv4 Address" (e.g. `192.168.0.12`)
   - Mac/Linux: `ifconfig` or `ip a` → look for something like `192.168.0.12`
3. Serve the frontend folder instead of opening the file directly, so your phone can reach it too:
   ```bash
   cd frontend
   npx serve -l 3000
   ```
4. On your phone's browser, go to `http://<your-computer-ip>:3000` (e.g. `http://192.168.0.12:3000`).
5. Open `http://<your-computer-ip>:5000` instead (the Express server serves the app and the API together, so nothing else needs configuring).

That's it — the same app now works identically on your phone.

**Want it reachable from anywhere (not just home Wi-Fi)?** Use the production setup below: Netlify hosts the frontend **and** the backend (as a Netlify Function), and MongoDB Atlas stores the data.

### 6. Create your first account

Open the app, tap **Log in → Register**, and create a Librarian account first (so you can add books and see the dashboard). Create a Student account separately to test borrowing.

## 🌍 Deploy it live (Netlify does everything)

Netlify serves the `frontend/` folder and runs the whole Express API as one Netlify Function (`netlify/functions/api.js`). Every `/api/*` request is routed to it, so login, register, books, loans, rooms and the admin dashboard all work from a single address. There is no separate backend host to run.

**Full step-by-step guide: see [`DEPLOY_NETLIFY.md`](DEPLOY_NETLIFY.md).** In short:

1. Push this project to GitHub (never commit `backend/.env`).
2. MongoDB Atlas -> Network Access -> allow `0.0.0.0/0`.
3. Netlify -> Add new site -> Import from GitHub (build command empty; `netlify.toml` does the rest).
4. Netlify -> Environment variables: `MONGO_URI`, `JWT_SECRET` (32+ random characters), `APP_URL` (your Netlify URL), `EMAIL_VERIFICATION_ENABLED=false`.
5. Deploy, then open `/api/health` - it should say `"database":"connected"`.
6. Seed the catalog once from your computer (`cd backend && npm run seed && npm run seed:rooms`) if the database is still empty.


## 📚 Book categories included (30 total)

Computer Science, Engineering, Mathematics, Physics, Chemistry, Biology, Business & Economics, Law, Medical & Pharmacy, English Literature, Bangla Literature, History, Philosophy, Religion & Theology, Psychology, Sociology, Political Science, Fiction, Science Fiction & Fantasy, Biography & Memoir, Self-Help, Art & Design, Architecture, Environmental Science, Journalism & Media, Poetry, Children's Books, Reference & Encyclopedia, Textbook, Thesis & Research Paper.

## 🔌 API Endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create a Student or Librarian account (sends verification email) |
| POST | `/api/auth/login` | — | Log in, get a JWT |
| POST | `/api/auth/verify-email` | — | Verify email using the token from the emailed link |
| POST | `/api/auth/resend-verification` | — | Resend the verification email |
| POST | `/api/auth/forgot-password` | — | Request a password reset link by email |
| POST | `/api/auth/reset-password` | — | Set a new password using the emailed token |
| GET | `/api/auth/me` | Bearer token | Get current logged-in user |
| POST | `/api/auth/2fa/setup` | Logged in | Generate a 2FA secret + QR code |
| POST | `/api/auth/2fa/confirm` | Logged in | Confirm the 6-digit code and enable 2FA |
| POST | `/api/auth/2fa/disable` | Logged in | Turn off 2FA |
| GET | `/api/books/search?q=&category=&branch=&page=` | — | FR-01: Search books |
| GET | `/api/books/suggest?q=` | — | Search-as-you-type suggestions |
| GET | `/api/books/branches` | — | List all branches (multi-branch support) |
| GET | `/api/books/export/csv` | Librarian/Admin | Export the full catalog as CSV |
| GET | `/api/books/export/pdf` | Librarian/Admin | Export the full catalog as PDF |
| POST | `/api/books` | Librarian/Admin | FR-05: Add a book |
| POST | `/api/books/bulk-import` | Librarian/Admin | FR-12: Bulk import books from CSV |
| GET | `/api/books/:id/similar` | — | Recommendation: co-borrowed books, category fallback |
| GET | `/api/books/:id/qrcode` | — | QR code (PNG data URL) encoding the book's ID |
| GET | `/api/books/:id/cover` | — | Real cover image lookup (Open Library), cached |
| POST | `/api/books/covers/batch` | — | Batch cover lookup for a page of results |
| DELETE | `/api/books/:id` | Librarian/Admin | FR-05: Remove a book |
| POST | `/api/transactions/borrow` | Logged in | FR-02: Borrow a book |
| POST | `/api/transactions/return` | Logged in | FR-03: Return a book (emails next reservation holder) |
| POST | `/api/transactions/reserve` | Logged in | FR-10: Reserve an unavailable book |
| POST | `/api/transactions/reserve/:id/cancel` | Logged in | Cancel a reservation |
| POST | `/api/transactions/:id/renew` | Logged in | Renew a loan (once, if not reserved by someone else) |
| POST | `/api/transactions/:id/report-lost` | Logged in | Report a borrowed book lost (charges replacement fee) |
| PATCH | `/api/transactions/:id/mark-paid` | Librarian/Admin | Mark a fine as paid (clears the fine cap) |
| POST | `/api/transactions/:id/review` | Logged in | FR-11: Rate & review a returned book |
| GET | `/api/transactions/my-history` | Logged in | My Loans list (includes reservation queue position) |
| GET | `/api/payments/my-balance` | Logged in | Current unpaid fine balance and bKash availability |
| POST | `/api/payments/requests` | Logged in | Request desk payment for all outstanding fines |
| GET | `/api/payments/requests/pending` | Librarian/Admin | List pending desk-payment requests |
| PATCH | `/api/payments/requests/:id/approve` | Librarian/Admin | Receive and record a requested desk payment |
| POST | `/api/payments/bkash/start` | Logged in | Start a bKash payment |
| POST | `/api/payments/bkash/execute` | Logged in | Confirm a completed bKash payment |
| GET | `/api/users` | Librarian/Admin | FR-06: List/search members |
| GET | `/api/users/:id/detail` | Librarian/Admin | Full borrow history for one member |
| PATCH | `/api/users/:id/status` | Librarian/Admin | FR-06: Activate/deactivate a member |
| PATCH | `/api/users/:id/role` | Admin only | Change a member's role — the only way to grant Admin |
| GET | `/api/users/me/profile` / PUT | Logged in | View/update your own profile |
| GET | `/api/reports/inventory` | Librarian/Admin | FR-07: Inventory report |
| GET | `/api/reports/borrowed` | Librarian/Admin | FR-07: Currently borrowed report |
| GET | `/api/reports/fines` | Librarian/Admin | FR-07: Fines report |
| GET | `/api/reports/fines/export` | Librarian/Admin | Export fines as CSV |
| GET | `/api/reports/fines/export-pdf` | Librarian/Admin | Export fines as PDF |
| GET | `/api/reports/inventory/export-pdf` | Librarian/Admin | Export inventory summary as PDF |
| GET | `/api/reports/analytics` | Librarian/Admin | Most-borrowed, category demand, top readers |
| GET | `/api/reports/audit-log` | Librarian/Admin | Activity trail of catalog/member changes |
| GET | `/api/reports/trending` | — | Most-borrowed books this week (home page) |
| GET | `/api/books/new-arrivals` | — | Most recently added books (home page) |
| GET / POST | `/api/rooms` | — / Librarian | List rooms / add a room |
| GET | `/api/rooms/:id/availability?date=` | — | Which hourly slots are free on a given date |
| POST | `/api/rooms/:id/book` | Logged in | Book an hourly study room slot |
| GET | `/api/rooms/bookings/mine` | Logged in | Your upcoming room bookings |
| POST | `/api/rooms/bookings/:id/cancel` | Logged in | Cancel a room booking |
| POST | `/api/suggestions` | Logged in | Suggest a book that's missing from the catalog |
| GET | `/api/suggestions/mine` | Logged in | Your own suggestions and their status |
| GET | `/api/suggestions?status=` | Librarian/Admin | All suggestions, optionally filtered |
| PATCH | `/api/suggestions/:id` | Librarian/Admin | Approve/reject a suggestion |
| GET | `/api/notifications` | Logged in | Your notifications + unread count |
| PATCH | `/api/notifications/:id/read` | Logged in | Mark one notification as read |
| POST | `/api/notifications/read-all` | Logged in | Mark all notifications as read |
| GET | `/api/announcements` | — | Active announcements (home page banner) |
| POST | `/api/announcements` | Librarian/Admin | Post a new announcement |
| GET | `/api/announcements/all` | Librarian/Admin | All announcements (including inactive) |
| DELETE | `/api/announcements/:id` | Librarian/Admin | Take an announcement down |
| POST | `/api/contact` | — | Ask a librarian — emails all active librarians |

Protected routes expect `Authorization: Bearer <token>` — the frontend handles this automatically once you're logged in.

## 📄 Included sample data

`sample_books_510.csv` — a 510-row sample export (17 books × 30 categories) so you can preview the data shape without running the full seed.
