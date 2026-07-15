'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_PATH = path.join(__dirname, '..', 'data', 'users.json');
const SALT_ROUNDS = 12;

/**
 * Default accounts for local / demo use.
 * Change these passwords immediately in production (edit data/users.json
 * or re-run with SEED_PASSWORDS env / edit this script).
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

async function main() {
  const dir = path.dirname(USERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

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
    console.log(`  · ${u.username} (${u.role}) — password set`);
  }

  fs.writeFileSync(USERS_PATH, JSON.stringify({ users }, null, 2), 'utf8');
  console.log(`\nWrote ${users.length} users → ${USERS_PATH}`);
  console.log('Keep data/users.json private. Do not commit plaintext passwords.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
