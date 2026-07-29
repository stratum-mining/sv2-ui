import assert from 'node:assert/strict';
import test from 'node:test';

import type { PoolConfig, SetupData } from '@sv2-ui/shared';
import {
  BenchmarkManager,
  rotatePoolsForBenchmark,
  ShareCounterAccumulator,
  summarizeLatencySamples,
} from './benchmark.js';

const POOLS: PoolConfig[] = [
  {
    name: 'Alpha',
    address: 'alpha.example.com',
    port: 3333,
    authority_public_key: 'alpha-key',
    user_identity: 'miner',
  },
  {
    name: 'Beta',
    address: 'beta.example.com',
    port: 4444,
    authority_public_key: 'beta-key',
    user_identity: 'miner',
  },
];

const SETUP: SetupData = {
  miningMode: 'solo',
  mode: 'no-jd',
  pool: POOLS[0],
  fallbackPools: [POOLS[1]],
  bitcoin: null,
  jdc: null,
  translator: {
    enable_vardiff: true,
    aggregate_channels: false,
    min_hashrate: 1,
    shares_per_minute: 1,
    downstream_extranonce2_size: 4,
  },
};

test('summarizes latency using the median so outliers cannot dominate', () => {
  assert.deepEqual(summarizeLatencySamples([10, 12, 11, 50]), {
    medianLatencyMs: 11.5,
  });
  assert.deepEqual(summarizeLatencySamples([10, 12, 11]), {
    medianLatencyMs: 11,
  });
  assert.deepEqual(summarizeLatencySamples([]), {
    medianLatencyMs: null,
  });
});

test('accumulates shares when channels disconnect, reconnect, or reset', () => {
  const accumulator = new ShareCounterAccumulator();

  assert.deepEqual(accumulator.update([
    { key: 'extended:1', accepted: 10, stale: 1 },
    { key: 'extended:2', accepted: 5, stale: 0 },
  ]), { accepted: 0, stale: 0 });
  assert.deepEqual(accumulator.update([
    { key: 'extended:1', accepted: 12, stale: 2 },
    { key: 'extended:2', accepted: 6, stale: 0 },
  ]), { accepted: 3, stale: 1 });
  assert.deepEqual(accumulator.update([
    { key: 'extended:1', accepted: 13, stale: 2 },
  ]), { accepted: 4, stale: 1 });
  assert.deepEqual(accumulator.update([
    { key: 'extended:1', accepted: 14, stale: 2 },
    { key: 'extended:3', accepted: 2, stale: 1 },
  ]), { accepted: 7, stale: 2 });
  assert.deepEqual(accumulator.update([
    { key: 'extended:1', accepted: 1, stale: 0 },
    { key: 'extended:3', accepted: 3, stale: 1 },
  ]), { accepted: 9, stale: 2 });
});

test('rotates the existing ordered fallback list without mutating the saved setup', () => {
  const rotated = rotatePoolsForBenchmark(SETUP, POOLS, 1);

  assert.equal(rotated.pool?.name, 'Beta');
  assert.deepEqual(rotated.fallbackPools.map((pool) => pool.name), ['Alpha']);
  assert.equal(SETUP.pool?.name, 'Alpha');
  assert.deepEqual(SETUP.fallbackPools.map((pool) => pool.name), ['Beta']);
});

test('runs each pool, records measurements, and restores the original setup', async () => {
  const applied: SetupData[] = [];
  const counterReads = new Map<string, number>();
  let settled = 0;

  const manager = new BenchmarkManager({
    applyConfiguration: async (data) => {
      applied.push(structuredClone(data));
    },
    getActivePool: async () => ({ index: 0 }),
    readShareCounters: async () => {
      const poolName = applied.at(-1)?.pool?.name ?? '';
      const readCount = (counterReads.get(poolName) ?? 0) + 1;
      counterReads.set(poolName, readCount);

      if (poolName === 'Alpha') {
        return readCount === 1
          ? [{ key: 'extended:1', accepted: 10, stale: 1 }]
          : [{ key: 'extended:1', accepted: 13, stale: 2 }];
      }

      return readCount === 1
        ? [{ key: 'extended:1', accepted: 20, stale: 4 }]
        : [{ key: 'extended:1', accepted: 22, stale: 4 }];
    },
    measureLatency: async (pool) => pool.name === 'Alpha' ? 10 : 20,
    sampleIntervalMs: 1,
    // Multi-sample scheduling is covered separately. Keep this orchestration
    // test independent of sub-millisecond timer precision on slower CI hosts.
    maxLatencySamples: 1,
    activePoolPollIntervalMs: 1,
    activePoolTimeoutMs: 20,
    onSettled: () => {
      settled += 1;
    },
  });

  manager.start(SETUP, POOLS, 0.01);
  await manager.waitForCompletion();

  const run = manager.getSnapshot();
  assert.equal(run?.status, 'completed');
  assert.deepEqual(run?.results.map((result) => result.status), ['completed', 'completed']);
  assert.equal(run?.results[0].medianLatencyMs, 10);
  assert.equal(run?.results[0].acceptedShares, 3);
  assert.equal(run?.results[0].staleShares, 1);
  assert.equal(run?.results[1].medianLatencyMs, 20);
  assert.equal(run?.results[1].acceptedShares, 2);
  assert.equal(run?.results[1].staleShares, 0);
  assert.deepEqual(applied.map((data) => data.pool?.name), ['Alpha', 'Beta', 'Alpha']);
  assert.deepEqual(applied.at(-1), SETUP);
  assert.equal(settled, 1);
});

