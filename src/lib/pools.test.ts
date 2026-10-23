import assert from 'node:assert/strict';
import test from 'node:test';

import type { PoolConfig, SetupData } from '@sv2-ui/shared';
import {
  ALL_KNOWN_POOLS,
  POOL_MINING_JD,
  POOL_MINING_NO_JD,
  SOLO_POOLS,
  knownPoolToConfig,
  getKnownPoolForConfig,
  getMovedPresetPools,
  getUnselectedPresets,
  withCurrentPresetEndpoints,
  isSameTrustedPool,
  hasSameEndpoint,
  isDuplicatePoolEndpoint,
  createEmptyCustomPool,
  getNextCustomPoolName,
  getDuplicatePoolEndpointIndexes,
  type KnownPool,
} from './pools';
import { isValidPoolAuthorityPubkey } from './utils';

test('solo pool presets are sorted alphabetically', () => {
  const names = SOLO_POOLS.map((pool) => pool.name);

  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('CKPool preset matches its SV2 solo endpoint', () => {
  const ckPool = SOLO_POOLS.find((pool) => pool.id === 'ckpool');

  assert.ok(ckPool);
  assert.deepEqual(knownPoolToConfig(ckPool), {
    name: 'CKPool',
    address: 'stratum.ckpool.org',
    port: 3336,
    authority_public_key: '9anrRNhBh7869XtNnFcCuGBRZP51E635qGbu457J5kHdszhfRc3',
    user_identity: '',
  });
  assert.equal(
    `stratum2+tcp://${ckPool.address}:${ckPool.port}/${ckPool.authority_public_key}`,
    'stratum2+tcp://stratum.ckpool.org:3336/9anrRNhBh7869XtNnFcCuGBRZP51E635qGbu457J5kHdszhfRc3',
  );
  assert.equal(isValidPoolAuthorityPubkey(ckPool.authority_public_key), true);
  assert.equal(ckPool.monogram, 'CK');
  assert.equal(ckPool.logoUrl, undefined);
});

test('an unverified display name cannot establish trusted pool identity', () => {
  const attackerSuppliedConfig = {
    name: 'Braiins Pool',
    address: 'attacker.example',
    port: 3333,
    authority_public_key: '',
  };

  assert.equal(getKnownPoolForConfig(attackerSuppliedConfig), null,
    'a user-controlled name alone must not grant official pool branding');
});

test('correct address and port with wrong authority key must not receive official branding', () => {
  const wrongAuthorityConfig = {
    name: 'Braiins Pool',
    address: 'stratum.braiins.com',
    port: 3333,
    authority_public_key: '1111111111111111111111111111111111111111111111111111111111111111',
  };

  assert.equal(getKnownPoolForConfig(wrongAuthorityConfig), null,
    'an official endpoint with a forged authority key must not receive official pool branding');
});

test('getKnownPoolForConfig returns the preset for a fully matching config', () => {
  const known = SOLO_POOLS[0];
  const config = {
    name: known.name,
    address: known.address,
    port: known.port,
    authority_public_key: known.authority_public_key,
  };

  assert.equal(getKnownPoolForConfig(config)?.id, known.id,
    'a config with matching address, port and authority key resolves to the known pool');
});

// Every endpoint a preset has had since presets started keeping their previous
// endpoints. Saved setups may hold any of them, so each must keep resolving to
// its preset. When a preset moves, add its new endpoint here and keep the old
// one. Remove an entry only together with its preset, or when its key leaked
// (see previousEndpoints).
const SHIPPED_PRESET_ENDPOINTS = [
  { id: 'braiins', address: 'stratum.braiins.com', port: 3333, authority_public_key: '9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna' },
  { id: 'sri-solo', address: '75.119.150.111', port: 3333, authority_public_key: '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72' },
  { id: 'blitzpool', address: 'blitzpool.yourdevice.ch', port: 3333, authority_public_key: '9bCoFxTszKCuffyywH5uS5o6WcU4vsjTH2axxc7wE86y2HhvULU' },
  { id: 'ckpool', address: 'sv2solo.ckpool.org', port: 3336, authority_public_key: '9anrRNhBh7869XtNnFcCuGBRZP51E635qGbu457J5kHdszhfRc3' },
  { id: 'ckpool', address: 'stratum.ckpool.org', port: 3336, authority_public_key: '9anrRNhBh7869XtNnFcCuGBRZP51E635qGbu457J5kHdszhfRc3' },
  { id: 'nexuspool', address: 'nexuspool.io', port: 3350, authority_public_key: '9amd6GUzTaGXASESCa75c9Rx3vWYihRyLUAE3Vrmqwgm3T9jtxN' },
  { id: 'publicpool', address: 'public-pool.io', port: 3333, authority_public_key: '9c4zpyJ2ndm4e8sP2uNc1VNCGxYjqaxWS6wUCjk8zFj6njFquH6' },
  { id: 'publicpool', address: 'public-pool.io', port: 23330, authority_public_key: '9c4zpyJ2ndm4e8sP2uNc1VNCGxYjqaxWS6wUCjk8zFj6njFquH6' },
  { id: 'pyblock', address: 'pool.pyblock.xyz', port: 5555, authority_public_key: '9anZZb1uaJDqubvJhekPiNRHA2tuShcNaugDmFxtnTq54sDvTf5' },
];

// The editors look presets up in one of these lists, and the SRI pool is in two
// of them, so each list has to recognize every endpoint its presets have had.
const PRESET_LISTS = { POOL_MINING_NO_JD, POOL_MINING_JD, SOLO_POOLS };

test('every shipped preset endpoint still resolves to its preset in each list', () => {
  for (const [listName, presets] of Object.entries(PRESET_LISTS)) {
    for (const { id, ...endpoint } of SHIPPED_PRESET_ENDPOINTS) {
      if (!presets.some((preset) => preset.id === id)) continue;
      assert.equal(getKnownPoolForConfig(endpoint, presets)?.id, id,
        `setups saved with ${endpoint.address}:${endpoint.port} must still resolve to ${id} in ${listName}: ` +
          'add it to that preset\'s previousEndpoints');
    }
  }
});

test('every current preset endpoint is listed as shipped', () => {
  for (const preset of ALL_KNOWN_POOLS) {
    assert.ok(
      SHIPPED_PRESET_ENDPOINTS.some((endpoint) => endpoint.id === preset.id && isSameTrustedPool(endpoint, preset)),
      `add ${preset.address}:${preset.port} to SHIPPED_PRESET_ENDPOINTS`,
    );
  }
});

const OLD_ENDPOINT = { address: 'old.pool.example', port: 3333, authority_public_key: 'OLD_KEY' };
const MOVED_PRESET: KnownPool = { ...SOLO_POOLS[0], previousEndpoints: [OLD_ENDPOINT] };
const OTHER_PRESET = SOLO_POOLS[1];

function savedSetup(pools: PoolConfig[], mode: SetupData['mode'] = 'no-jd'): SetupData {
  return {
    miningMode: 'solo',
    mode,
    miner_telemetry_cidr: '',
    pool: pools[0] ?? null,
    fallbackPools: pools.slice(1),
    bitcoin: null,
    jdc: null,
    translator: null,
  };
}

test('a pool saved with a preset\'s previous endpoint is still that preset', () => {
  assert.equal(getKnownPoolForConfig(OLD_ENDPOINT, [MOVED_PRESET]), MOVED_PRESET);
  assert.equal(getKnownPoolForConfig({ ...OLD_ENDPOINT, authority_public_key: 'OTHER' }, [MOVED_PRESET]), null,
    'a previous endpoint with a different authority key must not receive official branding');
});

test('a preset\'s current endpoint wins over another preset\'s previous one', () => {
  const takenOver: KnownPool = { ...OTHER_PRESET, ...OLD_ENDPOINT };

  assert.equal(getKnownPoolForConfig(OLD_ENDPOINT, [MOVED_PRESET, takenOver]), takenOver);
});

test('pools on a moved preset\'s old endpoint are offered the current one', () => {
  const moved = { name: MOVED_PRESET.name, ...OLD_ENDPOINT, user_identity: 'bc1qexample' };
  const custom = { ...createEmptyCustomPool('bc1qexample'), address: 'custom.pool.example' };
  const config = savedSetup([custom, moved]);

  assert.deepEqual(getMovedPresetPools(config, [MOVED_PRESET]), [{ pool: moved, preset: MOVED_PRESET }]);
  assert.deepEqual(withCurrentPresetEndpoints(config, [MOVED_PRESET]), {
    pool: custom,
    fallbackPools: [knownPoolToConfig(MOVED_PRESET, 'bc1qexample')],
  }, 'only the moved pool\'s endpoint changes; its identity and priority stay');
  assert.deepEqual(getMovedPresetPools(savedSetup([moved], 'jd'), [MOVED_PRESET]), [],
    'sovereign solo mining uses no pools, even when an older save still holds one');
  assert.deepEqual(getMovedPresetPools(null, [MOVED_PRESET]), []);
});

test('moving a pool onto an endpoint already in the list keeps only the higher-priority entry', () => {
  const moved = { name: MOVED_PRESET.name, ...OLD_ENDPOINT, user_identity: 'primary' };
  const other = knownPoolToConfig(OTHER_PRESET, 'other');
  const current = knownPoolToConfig(MOVED_PRESET, 'fallback');
  const update = withCurrentPresetEndpoints(savedSetup([moved, other, current]), [MOVED_PRESET, OTHER_PRESET]);

  assert.deepEqual(update, { pool: knownPoolToConfig(MOVED_PRESET, 'primary'), fallbackPools: [other] });
});

test('the pool editors do not offer a preset again for a pool on its old endpoint', () => {
  const moved = { name: MOVED_PRESET.name, ...OLD_ENDPOINT, user_identity: '' };
  const wrongKey = { ...knownPoolToConfig(OTHER_PRESET), authority_public_key: 'OTHER' };

  assert.deepEqual(getUnselectedPresets([MOVED_PRESET, OTHER_PRESET], [moved]), [OTHER_PRESET]);
  assert.deepEqual(getUnselectedPresets([MOVED_PRESET, OTHER_PRESET], [wrongKey]), [MOVED_PRESET],
    'a wrong-key entry still occupies the preset\'s endpoint');
});

test('isSameTrustedPool requires address, port and authority key to all match', () => {
  const a = { address: 'pool.example', port: 3333, authority_public_key: 'KEY' };
  const sameKey = { address: 'pool.example', port: 3333, authority_public_key: 'KEY' };
  const wrongKey = { address: 'pool.example', port: 3333, authority_public_key: 'OTHER' };
  const wrongPort = { address: 'pool.example', port: 3334, authority_public_key: 'KEY' };

  assert.equal(isSameTrustedPool(a, sameKey), true);
  assert.equal(isSameTrustedPool(a, wrongKey), false, 'different authority key is not the same trusted pool');
  assert.equal(isSameTrustedPool(a, wrongPort), false, 'different port is not the same trusted pool');
  assert.equal(isSameTrustedPool(a, null), false, 'null is never the same trusted pool');
  assert.equal(isSameTrustedPool(null, a), false, 'null is never the same trusted pool');
  assert.equal(isSameTrustedPool(a, { ...a, address: 'POOL.EXAMPLE' }), true, 'address comparison is case-insensitive');
});

test('hasSameEndpoint compares address and port only, ignoring authority key', () => {
  const a = { address: 'pool.example', port: 3333 };
  const sameEndpoint = { address: 'pool.example', port: 3333 };
  const wrongKey = { address: 'pool.example', port: 3333, authority_public_key: 'OTHER' };
  const wrongPort = { address: 'pool.example', port: 3334 };

  assert.equal(hasSameEndpoint(a, sameEndpoint), true);
  assert.equal(hasSameEndpoint(a, { ...wrongKey }), true, 'endpoint match ignores the authority key');
  assert.equal(hasSameEndpoint(a, wrongPort), false, 'different port is a different endpoint');
  assert.equal(hasSameEndpoint(a, null), false);
  assert.equal(hasSameEndpoint(a, { ...a, address: 'POOL.EXAMPLE' }), true, 'address comparison is case-insensitive');
});

test('isDuplicatePoolEndpoint collapses same-endpoint entries regardless of key', () => {
  const correct = { address: 'pool.example', port: 3333, authority_public_key: 'KEY' };
  const wrongKey = { address: 'pool.example', port: 3333, authority_public_key: 'OTHER' };

  assert.equal(isDuplicatePoolEndpoint(correct, wrongKey), true,
    'a wrong-key entry at a known endpoint is still a duplicate and must not be re-added');
  assert.equal(isDuplicatePoolEndpoint(correct, { ...correct, port: 3334 }), false);
});

test('getNextCustomPoolName gives each additional custom pool a unique name', () => {
  assert.equal(getNextCustomPoolName([]), 'Custom Pool');

  const first = createEmptyCustomPool('', getNextCustomPoolName([]));
  const second = createEmptyCustomPool('', getNextCustomPoolName([first]));
  const third = createEmptyCustomPool('', getNextCustomPoolName([first, second]));

  assert.deepEqual([first.name, second.name, third.name], ['Custom Pool', 'Custom Pool 2', 'Custom Pool 3']);
});

test('getNextCustomPoolName reuses the lowest free suffix', () => {
  const remaining = [{ name: 'Custom Pool' }, { name: 'Custom Pool 3' }];

  assert.equal(getNextCustomPoolName(remaining), 'Custom Pool 2');
  assert.equal(getNextCustomPoolName([{ name: 'Custom Pool 2' }]), 'Custom Pool',
    'the unsuffixed name is reused once it is free');
});

test('getDuplicatePoolEndpointIndexes allows several empty custom pools', () => {
  const pools = [createEmptyCustomPool(), createEmptyCustomPool('', 'Custom Pool 2'), createEmptyCustomPool('', 'Custom Pool 3')];

  assert.equal(getDuplicatePoolEndpointIndexes(pools).size, 0);
});

test('getDuplicatePoolEndpointIndexes flags every pool sharing an endpoint', () => {
  const preset = knownPoolToConfig(SOLO_POOLS[0]);
  const pools = [
    { ...createEmptyCustomPool(), address: 'Pool.Example.com', port: 3333 },
    preset,
    { ...createEmptyCustomPool('', 'Custom Pool 2'), address: 'pool.example.com', port: 3333 },
    { ...createEmptyCustomPool('', 'Custom Pool 3'), address: 'pool.example.com', port: 4444 },
  ];

  assert.deepEqual([...getDuplicatePoolEndpointIndexes(pools)].sort(), [0, 2],
    'same address (case-insensitive) and port is a duplicate; a different port is not');
});
