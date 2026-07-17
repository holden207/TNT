# TNT Global Maritime Intelligence

Secured multi-user portal for the existing TNT corridor intelligence app.

**The original `index.html` file is never modified.** Authentication, UX polish, and bug fixes are applied by the Node server at request time.

## Quick start

```bash
npm run setup
npm start
```

Open [http://localhost:3847](http://localhost:3847) and sign in.

## Initial administrator

A fresh installation creates one bootstrap account:

- Username: `admin`
- Temporary password: `Admin@TNT2026!`

The bootstrap password is known and is accepted only to start a restricted session. The administrator must replace it at `/change-password` before the dashboard or user-management API can be used. Passwords are stored as bcrypt hashes in `data/users.json`.

Existing installations migrate legacy seeded accounts to active status and require those accounts to replace their known passwords.

## Access approval

1. A prospective user submits `/register`.
2. The account is stored as `pending`; registration does not sign the user in.
3. An administrator opens `/admin/users`, assigns a role, and approves the request.
4. Pending and disabled accounts cannot sign in.
5. Role, status, and password-reset changes revoke the affected user’s existing sessions immediately.

Only active administrators can call the user-management API. Administrators cannot change their own role or disable themselves, and the system protects the last active administrator.

Roles:

- `viewer`: Corridors, Analytics, and Multi-Port browsing.
- `analyst`: viewer capabilities plus Report Builder, CSV export, and application print controls.
- `admin`: analyst capabilities plus account approval and role management.

## What was added (without changing `index.html`)

1. **Secure login** — Express session cookies (`httpOnly`), bcrypt password verification, rate-limited login, account lockout after failed attempts.
2. **Administrator-controlled users** — New accounts remain pending until an administrator approves them and assigns a role.
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
- The JSON user store and in-memory sessions are intended for a single Node process. Use a database and shared session store before running multiple application instances.
- Report/export/print restrictions are interface controls because the full corridor dataset is delivered to authenticated browsers. Account approval and role assignment are enforced server-side.

## Tests

Run `npm test` to verify pending registration, administrator-only APIs, approval, role updates, account disabling, forced password replacement, session revocation, sanitized responses, and same-origin mutation checks.
