import assert from 'node:assert/strict';
import test from 'node:test';

import {
  unknownUserParser,
  jdcBitcoinCoreDisconnectedParser,
  jdcBitcoinCoreUnsupportedMiningInterfaceParser,
} from './parsers.js';
import { collectDiagnostics } from './parsers.js';
import type { ContainerLogLine } from './types.js';

function createLogLine(
  container: 'translator' | 'jdc',
  message: string
): ContainerLogLine {
  return {
    container,
    stream: 'stderr',
    timestamp: '2026-04-17T18:30:43.174887Z',
    message,
    raw: `2026-04-17T18:30:43.174887Z ERROR ${message}`,
  };
}

const SAMPLE_TRANSLATOR_LINE = (message: string): ContainerLogLine => ({
  container: 'translator',
  stream: 'stderr',
  timestamp: '2026-04-22T18:40:21.344598Z',
  message,
  raw: `2026-04-22T18:40:21.344598Z ${message}`,
});

const SAMPLE_JDC_LINE = (message: string): ContainerLogLine => ({
  container: 'jdc',
  stream: 'stderr',
  timestamp: '2026-04-22T18:38:34.491085Z',
  message,
  raw: `2026-04-22T18:38:34.491085Z ${message}`,
});

test('unknownUserParser matches OpenMiningChannelError with unknown-user', () => {
  const lines = [
    createLogLine(
      'translator',
      'OpenMiningChannelError(request_id: 123, error_code: unknown-user)'
    ),
  ];

  const result = unknownUserParser(lines);

  assert.ok(result !== null);
  assert.equal(result?.code, 'unknown-user');
  assert.equal(result?.severity, 'warning');
  assert.equal(result?.title, 'Invalid Braiins username');
  assert.deepEqual(result?.containers, ['translator']);
  assert.equal(result?.evidence.length, 1);
});

test('unknownUserParser returns null when no match', () => {
  const lines = [
    createLogLine('translator', 'Some other error message'),
  ];

  const result = unknownUserParser(lines);

  assert.equal(result, null);
});

test('unknownUserParser returns null when wrong container', () => {
  const lines = [
    createLogLine(
      'jdc',
      'OpenMiningChannelError(request_id: 123, error_code: unknown-user)'
    ),
  ];

  const result = unknownUserParser(lines);

  assert.equal(result, null);
});

test('jdcBitcoinCoreDisconnectedParser matches CapnpError Disconnected', () => {
  const lines = [
    createLogLine(
      'jdc',
      'jd_client_sv2::template_receiver::bitcoin_core: Failed to create BitcoinCoreToSv2: CapnpError(Error { kind: Disconnected, extra: "Peer disconnected." })'
    ),
  ];

  const result = jdcBitcoinCoreDisconnectedParser(lines);

  assert.ok(result !== null);
  assert.equal(result?.code, 'jdc-bitcoin-core-disconnected');
  assert.equal(result?.severity, 'error');
  assert.equal(result?.title, 'Bitcoin Core stopped running');
  assert.deepEqual(result?.containers, ['jdc']);
  assert.equal(result?.evidence.length, 1);
});

test('jdcBitcoinCoreDisconnectedParser matches Disconnected Peer disconnected', () => {
  const lines = [
    createLogLine(
      'jdc',
      'bitcoin_core_sv2::template_distribution_protocol::monitors: Failed to get response: Disconnected: Peer disconnected.'
    ),
  ];

  const result = jdcBitcoinCoreDisconnectedParser(lines);

  assert.ok(result !== null);
  assert.equal(result?.code, 'jdc-bitcoin-core-disconnected');
  assert.equal(result?.severity, 'error');
});

test('jdcBitcoinCoreDisconnectedParser matches CannotConnectToUnixSocket', () => {
  const lines = [
    createLogLine(
      'jdc',
      'jd_client_sv2::template_receiver::bitcoin_core: Failed to create BitcoinCoreToSv2: CannotConnectToUnixSocket("/root/.bitcoin/node.sock", "Connection refused (os error 111)")'
    ),
  ];

  const result = jdcBitcoinCoreDisconnectedParser(lines);

  assert.ok(result !== null);
  assert.equal(result?.code, 'jdc-bitcoin-core-disconnected');
  assert.equal(result?.severity, 'error');
});

