# LibraryMS — Manual Testing Checklist

Automated tests (`npm test` in `/backend`) cover pure logic — validators, CSV
export, and the seed-data generator. Everything that touches a live database
or a real inbox needs a manual pass. Use this checklist before a demo or
submission.

## Setup
- [ ] `npm install` succeeds in `/backend` with no errors
- [ ] `npm run seed` populates 30,000+ books across 30 categories
- [ ] `npm start` boots the server without crashing
- [ ] Frontend loads at `index.html` and shows the home page with live stats

## Registration & Auth (as Student)
- [ ] Register with a valid email/password → account created, verification email sent (or a console warning if EMAIL_USER isn't set)
- [ ] Register with an already-used email → clear error, no duplicate created
- [ ] Register with a weak password (< 6 chars) → rejected with a clear message
- [ ] Log in with correct credentials → succeeds
- [ ] Log in with wrong password → "Invalid email or password", no hint about which part is wrong
- [ ] Verification banner appears until the account is verified
- [ ] Click "Resend verification email" → new email sent
- [ ] Click the emailed verification link → `verify.html` confirms and banner disappears on next login
- [ ] "Forgot password" → enter email → reset email sent
- [ ] Click the emailed reset link → `reset-password.html` lets you set a new password
- [ ] Log in with the new password → succeeds; old password no longer works

## Registration & Auth (as Librarian)
- [ ] Selecting "Librarian" in the register form reveals the access code field
- [ ] Submitting with the wrong (or blank) code is rejected with "Invalid librarian access code."
- [ ] Submitting with the correct code (matching `LIBRARIAN_SIGNUP_CODE` in `.env`) succeeds → Admin tab appears in navigation
- [ ] If `LIBRARIAN_SIGNUP_CODE` isn't set in `.env` at all, librarian registration is rejected regardless of what code is entered
- [ ] There is no way to select "Admin" anywhere in the registration UI, and posting `role: "admin"` directly to `/api/auth/register` still creates a student account
- [ ] `PATCH /api/users/:id/role` succeeds when called by an admin token, and is rejected (403) when called by a librarian or student token
- [ ] Librarian-only routes (Reports, Members, Analytics, Activity log) are inaccessible to Student accounts (test by hitting the API directly with a student token)

## Two-Factor Authentication
- [ ] Enable 2FA from account settings → QR code shown
- [ ] Scan with an authenticator app (Google Authenticator / Authy) → enter the 6-digit code → 2FA enabled
- [ ] Log out, log back in → prompted for a 2FA code after password
- [ ] Wrong 2FA code → rejected
- [ ] Disable 2FA → next login no longer asks for a code

## Book Search & Browse
- [ ] Searching "algorithms" returns relevant results
- [ ] Category filter narrows results correctly
- [ ] Pagination moves forward/back without errors
- [ ] Empty search + no filter returns the full catalog, paginated
- [ ] Book detail modal shows correct ISBN, shelf location, availability
- [ ] "You might also like" shows relevant suggestions

## Borrow / Return / Reserve
- [ ] Borrowing an available book decreases its available copies by 1
- [ ] Borrowed book appears in My Loans with the correct due date
- [ ] Returning a book on time shows no fine
- [ ] Returning a book late calculates the correct fine (৳5/day in the current config)
- [ ] Reserving an unavailable book succeeds; reserving twice is blocked
- [ ] Returning a book that has a pending reservation emails the reservation holder
- [ ] My Loans shows a reserved book's live queue position ("#2 in line")
- [ ] Cancelling a reservation removes it from My Loans
- [ ] Renewing a loan once succeeds and pushes the due date back
- [ ] Renewing a second time is blocked
- [ ] Renewing is blocked if another student has reserved the same book
- [ ] Reporting a book lost charges the replacement fee, marks the loan "lost", and removes one copy from the book's total
- [ ] Once unpaid fines reach ৳100, borrowing a new book is blocked with a clear message
- [ ] A librarian marking a fine "paid" lifts that block on the next borrow attempt

## Study Rooms
- [ ] Room list loads with correct names/capacities
- [ ] Picking a date shows an hourly slot grid; already-booked hours are visibly disabled
- [ ] Booking a free slot succeeds and appears under "My bookings"
- [ ] Booking an already-taken slot is rejected
- [ ] Cancelling a booking frees the slot back up
- [ ] Librarian can add a new room from Admin → Rooms and it appears in the room selector immediately

## Book Suggestions
- [ ] Submitting a suggestion from My Loans appears under "Your suggestions" as Pending
- [ ] Librarian sees it under Admin → Suggestions with the student's name and reason
- [ ] Approving/rejecting updates the status the student sees

## Notifications & Announcements
- [ ] The bell icon shows an unread count badge that matches actual unread notifications
- [ ] Clicking a notification marks it read and the badge count drops
- [ ] "Mark all read" clears the badge entirely
- [ ] A librarian's posted announcement appears as a banner on the home page for all users
- [ ] "Take down" removes an announcement from the home page immediately

## Ask a Librarian
- [ ] Submitting the contact form (logged out) sends an email to every active librarian
- [ ] Logged-in users have their name/email pre-filled in the form

## Librarian Dashboard
- [ ] Reports tab shows correct total titles / copies / currently-borrowed / fines
- [ ] Export CSV (catalog and fines) downloads a valid, correctly-formatted file
- [ ] Export PDF (catalog, fines, inventory) downloads a readable PDF
- [ ] Add a book → appears immediately in search
- [ ] Bulk CSV import → correct count of books inserted, catalog updated
- [ ] Members list search works by name/email/student ID
- [ ] Clicking a member shows their correct borrow history and fines
- [ ] Deactivating a member blocks their next login attempt
- [ ] Analytics charts reflect actual borrow data (spot-check one number against the database)
- [ ] Activity log shows an entry for every add/edit/delete/deactivate action taken during this session

## QR Codes
- [ ] Book detail modal shows a scannable QR code
- [ ] Scanning it with the in-app scanner (Admin → Scan) correctly identifies the book
- [ ] Scan-to-borrow / scan-to-return completes the transaction

## Book Covers & Home Page
- [ ] Browse and book-detail pages show a designed placeholder cover (gradient + spine) while a real cover loads
- [ ] Real, well-known titles (e.g. "Introduction to Algorithms") upgrade to an actual cover image once Open Library returns a match
- [ ] Home page "New Arrivals" reflects the most recently added books
- [ ] Home page "Trending this week" reflects real borrow activity from the past 7 days

## Responsive / Cross-Device
- [ ] Layout looks correct at mobile width (< 480px) — bottom nav appears, top nav hides
- [ ] Layout looks correct at tablet and desktop widths
- [ ] All modals are usable (not clipped) on a small screen
- [ ] Dark mode toggle persists across reloads

## Accessibility
- [ ] Tab key can reach every interactive element in a logical order
- [ ] Focus outline is visible on buttons/inputs when tabbing
- [ ] Skip-to-content link appears on first Tab press and works
- [ ] Screen reader announces toast messages and status text (test with VoiceOver/NVDA if available)

## Language Toggle
- [ ] Switching to Bangla updates all static UI labels
- [ ] Switching back to English restores original labels
- [ ] Preference persists across page reloads

## Emails (requires EMAIL_USER/EMAIL_PASS configured)
- [ ] Verification email arrives and link works
- [ ] Reset email arrives and link works
- [ ] `node scripts/sendReminders.js` sends due-date and fine emails to the right people
- [ ] `node scripts/weeklyDigest.js` sends a sensible digest (or logs "nothing new" when there's no new activity)

## Deployment (if applicable)
- [ ] `/api/health` on the Netlify site shows `"database":"connected"`
- [ ] Frontend loads at its Netlify URL and successfully points at the backend
- [ ] A fresh browser (no localStorage) can register, verify, and log in against the deployed backend
