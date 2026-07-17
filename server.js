'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const { ensureUsersFile } = require('./scripts/seed-users');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3847;
const USERS_PATH = process.env.TNT_USERS_PATH
  ? path.resolve(process.env.TNT_USERS_PATH)
  : path.join(ROOT, 'data', 'users.json');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes
const COOKIE_NAME = 'tnt_session';
const IS_PROD = process.env.NODE_ENV === 'production';
const SALT_ROUNDS = 12;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const DEFAULT_ROLE = 'viewer';
const VALID_ROLES = new Set(['viewer', 'analyst', 'admin']);
const VALID_STATUSES = new Set(['pending', 'active', 'disabled']);
const LEGACY_SEED_USERS = new Set(['admin', 'analyst', 'viewer', 'ops']);
const PKG = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  } catch (_) {
    return { version: '0.0.0' };
  }
})();

/** Content-hash asset version — busts CDN/browser caches after every deploy. */
function fileFingerprint(relPath) {
  try {
    const buf = fs.readFileSync(path.join(ROOT, relPath));
    return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  } catch (_) {
    return '0';
  }
}

const DEPLOY_REV =
  process.env.RENDER_GIT_COMMIT ||
  process.env.SOURCE_VERSION ||
  process.env.GIT_COMMIT ||
  '';

const ASSET_VERSION = [
  PKG.version || '0',
  fileFingerprint('public/enhancements/dashboard-shell.css'),
  fileFingerprint('public/enhancements/app-patches.js'),
  fileFingerprint('public/enhancements/app-ux.css'),
  DEPLOY_REV.slice(0, 7),
]
  .filter(Boolean)
  .join('.')
  .replace(/[^a-zA-Z0-9._-]/g, '');

function assetUrl(pathname) {
  return `${pathname}?v=${encodeURIComponent(ASSET_VERSION)}`;
}

/** @type {Map<string, { userId: string, authVersion: number, expires: number }>} */
const sessions = new Map();
let userMutationQueue = Promise.resolve();

function loadUsers() {
  if (!fs.existsSync(USERS_PATH)) {
    throw new Error('User store is not initialized. Restart the server or run: npm run seed');
  }
  const raw = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
  if (!Array.isArray(raw.users)) {
    throw new Error('User store is corrupt (missing users array).');
  }
  return raw.users;
}

function saveUsers(users) {
  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${USERS_PATH}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ users }, null, 2), 'utf8');
  fs.renameSync(tmp, USERS_PATH);
}

function mutateUsers(mutator) {
  const run = userMutationQueue.then(async () => {
    const users = loadUsers();
    const result = await mutator(users);
    saveUsers(users);
    return result;
  });
  userMutationQueue = run.catch(() => {});
  return run;
}

function findUser(username) {
  const users = loadUsers();
  const u = users.find((x) => x.username === String(username).toLowerCase().trim());
  return { users, user: u || null };
}

function normalizeUsername(raw) {
  return String(raw || '').toLowerCase().trim();
}

function validateUsername(username) {
  if (!username) return 'Username is required.';
  if (!USERNAME_RE.test(username)) {
    return 'Username must be 3–32 characters: letters, numbers, dots, hyphens, or underscores.';
  }
  return null;
}

function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password is too long.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}

function validateDisplayName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'Display name is required.';
  if (trimmed.length > 64) return 'Display name must be 64 characters or fewer.';
  return null;
}

function capabilitiesFor(role) {
  return {
    browse: true,
    report: role === 'analyst' || role === 'admin',
    export: role === 'analyst' || role === 'admin',
    print: role === 'analyst' || role === 'admin',
    manageUsers: role === 'admin',
  };
}

async function migrateExistingUsers() {
  return mutateUsers((users) => {
    const now = new Date().toISOString();
    users.forEach((user) => {
      if (!VALID_ROLES.has(user.role)) user.role = DEFAULT_ROLE;
      if (!VALID_STATUSES.has(user.status)) user.status = 'active';
      if (!Number.isInteger(user.authVersion) || user.authVersion < 1) user.authVersion = 1;
      if (typeof user.mustChangePassword !== 'boolean') {
        user.mustChangePassword = LEGACY_SEED_USERS.has(user.username);
      }
      if (user.status === 'active' && !user.approvedAt) {
        user.approvedAt = user.createdAt || now;
        user.approvedBy = user.approvedBy || 'system-migration';
      }
    });
  });
}

function setSessionCookie(res, sessionId) {
  res.cookie(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function purgeExpiredSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expires <= now) sessions.delete(id);
  }
}

