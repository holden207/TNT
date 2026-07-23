'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_USERS_PATH = path.join(ROOT, 'data', 'users.json');
const SALT_ROUNDS = 12;

const SEED = [
  {
    username: 'admin',
    password: 'Admin@TNT2026!',
    displayName: 'System Administrator',
    role: 'admin',
  },
];

function usersPath() {
  return process.env.TNT_USERS_PATH
    ? path.resolve(process.env.TNT_USERS_PATH)
    : DEFAULT_USERS_PATH;
}

function useSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function backendName() {
  return useSupabase() ? 'supabase' : 'file';
}

function createClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    passwordHash: row.password_hash,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    failedAttempts: row.failed_attempts || 0,
    lockedUntil: row.locked_until || null,
    lastLoginAt: row.last_login_at || null,
    approvedAt: row.approved_at || null,
    approvedBy: row.approved_by || null,
    disabledAt: row.disabled_at || null,
    disabledBy: row.disabled_by || null,
    authVersion: row.auth_version || 1,
    mustChangePassword: !!row.must_change_password,
    passwordChangedAt: row.password_changed_at || null,
  };
}

function userToRow(user) {
  return {
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    role: user.role,
    status: user.status,
    password_hash: user.passwordHash,
    created_at: user.createdAt || null,
    updated_at: user.updatedAt || null,
    failed_attempts: user.failedAttempts || 0,
    locked_until: user.lockedUntil || null,
    last_login_at: user.lastLoginAt || null,
    approved_at: user.approvedAt || null,
    approved_by: user.approvedBy || null,
    disabled_at: user.disabledAt || null,
    disabled_by: user.disabledBy || null,
    auth_version: Number(user.authVersion) || 1,
    must_change_password: !!user.mustChangePassword,
    password_changed_at: user.passwordChangedAt || null,
  };
}

async function buildSeedUsers() {
  const users = [];
  for (const u of SEED) {
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    users.push({
      id: u.username,
      username: u.username.toLowerCase(),
      displayName: u.displayName,
      role: u.role,
      status: 'active',
      passwordHash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      approvedAt: new Date().toISOString(),
      approvedBy: 'bootstrap',
      disabledAt: null,
      disabledBy: null,
      authVersion: 1,
      mustChangePassword: true,
    });
  }
  return users;
}

async function loadUsersFromFile() {
  const filePath = usersPath();
  if (!fs.existsSync(filePath)) {
    throw new Error('User store is not initialized. Restart the server or run: npm run seed');
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(raw.users)) {
    throw new Error('User store is corrupt (missing users array).');
  }
  return raw.users;
}

async function saveUsersToFile(users) {
  const filePath = usersPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ users }, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

async function loadUsersFromSupabase() {
  const supabase = createClient();
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw new Error(`Supabase load failed: ${error.message}`);
  return (data || []).map(rowToUser);
}

async function saveUsersToSupabase(users) {
  const supabase = createClient();
  const rows = users.map(userToRow);
  if (!rows.length) {
    const { error } = await supabase.from('users').delete().neq('id', '');
    if (error) throw new Error(`Supabase clear failed: ${error.message}`);
    return;
  }

  const { error: upsertError } = await supabase.from('users').upsert(rows, { onConflict: 'id' });
  if (upsertError) throw new Error(`Supabase upsert failed: ${upsertError.message}`);

  const ids = rows.map((row) => row.id);
  const { data: existing, error: listError } = await supabase.from('users').select('id');
  if (listError) throw new Error(`Supabase list failed: ${listError.message}`);

  const keep = new Set(ids);
  const stale = (existing || []).map((row) => row.id).filter((id) => !keep.has(id));
  if (stale.length) {
    const { error: deleteError } = await supabase.from('users').delete().in('id', stale);
    if (deleteError) throw new Error(`Supabase delete failed: ${deleteError.message}`);
  }
}

async function loadUsers() {
  return useSupabase() ? loadUsersFromSupabase() : loadUsersFromFile();
}

async function saveUsers(users) {
  return useSupabase() ? saveUsersToSupabase(users) : saveUsersToFile(users);
}

/**
 * Ensure at least one bootstrap admin exists.
 * Supabase: inserts seed only when the table is empty.
 * File: creates users.json when missing/empty (Render-safe).
 */
async function ensureUsersStore({ force = false } = {}) {
  if (useSupabase()) {
    const existing = await loadUsersFromSupabase();
    if (!force && existing.length > 0) {
      return { created: false, backend: 'supabase', count: existing.length, path: 'supabase:users' };
    }
    const users = await buildSeedUsers();
    await saveUsersToSupabase(users);
    return { created: true, backend: 'supabase', count: users.length, path: 'supabase:users' };
  }

  const filePath = usersPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!force && fs.existsSync(filePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(raw.users) && raw.users.length > 0) {
        return { created: false, backend: 'file', count: raw.users.length, path: filePath };
      }
    } catch (err) {
      throw new Error(`Existing user store is invalid; refusing to overwrite it: ${err.message}`);
    }
  }

  const users = await buildSeedUsers();
  await saveUsersToFile(users);
  return { created: true, backend: 'file', count: users.length, path: filePath };
}

module.exports = {
  SEED,
  backendName,
  useSupabase,
  usersPath,
  loadUsers,
  saveUsers,
  ensureUsersStore,
  buildSeedUsers,
};
