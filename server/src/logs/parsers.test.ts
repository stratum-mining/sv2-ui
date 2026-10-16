import assert from 'node:assert/strict';
import test from 'node:test';

import {
  unknownUserParser,
  jdcBitcoinCoreDisconnectedParser,
  jdcBitcoinCoreInitialBlockDownloadParser,
  jdcBitcoinCoreUnsupportedMiningInterfaceParser,
  evaluateDiagnosisPolicy,
  getAutoRetryPolicy,
  logParsers,
} from './parsers.js';
import { collectDiagnostics } from './parsers.js';
import type { AutoRetryPolicy, ContainerLogLine } from './types.js';

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

test('jdcBitcoinCoreInitialBlockDownloadParser matches IBD warning', () => {
  const lines = [
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Waiting for initial template and prevhash from Template Provider...'
    ),
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Is the Bitcoin node undergoing IBD?'
    ),
  ];

  const result = jdcBitcoinCoreInitialBlockDownloadParser(lines);

  assert.ok(result !== null);
  assert.equal(result?.code, 'jdc-bitcoin-core-initial-block-download');
  assert.equal(result?.severity, 'error');
  assert.equal(result?.title, 'Bitcoin Core is still syncing');
  assert.deepEqual(result?.containers, ['jdc']);
  assert.equal(result?.evidence.length, 2);
});

test('jdcBitcoinCoreInitialBlockDownloadParser requires explicit IBD hint', () => {
  const lines = [
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Waiting for initial template and prevhash from Template Provider...'
    ),
  ];

  const result = jdcBitcoinCoreInitialBlockDownloadParser(lines);

  assert.equal(result, null);
});

test('jdcBitcoinCoreInitialBlockDownloadParser clears stale IBD after readiness', () => {
  const lines = [
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Waiting for initial template and prevhash from Template Provider...'
    ),
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Is the Bitcoin node undergoing IBD?'
    ),
    createLogLine(
      'jdc',
      'INFO jd_client_sv2::channel_manager: Required template data received, ready to accept connections'
    ),
  ];

  const result = jdcBitcoinCoreInitialBlockDownloadParser(lines);

  assert.equal(result, null);
});

test('jdcBitcoinCoreInitialBlockDownloadParser reappears after newer IBD hint', () => {
  const lines = [
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Is the Bitcoin node undergoing IBD?'
    ),
    createLogLine(
      'jdc',
      'INFO jd_client_sv2::channel_manager: Required template data received, ready to accept connections'
    ),
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Waiting for initial template and prevhash from Template Provider...'
    ),
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Is the Bitcoin node undergoing IBD?'
    ),
  ];

  const result = jdcBitcoinCoreInitialBlockDownloadParser(lines);

  assert.ok(result !== null);
  assert.equal(result?.code, 'jdc-bitcoin-core-initial-block-download');
  assert.equal(result?.evidence.length, 2);
  assert.ok(
    result?.evidence.every((item) =>
      item.line.includes('Waiting for initial template') ||
      item.line.includes('Is the Bitcoin node undergoing IBD?')
    )
  );
});

test('jdcBitcoinCoreInitialBlockDownloadParser returns null when wrong container', () => {
  const lines = [
    createLogLine(
      'translator',
      'WARN jd_client_sv2::channel_manager: Is the Bitcoin node undergoing IBD?'
    ),
  ];

  const result = jdcBitcoinCoreInitialBlockDownloadParser(lines);

  assert.equal(result, null);
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

test('collectDiagnostics includes Bitcoin Core IBD diagnostics', () => {
  const lines = [
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Waiting for initial template and prevhash from Template Provider...'
    ),
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Is the Bitcoin node undergoing IBD?'
    ),
  ];

  const diagnostics = collectDiagnostics(lines);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, 'jdc-bitcoin-core-initial-block-download');
  assert.equal(
    diagnostics[0]?.message,
    'Your Bitcoin Core node is in initial block download, so it cannot provide block templates yet.'
  );
});

