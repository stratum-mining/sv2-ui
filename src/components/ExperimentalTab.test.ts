import assert from 'node:assert/strict';
import test from 'node:test';

import { isTelegramExperimentOpen } from './settings/ExperimentalTab';

test('keeps an unconfigured Telegram experiment closed until it is enabled', () => {
  const settings = {
    connected: false,
    paired: false,
    enabled: false,
  };

  assert.equal(isTelegramExperimentOpen(settings, null), false);
  assert.equal(isTelegramExperimentOpen(settings, true), true);
});

test('opens an existing unpaired Telegram setup unless the user closes it', () => {
  const settings = {
    connected: true,
    paired: false,
    enabled: false,
  };

  assert.equal(isTelegramExperimentOpen(settings, null), true);
  assert.equal(isTelegramExperimentOpen(settings, false), false);
});

test('uses the backend notification state after Telegram is paired', () => {
  const settings = {
    connected: true,
    paired: true,
    enabled: false,
  };

  assert.equal(isTelegramExperimentOpen(settings, true), false);
  assert.equal(isTelegramExperimentOpen({ ...settings, enabled: true }, false), true);
});
