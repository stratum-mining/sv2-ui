import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import {
  AGGREGATE_KEY,
  mergeCounterEntries,
  mergeMetricEntries,
  mergeShareStatsEntries,
  normalizeMetricKey,
  usePersistentBestDifficulty,
  usePersistentBlocksFound,
  usePersistentShareStats,
} from './usePersistentDashboardMetrics.js';

function withMockLocalStorage(store: Record<string, string>, run: () => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear() {},
      getItem(key: string) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      key() {
        return null;
      },
      get length() {
        return Object.keys(store).length;
      },
      removeItem() {},
      setItem() {},
    } satisfies Storage,
  });
  try {
    run();
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'localStorage', previous);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
  }
}

test('bounds persisted rejection-reason cardinality from untrusted telemetry', () => {
  const reasonCount = 10_000;
  const rejectedByReason = Object.fromEntries(
    Array.from({ length: reasonCount }, (_, index) => [`reason-${index}`, 1]),
  );
  const storedState = JSON.stringify({
    channel: {
      acknowledged: 0,
      submitted: reasonCount,
      rejected: reasonCount,
      rejectedByReason,
    },
  });

  withMockLocalStorage({ 'sv2_share_stats:default': storedState }, () => {
    let observedReasonCount = -1;
    function Probe() {
      observedReasonCount = usePersistentShareStats([], 'default').rejectionReasons.length;
      return null;
    }

    renderToString(createElement(Probe));
    assert.ok(
      observedReasonCount < reasonCount,
      `loaded all ${reasonCount} attacker-controlled reason labels`,
    );
  });
});

test('normalizeMetricKey hashes over-length keys instead of dropping them', () => {
  const longKey = `jdc:1:extended:2:${'x'.repeat(300)}`;
  const normalized = normalizeMetricKey(longKey);
  assert.ok(normalized.startsWith('h:'), 'over-length key should be hashed');
  assert.ok(normalized.length <= 256, 'hashed key must stay short');
  assert.equal(normalizeMetricKey('short-key'), 'short-key');
  assert.equal(normalizeMetricKey(AGGREGATE_KEY), AGGREGATE_KEY);
});

test('mergeCounterEntries bounds the entry count for over-cap snapshots', () => {
  const channelCount = 300;
  const entries = Array.from({ length: channelCount }, (_, index) => ({
    key: `ch:${index}`,
    value: 1,
  }));

  const { next } = mergeCounterEntries({}, entries);
  const realKeys = Object.keys(next).filter((key) => key !== AGGREGATE_KEY);

  assert.ok(realKeys.length <= 256, `expected <=256 real keys, got ${realKeys.length}`);
  assert.ok(
    !realKeys.some((key) => next[key].total > 1),
    'retained entries must keep their own values',
  );
});

test('repeated identical over-cap snapshots never inflate scalar totals', () => {
  const entries = Array.from({ length: 300 }, (_, index) => ({
    key: `ch:${index}`,
    value: 1,
  }));

  type CounterState = ReturnType<typeof mergeCounterEntries>['next'];
  const sum = (state: CounterState) =>
    Object.values(state).reduce((total, { total: value }) => total + value, 0);

  let state = mergeCounterEntries({}, entries).next;
  const baseline = sum(state);
  assert.ok(baseline <= 300 && baseline >= 256, `unexpected baseline total ${baseline}`);

  for (let merge = 2; merge <= 11; merge += 1) {
    state = mergeCounterEntries(state, entries).next;
    const total = sum(state);
    assert.equal(
      total,
      baseline,
      `merge ${merge} of an unchanged snapshot moved the total to ${total}`,
    );
  }

  const realKeys = Object.keys(state).filter((key) => key !== AGGREGATE_KEY);
  assert.ok(realKeys.length <= 256, 'entry count must stay bounded across repeats');
});

test('mergeCounterEntries keeps totals monotonic and bounded across channel churn', () => {
  let state: ReturnType<typeof mergeCounterEntries>['next'] = {};
  let previousTotal = 0;

  for (let batch = 0; batch < 5; batch += 1) {
    const entries = Array.from({ length: 300 }, (_, index) => ({
      key: `ch:${batch}-${index}`,
      value: 1,
    }));
    state = mergeCounterEntries(state, entries).next;
    const total = Object.values(state).reduce((sum, { total: value }) => sum + value, 0);
    assert.ok(total >= previousTotal, 'lifetime total must never decrease');
    assert.ok(
      total <= 256 * (batch + 1),
      'the bounded store can retain at most one full cohort per churn round',
    );
    previousTotal = total;
  }

  assert.equal(previousTotal, 1280, 'each churn round retains exactly one full cohort');
});

