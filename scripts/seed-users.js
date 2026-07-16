'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_PATH = path.join(__dirname, '..', 'data', 'users.json');
const SALT_ROUNDS = 12;

/**
 * Default accounts for local / demo use.
 * Change these passwords immediately in production (edit data/users.json
 * or re-run with --force / edit this script).
 */
const SEED = [
  {
    username: 'admin',
    password: 'Admin@TNT2026!',
    displayName: 'System Administrator',
    role: 'admin',
  },
  {
    username: 'analyst',
    password: 'Analyst@TNT2026!',
    displayName: 'Maritime Analyst',
    role: 'analyst',
  },
  {
    username: 'viewer',
    password: 'Viewer@TNT2026!',
    displayName: 'Read-Only Viewer',
    role: 'viewer',
  },
  {
    username: 'ops',
    password: 'Ops@TNT2026!',
    displayName: 'Operations Lead',
    role: 'analyst',
  },
];

async function buildSeedUsers() {
  const users = [];
  for (const u of SEED) {
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    users.push({
      id: u.username,
      username: u.username.toLowerCase(),
      displayName: u.displayName,
      role: u.role,
      passwordHash,
      createdAt: new Date().toISOString(),
      failedAttempts: 0,
      lockedUntil: null,
    });
  }
  return users;
}

/**
 * Ensure data/users.json exists with at least one user.
 * Safe for Render: creates the file on first boot when gitignored data is absent.
 * Does not overwrite a valid existing store unless force=true.
 */
async function ensureUsersFile({ force = false } = {}) {
  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!force && fs.existsSync(USERS_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
      if (Array.isArray(raw.users) && raw.users.length > 0) {
        return { created: false, path: USERS_PATH, count: raw.users.length };
      }
    } catch (_) {
      // Corrupt file — recreate below.
    }
  }

  const users = await buildSeedUsers();
  fs.writeFileSync(USERS_PATH, JSON.stringify({ users }, null, 2), 'utf8');
  return { created: true, path: USERS_PATH, count: users.length };
}

async function main() {
  const force = process.argv.includes('--force');
  const result = await ensureUsersFile({ force });
  if (result.created) {
    for (const u of SEED) {
      console.log(`  · ${u.username} (${u.role}) — password set`);
    }
    console.log(`\nWrote ${result.count} users → ${result.path}`);
  } else {
    console.log(`Users file already present (${result.count} users) → ${result.path}`);
    console.log('Pass --force to overwrite with fresh seed accounts.');
  }
  console.log('Keep data/users.json private. Do not commit plaintext passwords.');
}

module.exports = { ensureUsersFile, USERS_PATH, SEED };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
