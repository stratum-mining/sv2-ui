import assert from 'node:assert/strict';
import test from 'node:test';

import { canCancelSetup } from './SetupWizard';

test('a first setup offers no cancel, since App sends every route back to /setup', () => {
  assert.equal(canCancelSetup(false, false), false);
});

test('editing a saved setup can be cancelled until Start Mining submits', () => {
  assert.equal(canCancelSetup(true, false), true);
  assert.equal(canCancelSetup(true, true), false);
});
