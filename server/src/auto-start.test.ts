import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AUTO_START_MIN_BACKOFF_MS, AutoStartReconciler, QUICK_EXIT_WINDOW_MS } from './auto-start.js';
import type { AutoStartDeps } from './auto-start.js';
import type { BitcoinCoreVersionCheck } from './bitcoin-core-version.js';
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
    checkBitcoinCoreVersion: async (data) => ({ kind: 'confirmed', data }),
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

test('restarts a retryable diagnosis and backs off if it exits again quickly', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    logs: INVALID_CERTIFICATE_LOGS,
  });

  await reconciler.reconcile();
  assert.equal(calls.filter((c) => c === 'startStack').length, 1);

  // The restart did not help: the stack stops again inside the quick-exit
  // window, so the crash-loop backoff applies instead of a second restart.
  clock.now += 30_000;
  await reconciler.reconcile();
  assert.equal(
    calls.filter((c) => c === 'startStack').length,
    1,
    'no immediate restart while the crash-loop backoff is pending'
  );

  clock.now += QUICK_EXIT_WINDOW_MS;
  await reconciler.reconcile();
  assert.equal(
    calls.filter((c) => c === 'startStack').length,
    2,
    'retried once the crash-loop backoff expired'
  );
});

test('lets the start-path socket probe gate retry diagnoses', async () => {
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

// As JDC v0.9.0 logs it when configured for Core 30 on a Core 31 node.
const VERSION_MISMATCH_LOGS = [
  logLine(
    'jdc',
    'jd_client_sv2::template_receiver::bitcoin_core: Failed to create BitcoinCoreToSv2: Initialization { version: V30X, protocol: TDP, details: "CapnpError(Error { kind: Failed, extra: \\"remote exception: std::exception: Old mining interface (@2) not supported. Please update your client!\\" })" }',
  ),
];

const CORRECTED_DATA = {
  mode: 'jd',
  miningMode: 'pool',
  bitcoin: { core_version: '32' },
} as unknown as SetupData;

const CORRECTED_FILE: ServiceConfigFile = { filename: 'jdc.toml', contents: 'version = 32' };

const CORRECTED: BitcoinCoreVersionCheck = {
  kind: 'corrected',
  data: CORRECTED_DATA,
  from: '31',
  to: '32',
};

const REFUSED: BitcoinCoreVersionCheck = {
  kind: 'refused',
  issue: { code: 'bitcoin-core-version-unconfirmed', title: 'Could not confirm', message: 'm' },
  detail: 'connect ECONNREFUSED',
};

const prepareFromData: AutoStartDeps['prepareServiceConfig'] = (data) =>
  data === CORRECTED_DATA
    ? { kind: 'ready', data, files: [CORRECTED_FILE] }
    : { kind: 'ready', data, files: [FILE] };

function checkReturning(...checks: BitcoinCoreVersionCheck[]) {
  const counter = { count: 0 };
  const checkBitcoinCoreVersion = async (data: SetupData): Promise<BitcoinCoreVersionCheck> => {
    const check = checks[Math.min(counter.count, checks.length - 1)];
    counter.count += 1;
    return check ?? { kind: 'confirmed', data };
  };
  return { counter, checkBitcoinCoreVersion };
}

test('asks the node only once per boot while the stack stays up', async () => {
  clock.now = START_TIME;
  const { counter, checkBitcoinCoreVersion } = checkReturning();
  const { reconciler, calls } = makeReconciler({ checkBitcoinCoreVersion });

  await reconciler.reconcile();
  await reconciler.reconcile();

  assert.equal(counter.count, 1);
  assert.deepEqual(calls, ['release', 'release']);
});

test('asks the node before every start of a stopped stack', async () => {
  clock.now = START_TIME;
  const { counter, checkBitcoinCoreVersion } = checkReturning();
  const { reconciler } = makeReconciler({
    checkBitcoinCoreVersion,
    containers: { translator: DOWN, jdc: DOWN },
  });

  await reconciler.reconcile();
  clock.now += QUICK_EXIT_WINDOW_MS + 1;
  await reconciler.reconcile();

  assert.equal(counter.count, 2);
});

test('does not keep asking while Translator recovery has JDC up', async () => {
  clock.now = START_TIME;
  const { counter, checkBitcoinCoreVersion } = checkReturning();
  const { reconciler, calls } = makeReconciler({
    checkBitcoinCoreVersion,
    containers: { translator: DOWN, jdc: UP },
  });

  await reconciler.reconcile();
  await reconciler.reconcile();

  assert.equal(counter.count, 1);
  assert.deepEqual(calls, ['release', 'release']);
});

test('does not ask for a setup without JDC', async () => {
  clock.now = START_TIME;
  const noJd = { mode: 'no-jd', miningMode: 'pool' } as unknown as SetupData;
  const { counter, checkBitcoinCoreVersion } = checkReturning();
  const { reconciler } = makeReconciler({
    checkBitcoinCoreVersion,
    savedState: state({ mode: 'no-jd', data: noJd }),
    prepared: { kind: 'ready', data: noJd, files: [FILE] },
    containers: { translator: DOWN, jdc: DOWN },
  });

  await reconciler.reconcile();

  assert.equal(counter.count, 0);
});

test('restarts a healthy stack on the corrected version and saves it', async () => {
  clock.now = START_TIME;
  const started: SetupData[] = [];
  const saved: SetupData[] = [];
  const reconciledFiles: string[] = [];
  const { reconciler } = makeReconciler({
    ...checkReturning(CORRECTED),
    prepareServiceConfig: prepareFromData,
    startStack: async (data) => { started.push(data); },
    saveState: async (data) => { saved.push(data); },
    reconcileServiceConfigFiles: async (files) => {
      reconciledFiles.push(...files.map((file) => file.contents));
      return [];
    },
  });

  await reconciler.reconcile();

  assert.deepEqual(started, [CORRECTED_DATA]);
  assert.deepEqual(saved, [CORRECTED_DATA]);
  assert.deepEqual(reconciledFiles, ['version = 32']);
});

test('a stack paused on a version mismatch recovers once the version is corrected', async () => {
  clock.now = START_TIME;
  const started: SetupData[] = [];
  const { reconciler } = makeReconciler({
    ...checkReturning(CORRECTED),
    prepareServiceConfig: prepareFromData,
    containers: { translator: DOWN, jdc: DOWN },
    logs: VERSION_MISMATCH_LOGS,
    startStack: async (data) => { started.push(data); },
  });

  await reconciler.reconcile();

  assert.deepEqual(started, [CORRECTED_DATA]);
});

test('a stack paused on a version mismatch recovers once the node matches again', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    logs: VERSION_MISMATCH_LOGS,
  });

  await reconciler.reconcile();

  assert.ok(calls.includes('startStack'));
});