test('jdcBitcoinCoreDisconnectedParser returns null when no match', () => {
  const lines = [
    createLogLine('jdc', 'Some other error message'),
  ];

  const result = jdcBitcoinCoreDisconnectedParser(lines);

  assert.equal(result, null);
});

test('jdcBitcoinCoreDisconnectedParser returns null when wrong container', () => {
  const lines = [
    createLogLine(
      'translator',
      'Failed to create BitcoinCoreToSv2: CannotConnectToUnixSocket("/root/.bitcoin/node.sock", "Connection refused (os error 111)")'
    ),
  ];

  const result = jdcBitcoinCoreDisconnectedParser(lines);

  assert.equal(result, null);
});

test('jdcBitcoinCoreDisconnectedParser collects multiple matches', () => {
  const lines = [
    createLogLine(
      'jdc',
      'jd_client_sv2::template_receiver::bitcoin_core: Failed to create BitcoinCoreToSv2: CapnpError(Error { kind: Disconnected, extra: "Peer disconnected." })'
    ),
    createLogLine(
      'jdc',
      'bitcoin_core_sv2::template_distribution_protocol::monitors: Failed to get response: Disconnected: Peer disconnected.'
    ),
  ];

  const result = jdcBitcoinCoreDisconnectedParser(lines);

  assert.ok(result !== null);
  assert.equal(result?.evidence.length, 2);
});

test('jdcBitcoinCoreUnsupportedMiningInterfaceParser matches old mining interface error', () => {
  const lines = [
    createLogLine(
      'jdc',
      'jd_client_sv2::template_receiver::bitcoin_core: Failed to create BitcoinCoreToSv2: CapnpError(Error { kind: Failed, extra: "remote exception: std::exception: Old mining interface (@2) not supported. Please update your client!" })'
    ),
  ];

  const result = jdcBitcoinCoreUnsupportedMiningInterfaceParser(lines);

  assert.ok(result !== null);
  assert.equal(result?.code, 'jdc-bitcoin-core-unsupported-mining-interface');
  assert.equal(result?.severity, 'error');
  assert.equal(result?.title, 'Bitcoin Core version does not match');
  assert.deepEqual(result?.containers, ['jdc']);
  assert.equal(result?.evidence.length, 1);
  assert.equal(result?.recommendation, 'Open setup and select your actual Bitcoin Core version.');
});

test('jdcBitcoinCoreUnsupportedMiningInterfaceParser matches old mining interface error in shorter log lines', () => {
  const lines = [
    createLogLine(
      'jdc',
      'ERROR bitcoin_core_sv2: remote exception: std::exception: Old mining interface (@0xabc123) not supported. Please update your client!'
    ),
  ];

  const result = jdcBitcoinCoreUnsupportedMiningInterfaceParser(lines);

  assert.ok(result !== null);
  assert.equal(result?.code, 'jdc-bitcoin-core-unsupported-mining-interface');
  assert.equal(result?.evidence.length, 1);
});

test('jdcBitcoinCoreUnsupportedMiningInterfaceParser matches unimplemented Bitcoin Core IPC method', () => {
  const lines = [
    createLogLine(
      'jdc',
      'ERROR jd_client_sv2::template_receiver::bitcoin_core: Failed to create BitcoinCoreToSv2: CapnpError(Error { kind: Unimplemented, extra: "remote exception: Method not implemented.; interfaceName = capnp/init.capnp:Init; typeId = 9815814193794562661; methodId = 3" })'
    ),
  ];

  const result = jdcBitcoinCoreUnsupportedMiningInterfaceParser(lines);

  assert.ok(result !== null);
  assert.equal(result?.code, 'jdc-bitcoin-core-unsupported-mining-interface');
  assert.equal(result?.severity, 'error');
  assert.equal(result?.evidence.length, 1);
});

test('jdcBitcoinCoreUnsupportedMiningInterfaceParser returns null for wrong container', () => {
  const lines = [
    createLogLine(
      'translator',
      'Failed to create BitcoinCoreToSv2: CapnpError(Error { kind: Failed, extra: "remote exception: std::exception: Old mining interface (@2) not supported. Please update your client!" })'
    ),
  ];

  const result = jdcBitcoinCoreUnsupportedMiningInterfaceParser(lines);

  assert.equal(result, null);
});