test('repeated identical over-cap snapshots never inflate share-stat totals', () => {
  const entries = Array.from({ length: 300 }, (_, index) => ({
    key: `ch:${index}`,
    acknowledged: 1,
    submitted: 2,
    rejected: 3,
    rejectedByReason: {},
  }));
  type ShareStatsState = ReturnType<typeof mergeShareStatsEntries>['next'];
  const counters = (state: ShareStatsState) =>
    Object.values(state).reduce(
      (total, entry) => total + entry.acknowledged + entry.submitted + entry.rejected,
      0,
    );

  let state = mergeShareStatsEntries({}, entries).next;
  const baseline = counters(state);
  assert.ok(baseline <= 300 * 6, `unexpected baseline total ${baseline}`);

  for (let merge = 2; merge <= 11; merge += 1) {
    state = mergeShareStatsEntries(state, entries).next;
    const total = counters(state);
    assert.equal(
      total,
      baseline,
      `merge ${merge} of an unchanged snapshot moved the totals to ${total}`,
    );
  }
});

test('evicting the best-difficulty holder preserves the displayed maximum', () => {
  const maxOf = (state: Record<string, number>) =>
    Object.values(state).reduce((best, value) => Math.max(best, value), 0);

  const baseEntries = Array.from({ length: 300 }, (_, index) => ({
    key: `ch:${index}`,
    value: 10,
  }));
  let state = mergeMetricEntries({}, baseEntries).next;
  assert.equal(maxOf(state), 10);

  // A much higher difficulty arrives alongside the base set, forcing the
  // eviction of the channel that reported it; the lifetime best must survive.
  const whaleEntries = [...baseEntries, { key: 'ch:whale', value: 1_000_000 }];
  state = mergeMetricEntries(state, whaleEntries).next;
  assert.equal(maxOf(state), 1_000_000, 'the evicted lifetime best must stay visible');

  for (let merge = 3; merge <= 7; merge += 1) {
    state = mergeMetricEntries(state, whaleEntries).next;
    assert.equal(maxOf(state), 1_000_000, `merge ${merge} lost the lifetime best`);
    assert.ok(maxOf(state) >= 1_000_000, 'displayed best difficulty must never decrease');
  }
});

test('usePersistentBestDifficulty treats the aggregate bucket as a lifetime maximum', () => {
  const storedState = JSON.stringify({
    [AGGREGATE_KEY]: 9999,
    'real:1': 5,
  });

  withMockLocalStorage({ 'sv2_best_diff:default': storedState }, () => {
    let observed = -1;
    function Probe() {
      observed = usePersistentBestDifficulty([], 'default');
      return null;
    }

    renderToString(createElement(Probe));
    assert.equal(observed, 9999, 'max must include the lifetime-best aggregate bucket');
  });
});

test('channel churn with unique rejection reasons keeps the aggregate bounded', () => {
  type ShareStatsState = ReturnType<typeof mergeShareStatsEntries>['next'];
  let state: ShareStatsState = {};

  for (let batch = 0; batch < 6; batch += 1) {
    const entries = Array.from({ length: 300 }, (_, index) => ({
      key: `ch:${batch}-${index}`,
      acknowledged: 1,
      submitted: 1,
      rejected: 2,
      rejectedByReason: {
        [`r:${batch}:${index}`]: 1,
        [`over-length:${batch}:${index}:${'x'.repeat(200)}`]: 1,
      },
    }));
    state = mergeShareStatsEntries(state, entries).next;

    const reasons = Object.keys(state[AGGREGATE_KEY]?.rejectedByReason ?? {});
    assert.ok(
      reasons.length <= 32,
      `aggregate bucket accumulated ${reasons.length} unique rejection labels`,
    );
    for (const reason of reasons) {
      assert.ok(reason.length <= 128, 'aggregate bucket kept an over-length reason label');
    }
  }
});

test('loading bounds an oversized stored aggregate rejection-reason map', () => {
  const hostileReasons: Record<string, number> = {};
  for (let index = 0; index < 5000; index += 1) {
    hostileReasons[`attacker:${index}:${'y'.repeat(300)}`] = index + 1;
  }
  for (let index = 0; index < 40; index += 1) {
    hostileReasons[`ok:${index}`] = 1000 - index;
  }
  const storedState = JSON.stringify({
    [AGGREGATE_KEY]: {
      acknowledged: 1,
      submitted: 1,
      rejected: 5040,
      rejectedByReason: hostileReasons,
    },
    'ch:1': { acknowledged: 0, submitted: 0, rejected: 0, rejectedByReason: {} },
  });

  withMockLocalStorage({ 'sv2_share_stats:default': storedState }, () => {
    let observedReasons: Array<{ reason: string; count: number }> = [];
    function Probe() {
      observedReasons = usePersistentShareStats([], 'default').rejectionReasons;
      return null;
    }

    renderToString(createElement(Probe));
    assert.ok(
      observedReasons.length <= 32,
      `loaded ${observedReasons.length} aggregate reason labels`,
    );
    for (const item of observedReasons) {
      assert.ok(item.reason.length <= 128, 'loaded an over-length aggregate reason label');
    }
    assert.deepEqual(
      observedReasons.slice(0, 3).map((item) => item.reason),
      ['ok:0', 'ok:1', 'ok:2'],
      'surviving labels must be ranked by count',
    );
  });
});

