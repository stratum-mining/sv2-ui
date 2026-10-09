import test from 'node:test';
import assert from 'node:assert';
import { deriveSetupStatus, BackendError, type SetupStatus } from './useSetupStatus';
import { AuthError } from '../lib/auth-fetch';

test('deriveSetupStatus with fresh 500 error', () => {
  const result = deriveSetupStatus(undefined, new BackendError(), false);
  
  // A fresh 500 implies standalone mode because we can't tell if it's a proxy failure
  // (no backend) or a struggling backend.
  assert.strictEqual(result.isOrchestrated, false);
  assert.strictEqual(result.isBackendError, true);
  assert.strictEqual(result.isConfigured, false);
  assert.strictEqual(result.isRunning, false);
});

test('deriveSetupStatus with stale data and 500 error', () => {
  const staleData: SetupStatus = {
    configured: true,
    running: true,
    dockerError: null,
    autoStarting: false,
    shouldBeRunning: true,
    miningMode: 'solo',
    mode: 'jd',
    poolName: null,
    activePoolIndex: null,
    activePoolAddress: null,
    activePoolPort: null,
    activePoolAuthorityPublicKey: null,
    configurationIssues: [],
    containers: { translator: null, jdc: null },
  };

  const result = deriveSetupStatus(staleData, new BackendError(), false);
  
  // If we have stale data, we know the backend was present, so we remain in orchestrated mode.
  assert.strictEqual(result.isOrchestrated, true);
  assert.strictEqual(result.isBackendError, true);
  assert.strictEqual(result.isConfigured, true);
  assert.strictEqual(result.isRunning, true);
});

test('deriveSetupStatus with success data', () => {
  const data: SetupStatus = {
    configured: true,
    running: true,
    dockerError: null,
    autoStarting: false,
    shouldBeRunning: true,
    miningMode: 'pool',
    mode: 'no-jd',
    poolName: 'Foundry USA',
    activePoolIndex: 0,
    activePoolAddress: 'stratum.foundry.com',
    activePoolPort: 3333,
    activePoolAuthorityPublicKey: 'abc',
    configurationIssues: [],
    containers: { translator: null, jdc: null },
  };

  const result = deriveSetupStatus(data, null, false);
  
  assert.strictEqual(result.isOrchestrated, true);
  assert.strictEqual(result.isBackendError, false);
  assert.strictEqual(result.isConfigured, true);
  assert.strictEqual(result.isRunning, true);
});

test('deriveSetupStatus with authentication error', () => {
  const result = deriveSetupStatus(undefined, new AuthError(), false);
  
  assert.strictEqual(result.isUnauthenticated, true);
  assert.strictEqual(result.isOrchestrated, false);
});

test('deriveSetupStatus reports a degraded JD stack as not running', () => {
  const data: SetupStatus = {
    configured: true,
    running: false,
    degraded: true,
    dockerError: null,
    autoStarting: false,
    shouldBeRunning: true,
    miningMode: 'pool',
    mode: 'jd',
    poolName: 'Blitzpool',
    activePoolIndex: 1,
    activePoolAddress: 'blitzpool.yourdevice.ch',
    activePoolPort: 3333,
    activePoolAuthorityPublicKey: 'abc',
    configurationIssues: [],
    containers: { translator: null, jdc: null },
  };

  const result = deriveSetupStatus(data, null, false);

  assert.strictEqual(result.isRunning, false);
  assert.strictEqual(result.isDegraded, true);
});

test('deriveSetupStatus treats a missing degraded flag as not degraded', () => {
  const result = deriveSetupStatus(undefined, null, false);

  assert.strictEqual(result.isDegraded, false);
});
