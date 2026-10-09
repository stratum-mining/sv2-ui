import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRANSLATOR_FAILING_AFTER_MS, TranslatorRecovery } from './translator-recovery.js';

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
