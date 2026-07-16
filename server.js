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
const USERS_PATH = path.join(ROOT, 'data', 'users.json');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes
const COOKIE_NAME = 'tnt_session';
const IS_PROD = process.env.NODE_ENV === 'production';
const SALT_ROUNDS = 12;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const DEFAULT_ROLE = 'viewer';

/** @type {Map<string, { userId: string, username: string, displayName: string, role: string, expires: number }>} */
const sessions = new Map();

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
  fs.writeFileSync(USERS_PATH, JSON.stringify({ users }, null, 2), 'utf8');
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
    username: user.username,
    displayName: user.displayName,
    role: user.role,
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
  // Sliding expiry
  s.expires = Date.now() + SESSION_TTL_MS;
  return { id, ...s };
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

function injectIntoHtml(html, user) {
  const userJson = JSON.stringify({
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  }).replace(/</g, '\\u003c');

  const inject = [
    '<link rel="icon" type="image/png" href="/images/tnt-logo-round.png">',
    '<link rel="apple-touch-icon" href="/images/tnt-logo-round.png">',
    '<link rel="stylesheet" href="/enhancements/app-ux.css">',
    `<script>window.__TNT_USER__=${userJson};</script>`,
    '<script src="/enhancements/app-patches.js" defer></script>',
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
app.use('/auth', express.static(path.join(ROOT, 'public', 'auth'), { maxAge: '1h' }));
app.use('/enhancements', express.static(path.join(ROOT, 'public', 'enhancements'), { maxAge: '1h' }));
app.use('/images', express.static(path.join(ROOT, 'public', 'images'), { maxAge: '1h' }));

app.get('/login', (req, res) => {
  if (getSession(req)) return res.redirect('/');
  res.sendFile(path.join(ROOT, 'public', 'auth', 'login.html'));
});

app.get('/register', (req, res) => {
  if (getSession(req)) return res.redirect('/');
  res.sendFile(path.join(ROOT, 'public', 'auth', 'register.html'));
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

    const { users, user } = findUser(username);
    // Valid bcrypt hash used only when the username is unknown (timing parity)
    const dummyHash = '$2a$12$/j5FIC65lNLKtab9Q2/5yOBcure3S9t/NS9zRIDMBi6sJDPR/V2ZK';

    // Constant-time-ish path: always hash even if user missing
    const hash = user?.passwordHash || dummyHash;
    const match = await bcrypt.compare(password, hash);

    if (!user || !match) {
      if (user) {
        user.failedAttempts = (user.failedAttempts || 0) + 1;
        if (user.failedAttempts >= MAX_FAILED) {
          user.lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
          user.failedAttempts = 0;
        }
        saveUsers(users);
      }
      return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const mins = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000);
      return res.status(423).json({
        ok: false,
        error: `Account temporarily locked. Try again in about ${mins} minute(s).`,
      });
    }

    user.failedAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date().toISOString();
    saveUsers(users);

    const sessionId = createSession(user);
    setSessionCookie(res, sessionId);

    return res.json({
      ok: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
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

    const users = loadUsers();
    if (users.some((u) => u.username === username)) {
      return res.status(409).json({ ok: false, error: 'That username is already taken.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = {
      id: uuidv4(),
      username,
      displayName,
      role: DEFAULT_ROLE,
      passwordHash,
      createdAt: new Date().toISOString(),
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date().toISOString(),
    };

    users.push(user);
    saveUsers(users);

    const sessionId = createSession(user);
    setSessionCookie(res, sessionId);

    return res.status(201).json({
      ok: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ ok: false, error: 'Server error while creating account.' });
  }
});

app.post('/api/change-password', requireAuth, async (req, res) => {
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

    const { users, user } = findUser(req.session.username);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Account not found.' });
    }

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Current password is incorrect.' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.passwordChangedAt = new Date().toISOString();
    saveUsers(users);

    return res.json({ ok: true, message: 'Password updated.' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ ok: false, error: 'Server error while updating password.' });
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

async function start() {
  const store = await ensureUsersFile();
  if (store.created) {
    console.log(`  Initialized ${store.count} demo users → ${store.path}`);
  }

  app.listen(PORT, () => {
    console.log('');
    console.log('  TNT Maritime Intelligence');
    console.log(`  → http://localhost:${PORT}`);
    console.log('  Login or create an account at /login and /register');
    console.log('  Demo users: admin, analyst, viewer, ops');
    console.log('');
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