test('usePersistentBestDifficulty computes a bounded max without a spread RangeError', () => {
  const indices = Array.from({ length: 10000 }, (_, index) => index);
  const storedState = JSON.stringify(
    Object.fromEntries(indices.map((index) => [`k:${index}`, index % 7])),
  );
  const expectedMax = Math.max(...indices.slice(-256).map((index) => index % 7));

  withMockLocalStorage({ 'sv2_best_diff:default': storedState }, () => {
    let observed = -1;
    function Probe() {
      observed = usePersistentBestDifficulty([], 'default');
      return null;
    }

    assert.doesNotThrow(() => renderToString(createElement(Probe)));
    assert.equal(observed, expectedMax, 'max of the last 256 stored entries (no spread)');
  });
});

test('usePersistentBlocksFound normalizes an oversized stored state at load', () => {
  const storedState = JSON.stringify(
    Object.fromEntries(Array.from({ length: 10000 }, (_, index) => [`k:${index}`, 1])),
  );

  withMockLocalStorage({ 'sv2_blocks_found:default': storedState }, () => {
    let observed = -1;
    function Probe() {
      observed = usePersistentBlocksFound([], 'default');
      return null;
    }

    assert.doesNotThrow(() => renderToString(createElement(Probe)));
    assert.equal(observed, 256, 'load caps the unbounded stored metric to the entry limit');
  });
});

test('usePersistentShareStats resets state when the stored payload exceeds the size limit', () => {
  const padding = 'x'.repeat(3 * 1024 * 1024);
  const storedState = JSON.stringify({
    channel: { acknowledged: 1, submitted: 1, rejected: 1, rejectedByReason: {} },
    padding,
  });

  withMockLocalStorage({ 'sv2_share_stats:default': storedState }, () => {
    let observed = undefined as ReturnType<typeof usePersistentShareStats> | undefined;
    function Probe() {
      observed = usePersistentShareStats([], 'default');
      return null;
    }

    renderToString(createElement(Probe));
    assert.equal(observed?.acknowledged, 0, 'oversized payload is discarded');
    assert.equal(observed?.rejectionReasons.length, 0);
  });
});

test('share totals add up across a restart instead of freezing', () => {
  const key = 'jdc:server:extended:1:worker';
  const snapshot = (submitted: number, rejected: number) => [{
    key,
    acknowledged: submitted - rejected,
    submitted,
    rejected,
    rejectedByReason: (rejected > 0 ? { 'invalid-share': rejected } : {}) as Record<string, number>,
  }];
  const totals = (state: ReturnType<typeof mergeShareStatsEntries>['next']) => ({
    submitted: state[key].submitted,
    rejected: state[key].rejected,
    reasons: state[key].rejectedByReason,
  });

  let state = mergeShareStatsEntries({}, snapshot(654, 1)).next;
  // The same counters again (cached data, a page reload) add nothing.
  state = mergeShareStatsEntries(state, snapshot(654, 1)).next;
  assert.deepEqual(totals(state), { submitted: 654, rejected: 1, reasons: { 'invalid-share': 1 } });

  // Restart: the channel comes back under the same key with counters from 0.
  state = mergeShareStatsEntries(state, snapshot(10, 0)).next;
  assert.deepEqual(totals(state), { submitted: 664, rejected: 1, reasons: { 'invalid-share': 1 } });

  state = mergeShareStatsEntries(state, snapshot(700, 2)).next;
  assert.deepEqual(totals(state), { submitted: 1354, rejected: 3, reasons: { 'invalid-share': 3 } });
});

test('a total saved before live counters were kept carries on without doubling', () => {
  const key = 'jdc:server:extended:1:worker';
  const saved = { [key]: { acknowledged: 600, submitted: 600, rejected: 0, rejectedByReason: {} } };

  const same = mergeShareStatsEntries(saved, [{ key, acknowledged: 610, submitted: 610, rejected: 0 }]).next;
  assert.equal(same[key].submitted, 610, 'same run: only the 10 new shares are added');

  const restarted = mergeShareStatsEntries(saved, [{ key, acknowledged: 5, submitted: 5, rejected: 0 }]).next;
  assert.equal(restarted[key].submitted, 605, 'new run: its shares are added on top');
});

test('blocks found add up across a restart', () => {
  const key = 'jdc:1:extended:1:worker';
  let state = mergeCounterEntries({}, [{ key, value: 1 }]).next;
  state = mergeCounterEntries(state, [{ key, value: 1 }]).next;
  state = mergeCounterEntries(state, [{ key, value: 0 }]).next;
  state = mergeCounterEntries(state, [{ key, value: 1 }]).next;
  assert.equal(state[key].total, 2);
});

test('blocks found saved as plain numbers still load', () => {
  withMockLocalStorage({ 'sv2_blocks_found:default': JSON.stringify({ a: 2, b: 1 }) }, () => {
    let observed = -1;
    function Probe() {
      observed = usePersistentBlocksFound([], 'default');
      return null;
    }
    renderToString(createElement(Probe));
    assert.equal(observed, 3);
  });
});
