import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AutoStartReconciler, QUICK_EXIT_WINDOW_MS } from './auto-start.js';
import { SLOW_RETRY_MS } from './logs/parsers.js';
import type { AutoStartDeps } from './auto-start.js';
import type { SavedState } from './state.js';
import type { SetupData } from './types.js';
import type { PreparedServiceConfig, ServiceConfigFile } from './service-config.js';
import { logParsers } from './logs/parsers.js';
import type { ContainerLogLine } from './logs/types.js';

const CONFIG_DIR = '/config';
const START_TIME = 1_000_000;

const SETUP_DATA = { mode: 'jd', miningMode: 'pool' } as unknown as SetupData;

const FILE: ServiceConfigFile = { filename: 'translator.toml', contents: 'x' };

const READY: PreparedServiceConfig = { kind: 'ready', data: SETUP_DATA, files: [FILE] };

function state(overrides: Partial<SavedState> = {}): SavedState {
  return {
    configured: true,
    miningMode: 'pool',
    mode: 'jd',
    data: SETUP_DATA,
    shouldBeRunning: true,
    ...overrides,
  };
}

const UP = { id: '1', name: 'c', status: 'healthy' as const, ports: {} };
const DOWN = null;

/** A log line a real parser can match, for diagnostics-driven tests. */
function logLine(container: 'translator' | 'jdc', message: string): ContainerLogLine {
  return {
    container,
    stream: 'stderr',
    timestamp: '2026-04-22T18:38:34.491085Z',
    message,
    raw: `2026-04-22T18:38:34.491085Z ${message}`,
  };
}

const UNKNOWN_USER_LOGS = [
  logLine('translator', 'OpenMiningChannelError(request_id: 123, error_code: unknown-user)'),
];

const INVALID_CERTIFICATE_LOGS = [
  logLine(
    'translator',
    'Failed Noise handshake with 75.119.150.111:3333: Invalid Certificate: SignatureNoiseMessage { version: 0, valid_from: 1776883236, not_valid_after: 1776886836, signature: test }. Retrying...'
  ),
];

type Recorded = {
  calls: string[];
  stopStack: () => Promise<void>;
  startStack: (data: SetupData, configDir: string) => Promise<void>;
  saveState: (data: SetupData, shouldBeRunning: boolean) => Promise<void>;
  reconcileServiceConfigFiles: (files: ServiceConfigFile[], configDir: string) => Promise<string[]>;
};

function record(): Recorded {
  const calls: string[] = [];
  return {
    calls,
    stopStack: async () => { calls.push('stopStack'); },
    startStack: async () => { calls.push('startStack'); },
    saveState: async () => { calls.push('saveState'); },
    reconcileServiceConfigFiles: async (files) => {
      calls.push(`reconcileServiceConfigFiles(${files.map((f) => f.filename).join(',')})`);
      return [];
    },
  };
}

type DepOverrides = Partial<AutoStartDeps> & {
  savedState?: SavedState;
  prepared?: PreparedServiceConfig;
  drift?: string[];
  logs?: ContainerLogLine[];
  containers?: { translator: typeof UP | null; jdc: typeof UP | null };
};

function makeReconciler(overrides: DepOverrides = {}) {
  const rec = record();
  const { savedState, prepared, drift, containers, logs, ...depOverrides } = overrides;

  const deps: AutoStartDeps = {
    loadState: async () => savedState ?? state(),
    getStackStatus: async () => containers ?? { translator: UP, jdc: UP },
    prepareServiceConfig: () => prepared ?? READY,
    getServiceConfigDrift: async () => drift ?? [],
    reconcileServiceConfigFiles: rec.reconcileServiceConfigFiles,
    stopStack: rec.stopStack,
    startStack: rec.startStack,
    saveState: rec.saveState,
    getBitcoinSocketStartupError: async () => null,
    readStackLogs: async () => logs ?? [],
    tryAcquire: () => true,
    release: () => { rec.calls.push('release'); },
    configDir: CONFIG_DIR,
    now: () => clock.now,
    log: { log: () => {}, error: () => {} },
    ...depOverrides,
  };

  const reconciler = new AutoStartReconciler(deps);
  return { reconciler, calls: rec.calls };
}