function createSession(user) {
  purgeExpiredSessions();
  const id = uuidv4() + '.' + crypto.randomBytes(16).toString('hex');
  const record = {
    userId: user.id,
    authVersion: Number(user.authVersion) || 1,
    expires: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(id, record);
  return id;
}

function getSession(req) {
  const id = req.cookies?.[COOKIE_NAME];
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expires <= Date.now()) {
    sessions.delete(id);
    return null;
  }
  let user;
  try {
    user = loadUsers().find((item) => item.id === s.userId);
  } catch (_) {
    sessions.delete(id);
    return null;
  }
  if (
    !user ||
    user.status !== 'active' ||
    (Number(user.authVersion) || 1) !== s.authVersion
  ) {
    sessions.delete(id);
    return null;
  }
  // Sliding expiry
  s.expires = Date.now() + SESSION_TTL_MS;
  return {
    id,
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    mustChangePassword: !!user.mustChangePassword,
    expires: s.expires,
  };
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ ok: false, error: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.session.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Administrator access required.' });
    }
    next();
  });
}

function requireSameOriginJson(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({ ok: false, error: 'JSON request required.' });
  }
  const origin = req.get('origin');
  const expected = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== expected) {
    return res.status(403).json({ ok: false, error: 'Cross-origin request denied.' });
  }
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') {
    return res.status(403).json({ ok: false, error: 'Cross-origin request denied.' });
  }
  next();
}

function invalidateSessionsForUser(userId, exceptId) {
  for (const [id, session] of sessions) {
    if (session.userId === userId && id !== exceptId) sessions.delete(id);
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt || null,
    approvedAt: user.approvedAt || null,
    approvedBy: user.approvedBy || null,
    disabledAt: user.disabledAt || null,
    disabledBy: user.disabledBy || null,
    lastLoginAt: user.lastLoginAt || null,
    mustChangePassword: !!user.mustChangePassword,
  };
}

function injectIntoHtml(html, user) {
  const userJson = JSON.stringify({
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    permissions: capabilitiesFor(user.role),
  }).replace(/</g, '\\u003c');

  const inject = [
    `<meta name="tnt-asset-version" content="${ASSET_VERSION}">`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">',
    '<link rel="icon" type="image/png" href="/images/tnt-logo-round.png">',
    '<link rel="apple-touch-icon" href="/images/tnt-logo-round.png">',
    `<link rel="stylesheet" href="${assetUrl('/enhancements/app-ux.css')}">`,
    `<link rel="stylesheet" href="${assetUrl('/enhancements/dashboard-shell.css')}">`,
    `<script>window.__TNT_USER__=${userJson};window.__TNT_ASSET_VERSION__=${JSON.stringify(ASSET_VERSION)};</script>`,
    `<script src="${assetUrl('/enhancements/app-patches.js')}" defer></script>`,
  ].join('\n');

  if (html.includes('</head>')) {
    return html.replace('</head>', `${inject}\n</head>`);
  }
  return inject + html;
}

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(cookieParser());

// Invalid JSON bodies must return JSON (not Express's HTML "Bad Request")
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ ok: false, error: 'Invalid request body.' });
  }
  return next(err);
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many login attempts. Try again later.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many account creation attempts. Try again later.' },
});

// Public assets for login + enhancements
// Enhancements are versioned via ?v= in HTML; short revalidation avoids stale UI after deploys.
app.use('/auth', express.static(path.join(ROOT, 'public', 'auth'), { maxAge: '1h' }));
app.use(
  '/enhancements',
  express.static(path.join(ROOT, 'public', 'enhancements'), {
    etag: true,
    lastModified: true,
    setHeaders(res) {
      // Prefer revalidation over a sticky 1h cache that can outlive a deploy.
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    },
  })
);
app.use('/images', express.static(path.join(ROOT, 'public', 'images'), { maxAge: '1h' }));

app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    version: PKG.version || null,
    assetVersion: ASSET_VERSION,
    deployRev: DEPLOY_REV || null,
  });
});

app.get('/login', (req, res) => {
  const session = getSession(req);
  if (session) return res.redirect(session.mustChangePassword ? '/change-password' : '/');
  res.sendFile(path.join(ROOT, 'public', 'auth', 'login.html'));
});

app.get('/register', (req, res) => {
  const session = getSession(req);
  if (session) return res.redirect(session.mustChangePassword ? '/change-password' : '/');
  res.sendFile(path.join(ROOT, 'public', 'auth', 'register.html'));
});

