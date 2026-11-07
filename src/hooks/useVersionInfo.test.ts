import assert from 'node:assert/strict';
import test from 'node:test';
import { formatVersionLine } from './useVersionInfo.js';

test('formatVersionLine names a release build and the sv2-apps release it selects', () => {
  assert.equal(
    formatVersionLine({
      version: 'v0.8.2',
      commit: '3f1c2a9b8e7d6c5b4a39281706f5e4d3c2b1a090',
      sv2AppsVersions: ['v0.9.2'],
    }),
    'sv2-ui v0.8.2 (3f1c2a9) · sv2-apps v0.9.2',
  );
});

test('formatVersionLine leaves out an unknown commit', () => {
  assert.equal(
    formatVersionLine({ version: 'dev', commit: null, sv2AppsVersions: ['main'] }),
    'sv2-ui dev · sv2-apps main',
  );
});

test('formatVersionLine lists every sv2-apps tag when the images disagree', () => {
  assert.equal(
    formatVersionLine({ version: 'main', commit: null, sv2AppsVersions: ['v0.9.2', 'main'] }),
    'sv2-ui main · sv2-apps v0.9.2 / main',
  );
});