test('a confirmed version does not override another diagnosed failure', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({
    containers: { translator: DOWN, jdc: DOWN },
    logs: [...VERSION_MISMATCH_LOGS, ...UNKNOWN_USER_LOGS],
  });

  await reconciler.reconcile();

  assert.deepEqual(calls, ['release']);
});

test('keeps pausing on a version mismatch when the node could not be asked', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({
    ...checkReturning({ kind: 'node-unavailable', error: 'Socket not found' }),
    containers: { translator: DOWN, jdc: DOWN },
    logs: VERSION_MISMATCH_LOGS,
  });

  await reconciler.reconcile();

  assert.deepEqual(calls, ['release']);
});

test('a corrected version is not counted as a crash of the previous start', async () => {
  clock.now = START_TIME;
  let startCount = 0;
  const { reconciler } = makeReconciler({
    ...checkReturning({ kind: 'confirmed', data: SETUP_DATA }, CORRECTED),
    prepareServiceConfig: prepareFromData,
    containers: { translator: DOWN, jdc: DOWN },
    startStack: async () => { startCount += 1; },
  });

  await reconciler.reconcile();
  clock.now += 1_000;
  await reconciler.reconcile();

  assert.equal(startCount, 2);
});

test('a correction that fails before the restart is checked again', async () => {
  clock.now = START_TIME;
  const started: SetupData[] = [];
  const { counter, checkBitcoinCoreVersion } = checkReturning(CORRECTED);
  const socketErrors = ['Socket did not respond', null];
  const { reconciler } = makeReconciler({
    checkBitcoinCoreVersion,
    prepareServiceConfig: prepareFromData,
    getBitcoinSocketStartupError: async () => socketErrors.shift() ?? null,
    startStack: async (data) => { started.push(data); },
  });

  await reconciler.reconcile();
  assert.deepEqual(started, []);

  clock.now += AUTO_START_MIN_BACKOFF_MS + 1;
  await reconciler.reconcile();

  assert.equal(counter.count, 2, 'the old JDC is still up, so it must not pass as confirmed');
  assert.deepEqual(started, [CORRECTED_DATA]);
});

test('a stop that fails keeps the correction from being saved or started', async () => {
  clock.now = START_TIME;
  const { counter, checkBitcoinCoreVersion } = checkReturning(CORRECTED);
  const { reconciler, calls } = makeReconciler({
    checkBitcoinCoreVersion,
    prepareServiceConfig: prepareFromData,
    stopStack: async () => { throw new Error('cannot stop container'); },
  });

  await reconciler.reconcile();
  assert.deepEqual(calls, ['release']);

  clock.now += AUTO_START_MIN_BACKOFF_MS + 1;
  await reconciler.reconcile();
  assert.equal(counter.count, 2);
});