app.get('/change-password', requireAuth, (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'auth', 'change-password.html'));
});

app.get('/admin/users', requireAdmin, (req, res) => {
  if (req.session.mustChangePassword) return res.redirect('/change-password');
  res.sendFile(path.join(ROOT, 'public', 'admin', 'users.html'));
});
app.get('/admin/users.css', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'admin', 'users.css'));
});
app.get('/admin/users.js', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'admin', 'users.js'));
});

app.get('/api/session', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ ok: false, authenticated: false });
  res.json({
    ok: true,
    authenticated: true,
    user: {
      username: session.username,
      displayName: session.displayName,
      role: session.role,
      permissions: capabilitiesFor(session.role),
      mustChangePassword: session.mustChangePassword,
    },
  });
});

app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'Username and password are required.' });
    }
    if (username.length > 64 || password.length > 128) {
      return res.status(400).json({ ok: false, error: 'Invalid credentials.' });
    }

    const { user } = findUser(username);
    // Valid bcrypt hash used only when the username is unknown (timing parity)
    const dummyHash = '$2a$12$/j5FIC65lNLKtab9Q2/5yOBcure3S9t/NS9zRIDMBi6sJDPR/V2ZK';

    // Constant-time-ish path: always hash even if user missing
    const hash = user?.passwordHash || dummyHash;
    const match = await bcrypt.compare(password, hash);

    if (!user || !match) {
      if (user) {
        await mutateUsers((users) => {
          const current = users.find((item) => item.id === user.id);
          if (!current) return;
          current.failedAttempts = (current.failedAttempts || 0) + 1;
          if (current.failedAttempts >= MAX_FAILED) {
            current.lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
            current.failedAttempts = 0;
          }
        });
      }
      return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
    }

    const authenticatedUser = await mutateUsers((users) => {
      const current = users.find((item) => item.id === user.id);
      if (!current || current.passwordHash !== hash) {
        const err = new Error('CREDENTIALS_CHANGED');
        err.code = 'CREDENTIALS_CHANGED';
        throw err;
      }
      if (current.status !== 'active') {
        const err = new Error(current?.status === 'pending' ? 'ACCOUNT_PENDING' : 'ACCOUNT_DISABLED');
        err.code = current?.status === 'pending' ? 'ACCOUNT_PENDING' : 'ACCOUNT_DISABLED';
        throw err;
      }
      if (current.lockedUntil && new Date(current.lockedUntil).getTime() > Date.now()) {
        const err = new Error('ACCOUNT_LOCKED');
        err.code = 'ACCOUNT_LOCKED';
        err.minutes = Math.ceil((new Date(current.lockedUntil).getTime() - Date.now()) / 60000);
        throw err;
      }
      current.failedAttempts = 0;
      current.lockedUntil = null;
      current.lastLoginAt = new Date().toISOString();
      return current;
    }).catch((err) => {
      if (err.code === 'ACCOUNT_PENDING') {
        return res.status(403).json({
          ok: false,
          code: err.code,
          error: 'Your access request is awaiting administrator approval.',
        });
      }
      if (err.code === 'ACCOUNT_DISABLED') {
        return res.status(403).json({
          ok: false,
          code: err.code,
          error: 'This account is disabled. Contact an administrator.',
        });
      }
      if (err.code === 'ACCOUNT_LOCKED') {
        return res.status(423).json({
          ok: false,
          code: err.code,
          error: `Account temporarily locked. Try again in about ${err.minutes} minute(s).`,
        });
      }
      if (err.code === 'CREDENTIALS_CHANGED') {
        return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
      }
      throw err;
    });
    if (res.headersSent) return;

    const sessionId = createSession(authenticatedUser);
    setSessionCookie(res, sessionId);

    return res.json({
      ok: true,
      user: {
        username: authenticatedUser.username,
        displayName: authenticatedUser.displayName,
        role: authenticatedUser.role,
        permissions: capabilitiesFor(authenticatedUser.role),
        mustChangePassword: !!authenticatedUser.mustChangePassword,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ ok: false, error: 'Server error during login.' });
  }
});

