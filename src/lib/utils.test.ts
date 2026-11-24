import assert from 'node:assert/strict';
import test from 'node:test';
import bs58check from 'bs58check';

import {
  stripWrappingQuotes,
  isValidPoolAuthorityPubkey,
  getPoolAuthorityPubkeyError,
  isTomlSafeIdentifier,
  getIdentifierError,
  isValidPoolAddress,
  getPoolAddressError,
  getBitcoinAddressError,
  getBitcoinAddressPlaceholder,
  isValidBitcoinAddress,
} from './utils';
import { ALL_NETWORKS, computeDefaultSocketPath, isValidBitcoinNetwork } from '@sv2-ui/shared';


const VALID_PUBKEYS = [
  '9awtMD5KQgvRUh2yFbjVeT7b6hjipWcAsQHd6wEhgtDT9soosna', // Braiins
  '9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72', // SRI
  '9anZZb1uaJDqubvJhekPiNRHA2tuShcNaugDmFxtnTq54sDvTf5', // PyBLØCK
  '9bCoFxTszKCuffyywH5uS5o6WcU4vsjTH2axxc7wE86y2HhvULU', // Blitzpool
  '9amd6GUzTaGXASESCa75c9Rx3vWYihRyLUAE3Vrmqwgm3T9jtxN', // NexusPool
  '9c4zpyJ2ndm4e8sP2uNc1VNCGxYjqaxWS6wUCjk8zFj6njFquH6', // PublicPool
];

test('stripWrappingQuotes: returns the input unchanged when no wrapping quotes', () => {
  assert.equal(stripWrappingQuotes('abc'), 'abc');
});

test('stripWrappingQuotes: trims leading and trailing whitespace', () => {
  assert.equal(stripWrappingQuotes('  abc  '), 'abc');
});

test('stripWrappingQuotes: strips a matched pair of wrapping double quotes', () => {
  assert.equal(stripWrappingQuotes('"abc"'), 'abc');
});

test('stripWrappingQuotes: strips a matched pair of wrapping single quotes', () => {
  assert.equal(stripWrappingQuotes("'abc'"), 'abc');
});

test('stripWrappingQuotes: trims then strips quotes', () => {
  assert.equal(stripWrappingQuotes('  "abc"  '), 'abc');
});

test('stripWrappingQuotes: does not strip unmatched quotes', () => {
  assert.equal(stripWrappingQuotes('"abc'), '"abc');
  assert.equal(stripWrappingQuotes('abc"'), 'abc"');
});

test('stripWrappingQuotes: does not strip interior quotes', () => {
  assert.equal(stripWrappingQuotes('a"b"c'), 'a"b"c');
});

test('isValidPoolAuthorityPubkey: accepts known production pubkeys', () => {
  for (const pk of VALID_PUBKEYS) {
    assert.equal(isValidPoolAuthorityPubkey(pk), true, `expected ${pk} to be valid`);
  }
});

test('isValidPoolAuthorityPubkey: rejects a pubkey wrapped in double quotes (must be canonical)', () => {
  assert.equal(isValidPoolAuthorityPubkey(`"${VALID_PUBKEYS[1]}"`), false);
});

test('isValidPoolAuthorityPubkey: rejects a pubkey wrapped in single quotes (must be canonical)', () => {
  assert.equal(isValidPoolAuthorityPubkey(`'${VALID_PUBKEYS[1]}'`), false);
});

test('isValidPoolAuthorityPubkey: rejects a pubkey with surrounding whitespace (must be canonical)', () => {
  assert.equal(isValidPoolAuthorityPubkey(`  ${VALID_PUBKEYS[0]}  `), false);
});

test('isValidPoolAuthorityPubkey: rejects empty string', () => {
  assert.equal(isValidPoolAuthorityPubkey(''), false);
});

test('isValidPoolAuthorityPubkey: rejects whitespace-only string', () => {
  assert.equal(isValidPoolAuthorityPubkey('   '), false);
});

test('isValidPoolAuthorityPubkey: rejects a pubkey with a tampered checksum (last char flipped)', () => {
  const pk = VALID_PUBKEYS[0];
  const flipped = pk.slice(0, -1) + (pk.slice(-1) === 'a' ? 'b' : 'a');
  assert.equal(isValidPoolAuthorityPubkey(flipped), false);
});

test('isValidPoolAuthorityPubkey: rejects a pubkey containing a TOML-breaking interior quote', () => {
  assert.equal(isValidPoolAuthorityPubkey('9aw"MD5KQgvRU'), false);
});

test('isValidPoolAuthorityPubkey: rejects obvious non-base58 input', () => {
  assert.equal(isValidPoolAuthorityPubkey('not a pubkey'), false);
});