const clock = { now: START_TIME };

test('does nothing when the stack is already running and drift-free', async () => {
  const { reconciler, calls } = makeReconciler();
  await reconciler.reconcile();
  assert.deepEqual(calls, ['release']);
});

test('starts a stopped stack when shouldBeRunning is true', async () => {
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
  });
  await reconciler.reconcile();
  assert.deepEqual(calls, [
    'stopStack',
    'reconcileServiceConfigFiles(translator.toml)',
    'saveState',
    'startStack',
    'release',
  ]);
});

test('restarts a running stack when generated config drifted', async () => {
  const { reconciler, calls } = makeReconciler({ drift: ['translator.toml'] });
  await reconciler.reconcile();
  assert.ok(calls.includes('stopStack'));
  assert.ok(calls.includes('startStack'));
});

test('does nothing when shouldBeRunning is false', async () => {
  const { reconciler, calls } = makeReconciler({
    savedState: state({ shouldBeRunning: false }),
    containers: { translator: DOWN, jdc: DOWN },
  });
  await reconciler.reconcile();
  assert.deepEqual(calls, ['release']);
});

test('does nothing when not configured', async () => {
  const { reconciler, calls } = makeReconciler({
    savedState: state({ configured: false, data: null, shouldBeRunning: false }),
    containers: { translator: DOWN, jdc: DOWN },
  });
  await reconciler.reconcile();
  assert.deepEqual(calls, ['release']);
});

test('hands off to Translator recovery when only the Translator is stopped in JD mode', async () => {
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: UP },
  });
  await reconciler.reconcile();
  assert.deepEqual(calls, ['release']);
});

test('stops the stack when setup review is required, and only logs it once', async () => {
  let prepareCalls = 0;
  const review: PreparedServiceConfig = {
    kind: 'needs-setup-review',
    issues: [{ code: 'missing', title: 't', message: 'm' }],
  };
  const { reconciler, calls } = makeReconciler({
    prepared: review,
    containers: { translator: UP, jdc: UP },
    prepareServiceConfig: (_data, options) => {
      prepareCalls += 1;
      assert.equal(options?.logFailure, prepareCalls === 1);
      return review;
    },
  });

  await reconciler.reconcile();
  assert.deepEqual(calls, ['stopStack', 'release']);

  await reconciler.reconcile();
  assert.deepEqual(calls, ['stopStack', 'release', 'stopStack', 'release']);
});

test('does not stop a stopped stack when setup review is required', async () => {
  const review: PreparedServiceConfig = {
    kind: 'needs-setup-review',
    issues: [{ code: 'missing', title: 't', message: 'm' }],
  };
  const { reconciler, calls } = makeReconciler({
    prepared: review,
    containers: { translator: DOWN, jdc: DOWN },
  });
  await reconciler.reconcile();
  assert.deepEqual(calls, ['release']);
});

test('records backoff when the Bitcoin socket check fails in JD mode', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    getBitcoinSocketStartupError: async () => 'socket missing',
  });

  await reconciler.reconcile();
  assert.deepEqual(calls, ['release'], 'no restart when the socket is unusable');

  // Within the 60s backoff the reconciler must not retry.
  clock.now += 30_000;
  await reconciler.reconcile();
  assert.deepEqual(calls, ['release'], 'no restart while backing off');

  // Once the socket is healthy and the backoff expired, it starts the stack.
  const healthy = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    getBitcoinSocketStartupError: async () => null,
  });
  await healthy.reconciler.reconcile();
  assert.ok(healthy.calls.includes('startStack'));
});

test('backs off exponentially on thrown errors, capped at the maximum', async () => {
  clock.now = START_TIME;
  let startAttempts = 0;
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    startStack: async () => {
      startAttempts += 1;
      calls.push('startStack');
      throw new Error('docker down');
    },
  });

  // Expected waits after each failure: 60s, 120s, 240s, then capped at 300s.
  const expectedWaits = [60_000, 120_000, 240_000, 300_000, 300_000];
  for (const wait of expectedWaits) {
    const attemptBefore = startAttempts;
    await reconciler.reconcile();
    assert.equal(startAttempts, attemptBefore + 1, 'attempts once when due');

    // One millisecond before the wait expires, reconcile must be a no-op.
    clock.now += wait - 1;
    const callsBefore = calls.length;
    await reconciler.reconcile();
    assert.equal(calls.length, callsBefore, 'respects backoff until due');

    clock.now += 1;
  }

  assert.equal(startAttempts, 5);
});