test('collectDiagnostics clears stale Bitcoin Core IBD diagnostics after readiness', () => {
  const lines = [
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Waiting for initial template and prevhash from Template Provider...'
    ),
    createLogLine(
      'jdc',
      'WARN jd_client_sv2::channel_manager: Is the Bitcoin node undergoing IBD?'
    ),
    createLogLine(
      'jdc',
      'INFO jd_client_sv2::channel_manager: Required template data received, ready to accept connections'
    ),
  ];

  const diagnostics = collectDiagnostics(lines);

  assert.equal(diagnostics.length, 0);
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

const SETUP_SUCCESS = 'INFO translator_sv2::sv2::upstream::common_message_handler: Received: SetupConnectionSuccess(used_version: 2, flags: 0x00000000)';
const CHANNEL_OPENED = 'INFO translator_sv2::sv2::channel_manager: Received: OpenStandardMiningChannelSuccess(request_id: 1, channel_id: 1, target: [0u8; 32], nominal_hash_rate: 4.0, max_target: [7u8; 32], min_extranonce_size: 0)';
const SOCKET_CLOSED = 'ERROR translator_sv2::io_task: Reader error error=SocketClosed';

test('upstreamClosedBeforeChannelParser: detects a handshake closed without a channel', () => {
  const lines = [
    SAMPLE_TRANSLATOR_LINE('INFO translator_sv2: Starting Translator Proxy...'),
    SAMPLE_TRANSLATOR_LINE(SETUP_SUCCESS),
    SAMPLE_TRANSLATOR_LINE(SOCKET_CLOSED),
    SAMPLE_TRANSLATOR_LINE('ERROR translator_sv2::translator_runtime: All upstreams failed after 3 retries each'),
  ];

  const diagnostic = collectDiagnostics(lines)[0];

  assert.equal(diagnostic?.code, 'upstream-closed-before-channel');
  assert.equal(diagnostic?.severity, 'error');
  assert.equal(diagnostic?.containers[0], 'translator');
  assert.equal(diagnostic?.detectedAt, '2026-04-22T18:40:21.344598Z');
  assert.equal(diagnostic?.evidence.length, 2);
  assert.ok(diagnostic?.evidence[0]?.line.includes('SetupConnectionSuccess'));
  assert.ok(diagnostic?.evidence[1]?.line.includes('SocketClosed'));
});

test('upstreamClosedBeforeChannelParser: clears when the next attempt opens a channel', () => {
  const lines = [
    SAMPLE_TRANSLATOR_LINE(SETUP_SUCCESS),
    SAMPLE_TRANSLATOR_LINE(SOCKET_CLOSED),
    SAMPLE_TRANSLATOR_LINE(SETUP_SUCCESS),
    SAMPLE_TRANSLATOR_LINE(CHANNEL_OPENED),
  ];

  assert.equal(collectDiagnostics(lines).length, 0);
});

test('upstreamClosedBeforeChannelParser: ignores a close after a channel was opened', () => {
  const lines = [
    SAMPLE_TRANSLATOR_LINE(SETUP_SUCCESS),
    SAMPLE_TRANSLATOR_LINE(CHANNEL_OPENED),
    SAMPLE_TRANSLATOR_LINE(SOCKET_CLOSED),
  ];

  assert.equal(collectDiagnostics(lines).length, 0);
});

test('upstreamClosedBeforeChannelParser: ignores a socket close with no handshake before it', () => {
  const lines = [SAMPLE_TRANSLATOR_LINE(SOCKET_CLOSED)];

  assert.equal(collectDiagnostics(lines).length, 0);
});

test('upstreamClosedBeforeChannelParser: ignores matching lines from other containers', () => {
  const lines = [
    SAMPLE_JDC_LINE(SETUP_SUCCESS),
    SAMPLE_JDC_LINE(SOCKET_CLOSED),
  ];

  assert.equal(collectDiagnostics(lines).length, 0);
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

test('getAutoRetryPolicy: fatal config-bound scenarios never auto-restart', () => {
  assert.equal(getAutoRetryPolicy('unknown-user'), 'never');
  assert.equal(getAutoRetryPolicy('jdc-bitcoin-core-unsupported-mining-interface'), 'never');
});

test('getAutoRetryPolicy: scenarios with an external precondition use the probe', () => {
  assert.equal(getAutoRetryPolicy('jdc-bitcoin-core-disconnected'), 'probe');
});

test('getAutoRetryPolicy: self-healing scenarios retry slowly', () => {
  assert.equal(getAutoRetryPolicy('invalid-certificate'), 'slow');
  assert.equal(getAutoRetryPolicy('jdc-bitcoin-core-initial-block-download'), 'slow');
  // The pool closes a connection that opens no channel in time; a downstream
  // miner connecting is what clears it.
  assert.equal(getAutoRetryPolicy('upstream-closed-before-channel'), 'slow');
});

test('getAutoRetryPolicy: unknown codes have no policy', () => {
  assert.equal(getAutoRetryPolicy('not-a-real-code'), null);
});

test('every registered parser declares an autoRetry policy', () => {
  const policies: AutoRetryPolicy[] = ['never', 'probe', 'slow'];
  for (const parser of logParsers) {
    assert.ok(
      policies.includes(parser.autoRetry),
      `${parser.code} has invalid autoRetry: ${parser.autoRetry}`
    );
  }
});

test('evaluateDiagnosisPolicy: a clean log set proceeds without codes', () => {
  assert.deepEqual(evaluateDiagnosisPolicy([SAMPLE_JDC_LINE('2026-05-14 00:00:00 UTC Starting')]), {
    action: 'proceed',
    codes: [],
  });
});

test('evaluateDiagnosisPolicy: a never-policy diagnosis pauses with its codes', () => {
  const lines = [
    SAMPLE_TRANSLATOR_LINE(
      'OpenMiningChannelError(request_id: 4521, error_code: unknown-user)'
    ),
  ];

  assert.deepEqual(evaluateDiagnosisPolicy(lines), {
    action: 'pause',
    codes: ['unknown-user'],
  });
});

test('evaluateDiagnosisPolicy: a slow diagnosis defers to the slow schedule', () => {
  const lines = [
    SAMPLE_TRANSLATOR_LINE(
      'Failed Noise handshake with 75.119.150.111:3333: Invalid Certificate: SignatureNoiseMessage { version: 0, valid_from: 1776883236, not_valid_after: 1776886836, signature: ce3caec9 }. Retrying...'
    ),
  ];

  assert.deepEqual(evaluateDiagnosisPolicy(lines), {
    action: 'slow-retry',
    codes: ['invalid-certificate'],
  });
});

test('evaluateDiagnosisPolicy: a probe diagnosis proceeds so the caller can gate', () => {
  const lines = [
    SAMPLE_JDC_LINE(
      'Failed to create BitcoinCoreToSv2: CapnpError(Error { kind: Disconnected, extra: "Peer disconnected" })'
    ),
  ];

  assert.deepEqual(evaluateDiagnosisPolicy(lines), {
    action: 'proceed',
    codes: ['jdc-bitcoin-core-disconnected'],
  });
});

test('evaluateDiagnosisPolicy: the most restrictive policy wins across codes', () => {
  const lines = [
    SAMPLE_TRANSLATOR_LINE('Connection refused, retrying'),
    SAMPLE_JDC_LINE(
      'Failed to create BitcoinCoreToSv2: CapnpError(Error { kind: Disconnected, extra: "Peer disconnected" })'
    ),
    SAMPLE_TRANSLATOR_LINE(
      'OpenMiningChannelError(request_id: 1, error_code: unknown-user)'
    ),
  ];

  assert.deepEqual(evaluateDiagnosisPolicy(lines), {
    action: 'pause',
    codes: ['jdc-bitcoin-core-disconnected', 'unknown-user'],
  });
});

test('evaluateDiagnosisPolicy: an unregistered code pauses', () => {
  const fakeParser = {
    code: 'future-unknown-scenario',
    autoRetry: 'never' as const,
    match: (lines: ContainerLogLine[]) =>
      lines.some((line) => line.message.includes('future failure'))
        ? {
            code: 'unregistered-code',
            severity: 'error' as const,
            title: 't',
            message: 'm',
            recommendation: 'r',
            streamId: 'mining-services' as const,
            containers: ['translator' as const],
            detectedAt: null,
            evidence: [],
          }
        : null,
  };
  logParsers.push(fakeParser);
  try {
    const lines = [SAMPLE_TRANSLATOR_LINE('future failure detected')];

    assert.deepEqual(evaluateDiagnosisPolicy(lines), {
      action: 'pause',
      codes: ['unregistered-code'],
    });
  } finally {
    logParsers.splice(logParsers.indexOf(fakeParser), 1);
  }
});