test('isValidPoolAuthorityPubkey: rejects a base58-charset string with no checksum (length too short)', () => {
  assert.equal(isValidPoolAuthorityPubkey('9awtMD5K'), false);
});

test('getPoolAuthorityPubkeyError: returns null for empty input (required-ness is enforced separately)', () => {
  assert.equal(getPoolAuthorityPubkeyError(''), null);
});

test('getPoolAuthorityPubkeyError: returns null for valid pubkeys', () => {
  for (const pk of VALID_PUBKEYS) {
    assert.equal(getPoolAuthorityPubkeyError(pk), null, `expected ${pk} to produce no error`);
  }
});

test('getPoolAuthorityPubkeyError: returns an error for a valid pubkey wrapped in quotes (must be canonical)', () => {
  assert.match(getPoolAuthorityPubkeyError(`"${VALID_PUBKEYS[2]}"`) ?? '', /invalid/i);
});

test('getPoolAuthorityPubkeyError: returns a message for an invalid pubkey', () => {
  assert.match(getPoolAuthorityPubkeyError('not-a-real-pubkey') ?? '', /invalid/i);
});

test('getPoolAuthorityPubkeyError: returns a message for a tampered-checksum pubkey', () => {
  const pk = VALID_PUBKEYS[0];
  const flipped = pk.slice(0, -1) + (pk.slice(-1) === 'a' ? 'b' : 'a');
  assert.match(getPoolAuthorityPubkeyError(flipped) ?? '', /invalid/i);
});

test('isTomlSafeIdentifier: accepts a plain username', () => {
  assert.equal(isTomlSafeIdentifier('miner.worker1'), true);
});

test('isTomlSafeIdentifier: accepts an SRI-format identity with slashes', () => {
  assert.equal(isTomlSafeIdentifier('sri/solo/bc1qexampleaddress/worker1'), true);
});

test('isTomlSafeIdentifier: rejects a value containing a double quote', () => {
  assert.equal(isTomlSafeIdentifier('worker"1'), false);
});

test('isTomlSafeIdentifier: rejects a value containing a backslash', () => {
  assert.equal(isTomlSafeIdentifier('worker\\1'), false);
});

test('isTomlSafeIdentifier: rejects a value containing a newline', () => {
  assert.equal(isTomlSafeIdentifier('worker\n1'), false);
});

test('isTomlSafeIdentifier: rejects a value containing a tab', () => {
  assert.equal(isTomlSafeIdentifier('worker\t1'), false);
});

test('isTomlSafeIdentifier: rejects a value containing a control character', () => {
  assert.equal(isTomlSafeIdentifier('worker\x07bell'), false);
});

test('isTomlSafeIdentifier: rejects leading whitespace', () => {
  assert.equal(isTomlSafeIdentifier(' worker1'), false);
});

test('isTomlSafeIdentifier: rejects trailing whitespace', () => {
  assert.equal(isTomlSafeIdentifier('worker1 '), false);
});

test('isTomlSafeIdentifier: rejects an empty string', () => {
  assert.equal(isTomlSafeIdentifier(''), false);
});

test('getIdentifierError: returns null for empty input (required-ness is enforced separately)', () => {
  assert.equal(getIdentifierError(''), null);
});

test('getIdentifierError: returns null for a valid identifier', () => {
  assert.equal(getIdentifierError('miner.worker1'), null);
});

test('getIdentifierError: returns a whitespace-specific message for padded input', () => {
  assert.match(getIdentifierError(' miner ') ?? '', /whitespace/i);
});

test('getIdentifierError: returns a not-allowed-characters message for a quote', () => {
  assert.match(getIdentifierError('mi"ner') ?? '', /not allowed|invalid|characters/i);
});

test('getIdentifierError: returns a not-allowed-characters message for a backslash', () => {
  assert.match(getIdentifierError('mi\\ner') ?? '', /not allowed|invalid|characters/i);
});

test('isValidPoolAddress: accepts a standard domain name', () => {
  assert.equal(isValidPoolAddress('pool.braiins.com'), true);
  assert.equal(isValidPoolAddress('stratum.slushpool.com'), true);
});

test('isValidPoolAddress: accepts an IPv4 address', () => {
  assert.equal(isValidPoolAddress('192.168.1.100'), true);
  assert.equal(isValidPoolAddress('127.0.0.1'), true);
});

test('isValidPoolAddress: accepts localhost', () => {
  assert.equal(isValidPoolAddress('localhost'), true);
});

test('isValidPoolAddress: accepts an IPv6 address', () => {
  assert.equal(isValidPoolAddress('::1'), true);
});

