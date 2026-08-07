import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bitcoinSocketExistsScript } from './bitcoin-socket-exists.js';

test('bitcoinSocketExistsScript must not execute shell commands embedded in the socket path', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'sock-inj-'));
  const marker = path.join(tmp, 'pwned');

  const maliciousPath = '/tmp/$(touch ' + marker + ')/node.sock';

  try {
    execFileSync(process.execPath, ['-e', bitcoinSocketExistsScript, maliciousPath], {
      stdio: 'ignore',
    });
  } catch {
    // A non-zero exit (socket absent) is expected and irrelevant here.
  }

  const injected = existsSync(marker);
  rmSync(tmp, { recursive: true, force: true });

  assert.equal(
    injected,
    false,
    'socket path was interpreted as a shell command (command injection via execSync)',
  );
});

test('bitcoinSocketExistsScript exits 0 when the socket exists and non-zero otherwise', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'sock-exists-'));
  try {
    const socketPath = path.join(tmp, 'node.sock');
    assert.throws(
      () =>
        execFileSync(process.execPath, ['-e', bitcoinSocketExistsScript, socketPath], {
          stdio: 'ignore',
        }),
      /Command failed/,
      'missing socket path should exit non-zero',
    );
    writeFileSync(socketPath, '');
    execFileSync(process.execPath, ['-e', bitcoinSocketExistsScript, socketPath], {
      stdio: 'ignore',
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