test('collectDiagnostics includes Bitcoin Core version mismatch diagnostics', () => {
  const lines = [
    createLogLine(
      'jdc',
      'jd_client_sv2::template_receiver::bitcoin_core: Failed to create BitcoinCoreToSv2: CapnpError(Error { kind: Failed, extra: "remote exception: std::exception: Old mining interface (@2) not supported. Please update your client!" })'
    ),
  ];

  const diagnostics = collectDiagnostics(lines);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, 'jdc-bitcoin-core-unsupported-mining-interface');
  assert.equal(diagnostics[0]?.message, 'The Bitcoin Core version selected in setup does not match the node that is running.');
});

test('invalidCertificateParser: detects InvalidCertificate in translator', () => {
  const lines = [
    SAMPLE_TRANSLATOR_LINE(
      'ERROR translator_sv2::sv2::upstream::upstream: Failed Noise handshake with 75.119.150.111:3333: Invalid Certificate: SignatureNoiseMessage { version: 0, valid_from: 1776883236, not_valid_after: 1776886836, signature: ce3caec9ac6174dffcfe276d6bedc7abda82a6a7cfb3244500a279a60dd722ab031c6849e329fb2d7da33b11c466d52546c0a4ab8f1a7f48e7ffd31d093b6a8f }. Retrying...'
    ),
  ];

  const diagnostics = collectDiagnostics(lines);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, 'invalid-certificate');
  assert.equal(diagnostics[0]?.severity, 'error');
  assert.equal(diagnostics[0]?.title, 'Invalid Server Certificate');
  assert.ok(diagnostics[0]?.recommendation.includes('NTP'));
  assert.ok(diagnostics[0]?.containers.includes('translator'));
});

test('invalidCertificateParser: detects InvalidCertificate in jd container', () => {
  const lines = [
    SAMPLE_JDC_LINE(
      'WARN jd_client_sv2: Attempt 1/3 failed for pool=75.119.150.111:3333, jds=75.119.150.111:3334: NetworkHelpersError(CodecError(NoiseSv2Error(InvalidCertificate(SignatureNoiseMessage { version: 0, valid_from: 1776883128, not_valid_after: 1776886728, signature: [153, 148, 250, 162, 139, 0, 8, 46, 100, 107, 22, 38, 57, 228, 110, 104, 137, 23, 187, 172, 188, 90, 163, 98, 68, 39, 134, 213, 130, 81, 61, 3, 135, 201, 63, 146, 195, 227, 253, 20, 198, 200, 214, 123, 210, 92, 52, 249, 177, 99, 136, 82, 134, 91, 101, 32, 172, 239, 165, 121, 141, 9, 249, 6] }))))'
    ),
  ];

  const diagnostics = collectDiagnostics(lines);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, 'invalid-certificate');
  assert.equal(diagnostics[0]?.severity, 'error');
  assert.ok(diagnostics[0]?.containers.includes('jdc'));
});

test('invalidCertificateParser: does not match unrelated errors', () => {
  const lines = [
    SAMPLE_TRANSLATOR_LINE('ERROR translator_sv2::some::module: Connection refused'),
  ];

  const diagnostics = collectDiagnostics(lines);

  assert.equal(diagnostics.length, 0);
});

test('invalidCertificateParser: returns evidence with line data', () => {
  const lines = [
    SAMPLE_TRANSLATOR_LINE(
      'ERROR translator_sv2::sv2::upstream::upstream: Failed Noise handshake with 75.119.150.111:3333: Invalid Certificate: SignatureNoiseMessage { version: 0, valid_from: 1776883236, not_valid_after: 1776886836, signature: test }. Retrying...'
    ),
  ];

  const diagnostics = collectDiagnostics(lines);

  assert.equal(diagnostics[0]?.evidence.length, 1);
  assert.equal(diagnostics[0]?.evidence[0]?.container, 'translator');
  assert.equal(diagnostics[0]?.evidence[0]?.stream, 'stderr');
});
