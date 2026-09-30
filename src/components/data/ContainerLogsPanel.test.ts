import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LOG_DOWNLOAD_PATH } from './ContainerLogsPanel';

test('log downloads request the streamed, byte-capped export endpoint', () => {
  // The export must not request unbounded container history through
  // /api/logs/raw (CWE-400); the dedicated route streams formatted text
  // with a server-side cap instead.
  assert.equal(LOG_DOWNLOAD_PATH, '/api/logs/download');
  assert.doesNotMatch(LOG_DOWNLOAD_PATH, /tail=all/);
});
