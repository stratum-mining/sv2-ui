/**
 * Keeps the Bitcoin Core version JDC is configured for in line with the node.
 *
 * JDC picks its IPC client from the saved version. Core 31 and 32 accept each
 * other's clients for connecting and for templates, but refuse each other's
 * way of submitting a solved block, so a wrong version looks healthy until a
 * block is found and lost. The node can change major version at any time, for
 * example when Umbrel's Bitcoin Node moves `latest`, so the version has to be
 * read from the node before every start rather than trusted from setup.
 *
 * Mining must not start on a version that could not be read. Starting on the
 * saved value would bring back the silent block loss this check exists to
 * prevent, for any setup whose node cannot be asked.
 *
 * The answer has to come from the node behind the IPC socket JDC will use, so
 * the node is read through the data directory that holds that socket. Another
 * node on the same machine rejects that directory's cookie. A chain check alone
 * can't tell them apart, since both can be on the same chain.
 */

import path from 'node:path';

import {
  BITCOIN_CORE_VERSION_UNCONFIRMED_ISSUE,
  BITCOIN_CORE_VERSION_UNSUPPORTED_ISSUE,
  formatSupportedVersions,
  normalizeBitcoinCoreVersion,
  rpcVersionToCoreVersion,
  rpcVersionToDisplayVersion,
} from '@sv2-ui/shared';
import type {
  BitcoinCoreVersion,
  BitcoinCoreVersionCheckResponse,
  BitcoinNetwork,
} from '@sv2-ui/shared';
import type { SetupData, StatusResponse } from './types.js';

export type BitcoinCoreVersionIssue = StatusResponse['configurationIssues'][number];

export type NodeVersionRead =
  | { valid: true; chain: string; version: number }
  | { valid: false; error: string };

export type BitcoinCoreVersionCheckDeps = {
  readNodeVersion: (dataDir: string, network: BitcoinNetwork) => Promise<NodeVersionRead>;
  getSocketError: (data: SetupData) => Promise<string | null>;
};

export type BitcoinCoreVersionCheck =
  // The saved version matches the node, or this setup has no node to ask.
  | { kind: 'confirmed'; data: SetupData }
  // The node runs another supported version, which `data` now carries.
  | { kind: 'corrected'; data: SetupData; from: BitcoinCoreVersion | null; to: BitcoinCoreVersion }
  // The node answered that it is still loading: ask again shortly.
  | { kind: 'node-starting' }
  // The node's IPC socket is unavailable, so the socket check reports the cause.
  | { kind: 'node-unavailable'; error: string }
  // Mining must stay stopped: `issue` is for the user, `detail` for the logs.
  | { kind: 'refused'; issue: BitcoinCoreVersionIssue; detail: string };

const RPC_CHAIN_BY_NETWORK: Record<BitcoinNetwork, string> = {
  mainnet: 'main',
  testnet4: 'testnet4',
};

// RPC_IN_WARMUP: Bitcoin Core answers this while it loads its block index.
const NODE_STARTING_ERROR = /"code"\s*:\s*-28\b/;

function unconfirmedIssue(): BitcoinCoreVersionIssue {
  return {
    code: BITCOIN_CORE_VERSION_UNCONFIRMED_ISSUE,
    title: 'Could not confirm your Bitcoin Core version',
    message:
      'Mining can\'t start until SV2 UI can read the version from your node, because ' +
      'running on the wrong version can lose blocks you find. Check that Bitcoin Core\'s RPC ' +
      'server is on, that it uses its default RPC port or sets rpcport or rpcbind in ' +
      'bitcoin.conf, and that SV2 UI can read its cookie file, or rpcuser and rpcpassword in ' +
      'bitcoin.conf, from the data directory that holds its IPC socket.',
  };
}

function unsupportedIssue(rpcVersion: number): BitcoinCoreVersionIssue {
  return {
    code: BITCOIN_CORE_VERSION_UNSUPPORTED_ISSUE,
    title: 'Your Bitcoin Core version is not supported',
    message:
      `Your node runs Bitcoin Core ${rpcVersionToDisplayVersion(rpcVersion)}, and this version ` +
      `of SV2 UI supports ${formatSupportedVersions()}. Mining can't start until the node ` +
      'runs a supported version.',
  };
}

