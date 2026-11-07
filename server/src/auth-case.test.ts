import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(SERVER_DIR, '..');

async function startServer(): Promise<{
  base: string;
  configDir: string;
  stop: () => void;
}> {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-auth-case-'));
  const port = 4200 + Math.floor(Math.random() * 300);
  const child: ChildProcess = spawn(
    'node',
    ['--import', 'tsx', 'src/index.ts'],
    {
      cwd: SERVER_ROOT,
      env: { ...process.env, CONFIG_DIR: configDir, PORT: String(port), NODE_ENV: 'test' },
      stdio: 'ignore',
    },
  );

  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) break;
    } catch {
      // server not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { base, configDir, stop: () => child.kill('SIGKILL') };
}

test('case variations of protected routes must not leak API data', async () => {
  const { base, configDir, stop } = await startServer();
  try {
    // Set a password so auth is enforced.
    const setup = await fetch(`${base}/api/auth/setup-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'sup3rsecret' }),
    });
    assert.equal(setup.status, 200);

    // Correctly-cased protected route returns 401 without a session.
    const authed = await fetch(`${base}/api/env`);
    assert.equal(authed.status, 401);

    // Uppercase prefix (/API/env) bypasses the auth middleware's
    // startsWith('/api/') check, but the case-sensitive Router rejects
    // the route. It falls to the SPA catch-all — no API data leaks.
    const upperPrefix = await fetch(`${base}/API/env`);
    const ct = upperPrefix.headers.get('content-type') ?? '';
    assert.ok(
      !ct.includes('application/json'),
      `/API/env must not return JSON API data (got ${upperPrefix.status})`,
    );

    // Public routes must still work at the correct case.
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
  } finally {
    stop();
    await rm(configDir, { recursive: true, force: true });
  }
});

test('the version endpoint requires a session', async () => {
  const { base, configDir, stop } = await startServer();
  try {
    const setup = await fetch(`${base}/api/auth/setup-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'sup3rsecret' }),
    });
    assert.equal(setup.status, 200);
    const cookie = setup.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(cookie, 'password setup must start a session');

    const anonymous = await fetch(`${base}/api/version`);
    assert.equal(anonymous.status, 401);

    const authed = await fetch(`${base}/api/version`, { headers: { Cookie: cookie } });
    assert.equal(authed.status, 200);
    const info = await authed.json();
    assert.equal(typeof info.version, 'string');
    assert.ok(Array.isArray(info.sv2AppsVersions) && info.sv2AppsVersions.length > 0);
  } finally {
    stop();
    await rm(configDir, { recursive: true, force: true });
  }
});
