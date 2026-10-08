import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHistoryConfigKey } from './useHistoryConfigKey';

test('uses the active pool when it is known', () => {
  assert.equal(resolveHistoryConfigKey('jd', 'Pool A', 'jd:Pool B'), 'jd:Pool A');
});

test('keeps the last pool while the active pool is unknown', () => {
  assert.equal(resolveHistoryConfigKey('jd', null, 'jd:Pool A'), 'jd:Pool A');
});

test('does not reuse a pool from another mode', () => {
  assert.equal(resolveHistoryConfigKey('no-jd', null, 'jd:Pool A'), 'no-jd');
});

test('falls back to the mode, then default', () => {
  assert.equal(resolveHistoryConfigKey('jd', null, null), 'jd');
  assert.equal(resolveHistoryConfigKey(null, null, null), 'default');
});
