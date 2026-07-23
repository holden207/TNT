'use strict';

const { ensureUsersStore, usersPath, SEED, backendName } = require('../lib/users-store');

async function ensureUsersFile(options) {
  return ensureUsersStore(options);
}

async function main() {
  const force = process.argv.includes('--force');
  const result = await ensureUsersStore({ force });
  if (result.created) {
    for (const u of SEED) {
      console.log(`  · ${u.username} (${u.role}) — password set`);
    }
    console.log(`\nWrote ${result.count} users → ${result.path} (${result.backend})`);
  } else {
    console.log(`Users already present (${result.count}) → ${result.path} (${result.backend})`);
    console.log('Pass --force to overwrite with fresh seed accounts.');
  }
  if (backendName() === 'file') {
    console.log('Keep data/users.json private. Do not commit plaintext passwords.');
  } else {
    console.log('Users are stored in Supabase. Keep SUPABASE_SERVICE_ROLE_KEY private.');
  }
}

module.exports = { ensureUsersFile, USERS_PATH: usersPath(), SEED };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
