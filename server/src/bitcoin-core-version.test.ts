import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BITCOIN_CORE_VERSION_UNCONFIRMED_ISSUE,
  BITCOIN_CORE_VERSION_UNSUPPORTED_ISSUE,
} from '@sv2-ui/shared';
import { checkBitcoinCoreVersion } from './bitcoin-core-version.js';
import type { BitcoinCoreVersionCheckDeps, NodeVersionRead } from './bitcoin-core-version.js';
import type { SetupData } from './types.js';

function jdSetup(overrides: Partial<NonNullable<SetupData['bitcoin']>> = {}): SetupData {
  return {
    mode: 'jd',
    miningMode: 'solo',
    bitcoin: {
      core_version: '31',
      os: 'umbrel',
      network: 'mainnet',
      customDataDir: '',
      socket_path: '~/.bitcoin/node.sock',
      ...overrides,
    },
  } as unknown as SetupData;
}

function nodeAt(version: number, chain = 'main'): NodeVersionRead {
  return { valid: true, chain, version };
}

function deps(
  read: NodeVersionRead | Error,
  socketError: string | null = null,
): BitcoinCoreVersionCheckDeps & { reads: Array<[string, string]> } {
  const reads: Array<[string, string]> = [];
  return {
    reads,
    readNodeVersion: async (dataDir, network) => {
      reads.push([dataDir, network]);
      if (read instanceof Error) throw read;
      return read;
    },
    getSocketError: async () => socketError,
  };
}

test('confirms a saved version that matches the node, across minor versions', async () => {
  const data = jdSetup({ core_version: '31' });
  const check = await checkBitcoinCoreVersion(data, deps(nodeAt(310200)));
  assert.deepEqual(check, { kind: 'confirmed', data });
});

test('corrects a saved 31 when the node moved to Core 32', async () => {
  const data = jdSetup({ core_version: '31' });
  const check = await checkBitcoinCoreVersion(data, deps(nodeAt(320100)));

  assert.equal(check.kind, 'corrected');
  if (check.kind !== 'corrected') return;
  assert.equal(check.from, '31');
  assert.equal(check.to, '32');
  assert.equal(check.data.bitcoin?.core_version, '32');
  assert.equal(data.bitcoin?.core_version, '31', 'the input setup stays untouched');
});

test('corrects a saved 32 when the node was pinned back to Core 31', async () => {
  const check = await checkBitcoinCoreVersion(jdSetup({ core_version: '32' }), deps(nodeAt(310200)));
  assert.equal(check.kind, 'corrected');
  if (check.kind === 'corrected') assert.equal(check.data.bitcoin?.core_version, '31');
});

test('fills in a missing saved version from the node', async () => {
  const check = await checkBitcoinCoreVersion(jdSetup({ core_version: null }), deps(nodeAt(300400)));
  assert.equal(check.kind, 'corrected');
  if (check.kind === 'corrected') {
    assert.equal(check.from, null);
    assert.equal(check.to, '30');
  }
});

for (const [label, rpcVersion, shown] of [
  ['newer', 330000, '33.0'],
  ['older', 290500, '29.5'],
] as const) {
  test(`refuses a ${label} unsupported node and names the version found`, async () => {
    const check = await checkBitcoinCoreVersion(jdSetup(), deps(nodeAt(rpcVersion)));
    assert.equal(check.kind, 'refused');
    if (check.kind !== 'refused') return;
    assert.equal(check.issue.code, BITCOIN_CORE_VERSION_UNSUPPORTED_ISSUE);
    assert.match(check.issue.message, new RegExp(`Bitcoin Core ${shown.replace('.', '\\.')}`));
    assert.match(check.issue.message, /30\.x, 31\.x, or 32\.x/);
  });
}

test('refuses when the version cannot be read but the socket is up', async () => {
  const check = await checkBitcoinCoreVersion(
    jdSetup(),
    deps({ valid: false, error: 'host: connect ECONNREFUSED 127.0.0.1:8332' }),
  );
  assert.equal(check.kind, 'refused');
  if (check.kind !== 'refused') return;
  assert.equal(check.issue.code, BITCOIN_CORE_VERSION_UNCONFIRMED_ISSUE);
  assert.match(check.detail, /ECONNREFUSED/);
});

test('refuses when reading the version throws', async () => {
  const check = await checkBitcoinCoreVersion(
    jdSetup(),
    deps(new Error('bind source path does not exist: /missing')),
  );
  assert.equal(check.kind, 'refused');
  if (check.kind === 'refused') assert.match(check.detail, /bind source path/);
});