test('publishes accepted and stale share deltas while a pool is still running', async () => {
  let counterRead = 0;
  const manager = new BenchmarkManager({
    applyConfiguration: async () => {},
    getActivePool: async () => ({ index: 0 }),
    readShareCounters: async () => {
      counterRead += 1;
      return counterRead === 1
        ? [{ key: 'extended:1', accepted: 10, stale: 1 }]
        : [{ key: 'extended:1', accepted: 12, stale: 2 }];
    },
    measureLatency: async () => 10,
    sampleIntervalMs: 1,
    maxLatencySamples: 2,
    activePoolPollIntervalMs: 1,
    activePoolTimeoutMs: 20,
  });

  manager.start(SETUP, POOLS, 1);

  let liveRun = manager.getSnapshot();
  for (let attempt = 0; attempt < 100 && liveRun?.results[0].acceptedShares !== 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    liveRun = manager.getSnapshot();
  }

  assert.equal(liveRun?.status, 'running');
  assert.equal(liveRun?.results[0].status, 'running');
  assert.equal(liveRun?.results[0].acceptedShares, 2);
  assert.equal(liveRun?.results[0].staleShares, 1);

  assert.equal(manager.stop(), true);
  await manager.waitForCompletion();
});

test('spreads latency attempts across the interval and does not rank partial success', async () => {
  const attemptTimes: number[] = [];
  const manager = new BenchmarkManager({
    applyConfiguration: async () => {},
    getActivePool: async () => ({ index: 0 }),
    readShareCounters: async () => [],
    measureLatency: async () => {
      attemptTimes.push(Date.now());
      if (attemptTimes.length === 2) {
        throw new Error('connection refused');
      }
      return 10;
    },
    sampleIntervalMs: 5,
    maxLatencySamples: 3,
    activePoolPollIntervalMs: 1,
    activePoolTimeoutMs: 20,
  });

  manager.start(SETUP, [POOLS[0]], 0.06);
  await manager.waitForCompletion();

  const result = manager.getSnapshot()?.results[0];
  assert.equal(result?.status, 'failed');
  assert.equal(result?.attemptedSamples, 3);
  assert.equal(result?.successfulSamples, 2);
  assert.equal(result?.medianLatencyMs, null);
  assert.match(result?.error ?? '', /no latency rank was assigned/i);
  assert.equal(attemptTimes.length, 3);
  assert.ok(attemptTimes[2] - attemptTimes[0] >= 30);
});

test('stopping a run cancels unfinished rows and still restores the setup', async () => {
  const applied: SetupData[] = [];
  const manager = new BenchmarkManager({
    applyConfiguration: async (data) => {
      applied.push(structuredClone(data));
    },
    getActivePool: async () => ({ index: 0 }),
    readShareCounters: async () => [],
    measureLatency: async () => 10,
    sampleIntervalMs: 5,
    maxLatencySamples: 2,
    activePoolPollIntervalMs: 1,
    activePoolTimeoutMs: 20,
  });

  manager.start(SETUP, POOLS, 1);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(manager.stop(), true);
  await manager.waitForCompletion();

  const run = manager.getSnapshot();
  assert.equal(run?.status, 'cancelled');
  assert.ok(run?.results.some((result) => result.status === 'cancelled'));
  assert.deepEqual(applied.at(-1), SETUP);
});

test('marks the intended pool failed when the fallback becomes active', async () => {
  const manager = new BenchmarkManager({
    applyConfiguration: async () => {},
    getActivePool: async () => ({ index: 1 }),
    readShareCounters: async () => [],
    sampleIntervalMs: 1,
    maxLatencySamples: 2,
    activePoolPollIntervalMs: 1,
    activePoolTimeoutMs: 20,
  });

  manager.start(SETUP, POOLS, 0.01);
  await manager.waitForCompletion();

  const run = manager.getSnapshot();
  assert.equal(run?.status, 'completed');
  assert.equal(run?.results[0].status, 'failed');
  assert.match(run?.results[0].error ?? '', /Beta became active/i);
});
