import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { writeFileAtomically } from './atomic-write.js';

async function withRestrictiveUmask(run: () => Promise<void>): Promise<void> {
  const previousUmask = process.umask(0o077);
  try {
    await run();
  } finally {
    process.umask(previousUmask);
  }
}

test('preserves an existing 0644 mode under a restrictive umask', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-atomic-'));
  const file = path.join(dir, 'config.toml');
  try {
    await writeFile(file, 'original');
    await chmod(file, 0o644);

    await withRestrictiveUmask(async () => {
      await writeFileAtomically(file, 'updated');
    });

    const finalMode = (await stat(file)).mode & 0o777;
    assert.equal(finalMode, 0o644);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('preserves an existing 0600 mode under a restrictive umask', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-atomic-'));
  const file = path.join(dir, 'secret.toml');
  try {
    await writeFile(file, 'original');
    await chmod(file, 0o600);

    await withRestrictiveUmask(async () => {
      await writeFileAtomically(file, 'updated');
    });

    const finalMode = (await stat(file)).mode & 0o777;
    assert.equal(finalMode, 0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects a symlink destination instead of inheriting its writable mode', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-atomic-'));
  const attackerFile = path.join(dir, 'attacker-controlled');
  const file = path.join(dir, 'state.json');

  try {
    await writeFile(attackerFile, 'attacker controlled');
    await chmod(attackerFile, 0o666);
    await symlink(attackerFile, file);

    await assert.rejects(
      writeFileAtomically(file, 'trusted configuration'),
      /symbolic link/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('first-time write uses restrictive 0600 mode under a permissive umask', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-atomic-'));
  const file = path.join(dir, 'state.json');
  const previousUmask = process.umask(0o022);

  try {
    await writeFileAtomically(file, 'new file');

    const finalMode = (await stat(file)).mode & 0o777;
    assert.equal(finalMode, 0o600, 'newly created files must not be world-readable');
  } finally {
    process.umask(previousUmask);
    await rm(dir, { recursive: true, force: true });
  }
});
