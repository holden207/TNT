'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnt-access-'));
process.env.TNT_USERS_PATH = path.join(tempDir, 'users.json');

const { start } = require('../server');

let server;
let baseUrl;
let adminCookie;

function readStore() {
  return JSON.parse(fs.readFileSync(process.env.TNT_USERS_PATH, 'utf8')).users;
}

function cookieFrom(response) {
  const value = response.headers.get('set-cookie');
  return value ? value.split(';')[0] : '';
}

async function request(pathname, options = {}) {
  const headers = Object.assign({}, options.headers);
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers.Accept = 'application/json';
    headers.Origin = options.origin || baseUrl;
  }
  if (options.cookie) headers.Cookie = options.cookie;
  return fetch(baseUrl + pathname, {
    method: options.method || (options.json === undefined ? 'GET' : 'POST'),
    headers,
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    redirect: options.redirect || 'manual',
  });
}

async function json(response) {
  return response.json();
}

test.before(async () => {
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash('Admin@TNT2026!', 4);
  fs.writeFileSync(
    process.env.TNT_USERS_PATH,
    JSON.stringify({
      users: [{
        id: 'admin-id',
        username: 'admin',
        displayName: 'Administrator',
        role: 'admin',
        status: 'active',
        passwordHash,
        createdAt: now,
        approvedAt: now,
        approvedBy: 'test',
        failedAttempts: 0,
        lockedUntil: null,
        authVersion: 1,
        mustChangePassword: false,
      }],
    }),
    'utf8'
  );
  server = await start({ port: 0, quiet: true });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await request('/api/login', {
    json: { username: 'admin', password: 'Admin@TNT2026!' },
  });
  assert.equal(login.status, 200);
  adminCookie = cookieFrom(login);
  assert.ok(adminCookie);
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('registration creates a pending account without a session', async () => {
  const response = await request('/api/register', {
    json: {
      displayName: 'New Analyst',
      username: 'new.analyst',
      password: 'Request123!',
      confirmPassword: 'Request123!',
    },
  });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('set-cookie'), null);
  const data = await json(response);
  assert.equal(data.pending, true);
  assert.equal(readStore().find((user) => user.username === 'new.analyst').status, 'pending');
});

test('pending users cannot sign in', async () => {
  const response = await request('/api/login', {
    json: { username: 'new.analyst', password: 'Request123!' },
  });
  assert.equal(response.status, 403);
  assert.equal((await json(response)).code, 'ACCOUNT_PENDING');
});

test('only administrators can list and mutate users', async () => {
  const pending = readStore().find((user) => user.username === 'new.analyst');
  const approved = await request(`/api/admin/users/${pending.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    json: { status: 'active', role: 'viewer' },
  });
  assert.equal(approved.status, 200);

  const login = await request('/api/login', {
    json: { username: 'new.analyst', password: 'Request123!' },
  });
  assert.equal(login.status, 200);
  const loginData = await json(login);
  assert.equal(loginData.user.permissions.report, false);
  assert.equal(loginData.user.permissions.manageUsers, false);
  const viewerCookie = cookieFrom(login);

  const denied = await request('/api/admin/users', { cookie: viewerCookie });
  assert.equal(denied.status, 403);

  const list = await request('/api/admin/users', { cookie: adminCookie });
  assert.equal(list.status, 200);
  const users = (await json(list)).users;
  assert.ok(users.length >= 2);
  assert.equal(Object.hasOwn(users[0], 'passwordHash'), false);
  assert.equal(Object.hasOwn(users[0], 'failedAttempts'), false);
});

test('admin role updates revoke existing sessions immediately', async () => {
  const target = readStore().find((user) => user.username === 'new.analyst');
  const login = await request('/api/login', {
    json: { username: 'new.analyst', password: 'Request123!' },
  });
  const oldCookie = cookieFrom(login);

  const update = await request(`/api/admin/users/${target.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    json: { role: 'analyst' },
  });
  assert.equal(update.status, 200);

  const session = await request('/api/session', { cookie: oldCookie });
  assert.equal(session.status, 401);

  const analystLogin = await request('/api/login', {
    json: { username: 'new.analyst', password: 'Request123!' },
  });
  assert.equal((await json(analystLogin)).user.permissions.report, true);
});

test('disabled accounts cannot log in and active sessions are revoked', async () => {
  const target = readStore().find((user) => user.username === 'new.analyst');
  const login = await request('/api/login', {
    json: { username: 'new.analyst', password: 'Request123!' },
  });
  const analystCookie = cookieFrom(login);

  const disabled = await request(`/api/admin/users/${target.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    json: { status: 'disabled' },
  });
  assert.equal(disabled.status, 200);
  assert.equal((await request('/api/session', { cookie: analystCookie })).status, 401);

  const deniedLogin = await request('/api/login', {
    json: { username: 'new.analyst', password: 'Request123!' },
  });
  assert.equal(deniedLogin.status, 403);
  assert.equal((await json(deniedLogin)).code, 'ACCOUNT_DISABLED');
});

test('temporary passwords force replacement before dashboard access', async () => {
  const target = readStore().find((user) => user.username === 'new.analyst');
  await request(`/api/admin/users/${target.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    json: { status: 'active', temporaryPassword: 'Temporary456!' },
  });

  const login = await request('/api/login', {
    json: { username: 'new.analyst', password: 'Temporary456!' },
  });
  const loginData = await json(login);
  const cookie = cookieFrom(login);
  assert.equal(loginData.user.mustChangePassword, true);

  const dashboard = await request('/', { cookie });
  assert.equal(dashboard.status, 302);
  assert.equal(dashboard.headers.get('location'), '/change-password');

  const changed = await request('/api/change-password', {
    cookie,
    json: {
      currentPassword: 'Temporary456!',
      newPassword: 'Permanent789!',
      confirmPassword: 'Permanent789!',
    },
  });
  assert.equal(changed.status, 200);
  assert.ok(cookieFrom(changed));
});

test('admin mutations reject cross-origin requests and self access changes', async () => {
  const admin = readStore().find((user) => user.username === 'admin');
  const csrf = await request(`/api/admin/users/${admin.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    origin: 'https://evil.example',
    json: { role: 'viewer' },
  });
  assert.equal(csrf.status, 403);

  const selfChange = await request(`/api/admin/users/${admin.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    json: { status: 'disabled' },
  });
  assert.equal(selfChange.status, 409);
  assert.equal((await json(selfChange)).code, 'SELF_ACCESS_CHANGE');
});
