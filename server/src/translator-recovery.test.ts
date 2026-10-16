import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLOW_RETRY_MS } from './logs/parsers.js';
import { TRANSLATOR_FAILING_AFTER_MS, TranslatorRecovery } from './translator-recovery.js';
import type { DiagnosisRetryDecision } from './logs/parsers.js';

const CHECK_MS = 5_000;
const down = (jdcHasUpstream = true) => ({ kind: 'down', jdcHasUpstream }) as const;

/** Run one check per 5s and return the checks (by index) that restarted. */
function runChecks(recovery: TranslatorRecovery, count: number): number[] {
  const restartedAt: number[] = [];
  for (let check = 0; check < count; check += 1) {
    recovery.observe(down(), check * CHECK_MS);
    if (recovery.restartDue()) {
      recovery.recordRestart();
      restartedAt.push(check);
    }
  }
  return restartedAt;
}

test('restarts on the first check, then backs off to 5, 10, and 15 seconds', () => {
  assert.deepEqual(runChecks(new TranslatorRecovery(), 13), [0, 1, 3, 6, 9, 12]);
});

test('ends recovery only after the Translator stays up for two checks', () => {
  const recovery = new TranslatorRecovery();
  recovery.observe(down(), 0);
  recovery.recordRestart();

  recovery.observe({ kind: 'up' }, CHECK_MS);
  assert.equal(recovery.status(CHECK_MS).recovering, true);
  assert.equal(recovery.restartDue(), false);

  recovery.observe({ kind: 'up' }, 2 * CHECK_MS);
  assert.deepEqual(recovery.status(2 * CHECK_MS), { recovering: false, downForSecs: null, failing: false });
});

test('keeps counting downtime when a restarted Translator exits again', () => {
  const recovery = new TranslatorRecovery();
  recovery.observe(down(), 0);
  recovery.recordRestart();
  recovery.observe({ kind: 'up' }, CHECK_MS);
  recovery.observe(down(), 2 * CHECK_MS);

  assert.equal(recovery.status(2 * CHECK_MS).downForSecs, 10);
  assert.equal(recovery.restartDue(), true);
});

test('reports failing only after a minute down while JDC is connected upstream', () => {
  const recovery = new TranslatorRecovery();
  // JDC spends two minutes working through its pools first.
  recovery.observe(down(false), 0);
  recovery.observe(down(false), 120_000);
  assert.equal(recovery.status(120_000).failing, false);

  recovery.observe(down(true), 125_000);
  assert.equal(recovery.status(125_000 + TRANSLATOR_FAILING_AFTER_MS - 1).failing, false);
  assert.equal(recovery.status(125_000 + TRANSLATOR_FAILING_AFTER_MS).failing, true);
  assert.equal(recovery.status(125_000).downForSecs, 125);
});

test('JDC losing its upstream restarts the failing clock', () => {
  const recovery = new TranslatorRecovery();
  recovery.observe(down(true), 0);
  recovery.observe(down(false), 30_000);
  recovery.observe(down(true), 35_000);

  assert.equal(recovery.status(35_000 + TRANSLATOR_FAILING_AFTER_MS - 1).failing, false);
});

test('a full-stack restart path clears recovery state', () => {
  const recovery = new TranslatorRecovery();
  recovery.observe(down(), 0);
  recovery.recordRestart();
  recovery.observe({ kind: 'not-applicable' }, CHECK_MS);

  assert.deepEqual(recovery.status(CHECK_MS), { recovering: false, downForSecs: null, failing: false });
  recovery.observe(down(), 2 * CHECK_MS);
  assert.equal(recovery.restartDue(), true);
});

const pause: DiagnosisRetryDecision = { action: 'pause', codes: ['unknown-user'] };
const clean: DiagnosisRetryDecision = { action: 'proceed', codes: [] };
const slow: DiagnosisRetryDecision = {
  action: 'slow-retry',
  codes: ['invalid-certificate'],
};

test('gateRestart: a never diagnosis blocks the restart and logs once', () => {
  const recovery = new TranslatorRecovery();

  const first = recovery.gateRestart(pause, 0);
  assert.equal(first.allowed, false, 'unknown-user must not restart blind');
  assert.ok(first.message?.includes('unknown-user'));

  const second = recovery.gateRestart(pause, CHECK_MS);
  assert.deepEqual(second, { allowed: false, message: null }, 'same occurrence stays quiet');

  const other: DiagnosisRetryDecision = { action: 'pause', codes: ['future-code'] };
  const third = recovery.gateRestart(other, 2 * CHECK_MS);
  assert.ok(third.message, 'a different diagnosed failure logs again');
});

test('gateRestart: a clean log set allows and clears the logged pause', () => {
  const recovery = new TranslatorRecovery();
  recovery.gateRestart(pause, 0);

  assert.deepEqual(recovery.gateRestart(clean, CHECK_MS), { allowed: true, message: null });

  const again = recovery.gateRestart(pause, 2 * CHECK_MS);
  assert.ok(again.message, 'a recurrence after recovery logs once more');
});

test('gateRestart: a slow diagnosis restarts at most once per slow interval', () => {
  const recovery = new TranslatorRecovery();

  const first = recovery.gateRestart(slow, 0);
  assert.equal(first.allowed, true);
  assert.ok(first.message?.includes('10 minutes'));

  assert.deepEqual(
    recovery.gateRestart(slow, CHECK_MS),
    { allowed: false, message: null },
    'within the window the restart is paced'
  );

  const due = recovery.gateRestart(slow, SLOW_RETRY_MS);
  assert.equal(due.allowed, true, 'the window opens again after the slow interval');
  assert.ok(due.message);
});

test('gateRestart: gating leaves the observation state for the UI alone', () => {
  const recovery = new TranslatorRecovery();
  recovery.observe(down(true), 0);
  recovery.observe(down(true), CHECK_MS);

  const gate = recovery.gateRestart(pause, CHECK_MS);
  assert.equal(gate.allowed, false);

  // The dashboard keeps counting: down time grows and the failing clock runs.
  const at = 2 * CHECK_MS + TRANSLATOR_FAILING_AFTER_MS;
  recovery.observe(down(true), at);
  const status = recovery.status(at);
  assert.equal(status.recovering, true);
  assert.ok((status.downForSecs ?? 0) > 0);
  assert.equal(status.failing, true);
});

test('gateRestart: a recovery cycle clears the gate so the next pause logs', () => {
  const recovery = new TranslatorRecovery();
  recovery.observe(down(), 0);
  recovery.gateRestart(pause, 0);

  // JDC down too: the full stack path takes over and resets recovery.
  recovery.observe({ kind: 'not-applicable' }, CHECK_MS);
  recovery.observe(down(), 2 * CHECK_MS);

  const again = recovery.gateRestart(pause, 2 * CHECK_MS);
  assert.ok(again.message, 'state reset wipes the log-once key');
});
