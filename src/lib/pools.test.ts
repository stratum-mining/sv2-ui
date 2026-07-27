import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_FALLBACK_POOLS, type PoolConfig } from '@sv2-ui/shared';
import {
  appendEmptyCustomPool,
  canAddPool,
  knownPoolToConfig,
  SOLO_POOLS,
} from './pools';
import { isValidPoolAuthorityPubkey } from './utils';

const PRIMARY_POOL: PoolConfig = {
  name: 'Primary Pool',
  address: 'pool.example.com',
  port: 3333,
  authority_public_key: 'primary-key',
  user_identity: 'miner.worker',
};

test('appendEmptyCustomPool allows multiple custom fallback pools', () => {
  const withFirstCustomPool = appendEmptyCustomPool([PRIMARY_POOL], 'pool');
  const withSecondCustomPool = appendEmptyCustomPool(withFirstCustomPool, 'pool');

  assert.equal(withSecondCustomPool.length, 3);
  assert.equal(withSecondCustomPool[1].name, 'Custom Pool');
  assert.equal(withSecondCustomPool[2].name, 'Custom Pool');
  assert.equal(withSecondCustomPool[1].user_identity, PRIMARY_POOL.user_identity);
  assert.equal(withSecondCustomPool[2].user_identity, PRIMARY_POOL.user_identity);
});

test('pool additions stop at the configured fallback limit', () => {
  const maximumPools = Array.from(
    { length: MAX_FALLBACK_POOLS + 1 },
    (_, index) => ({
      ...PRIMARY_POOL,
      address: `pool-${index}.example.com`,
    }),
  );

  assert.equal(canAddPool(maximumPools.slice(0, -1)), true);
  assert.equal(canAddPool(maximumPools), false);
  assert.strictEqual(appendEmptyCustomPool(maximumPools, 'pool'), maximumPools);
});

test('solo pool presets are sorted alphabetically', () => {
  const names = SOLO_POOLS.map((pool) => pool.name);

  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('CKPool preset matches its SV2 solo endpoint', () => {
  const ckPool = SOLO_POOLS.find((pool) => pool.id === 'ckpool');

  assert.ok(ckPool);
  assert.deepEqual(knownPoolToConfig(ckPool), {
    name: 'CKPool',
    address: 'sv2solo.ckpool.org',
    port: 3336,
    authority_public_key: '9anrRNhBh7869XtNnFcCuGBRZP51E635qGbu457J5kHdszhfRc3',
    user_identity: '',
  });
  assert.equal(
    `stratum2+tcp://${ckPool.address}:${ckPool.port}/${ckPool.authority_public_key}`,
    'stratum2+tcp://sv2solo.ckpool.org:3336/9anrRNhBh7869XtNnFcCuGBRZP51E635qGbu457J5kHdszhfRc3',
  );
  assert.equal(isValidPoolAuthorityPubkey(ckPool.authority_public_key), true);
  assert.equal(ckPool.monogram, 'CK');
  assert.equal(ckPool.logoUrl, undefined);
});
