import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuildInfo } from './build-info.js';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

test('the build args set by the release workflow win over git', () => {
  assert.deepEqual(
    readBuildInfo({ SV2_UI_VERSION: 'v0.8.3', SV2_UI_COMMIT: '3f1c2a9b8e7d6c5b4a39281706f5e4d3c2b1a090' }, SERVER_DIR),
    { version: 'v0.8.3', commit: '3f1c2a9b8e7d6c5b4a39281706f5e4d3c2b1a090' },
  );
});

test('a run from the git checkout reports its branch and commit', () => {
  const info = readBuildInfo({}, SERVER_DIR);
  assert.notEqual(info.version, 'dev');
  assert.ok(info.version.length > 0);
  assert.match(info.commit ?? '', /^[0-9a-f]{40}$/);
});

test('an image built without the build args, which has no .git, reads dev', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sv2-ui-build-info-'));
  try {
    // The Dockerfile declares the build args with empty defaults.
    assert.deepEqual(readBuildInfo({ SV2_UI_VERSION: '', SV2_UI_COMMIT: '' }, dir), { version: 'dev', commit: null });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
