import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolConfig } from './types.js';
import { getPoolConfigError } from './pool-validation.js';

const VALID_POOL: PoolConfig = {
  name: 'Custom Pool',
  address: 'pool.example.com',
  port: 3333,
  authority_public_key: '9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna',
  user_identity: 'miner.worker1',
};

test('accepts a complete pool configuration', () => {
  assert.equal(getPoolConfigError(VALID_POOL, 'Primary pool'), null);
});

test('rejects empty and oversized pool names', () => {
  for (const name of ['', 'a'.repeat(129)]) {
    assert.match(
      getPoolConfigError({ ...VALID_POOL, name }, 'Primary pool') ?? '',
      /name is required/i,
    );
  }
});

test('rejects TOML-breaking pool addresses', () => {
  for (const address of ['pool.example.com"\nverify_payout = false', 'pool.example.com\\evil', 'pool.example.com\n']) {
    assert.match(
      getPoolConfigError({ ...VALID_POOL, address }, 'Primary pool') ?? '',
      /address/i,
    );
  }
});

test('rejects invalid and corrupted authority public keys', () => {
  assert.match(
    getPoolConfigError({ ...VALID_POOL, authority_public_key: 'not-a-key' }, 'Primary pool') ?? '',
    /public key is invalid/i,
  );
  assert.match(
    getPoolConfigError({
      ...VALID_POOL,
      authority_public_key: `${VALID_POOL.authority_public_key.slice(0, -1)}b`,
    }, 'Primary pool') ?? '',
    /public key is invalid/i,
  );
});

test('rejects invalid ports and oversized identities', () => {
  assert.match(
    getPoolConfigError({ ...VALID_POOL, port: 65536 }, 'Primary pool') ?? '',
    /port must be between/i,
  );
  assert.match(
    getPoolConfigError({ ...VALID_POOL, jds_port: 65536 }, 'Primary pool') ?? '',
    /JD port must be between/i,
  );
  assert.match(
    getPoolConfigError({ ...VALID_POOL, user_identity: 'a'.repeat(513) }, 'Primary pool') ?? '',
    /username/i,
  );
});