test('isValidPoolAddress: rejects an address with a protocol prefix', () => {
  assert.equal(isValidPoolAddress('stratum2+tcp://pool.braiins.com'), false);
  assert.equal(isValidPoolAddress('http://localhost'), false);
});

test('isValidPoolAddress: rejects an address with internal spaces', () => {
  assert.equal(isValidPoolAddress('pool.braiins .com'), false);
});

test('isValidPoolAddress: accepts an address with leading/trailing spaces (normalizes internally)', () => {
  assert.equal(isValidPoolAddress(' pool.braiins.com '), true);
});

test('isValidPoolAddress: rejects an address with commas', () => {
  assert.equal(isValidPoolAddress('google,1231com'), false);
});

test('isValidPoolAddress: rejects an address with an @ symbol', () => {
  assert.equal(isValidPoolAddress('google@ASDcom'), false);
});

test('getPoolAddressError: returns missing error for empty input', () => {
  assert.match(getPoolAddressError('') ?? '', /required/i);
});

test('getPoolAddressError: returns null for a valid address', () => {
  assert.equal(getPoolAddressError('pool.braiins.com'), null);
});

test('getPoolAddressError: returns protocol error message', () => {
  assert.match(getPoolAddressError('stratum+tcp://pool.com') ?? '', /protocol/i);
});

test('getPoolAddressError: returns space error message', () => {
  assert.match(getPoolAddressError('pool .com') ?? '', /space/i);
});

test('getPoolAddressError: returns invalid character message for commas or @', () => {
  assert.match(getPoolAddressError('google,1231@ASDcom') ?? '', /invalid character/i);
});

test('isValidPoolAuthorityPubkey: rejects a checksum-valid base58check blob of wrong decoded length', () => {
  const tooShort = bs58check.encode(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
  assert.equal(isValidPoolAuthorityPubkey(tooShort), false);
  const tooLong = bs58check.encode(Buffer.alloc(120, 0x42));
  assert.equal(isValidPoolAuthorityPubkey(tooLong), false);
});

test('isValidPoolAuthorityPubkey: rejects an off-curve x-only public key', () => {
  const invalidPoint = bs58check.encode(Buffer.concat([
    Buffer.from([0x01, 0x00]),
    Buffer.alloc(32),
  ]));
  assert.equal(isValidPoolAuthorityPubkey(invalidPoint), false);
});

const REGTEST_ADDRESS = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';
const TESTNET4_ADDRESS = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const MAINNET_ADDRESS = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
// Regtest and testnet share their legacy address prefixes, so Core accepts
// this address on either chain even though the bech32 prefixes differ.
const TESTNET_LEGACY_ADDRESS = 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn';

test('isValidBitcoinNetwork: accepts regtest and rejects unknown values', () => {
  assert.equal(isValidBitcoinNetwork('regtest'), true);
  assert.equal(isValidBitcoinNetwork('signet'), false);
  assert.equal(isValidBitcoinNetwork(null), false);
  assert.deepEqual(ALL_NETWORKS, ['mainnet', 'testnet4', 'regtest']);
});

test('computeDefaultSocketPath: puts regtest under its own network folder', () => {
  assert.equal(computeDefaultSocketPath('~/.bitcoin', 'regtest'), '~/.bitcoin/regtest/node.sock');
});

test('isValidBitcoinAddress: accepts a regtest address only on regtest', () => {
  assert.equal(isValidBitcoinAddress(REGTEST_ADDRESS, 'regtest'), true);
  assert.equal(isValidBitcoinAddress(REGTEST_ADDRESS, 'testnet4'), false);
  assert.equal(isValidBitcoinAddress(REGTEST_ADDRESS, 'mainnet'), false);
});

test('getBitcoinAddressError: reports bech32 addresses from another network as wrong network', () => {
  assert.equal(getBitcoinAddressError(MAINNET_ADDRESS, 'regtest'), 'Wrong network');
  assert.equal(getBitcoinAddressError(TESTNET4_ADDRESS, 'regtest'), 'Wrong network');
  assert.equal(getBitcoinAddressError(REGTEST_ADDRESS, 'testnet4'), 'Wrong network');
});

test('getBitcoinAddressError: accepts shared legacy prefixes on regtest and testnet4', () => {
  assert.equal(getBitcoinAddressError(TESTNET_LEGACY_ADDRESS, 'regtest'), null);
  assert.equal(getBitcoinAddressError(TESTNET_LEGACY_ADDRESS, 'testnet4'), null);
});

test('getBitcoinAddressPlaceholder: uses bcrt1 for regtest', () => {
  assert.equal(getBitcoinAddressPlaceholder('regtest'), 'bcrt1q...');
});
