import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeExperimentalFeatures } from './useExperimentalFeatures';

test('experimental features are disabled by default', () => {
  assert.deepEqual(normalizeExperimentalFeatures(undefined), { benchmark: false });
  assert.deepEqual(normalizeExperimentalFeatures({}), { benchmark: false });
});

test('benchmark is enabled only by an explicit boolean', () => {
  assert.deepEqual(normalizeExperimentalFeatures({ benchmark: true }), { benchmark: true });
  assert.deepEqual(normalizeExperimentalFeatures({ benchmark: 'true' }), { benchmark: false });
});