test('leaves a node that is down to the socket check', async () => {
  const check = await checkBitcoinCoreVersion(
    jdSetup(),
    deps({ valid: false, error: 'connect ECONNREFUSED' }, 'Socket not found'),
  );
  assert.deepEqual(check, { kind: 'node-unavailable', error: 'Socket not found' });
});

test('waits for a node that is still loading, even if another transport failed', async () => {
  const error = 'host: {"code":-28,"message":"Loading block index…"}\nbridge: connect ECONNREFUSED';
  const check = await checkBitcoinCoreVersion(jdSetup(), deps({ valid: false, error }));
  assert.deepEqual(check, { kind: 'node-starting' });
});

test('an RPC error that merely contains 28 does not read as still loading', async () => {
  const check = await checkBitcoinCoreVersion(
    jdSetup(),
    deps({ valid: false, error: '{"code":-282,"message":"other"}' }),
  );
  assert.equal(check.kind, 'refused');
});

test('refuses a node on another chain instead of trusting its version', async () => {
  const check = await checkBitcoinCoreVersion(
    jdSetup({ core_version: '31', network: 'mainnet' }),
    deps(nodeAt(320100, 'testnet4')),
  );
  assert.equal(check.kind, 'refused');
  if (check.kind !== 'refused') return;
  assert.equal(check.issue.code, BITCOIN_CORE_VERSION_UNCONFIRMED_ISSUE);
  assert.match(check.detail, /testnet4/);
});

test('matches testnet4 setups against the testnet4 chain', async () => {
  const data = jdSetup({
    network: 'testnet4',
    core_version: '32',
    socket_path: '~/.bitcoin/testnet4/node.sock',
  });
  const check = await checkBitcoinCoreVersion(data, deps(nodeAt(320100, 'testnet4')));
  assert.deepEqual(check, { kind: 'confirmed', data });
});

for (const version of [Number.NaN, 0, -1, 1.5]) {
  test(`refuses a nonsensical version from the RPC port: ${version}`, async () => {
    const check = await checkBitcoinCoreVersion(jdSetup(), deps(nodeAt(version)));
    assert.equal(check.kind, 'refused');
    if (check.kind === 'refused') {
      assert.equal(check.issue.code, BITCOIN_CORE_VERSION_UNCONFIRMED_ISSUE);
    }
  });
}

test('reads the node from the data directory holding its socket', async () => {
  const mainnet = deps(nodeAt(310200));
  await checkBitcoinCoreVersion(jdSetup({ socket_path: ' /mnt/bitcoin/node.sock ' }), mainnet);
  assert.deepEqual(mainnet.reads, [['/mnt/bitcoin', 'mainnet']]);

  const testnet4 = deps(nodeAt(310200, 'testnet4'));
  await checkBitcoinCoreVersion(
    jdSetup({ network: 'testnet4', socket_path: '~/.bitcoin/testnet4/node.sock' }),
    testnet4,
  );
  assert.deepEqual(testnet4.reads, [['~/.bitcoin', 'testnet4']]);
});

test('reads the node behind the socket, not the one the data directory field names', async () => {
  const twoNodes = deps(nodeAt(310000));
  await checkBitcoinCoreVersion(
    jdSetup({ customDataDir: '/nodes/core32', socket_path: '/nodes/core31/node.sock' }),
    twoNodes,
  );
  assert.deepEqual(twoNodes.reads, [['/nodes/core31', 'mainnet']]);
});

test('refuses a testnet4 socket it cannot tie to a testnet4 node', async () => {
  const outside = deps(nodeAt(320100, 'testnet4'));
  const check = await checkBitcoinCoreVersion(
    jdSetup({ network: 'testnet4', socket_path: '~/.bitcoin/node.sock' }),
    outside,
  );
  assert.equal(check.kind, 'refused');
  if (check.kind === 'refused') {
    assert.equal(check.issue.code, BITCOIN_CORE_VERSION_UNCONFIRMED_ISSUE);
  }
  assert.equal(outside.reads.length, 0);
});

test('does not ask a node for setups that do not use one', async () => {
  const data = { mode: 'no-jd', miningMode: 'pool' } as unknown as SetupData;
  const noNode = deps(nodeAt(320100));
  const check = await checkBitcoinCoreVersion(data, noNode);
  assert.deepEqual(check, { kind: 'confirmed', data });
  assert.equal(noNode.reads.length, 0);
});
