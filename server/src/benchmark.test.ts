import assert from 'node:assert/strict';
import test from 'node:test';

import type { PoolConfig, SetupData } from '@sv2-ui/shared';
import {
  BenchmarkManager,
  getCounterDelta,
  rotatePoolsForBenchmark,
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

test('summarizes latency using the arithmetic average', () => {
  assert.deepEqual(summarizeLatencySamples([10, 12, 11, 50]), {
    averageLatencyMs: 20.8,
  });
  assert.deepEqual(summarizeLatencySamples([]), {
    averageLatencyMs: null,
  });
});

test('computes non-negative share counter deltas', () => {
  assert.deepEqual(
    getCounterDelta(
      { accepted: 10, rejected: 2 },
      { accepted: 14, rejected: 3 }
    ),
    { accepted: 4, rejected: 1 }
  );
  assert.deepEqual(
    getCounterDelta(
      { accepted: 10, rejected: 2 },
      { accepted: 1, rejected: 0 }
    ),
    { accepted: 0, rejected: 0 }
  );
  assert.equal(getCounterDelta(null, { accepted: 1, rejected: 0 }), null);
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
  const counters = [
    { accepted: 10, rejected: 1 },
    { accepted: 13, rejected: 2 },
    { accepted: 20, rejected: 4 },
    { accepted: 22, rejected: 4 },
  ];
  let settled = 0;

  const manager = new BenchmarkManager({
    applyConfiguration: async (data) => {
      applied.push(structuredClone(data));
    },
    getActivePool: async () => ({ index: 0 }),
    readShareCounters: async () => counters.shift() ?? { accepted: 0, rejected: 0 },
    measureLatency: async (pool) => pool.name === 'Alpha' ? 10 : 20,
    sampleIntervalMs: 1,
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
  assert.equal(run?.results[0].averageLatencyMs, 10);
  assert.equal(run?.results[0].acceptedShares, 3);
  assert.equal(run?.results[0].rejectedShares, 1);
  assert.equal(run?.results[1].averageLatencyMs, 20);
  assert.equal(run?.results[1].acceptedShares, 2);
  assert.equal(run?.results[1].rejectedShares, 0);
  assert.deepEqual(applied.map((data) => data.pool?.name), ['Alpha', 'Beta', 'Alpha']);
  assert.deepEqual(applied.at(-1), SETUP);
  assert.equal(settled, 1);
});

test('stopping a run cancels unfinished rows and still restores the setup', async () => {
  const applied: SetupData[] = [];
  const manager = new BenchmarkManager({
    applyConfiguration: async (data) => {
      applied.push(structuredClone(data));
    },
    getActivePool: async () => ({ index: 0 }),
    readShareCounters: async () => ({ accepted: 0, rejected: 0 }),
    measureLatency: async () => 10,
    sampleIntervalMs: 5,
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
    readShareCounters: async () => ({ accepted: 0, rejected: 0 }),
    sampleIntervalMs: 1,
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