app.post('/api/register', registerLimiter, async (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const confirmPassword = String(req.body?.confirmPassword || '');
    const displayName = String(req.body?.displayName || '').trim();

    const usernameError = validateUsername(username);
    if (usernameError) return res.status(400).json({ ok: false, error: usernameError });

    const displayError = validateDisplayName(displayName);
    if (displayError) return res.status(400).json({ ok: false, error: displayError });

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ ok: false, error: passwordError });

    if (password !== confirmPassword) {
      return res.status(400).json({ ok: false, error: 'Passwords do not match.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = {
      id: uuidv4(),
      username,
      displayName,
      role: DEFAULT_ROLE,
      status: 'pending',
      passwordHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      approvedAt: null,
      approvedBy: null,
      disabledAt: null,
      disabledBy: null,
      authVersion: 1,
      mustChangePassword: false,
    };

    await mutateUsers((users) => {
      if (users.some((u) => u.username === username)) {
        const err = new Error('USERNAME_EXISTS');
        err.code = 'USERNAME_EXISTS';
        throw err;
      }
      users.push(user);
    });

    return res.status(202).json({
      ok: true,
      pending: true,
      message: 'Access request submitted for administrator approval.',
      user: {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    if (err.code === 'USERNAME_EXISTS') {
      return res.status(409).json({ ok: false, error: 'That username is already taken.' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ ok: false, error: 'Server error while creating account.' });
  }
});

app.post('/api/change-password', requireSameOriginJson, requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!currentPassword) {
      return res.status(400).json({ ok: false, error: 'Current password is required.' });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ ok: false, error: passwordError });

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ ok: false, error: 'New passwords do not match.' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ ok: false, error: 'New password must be different from the current one.' });
    }

    const { user } = findUser(req.session.username);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Account not found.' });
    }

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const updatedUser = await mutateUsers((users) => {
      const current = users.find((item) => item.id === req.session.userId);
      if (!current || current.status !== 'active') {
        const err = new Error('ACCOUNT_NOT_FOUND');
        err.code = 'ACCOUNT_NOT_FOUND';
        throw err;
      }
      if (current.passwordHash !== user.passwordHash) {
        const err = new Error('PASSWORD_CHANGED');
        err.code = 'PASSWORD_CHANGED';
        throw err;
      }
      current.passwordHash = passwordHash;
      current.passwordChangedAt = new Date().toISOString();
      current.updatedAt = current.passwordChangedAt;
      current.mustChangePassword = false;
      current.authVersion = (Number(current.authVersion) || 1) + 1;
      return current;
    });

    invalidateSessionsForUser(updatedUser.id);
    const sessionId = createSession(updatedUser);
    setSessionCookie(res, sessionId);

    return res.json({ ok: true, message: 'Password updated.' });
  } catch (err) {
    if (err.code === 'PASSWORD_CHANGED') {
      return res.status(409).json({ ok: false, error: 'Password changed in another session. Sign in again.' });
    }
    console.error('Change password error:', err);
    return res.status(500).json({ ok: false, error: 'Server error while updating password.' });
  }
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  if (req.session.mustChangePassword) {
    return res.status(403).json({ ok: false, code: 'PASSWORD_CHANGE_REQUIRED', error: 'Change your password first.' });
  }
  const users = loadUsers()
    .map(publicUser)
    .sort((a, b) => {
      const order = { pending: 0, active: 1, disabled: 2 };
      return order[a.status] - order[b.status] || a.username.localeCompare(b.username);
    });
  res.json({ ok: true, users });
});