function refused(issue: BitcoinCoreVersionIssue, detail: string): BitcoinCoreVersionCheck {
  return { kind: 'refused', issue, detail };
}

/**
 * The data directory of the node behind a socket: Bitcoin Core keeps it there on
 * mainnet, and in a folder named after the network on any other. Null when the
 * socket sits anywhere else, where its node can't be identified.
 */
function dataDirHoldingSocket(socketPath: string, network: BitcoinNetwork): string | null {
  const socketDir = path.posix.dirname(socketPath.trim());
  if (network === 'mainnet') return socketDir;
  return path.posix.basename(socketDir) === network ? path.posix.dirname(socketDir) : null;
}

export async function checkBitcoinCoreVersion(
  data: SetupData,
  deps: BitcoinCoreVersionCheckDeps,
): Promise<BitcoinCoreVersionCheck> {
  if (data.mode !== 'jd' || !data.bitcoin) {
    return { kind: 'confirmed', data };
  }

  const { bitcoin } = data;
  const network = bitcoin.network as BitcoinNetwork;

  const dataDir = dataDirHoldingSocket(bitcoin.socket_path, network);
  if (dataDir === null) {
    return refused(
      unconfirmedIssue(),
      `The IPC socket ${bitcoin.socket_path} is not in a ${network} data directory.`,
    );
  }

  let read: NodeVersionRead;
  try {
    read = await deps.readNodeVersion(dataDir, network);
  } catch (error) {
    read = { valid: false, error: error instanceof Error ? error.message : String(error) };
  }

  if (!read.valid) {
    if (NODE_STARTING_ERROR.test(read.error)) {
      return { kind: 'node-starting' };
    }
    const socketError = await deps.getSocketError(data);
    if (socketError) {
      return { kind: 'node-unavailable', error: socketError };
    }
    return refused(unconfirmedIssue(), `Could not read the node's version: ${read.error}`);
  }

  // Another node can answer on the RPC port, and its version says nothing
  // about the node behind this setup's IPC socket.
  if (read.chain !== RPC_CHAIN_BY_NETWORK[network]) {
    return refused(
      unconfirmedIssue(),
      `The RPC port answered for chain "${read.chain}", but this setup uses ${network}.`,
    );
  }

  if (!Number.isSafeInteger(read.version) || read.version <= 0) {
    return refused(unconfirmedIssue(), `The node reported an invalid version: ${read.version}`);
  }

  const nodeVersion = rpcVersionToCoreVersion(read.version);
  if (!nodeVersion) {
    return refused(
      unsupportedIssue(read.version),
      `The node runs Bitcoin Core ${rpcVersionToDisplayVersion(read.version)}, which is not supported.`,
    );
  }

  const savedVersion = normalizeBitcoinCoreVersion(bitcoin.core_version);
  if (savedVersion === nodeVersion) {
    return { kind: 'confirmed', data };
  }

  return {
    kind: 'corrected',
    data: { ...data, bitcoin: { ...bitcoin, core_version: nodeVersion } },
    from: savedVersion,
    to: nodeVersion,
  };
}

/**
 * The same check, as the setup wizard needs it. `detail` stays in the logs: it
 * can quote the probe's output, which is not meant for an API response.
 */
export function toVersionCheckResponse(
  check: BitcoinCoreVersionCheck,
): BitcoinCoreVersionCheckResponse {
  switch (check.kind) {
    case 'corrected':
      return { status: 'ready', version: check.to };
    case 'confirmed': {
      const version = normalizeBitcoinCoreVersion(check.data.bitcoin?.core_version);
      return version
        ? { status: 'ready', version }
        : { status: 'failed', ...unconfirmedIssue() };
    }
    case 'node-starting':
      return { status: 'starting' };
    case 'node-unavailable':
      return {
        status: 'failed',
        title: 'Could not reach your Bitcoin Core node',
        message: check.error,
      };
    case 'refused':
      return { status: 'failed', title: check.issue.title, message: check.issue.message };
  }
}
