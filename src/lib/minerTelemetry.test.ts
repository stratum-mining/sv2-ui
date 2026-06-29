import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMinerHashrate } from './minerTelemetry';

test('resolveMinerHashrate: prefers miner-reported hashrate over estimated fallback', () => {
  assert.deepEqual(
    resolveMinerHashrate({ reported_hashrate_hs: 883_045_410_200 }, 735_294_100_000),
    {
      hashrate: 883_045_410_200,
      source: 'miner_telemetry',
    }
  );
});

test('resolveMinerHashrate: treats zero miner-reported hashrate as a valid value', () => {
  assert.deepEqual(resolveMinerHashrate({ reported_hashrate_hs: 0 }, 735_294_100_000), {
    hashrate: 0,
    source: 'miner_telemetry',
  });
});

test('resolveMinerHashrate: falls back when miner telemetry is null', () => {
  assert.deepEqual(resolveMinerHashrate(null, 735_294_100_000), {
    hashrate: 735_294_100_000,
    source: 'estimated',
  });
});

test('resolveMinerHashrate: falls back when reported hashrate is null or missing', () => {
  assert.deepEqual(resolveMinerHashrate({ reported_hashrate_hs: null }, 735_294_100_000), {
    hashrate: 735_294_100_000,
    source: 'estimated',
  });
  assert.deepEqual(resolveMinerHashrate({}, 735_294_100_000), {
    hashrate: 735_294_100_000,
    source: 'estimated',
  });
});

test('resolveMinerHashrate: ignores non-finite values', () => {
  assert.deepEqual(resolveMinerHashrate({ reported_hashrate_hs: Number.NaN }, Number.POSITIVE_INFINITY), {
    hashrate: null,
    source: 'unavailable',
  });
});
