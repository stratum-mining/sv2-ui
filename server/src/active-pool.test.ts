import assert from 'node:assert/strict';
import test from 'node:test';

import { ActivePoolTracker, detectActivePool } from './active-pool.js';
import type { PoolConfig } from './types.js';
import type { ContainerLogLine } from './logs/types.js';

const POOLS: PoolConfig[] = [
  {
    name: 'Primary',
    address: 'primary.example.com',
    port: 3333,
    authority_public_key: 'primary-key',
    user_identity: 'miner',
  },
  {
    name: 'Fallback',
    address: 'fallback.example.com',
    port: 4444,
    authority_public_key: 'fallback-key',
    user_identity: 'miner',
  },
];

function log(message: string): ContainerLogLine {
  return {
    container: 'translator',
    stream: 'stderr',
    timestamp: '2026-07-17T10:00:00.000Z',
    message,
    raw: message,
  };
}

test('marks a fallback active after its connection succeeds', () => {
  const result = detectActivePool(POOLS, [
    log('Trying upstream 1 of 2: primary.example.com:3333'),
    log('Failed to connect to upstream'),
    log('Trying upstream 2 of 2: fallback.example.com:4444'),
    // Successful connections can log a DNS-resolved address.
    log('Connected to upstream at 192.0.2.42:4444'),
    log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
  ]);

  assert.equal(result.activeIndex, 1);
});

test('uses the newest successful connection when the primary recovers', () => {
  const result = detectActivePool(POOLS, [
    log('Trying upstream 2 of 2: fallback.example.com:4444'),
    log('Connected to upstream at 192.0.2.42:4444'),
    log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
    log('Trying upstream 1 of 2: primary.example.com:3333'),
    log('Connected to upstream at 192.0.2.10:3333'),
    log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
  ]);

  assert.equal(result.activeIndex, 0);
});

test('ignores an endpoint that does not agree with configured priority', () => {
  const result = detectActivePool(POOLS, [
    log('Trying upstream 2 of 2: attacker.example.com:4444'),
    log('Connected to upstream at 192.0.2.42:4444'),
    log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
  ]);

  assert.equal(result.activeIndex, null);
});

test('an invalid attempt cannot clear a previously connected pool', () => {
  const result = detectActivePool(
    POOLS,
    [log('Trying upstream 2 of 2: attacker.example.com:4444')],
    { activeIndex: 1, pendingIndex: null, connectedIndex: null }
  );

  assert.equal(result.activeIndex, 1);
});

test('uses reported priority when configured endpoints are duplicated', () => {
  const pools = [POOLS[0], { ...POOLS[0], name: 'Duplicate Fallback' }];
  const result = detectActivePool(pools, [
    log('Trying upstream 2 of 2: primary.example.com:3333'),
    log('Connected to upstream at 192.0.2.10:3333'),
    log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
  ]);

  assert.equal(result.activeIndex, 1);
});

test('directly matches configured IP connections without a preceding attempt line', () => {
  const pools = [{ ...POOLS[0], address: '192.0.2.10' }, POOLS[1]];
  const result = detectActivePool(pools, [
    log('Connected to upstream at 192.0.2.10:3333'),
    log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
  ]);

  assert.equal(result.activeIndex, 0);
});

test('does not switch pools when TCP connects but SV2 setup fails', () => {
  const result = detectActivePool(POOLS, [
    log('Trying upstream 2 of 2: fallback.example.com:4444'),
    log('Connected to upstream at 192.0.2.42:4444'),
    log('Failed Noise handshake with 192.0.2.42:4444: Invalid Certificate'),
  ]);

  assert.equal(result.activeIndex, null);
});

test('recognizes the JDC pool and JDS attempt format', () => {
  const result = detectActivePool(POOLS, [
    log('Trying upstream 2 of 2: pool=fallback.example.com:4444, jds=jds.example.com:4445'),
    log('Connected to upstream at 192.0.2.42:4444'),
    log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
  ]);

  assert.equal(result.activeIndex, 1);
});

test('tracker retains the connected fallback across incremental polls and log failures', async () => {
  const calls: Array<{ since?: number } | undefined> = [];
  let readCount = 0;
  const tracker = new ActivePoolTracker(async (_container, options) => {
    calls.push(options);
    readCount += 1;

    if (readCount === 1) {
      return [
        log('Trying upstream 2 of 2: fallback.example.com:4444'),
        log('Connected to upstream at 192.0.2.42:4444'),
        log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
      ];
    }
    throw new Error('container is restarting');
  });

  assert.deepEqual(await tracker.getActivePool('translator', POOLS), {
    name: 'Fallback',
    index: 1,
  });
  assert.deepEqual(await tracker.getActivePool('translator', POOLS), {
    name: 'Fallback',
    index: 1,
  });
  assert.equal(calls[0], undefined);
  assert.equal(typeof calls[1]?.since, 'number');
});

test('tracker carries a pending connection across incremental polls', async () => {
  let readCount = 0;
  const tracker = new ActivePoolTracker(async () => {
    readCount += 1;
    return readCount === 1
      ? [
          log('Trying upstream 2 of 2: fallback.example.com:4444'),
          log('Connected to upstream at 192.0.2.42:4444'),
        ]
      : [
          log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
        ];
  });

  assert.equal(await tracker.getActivePool('translator', POOLS), null);
  assert.deepEqual(await tracker.getActivePool('translator', POOLS), {
    name: 'Fallback',
    index: 1,
  });
});

