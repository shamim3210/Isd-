# Deploy LibraryMS on Netlify (frontend + backend together)

Netlify serves `frontend/` and runs the Express API (`backend/`) as one Netlify
Function (`netlify/functions/api.js`). Every `/api/*` call is rewritten to that
function, so there is no separate backend host, no CORS setup and no sleeping server.
The database stays on MongoDB Atlas.

## 1. MongoDB Atlas
- Network Access -> Add IP Address -> **Allow access from anywhere (0.0.0.0/0)**.
  (Netlify functions have no fixed IP.)
- Copy the connection string (`mongodb+srv://...`) and put your database name in it.

## 2. Netlify site
Deploy from GitHub (Add new site -> Import an existing project). Functions are not
deployed by drag-and-drop. Leave the build command empty; `netlify.toml` already sets
`publish = frontend` and `functions = netlify/functions`.

## 3. Environment variables
Site configuration -> Environment variables:

| Name | Value |
|------|-------|
| `MONGO_URI` | your Atlas connection string |
| `JWT_SECRET` | random, **32+ characters** (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `APP_URL` | your Netlify URL, e.g. `https://your-site.netlify.app` (no trailing slash) |
| `EMAIL_VERIFICATION_ENABLED` | `false` (unless Gmail SMTP is set up) |
| `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | optional, for password-reset / notification emails |
| `BKASH_*` | optional, for online fine payment |

Then **Deploys -> Trigger deploy -> Clear cache and deploy site**.

## 4. Check it
- Open `https://your-site.netlify.app/api/health` -> should show `"database":"connected"`.
- Seed data once from your own computer (Atlas URI in `backend/.env`):
  `cd backend && npm install && npm run seed && npm run seed:rooms`
- Register a Student / Librarian on the site and log in.

## Limits to know
- Netlify functions time out at 10 s and can return at most ~6 MB per response
  (a full 50k-book CSV/PDF export can exceed this).
- Free-tier function calls are metered (125k requests/month on the legacy free plan).