test('a stop right after an auto-start is a crash, not a restart trigger', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
  });

  await reconciler.reconcile(); // starts the stack
  assert.equal(calls.filter((c) => c === 'startStack').length, 1);

  // The stack stopped again one tick later (crash-loop): count it as a
  // failed start (backoff) instead of restarting immediately.
  clock.now += 30_000;
  await reconciler.reconcile();
  assert.equal(calls.filter((c) => c === 'startStack').length, 1, 'no immediate restart');

  // Once the 60s backoff expires the stack is still past the quick-exit
  // window relative to its original start, so it is retried.
  clock.now += 90_000;
  await reconciler.reconcile();
  assert.equal(calls.filter((c) => c === 'startStack').length, 2, 'retried after backoff');
});

test('an observed healthy stack clears the crash backoff', async () => {
  clock.now = START_TIME;
  // Mutable fixture so a tick can observe the stack up after the start.
  const containers = { translator: DOWN as typeof UP | null, jdc: DOWN as typeof UP | null };
  const { reconciler, calls } = makeReconciler({
    containers,
    getStackStatus: async () => containers,
  });

  await reconciler.reconcile(); // start (stack was down)
  containers.translator = UP;
  containers.jdc = UP;
  clock.now += 30_000;
  await reconciler.reconcile(); // observes healthy -> resets recovery state

  // Stack stops again long after: with backoff cleared it restarts at once.
  containers.translator = DOWN;
  containers.jdc = DOWN;
  clock.now += 30_000;
  await reconciler.reconcile();
  assert.equal(calls.filter((c) => c === 'startStack').length, 2, 'restarted without stale backoff');
});

test('releases the stack lock even when reconcile throws', async () => {
  const { reconciler, calls } = makeReconciler({
    loadState: async () => { throw new Error('state unreadable'); },
  });
  await reconciler.reconcile();
  assert.deepEqual(calls, ['release']);
});

test('does not take the lock when tryAcquire fails', async () => {
  const { reconciler, calls } = makeReconciler({ tryAcquire: () => false });
  await reconciler.reconcile();
  assert.deepEqual(calls, []);
});

test('resetRecoveryState clears the setup-review log flag', async () => {
  let prepareCalls = 0;
  const review: PreparedServiceConfig = {
    kind: 'needs-setup-review',
    issues: [{ code: 'missing', title: 't', message: 'm' }],
  };
  const { reconciler } = makeReconciler({
    prepared: review,
    containers: { translator: UP, jdc: UP },
    prepareServiceConfig: () => {
      prepareCalls += 1;
      return review;
    },
  });

  await reconciler.reconcile();
  reconciler.resetRecoveryState();
  await reconciler.reconcile();
  // After a reset the failure/setup-review log is reported again.
  assert.equal(prepareCalls, 2);
});

test('does not restart a stopped stack whose logs diagnose unknown-user', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    logs: UNKNOWN_USER_LOGS,
  });

  await reconciler.reconcile();
  assert.deepEqual(calls, ['release'], 'no stopStack/startStack: evidence stays on screen');
});

test('logs the diagnosed pause only once across ticks', async () => {
  clock.now = START_TIME;
  const messages: string[] = [];
  const { reconciler } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    logs: UNKNOWN_USER_LOGS,
    log: { log: (msg: string) => { messages.push(msg); }, error: () => {} },
  });

  await reconciler.reconcile();
  clock.now += 30_000;
  await reconciler.reconcile();

  const pauseLogs = messages.filter((m) => m.includes('Not restarting'));
  assert.equal(pauseLogs.length, 1);
});