test('invalidates the active pool when the authority key rotates without a new handshake', async () => {
  let readCount = 0;
  const tracker = new ActivePoolTracker(async (_container, options) => {
    readCount += 1;
    if (readCount === 1) {
      // Initial full read under the original key: a successful handshake.
      return [
        log('Trying upstream 2 of 2: fallback.example.com:4444'),
        log('Connected to upstream at 192.0.2.42:4444'),
        log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
      ];
    }
    // Second interaction.
    if (options === undefined) {
      // Fix path: the key change forces a full re-read, which now also shows
      // the new (not-yet-successful) attempt after the rotation.
      return [
        log('Trying upstream 2 of 2: fallback.example.com:4444'),
        log('Connected to upstream at 192.0.2.42:4444'),
        log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
        log('Trying upstream 2 of 2: fallback.example.com:4444'),
      ];
    }
    // Buggy path: unchanged configKey means an incremental read; no new logs
    // have appeared yet, so the stale active index would otherwise survive.
    return [];
  });

  const poolsWithKey = (key: string): PoolConfig[] => [
    { ...POOLS[0], authority_public_key: key },
    { ...POOLS[1] },
  ];

  // First: connected under the original key.
  assert.deepEqual(await tracker.getActivePool('translator', poolsWithKey('primary-key')), {
    name: 'Fallback',
    index: 1,
  });

  // Then the authority key rotates (same endpoint) without a new handshake.
  assert.equal(await tracker.getActivePool('translator', poolsWithKey('rotated-key')), null);
});

test('coalesces concurrent initial polls into one full-history log read', async () => {
  const calls: Array<{ since?: number } | undefined> = [];
  let readCount = 0;
  let releaseRead!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const tracker = new ActivePoolTracker(async (_container, options) => {
    calls.push(options);
    readCount += 1;
    await readGate;
    return [];
  });

  const requests = Array.from(
    { length: 32 },
    () => tracker.getActivePool('translator', POOLS)
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(readCount, 1);

  releaseRead();
  await Promise.all(requests);
  assert.equal(readCount, 1);

  // State was committed by the coalesced read, so the next poll reads
  // incrementally instead of the full history again.
  await tracker.getActivePool('translator', POOLS);
  assert.equal(readCount, 2);
  assert.equal(typeof calls[1]?.since, 'number');
});

test('does not coalesce concurrent polls with different configurations', async () => {
  let readCount = 0;
  let releaseRead!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const tracker = new ActivePoolTracker(async () => {
    readCount += 1;
    await readGate;
    return [];
  });

  const rotated = [
    { ...POOLS[0], authority_public_key: 'rotated-key' },
    { ...POOLS[1] },
  ];

  const requests = [
    tracker.getActivePool('translator', POOLS),
    tracker.getActivePool('translator', rotated),
  ];

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(readCount, 2);

  releaseRead();
  await Promise.all(requests);
});

test('clears the in-flight slot when a read fails so the next poll retries', async () => {
  let readCount = 0;
  let releaseRead!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const tracker = new ActivePoolTracker(async () => {
    readCount += 1;
    if (readCount === 1) {
      await readGate;
      throw new Error('container is restarting');
    }
    return [
      log('Trying upstream 2 of 2: fallback.example.com:4444'),
      log('Connected to upstream at 192.0.2.42:4444'),
      log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
    ];
  });

  const requests = Array.from(
    { length: 32 },
    () => tracker.getActivePool('translator', POOLS)
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(readCount, 1);

  releaseRead();
  // Without prior state a failed read reports no active pool for every
  // caller that joined the read.
  assert.deepEqual(await Promise.all(requests), Array<number>(32).fill(null));
  assert.equal(readCount, 1);

  // The next poll starts a fresh read instead of joining the dead one.
  assert.deepEqual(await tracker.getActivePool('translator', POOLS), {
    name: 'Fallback',
    index: 1,
  });
  assert.equal(readCount, 2);
});

test('coalesces concurrent incremental polls into one incremental read', async () => {
  const calls: Array<{ since?: number } | undefined> = [];
  let readCount = 0;
  let releaseRead!: () => void;
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const handshake = [
    log('Trying upstream 2 of 2: fallback.example.com:4444'),
    log('Connected to upstream at 192.0.2.42:4444'),
    log('Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)'),
  ];
  const tracker = new ActivePoolTracker(async (_container, options) => {
    calls.push(options);
    readCount += 1;
    if (readCount === 1) return handshake;
    await readGate;
    return [];
  });

  assert.deepEqual(await tracker.getActivePool('translator', POOLS), {
    name: 'Fallback',
    index: 1,
  });

  const requests = Array.from(
    { length: 8 },
    () => tracker.getActivePool('translator', POOLS)
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(readCount, 2);
  assert.equal(typeof calls[1]?.since, 'number');

  releaseRead();
  assert.deepEqual(await Promise.all(requests), Array.from({ length: 8 }, () => ({
    name: 'Fallback',
    index: 1,
  })));
});
