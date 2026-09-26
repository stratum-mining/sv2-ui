import assert from 'node:assert/strict';
import { constants, mkdtemp, open, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  CredentialError,
  generateRecoveryKey,
  getPasswordValidationError,
  hashPassword,
  loadCredential,
  saveCredential,
  verifyPassword,
  verifyRecoveryKey,
} from './auth-store.js';
import { createFifo } from './test-support.js';

test('accepts the correct password and rejects a wrong one', async () => {
  const credential = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse battery', credential), true);
  assert.equal(await verifyPassword('wrong password', credential), false);
});

test('never stores the plaintext password', async () => {
  const credential = await hashPassword('correct horse battery');
  assert.equal(JSON.stringify(credential).includes('correct horse battery'), false);
});

test('rejects short passwords', () => {
  assert.notEqual(getPasswordValidationError('short'), null);
  assert.equal(getPasswordValidationError('long enough password'), null);
});

test('returns null when no credential file exists', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-cred-'));
  try {
    assert.equal(await loadCredential(path.join(dir, 'credential.json')), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fails fast on a FIFO at the credential path instead of blocking', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-cred-'));
  const file = path.join(dir, 'credential.json');
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    await createFifo(file);

    const outcome = await Promise.race([
      loadCredential(file).then(
        (credential) => credential,
        (error: unknown) => error,
      ),
      new Promise<'timed-out'>((resolve) => {
        timeoutId = setTimeout(() => resolve('timed-out'), 250);
        timeoutId.unref();
      }),
    ]);

    if (outcome === 'timed-out') {
      // A spurious timeout on a stalled runner means the reader has already
      // closed. Open the writer with O_NONBLOCK so this branch can never
      // wedge a libuv worker and hang the whole test process.
      try {
        const writer = await open(file, constants.O_WRONLY | constants.O_NONBLOCK);
        await writer.writeFile('attacker-controlled input');
        await writer.close();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENXIO') throw error;
      }
      assert.fail('loadCredential blocked on a planted FIFO');
    }

    assert.ok(outcome instanceof CredentialError, `expected CredentialError, got ${outcome}`);
  } finally {
    clearTimeout(timeoutId);
    await rm(dir, { recursive: true, force: true });
  }
});

test('wraps a symlinked credential file in CredentialError', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-cred-'));
  const file = path.join(dir, 'credential.json');

  try {
    await writeFile(path.join(dir, 'elsewhere'), '{}');
    await symlink(path.join(dir, 'elsewhere'), file);

    await assert.rejects(loadCredential(file), CredentialError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('round-trips a saved credential', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-cred-'));
  const file = path.join(dir, 'credential.json');
  try {
    await saveCredential(file, await hashPassword('a good long password'));
    const loaded = await loadCredential(file);
    assert.notEqual(loaded, null);
    assert.equal(await verifyPassword('a good long password', loaded!), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('generates high-entropy, unique recovery keys', () => {
  const a = generateRecoveryKey();
  const b = generateRecoveryKey();
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b);
});

test('verifies a recovery key against a stored credential', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-cred-'));
  const file = path.join(dir, 'credential.json');
  try {
    const password = await hashPassword('a good long password');
    const recoveryKey = generateRecoveryKey();
    await saveCredential(file, { ...password, recoveryKey: await hashPassword(recoveryKey) });

    const loaded = await loadCredential(file);
    assert.equal(await verifyRecoveryKey(recoveryKey, loaded), true);
    assert.equal(await verifyRecoveryKey('wrong-key', loaded), false);
    assert.equal(await verifyRecoveryKey(recoveryKey, null), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadCredential tolerates an optional nested recovery key', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-cred-'));
  const file = path.join(dir, 'credential.json');
  try {
    const credential = {
      version: 1,
      algorithm: 'scrypt',
      salt: 'AAAA',
      hash: 'BBBB',
      recoveryKey: { version: 1, algorithm: 'scrypt', salt: 'CCCC', hash: 'DDDD' },
    };
    await saveCredential(file, credential);
    const loaded = await loadCredential(file);
    assert.notEqual(loaded, null);
    assert.equal(loaded!.recoveryKey !== undefined, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