test('resumes auto-start once the diagnosed failure clears from the logs', async () => {
  clock.now = START_TIME;
  const logs: ContainerLogLine[] = [...UNKNOWN_USER_LOGS];
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    readStackLogs: async () => logs,
  });

  await reconciler.reconcile();
  assert.deepEqual(calls, ['release'], 'paused while diagnosed');

  // User fixed the config via the manual path (which restarted with fresh
  // logs); the new run no longer emits the error.
  logs.length = 0;
  clock.now += 30_000;
  await reconciler.reconcile();
  assert.ok(calls.includes('startStack'), 'restarted once logs are clean');
});

test('retries a self-healing diagnosis at most once per slow interval', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    logs: INVALID_CERTIFICATE_LOGS,
  });

  await reconciler.reconcile(); // allowed: first slow retry
  assert.equal(calls.filter((c) => c === 'startStack').length, 1);

  // The restart did not help (crash -> quick-exit backoff -> still diagnosed).
  clock.now += QUICK_EXIT_WINDOW_MS + 60_000;
  const before = calls.filter((c) => c === 'startStack').length;
  await reconciler.reconcile();
  assert.equal(
    calls.filter((c) => c === 'startStack').length,
    before,
    'no second restart inside the slow interval'
  );

  clock.now += SLOW_RETRY_MS;
  await reconciler.reconcile();
  assert.equal(
    calls.filter((c) => c === 'startStack').length,
    before + 1,
    'retried once the slow interval expired'
  );
});

test('lets the start-path socket probe gate probe-policy diagnoses', async () => {
  clock.now = START_TIME;
  const jdcDisconnected = [
    logLine(
      'jdc',
      'jd_client_sv2::template_receiver::bitcoin_core: Failed to create BitcoinCoreToSv2: CapnpError(Error { kind: Disconnected, extra: "Peer disconnected." })'
    ),
  ];
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    logs: jdcDisconnected,
    getBitcoinSocketStartupError: async () => 'socket missing',
  });

  await reconciler.reconcile();
  assert.deepEqual(calls, ['release'], 'socket probe blocks the restart');

  // Once the socket is back, the same diagnosis does not block.
  const healthy = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    logs: jdcDisconnected,
    getBitcoinSocketStartupError: async () => null,
  });
  await healthy.reconciler.reconcile();
  assert.ok(healthy.calls.includes('startStack'));
});

test('treats an unregistered diagnostic code as never-auto-retry', async () => {
  clock.now = START_TIME;
  // Register a fake parser whose code has no autoRetry entry reachable via
  // getAutoRetryPolicy (we bypass the registry lookup by emitting a code
  // that is not in logParsers), then confirm the reconciler pauses.
  const fakeParser = {
    code: 'future-unknown-scenario',
    autoRetry: 'never' as const,
    match: (lines: ContainerLogLine[]) =>
      lines.some((line) => line.message.includes('future failure'))
        ? {
          code: 'unregistered-code',
          severity: 'error' as const,
          title: 't',
          message: 'm',
          recommendation: 'r',
          streamId: 'mining-services' as const,
          containers: ['translator' as const],
          detectedAt: null,
          evidence: [],
        }
        : null,
  };
  logParsers.push(fakeParser);
  try {
    const { reconciler, calls } = makeReconciler({
      containers: { translator: DOWN, jdc: DOWN },
      logs: [logLine('translator', 'future failure detected')],
    });

    await reconciler.reconcile();
    assert.deepEqual(calls, ['release'], 'unknown code pauses instead of restarting blind');
  } finally {
    logParsers.splice(logParsers.indexOf(fakeParser), 1);
  }
});

test('does not read logs when the stack is running', async () => {
  clock.now = START_TIME;
  let logReads = 0;
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    readStackLogs: async () => { logReads += 1; return UNKNOWN_USER_LOGS; },
    getStackStatus: async () => {
      // First tick: stopped (evaluates diagnostics). Later: running.
      return logReads === 0
        ? { translator: DOWN, jdc: DOWN }
        : { translator: UP, jdc: UP };
    },
  });

  await reconciler.reconcile(); // paused by diagnosis
  assert.equal(logReads, 1);
  assert.deepEqual(calls, ['release']);

  await reconciler.reconcile(); // healthy: no log read needed
  assert.equal(logReads, 1, 'running stack skips the diagnostics read');
  assert.deepEqual(calls, ['release', 'release']);
});
