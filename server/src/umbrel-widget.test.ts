import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { StatusResponse } from './types.js';
import { UmbrelWidget, widgetStatus } from './umbrel-widget.js';

test('the Umbrel widget persists its fleet-wide best share across restarts', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sv2-umbrel-widget-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const record = path.join(directory, 'best-share.json');
  const widget = new UmbrelWidget(record);
  const channel = { key: 'translator:1', userIdentity: 'worker', blocksFound: 0, bestDifficulty: 8e9 };

  await widget.refresh(async () => ({
    status: 'Online', hashrate: 2.5e12, activeWorkers: 2, channels: [channel],
  }));
  assert.deepEqual(widget.data(), {
    type: 'four-stats',
    refresh: '5s',
    link: '',
    items: [
      { title: 'Hashrate', text: '2.50', subtext: 'TH/s' },
      { title: 'Active Miners', text: '2' },
      { title: 'Best Share', text: '8.00G', subtext: 'All time' },
      { title: 'Status', text: 'Online' },
    ],
  });

  const restarted = new UmbrelWidget(record);
  await restarted.refresh(async () => ({
    status: 'Fallback pool', hashrate: 2.5e12, activeWorkers: 2,
    channels: [{ ...channel, bestDifficulty: 3e9 }],
  }));
  assert.equal(restarted.data().items[2].text, '8.00G');
  await restarted.reset();
  assert.equal(restarted.data().items[2].text, '—');
  await assert.rejects(fs.stat(record), { code: 'ENOENT' });
});

test('the widget distinguishes a fallback or a blocked setup from normal mining', () => {
  const healthy: StatusResponse = {
    configured: true, running: true, degraded: false, degradedForSecs: null,
    translatorFailing: false, soloFallback: false, dockerError: null,
    miningMode: 'pool', mode: 'jd', activePoolIndex: 0, poolName: 'Primary',
    activePoolAddress: null, activePoolPort: null, activePoolAuthorityPublicKey: null,
    configurationIssues: [], containers: { translator: null, jdc: null },
  };

  assert.equal(widgetStatus(healthy, true), 'Online');
  assert.equal(widgetStatus(healthy, false), 'Check app');
  assert.equal(widgetStatus({ ...healthy, activePoolIndex: 1 }, true), 'Fallback pool');
  assert.equal(widgetStatus({ ...healthy, activePoolIndex: null, soloFallback: true }, true), 'Solo fallback');
  assert.equal(widgetStatus({ ...healthy, running: false, degraded: true, translatorFailing: true }, true), 'Translator down');
  assert.equal(widgetStatus({
    ...healthy, configurationIssues: [{ code: 'saved-setup-unavailable', title: '', message: '' }],
  }, true), 'Review setup');
});
