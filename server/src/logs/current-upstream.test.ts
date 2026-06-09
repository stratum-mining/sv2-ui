import assert from 'node:assert/strict';
import test from 'node:test';

import { findCurrentUpstreamFromLines } from './current-upstream.js';

test('returns the only Trying upstream when there is one', () => {
  const lines = [
    'INFO translator_sv2: Trying upstream 1 of 1: stratum.braiins.com:3333',
    'INFO translator_sv2::sv2::upstream: Connected to upstream at 172.65.65.63:3333',
  ];
  assert.deepEqual(findCurrentUpstreamFromLines(lines), { host: 'stratum.braiins.com', port: 3333 });
});

test('after failover, returns the second upstream not the first that moved on', () => {
  const lines = [
    'INFO translator_sv2: Trying upstream 1 of 2: nonexistent-pool.invalid:3333',
    'WARN translator_sv2: Max retries reached for nonexistent-pool.invalid:3333, moving to next upstream',
    'INFO translator_sv2: Trying upstream 2 of 2: blitzpool.yourdevice.ch:3333',
    'INFO translator_sv2::sv2::upstream: Connected to upstream at 1.2.3.4:3333',
  ];
  assert.deepEqual(findCurrentUpstreamFromLines(lines), {
    host: 'blitzpool.yourdevice.ch',
    port: 3333,
  });
});

test('returns null when all upstreams failed', () => {
  const lines = [
    'INFO translator_sv2: Trying upstream 1 of 2: a.example.com:3333',
    'WARN translator_sv2: Max retries reached for a.example.com:3333, moving to next upstream',
    'INFO translator_sv2: Trying upstream 2 of 2: b.example.com:3333',
    'WARN translator_sv2: Max retries reached for b.example.com:3333, moving to next upstream',
    'ERROR translator_sv2: All upstreams failed after 3 retries each',
  ];
  assert.equal(findCurrentUpstreamFromLines(lines), null);
});

test('multi-cycle reconnect returns the most recent upstream', () => {
  const lines = [
    'INFO translator_sv2: Trying upstream 1 of 2: pool-a.example.com:3333',
    'INFO translator_sv2::sv2::upstream: Connected to upstream at 1.1.1.1:3333',
    'WARN translator_sv2: Max retries reached for pool-a.example.com:3333, moving to next upstream',
    'INFO translator_sv2: Trying upstream 2 of 2: pool-b.example.com:3333',
    'INFO translator_sv2::sv2::upstream: Connected to upstream at 2.2.2.2:3333',
    'WARN translator_sv2: Max retries reached for pool-b.example.com:3333, moving to next upstream',
    'INFO translator_sv2: Trying upstream 1 of 2: pool-a.example.com:3333',
    'INFO translator_sv2::sv2::upstream: Connected to upstream at 1.1.1.1:3333',
  ];
  assert.deepEqual(findCurrentUpstreamFromLines(lines), { host: 'pool-a.example.com', port: 3333 });
});

test('returns null on empty log', () => {
  assert.equal(findCurrentUpstreamFromLines([]), null);
});
