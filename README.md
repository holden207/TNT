# TNT Global Maritime Intelligence

Secured multi-user portal for the existing TNT corridor intelligence app.

**The original `index.html` file is never modified.** Authentication, UX polish, and bug fixes are applied by the Node server at request time.

## Quick start

```bash
npm run setup
npm start
```

Open [http://localhost:3847](http://localhost:3847) and sign in.

## Default accounts

| Username  | Password          | Role    |
|-----------|-------------------|---------|
| `admin`   | `Admin@TNT2026!`  | admin   |
| `analyst` | `Analyst@TNT2026!`| analyst |
| `viewer`  | `Viewer@TNT2026!` | viewer  |
| `ops`     | `Ops@TNT2026!`    | analyst |

Passwords are stored as **bcrypt** hashes in `data/users.json` (created by `npm run seed`). Change them before any shared or production use.

## What was added (without changing `index.html`)

1. **Secure login** — Express session cookies (`httpOnly`), bcrypt password verification, rate-limited login, account lockout after failed attempts.
2. **Multiple users** — Distinct credentials and roles (see table above). Add more users by editing the seed script and re-running `npm run seed`, or by appending hashed entries to `data/users.json`.
3. **Runtime functionality fixes** — Injected `app-patches.js` repairs report-tab switching (`gr(DIM)` dead reference), table sort event handling, and report TNT filter dash normalization.
4. **UX layer** — Injected `app-ux.css` plus session bar with display name, role, and sign-out; keyboard shortcuts (`/` focus search, `Esc` close detail); focus-visible styles; responsive tweaks.

## Project layout

```
index.html                 ← original app (unchanged)
server.js                  ← auth gateway + HTML injection
package.json
scripts/seed-users.js
data/users.json            ← generated; keep private
public/auth/               ← login page
public/enhancements/       ← CSS/JS layered onto the app
```

## Security notes

- Serve over HTTPS in production (`NODE_ENV=production` enables the `Secure` cookie flag).
- Do not expose `data/users.json` or commit plaintext passwords.
- Sessions live in memory (8-hour sliding TTL). Restarting the server signs everyone out.
