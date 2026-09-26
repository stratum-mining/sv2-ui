import assert from 'node:assert/strict';
import { chmod, lstat, mkdir, mkdtemp, rm, stat, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ensureConfigDir } from './config-dir.js';
import { withUmask } from './test-support.js';

test('creates a missing config directory with owner-only permissions', async () => {
  const parentDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-dir-'));
  const configDir = path.join(parentDir, 'config');

  try {
    await withUmask(0o000, () => ensureConfigDir(configDir));

    const mode = (await stat(configDir)).mode & 0o777;
    assert.equal(
      mode,
      0o700,
      'a permissive umask must not make the config directory group/other-accessible',
    );
  } finally {
    await rm(parentDir, { recursive: true, force: true });
  }
});

test('tightens an existing permissive config directory', async () => {
  const configDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-dir-'));

  try {
    await chmod(configDir, 0o755);

    await ensureConfigDir(configDir);

    const mode = (await stat(configDir)).mode & 0o777;
    assert.equal(
      mode,
      0o700,
      'directories created by the Dockerfile or older versions must be tightened',
    );
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('leaves a symlinked config directory untouched', async () => {
  const parentDir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-config-dir-'));
  const realDir = path.join(parentDir, 'real');
  const linkedDir = path.join(parentDir, 'linked');

  try {
    await mkdir(realDir);
    await chmod(realDir, 0o755);
    await symlink(realDir, linkedDir);

    await ensureConfigDir(linkedDir);

    assert.ok((await lstat(linkedDir)).isSymbolicLink(), 'the symlink itself must be preserved');
    assert.equal(
      (await stat(realDir)).mode & 0o777,
      0o755,
      'the linked target must not be chmoded through the link',
    );
  } finally {
    await rm(parentDir, { recursive: true, force: true });
  }
});
