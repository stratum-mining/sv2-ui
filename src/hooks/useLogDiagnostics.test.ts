import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveDiagnosticsSnapshot } from './useLogDiagnostics.js';
import type { LogDiagnostic, LogDiagnosticsResponse } from '@/types/log-diagnostics';

const UNKNOWN_USER: LogDiagnostic = {
  code: 'unknown-user',
  severity: 'warning',
  title: 'Invalid Braiins username',
  message: 'The Braiins username is not recognized by the pool.',
  recommendation: 'Verify the Braiins username.',
  streamId: 'mining-services',
  containers: ['translator'],
  detectedAt: '2026-05-14T12:00:00.000Z',
  evidence: [],
};

function snapshot(
  diagnostics: LogDiagnostic[],
  { partial }: { partial?: boolean } = {},
): LogDiagnosticsResponse {
  return {
    configured: true,
    mode: 'jd',
    generatedAt: '2026-05-14T12:00:00.000Z',
    streams: [],
    diagnostics,
    partial: partial ?? false,
  };
}

test('a complete snapshot replaces the previous one', () => {
  const diagnosed = snapshot([UNKNOWN_USER]);
  const clean = snapshot([]);

  assert.equal(resolveDiagnosticsSnapshot(diagnosed, clean), clean);
});

test('a failed poll holds the previous snapshot', () => {
  const diagnosed = snapshot([UNKNOWN_USER]);

  assert.equal(resolveDiagnosticsSnapshot(diagnosed, null), diagnosed);
});

test('a partial snapshot holds the previous snapshot', () => {
  const diagnosed = snapshot([UNKNOWN_USER]);
  // The Translator is removed mid restart: its logs are not there to read.
  const midRestart = snapshot([], { partial: true });

  assert.equal(resolveDiagnosticsSnapshot(diagnosed, midRestart), diagnosed);
});

test('the first complete snapshot wins from an empty state', () => {
  const diagnosed = snapshot([UNKNOWN_USER]);

  assert.equal(resolveDiagnosticsSnapshot(null, diagnosed), diagnosed);
});

test('a clean complete snapshot clears a held diagnosis', () => {
  const diagnosed = snapshot([UNKNOWN_USER]);
  const clean = snapshot([]);

  const held = resolveDiagnosticsSnapshot(diagnosed, snapshot([], { partial: true }));
  assert.equal(resolveDiagnosticsSnapshot(held, clean), clean);
});
