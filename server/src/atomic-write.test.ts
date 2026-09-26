import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { writeFileAtomically } from './atomic-write.js';
import { createFifo, withUmask } from './test-support.js';

test('writes with the explicitly requested mode under a restrictive umask', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-atomic-'));
  const file = path.join(dir, 'config.toml');
  try {
    await writeFile(file, 'original');
    await chmod(file, 0o644);

    await withUmask(0o077, async () => {
      await writeFileAtomically(file, 'updated', { mode: 0o644 });
    });

    const finalMode = (await stat(file)).mode & 0o777;
    assert.equal(finalMode, 0o644, 'an explicit mode must not be tightened by the umask');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('defaults to owner-only permissions under a permissive umask', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-atomic-'));
  const file = path.join(dir, 'state.json');

  try {
    await withUmask(0o000, async () => {
      await writeFileAtomically(file, 'new file');
    });

    const finalMode = (await stat(file)).mode & 0o777;
    assert.equal(finalMode, 0o600, 'a permissive umask must not widen the default mode');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('tightens an existing permissive mode when a restrictive mode is requested', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-atomic-'));
  const file = path.join(dir, 'state.json');
  try {
    await writeFile(file, 'original');
    await chmod(file, 0o644);

    await withUmask(0o077, async () => {
      await writeFileAtomically(file, 'updated', { mode: 0o600 });
    });

    const finalMode = (await stat(file)).mode & 0o777;
    assert.equal(finalMode, 0o600, 'upgraded installs must be migrated to the requested mode');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('replaces a symlink destination instead of writing through it', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-atomic-'));
  const attackerFile = path.join(dir, 'attacker-controlled');
  const file = path.join(dir, 'state.json');

  try {
    await writeFile(attackerFile, 'attacker controlled');
    await chmod(attackerFile, 0o666);
    await symlink(attackerFile, file);

    await writeFileAtomically(file, 'trusted configuration', { mode: 0o600 });

    const finalStat = await stat(file);
    assert.ok(finalStat.isFile(), 'the replacement must be a regular file, not a link');
    assert.equal(finalStat.mode & 0o777, 0o600);
    assert.equal(await readFile(attackerFile, 'utf8'), 'attacker controlled', 'the linked target must not be touched');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('replaces a FIFO destination instead of inheriting its mode', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-atomic-'));
  const file = path.join(dir, 'translator.toml');

  try {
    await createFifo(file);

    await writeFileAtomically(file, 'trusted configuration', { mode: 0o600 });

    const finalStat = await stat(file);
    assert.ok(finalStat.isFile(), 'the replacement must be a regular file, not a FIFO');
    assert.equal(finalStat.mode & 0o777, 0o600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
