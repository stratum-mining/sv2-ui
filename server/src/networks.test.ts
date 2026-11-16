import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RPC_PORTS } from '@sv2-ui/shared';
import { getDiscoveryNetworks, isRegtestEnabled } from './networks.js';

test('regtest uses the Bitcoin Core default RPC port', () => {
  assert.equal(RPC_PORTS.regtest, 18443);
});

test('regtest is available by default outside production', () => {
  assert.equal(isRegtestEnabled({ NODE_ENV: 'development' }), true);
  assert.equal(isRegtestEnabled({}), true);
});

test('regtest stays hidden in production unless it is explicitly enabled', () => {
  assert.equal(isRegtestEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(isRegtestEnabled({ NODE_ENV: 'production', ENABLE_REGTEST: '1' }), true);
  assert.equal(isRegtestEnabled({ NODE_ENV: 'production', ENABLE_REGTEST: 'true' }), true);
});

test('an explicit setting wins over the environment default', () => {
  assert.equal(isRegtestEnabled({ NODE_ENV: 'development', ENABLE_REGTEST: '0' }), false);
  assert.equal(isRegtestEnabled({ NODE_ENV: 'development', ENABLE_REGTEST: 'false' }), false);
  assert.equal(isRegtestEnabled({ NODE_ENV: 'production', ENABLE_REGTEST: ' TRUE ' }), true);
});

test('an unrecognized value falls back to the environment default', () => {
  assert.equal(isRegtestEnabled({ NODE_ENV: 'development', ENABLE_REGTEST: 'yes' }), true);
  assert.equal(isRegtestEnabled({ NODE_ENV: 'production', ENABLE_REGTEST: 'yes' }), false);
});

test('discovery adds regtest only when it is enabled', () => {
  assert.deepEqual(
    getDiscoveryNetworks({ NODE_ENV: 'production' }),
    ['mainnet', 'testnet4'],
  );
  assert.deepEqual(
    getDiscoveryNetworks({ NODE_ENV: 'production', ENABLE_REGTEST: '1' }),
    ['mainnet', 'testnet4', 'regtest'],
  );
});