app.patch('/api/admin/users/:id', requireSameOriginJson, requireAdmin, async (req, res) => {
  try {
    if (req.session.mustChangePassword) {
      return res.status(403).json({ ok: false, code: 'PASSWORD_CHANGE_REQUIRED', error: 'Change your password first.' });
    }
    const allowed = new Set(['role', 'status', 'temporaryPassword']);
    const keys = Object.keys(req.body || {});
    if (!keys.length || keys.some((key) => !allowed.has(key))) {
      return res.status(400).json({ ok: false, error: 'Only role, status, and temporaryPassword may be changed.' });
    }
    const nextRole = req.body.role;
    const nextStatus = req.body.status;
    const temporaryPassword = req.body.temporaryPassword;
    if (nextRole !== undefined && !VALID_ROLES.has(nextRole)) {
      return res.status(400).json({ ok: false, error: 'Invalid role.' });
    }
    if (nextStatus !== undefined && !VALID_STATUSES.has(nextStatus)) {
      return res.status(400).json({ ok: false, error: 'Invalid account status.' });
    }
    if (temporaryPassword !== undefined) {
      const passwordError = validatePassword(String(temporaryPassword));
      if (passwordError) return res.status(400).json({ ok: false, error: passwordError });
    }

    const passwordHash =
      temporaryPassword !== undefined ? await bcrypt.hash(String(temporaryPassword), SALT_ROUNDS) : null;
    const updated = await mutateUsers((users) => {
      const target = users.find((item) => item.id === req.params.id);
      if (!target) {
        const err = new Error('USER_NOT_FOUND');
        err.code = 'USER_NOT_FOUND';
        throw err;
      }

      const role = nextRole === undefined ? target.role : nextRole;
      const status = nextStatus === undefined ? target.status : nextStatus;
      const originalStatus = target.status;
      if (status === 'pending' && originalStatus !== 'pending') {
        const err = new Error('INVALID_STATUS_TRANSITION');
        err.code = 'INVALID_STATUS_TRANSITION';
        throw err;
      }
      const changesOwnAccess =
        target.id === req.session.userId && (role !== target.role || status !== target.status);
      if (changesOwnAccess) {
        const err = new Error('SELF_ACCESS_CHANGE');
        err.code = 'SELF_ACCESS_CHANGE';
        throw err;
      }
      if (target.role === 'admin' && target.status === 'active' && (role !== 'admin' || status !== 'active')) {
        const activeAdmins = users.filter((item) => item.id !== target.id && item.role === 'admin' && item.status === 'active');
        if (!activeAdmins.length) {
          const err = new Error('LAST_ADMIN');
          err.code = 'LAST_ADMIN';
          throw err;
        }
      }

      const now = new Date().toISOString();
      const changed = role !== target.role || status !== target.status || !!passwordHash;
      target.role = role;
      target.status = status;
      if (status === 'active' && originalStatus === 'pending') {
        target.approvedAt = now;
        target.approvedBy = req.session.username;
      }
      if (nextStatus === 'disabled') {
        target.disabledAt = now;
        target.disabledBy = req.session.username;
      } else if (nextStatus === 'active') {
        target.disabledAt = null;
        target.disabledBy = null;
      }
      if (passwordHash) {
        target.passwordHash = passwordHash;
        target.mustChangePassword = true;
        target.passwordChangedAt = now;
      }
      if (changed) {
        target.updatedAt = now;
        target.authVersion = (Number(target.authVersion) || 1) + 1;
      }
      return target;
    });

    invalidateSessionsForUser(updated.id);
    return res.json({ ok: true, user: publicUser(updated) });
  } catch (err) {
    const known = {
      USER_NOT_FOUND: [404, 'User not found.'],
      SELF_ACCESS_CHANGE: [409, 'Ask another administrator to change your own access.'],
      LAST_ADMIN: [409, 'At least one active administrator is required.'],
      INVALID_STATUS_TRANSITION: [409, 'Active or disabled accounts cannot be moved back to pending.'],
    };
    if (known[err.code]) {
      return res.status(known[err.code][0]).json({ ok: false, code: err.code, error: known[err.code][1] });
    }
    console.error('Admin user update error:', err);
    return res.status(500).json({ ok: false, error: 'Server error while updating the user.' });
  }
});

app.post('/api/logout', (req, res) => {
  const id = req.cookies?.[COOKIE_NAME];
  if (id) sessions.delete(id);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// Protected: serve original index.html unchanged on disk, with runtime injections
app.get('/', requireAuth, (req, res) => {
  if (req.session.mustChangePassword) return res.redirect('/change-password');
  const filePath = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(filePath, 'utf8');
  html = injectIntoHtml(html, req.session);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
});

app.get('/index.html', requireAuth, (req, res) => res.redirect('/'));

// Block direct raw file access under root except what we explicitly allow
app.use((req, res, next) => {
  if (req.path === '/index.html' || req.path.endsWith('.json') && req.path.includes('users')) {
    return res.status(403).end();
  }
  next();
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  res.status(404).send('Not found');
});

async function start(options = {}) {
  const listenPort = options.port === undefined ? PORT : options.port;
  const store = await ensureUsersFile();
  await migrateExistingUsers();
  if (store.created && !options.quiet) {
    console.log(`  Initialized bootstrap administrator → ${store.path}`);
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(listenPort, () => {
      if (!options.quiet) {
        const actualPort = server.address().port;
        console.log('');
        console.log('  TNT Maritime Intelligence');
        console.log(`  → http://localhost:${actualPort}`);
        console.log('  Login or request access at /login and /register');
        console.log('  The bootstrap administrator must change its password at first sign-in.');
        console.log('');
      }
      resolve(server);
    });
    server.on('error', reject);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, start, sessions };