test('a correction is remembered once the stack has started on it', async () => {
  clock.now = START_TIME;
  const { counter, checkBitcoinCoreVersion } = checkReturning(CORRECTED);
  const { reconciler } = makeReconciler({
    checkBitcoinCoreVersion,
    prepareServiceConfig: prepareFromData,
  });

  await reconciler.reconcile();
  await reconciler.reconcile();

  assert.equal(counter.count, 1);
});

test('a stop that fails on a refusal still says why and backs off', async () => {
  clock.now = START_TIME;
  const { counter, checkBitcoinCoreVersion } = checkReturning(REFUSED);
  const { reconciler, calls } = makeReconciler({
    checkBitcoinCoreVersion,
    stopStack: async () => { throw new Error('cannot stop container'); },
  });

  await reconciler.reconcile();
  assert.equal(reconciler.bitcoinCoreVersionIssue()?.code, 'bitcoin-core-version-unconfirmed');
  assert.deepEqual(calls, ['release']);

  await reconciler.reconcile();
  assert.equal(counter.count, 1, 'within the backoff');

  clock.now += AUTO_START_MIN_BACKOFF_MS + 1;
  await reconciler.reconcile();
  assert.equal(counter.count, 2, 'and it keeps trying to stop that JDC');
});

test('does not start when the version cannot be confirmed, and says why', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({
    ...checkReturning(REFUSED),
    containers: { translator: DOWN, jdc: DOWN },
  });

  await reconciler.reconcile();

  assert.deepEqual(calls, ['release']);
  assert.equal(reconciler.bitcoinCoreVersionIssue()?.code, 'bitcoin-core-version-unconfirmed');
});

test('stops a stack it cannot confirm, even one that looks healthy', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({ ...checkReturning(REFUSED) });

  await reconciler.reconcile();

  assert.deepEqual(calls, ['stopStack', 'release']);
});

test('stops JDC it cannot confirm while Translator recovery is running', async () => {
  clock.now = START_TIME;
  const { reconciler, calls } = makeReconciler({
    ...checkReturning(REFUSED),
    containers: { translator: DOWN, jdc: UP },
  });

  await reconciler.reconcile();

  assert.deepEqual(calls, ['stopStack', 'release']);
});

test('backs off while the version cannot be confirmed, then recovers and clears the issue', async () => {
  clock.now = START_TIME;
  const { counter, checkBitcoinCoreVersion } = checkReturning(REFUSED, {
    kind: 'confirmed',
    data: SETUP_DATA,
  });
  const { reconciler, calls } = makeReconciler({
    checkBitcoinCoreVersion,
    containers: { translator: DOWN, jdc: DOWN },
  });

  await reconciler.reconcile();
  await reconciler.reconcile(); // within the backoff: not even attempted
  assert.equal(counter.count, 1);

  clock.now += AUTO_START_MIN_BACKOFF_MS + 1;
  await reconciler.reconcile();

  assert.equal(reconciler.bitcoinCoreVersionIssue(), null);
  assert.ok(calls.includes('startStack'));
});

test('waits for a node that is still starting without touching the stack or backing off', async () => {
  clock.now = START_TIME;
  const { counter, checkBitcoinCoreVersion } = checkReturning(
    { kind: 'node-starting' },
    { kind: 'node-starting' },
    { kind: 'confirmed', data: SETUP_DATA },
  );
  const { reconciler, calls } = makeReconciler({
    checkBitcoinCoreVersion,
    containers: { translator: DOWN, jdc: DOWN },
  });

  await reconciler.reconcile();
  await reconciler.reconcile();
  assert.deepEqual(calls, ['release', 'release']);
  assert.equal(reconciler.bitcoinCoreVersionIssue(), null);

  await reconciler.reconcile();
  assert.equal(counter.count, 3, 'each tick asks again: no backoff');
  assert.ok(calls.includes('startStack'));
});

test('leaves a node that is down to the socket check', async () => {
  clock.now = START_TIME;
  let socketChecks = 0;
  const { reconciler, calls } = makeReconciler({
    ...checkReturning({ kind: 'node-unavailable', error: 'Socket not found' }),
    containers: { translator: DOWN, jdc: DOWN },
    getBitcoinSocketStartupError: async () => {
      socketChecks += 1;
      return 'Socket not found';
    },
  });

  await reconciler.reconcile();

  assert.equal(socketChecks, 1);
  assert.deepEqual(calls, ['release']);
  assert.equal(reconciler.bitcoinCoreVersionIssue(), null, 'a down node is not a version problem');
});
