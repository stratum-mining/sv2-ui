import Docker from 'dockerode';
import { BITCOIN_CORE } from '../constants.js';
import type {
  BitcoinNetwork,
  BitcoinBuildStatus,
  BitcoinStatusResponse,
} from '../types.js';
import { ensureNetwork, getContainerStatus, resolveNetworkName } from './docker.service.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// In-memory build state per network
const buildState: Record<BitcoinNetwork, BitcoinBuildStatus> = {
  mainnet: { state: 'idle' },
  testnet4: { state: 'idle' },
  regtest: { state: 'idle' },
};

// Accumulated build log lines per network (kept in memory during build)
const MAX_BUILD_LOG_LINES = 500;
const buildLogs: Record<BitcoinNetwork, string[]> = {
  mainnet: [],
  testnet4: [],
  regtest: [],
};

function getContainerName(network: BitcoinNetwork): string {
  return BITCOIN_CORE.containers[network];
}

async function imageExists(): Promise<boolean> {
  try {
    const image = docker.getImage(BITCOIN_CORE.image);
    await image.inspect();
    return true;
  } catch {
    return false;
  }
}

export async function buildBitcoinImage(
  network: BitcoinNetwork
): Promise<void> {
  if (buildState[network].state === 'building') return;

  buildState[network] = { state: 'building', progress: 'Starting build...' };
  buildLogs[network] = ['Starting build...'];

  try {
    const stream = await docker.buildImage(
      {
        context: BITCOIN_CORE.contextPath,
        src: ['Dockerfile', 'entrypoint.sh'],
      },
      { t: BITCOIN_CORE.image }
    );

    await new Promise<void>((resolve, reject) => {
      let buildError: string | null = null;
      docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err || buildError) {
            const msg = err?.message || buildError || 'Unknown build error';
            buildLogs[network].push(`ERROR: ${msg}`);
            buildState[network] = { state: 'error', error: msg };
            reject(new Error(msg));
          } else {
            buildLogs[network].push('Build completed successfully.');
            buildState[network] = { state: 'built' };
            resolve();
          }
        },
        (event: { stream?: string; error?: string; errorDetail?: { message: string } }) => {
          if (event.error) {
            buildError = event.error;
            buildLogs[network].push(`ERROR: ${event.error}`);
            buildState[network] = { state: 'error', error: event.error };
          } else if (event.stream) {
            const line = event.stream.trim();
            if (line) {
              buildLogs[network].push(line);
              if (buildLogs[network].length > MAX_BUILD_LOG_LINES) {
                buildLogs[network] = buildLogs[network].slice(-MAX_BUILD_LOG_LINES);
              }
              buildState[network] = { state: 'building', progress: line };
            }
          }
        }
      );
    });
  } catch (err) {
    if (buildState[network].state !== 'error') {
      buildState[network] = {
        state: 'error',
        error: err instanceof Error ? err.message : 'Unknown build error',
      };
    }
    throw err;
  }
}

export async function createAndStartBitcoinContainer(
  network: BitcoinNetwork
): Promise<void> {
  const containerName = getContainerName(network);
  const ports = BITCOIN_CORE.ports[network];
  const env = BITCOIN_CORE.env[network];
  const dataVolume = BITCOIN_CORE.volumes.data[network];
  const ipcVolume = BITCOIN_CORE.volumes.ipc[network];

  // Remove existing container if any
  try {
    const existing = docker.getContainer(containerName);
    const info = await existing.inspect();
    if (info.State.Running) {
      await existing.stop();
    }
    await existing.remove();
  } catch {
    // doesn't exist
  }

  await ensureNetwork();
  const netName = await resolveNetworkName();

  await docker.createContainer({
    name: containerName,
    Image: BITCOIN_CORE.image,
    Env: Object.entries(env).map(([k, v]) => `${k}=${v}`),
    ExposedPorts: {
      [`${ports.rpc}/tcp`]: {},
      [`${ports.p2p}/tcp`]: {},
    },
    HostConfig: {
      Binds: [
        `${dataVolume}:/home/bitcoin/.bitcoin`,
        `${ipcVolume}:/home/bitcoin/.bitcoin/ipc`,
      ],
      PortBindings: {
        [`${ports.rpc}/tcp`]: [{ HostPort: String(ports.rpc) }],
        [`${ports.p2p}/tcp`]: [{ HostPort: String(ports.p2p) }],
      },
      NetworkMode: netName,
      RestartPolicy: { Name: 'unless-stopped' },
    },
    Healthcheck: {
      Test: [
        'CMD-SHELL',
        'bitcoin-cli -datadir=/home/bitcoin/.bitcoin getblockchaininfo || exit 1',
      ],
      Interval: 30000000000,
      Timeout: 10000000000,
      StartPeriod: 60000000000,
      Retries: 3,
    },
  });

  const container = docker.getContainer(containerName);
  await container.start();
}

const ALL_NETWORKS: BitcoinNetwork[] = ['mainnet', 'testnet4', 'regtest'];

/**
 * Stop Bitcoin containers from other networks before starting the requested one.
 */
async function stopOtherNetworks(network: BitcoinNetwork): Promise<void> {
  for (const other of ALL_NETWORKS) {
    if (other === network) continue;
    try {
      const name = getContainerName(other);
      const container = docker.getContainer(name);
      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop();
      }
      await container.remove();
    } catch {
      // doesn't exist — fine
    }
  }
}

export async function startBitcoin(
  network: BitcoinNetwork
): Promise<{ status: string }> {
  // Stop any Bitcoin containers from other networks
  await stopOtherNetworks(network);

  const hasImage = await imageExists();

  if (!hasImage) {
    // Fire build in background, then auto-start container after build
    buildBitcoinImage(network)
      .then(() => createAndStartBitcoinContainer(network))
      .catch((err) => {
        console.error('Bitcoin build/start failed:', err);
      });
    return { status: 'building' };
  }

  // Image exists — create and start immediately
  await createAndStartBitcoinContainer(network);
  return { status: 'running' };
}

export async function stopBitcoin(network: BitcoinNetwork): Promise<void> {
  const containerName = getContainerName(network);
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop();
    }
    await container.remove();
  } catch {
    // doesn't exist
  }
  // Reset build state so user can start fresh
  buildState[network] = { state: 'idle' };
  buildLogs[network] = [];
}

export async function getBitcoinStatus(
  network: BitcoinNetwork
): Promise<BitcoinStatusResponse> {
  const containerName = getContainerName(network);
  const containerStatus = await getContainerStatus(containerName);

  const response: BitcoinStatusResponse = {
    container: containerStatus.state,
    build: { ...buildState[network] },
  };

  // If running, try to get blockchain info
  if (containerStatus.state === 'running') {
    try {
      response.blockchainInfo = await getBlockchainInfo(network);
    } catch {
      // Node may still be starting up
    }
  }

  return response;
}

async function execBitcoinCli(
  containerName: string,
  ...args: string[]
): Promise<string> {
  const container = docker.getContainer(containerName);
  const exec = await container.exec({
    Cmd: ['bitcoin-cli', '-rpcuser=stratum', '-rpcpassword=stratum123', ...args],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ Detach: false, Tty: false });
  return new Promise<string>((resolve, reject) => {
    let data = '';
    stream.on('data', (chunk: Buffer) => { data += chunk.toString('utf8'); });
    stream.on('end', () => resolve(data));
    stream.on('error', reject);
  });
}

export interface RegtestInfo {
  address: string;
  balance: string;
  blocks: number;
}

/**
 * Read the mining address saved by the entrypoint.
 * bitcoin-node has no wallet module, so we can't call getaddressesbylabel/getnewaddress.
 */
async function readSavedMiningAddress(containerName: string): Promise<string> {
  const container = docker.getContainer(containerName);
  const exec = await container.exec({
    Cmd: ['cat', '/home/bitcoin/.bitcoin/regtest/mining_address'],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ Detach: false, Tty: false });
  return new Promise<string>((resolve) => {
    let data = '';
    stream.on('data', (chunk: Buffer) => { data += chunk.toString('utf8'); });
    stream.on('end', () => resolve(data.replace(/[^a-zA-Z0-9]/g, '')));
    stream.on('error', () => resolve(''));
  });
}

export async function getRegtestInfo(): Promise<RegtestInfo> {
  const containerName = getContainerName('regtest');

  const blockCountRaw = await execBitcoinCli(containerName, '-regtest', 'getblockcount');
  const blocks = parseInt(blockCountRaw.match(/\d+/)?.[0] || '0', 10);

  // bitcoin-node has no wallet module — read the address saved by the entrypoint
  const address = await readSavedMiningAddress(containerName);

  // Balance can't be fetched without wallet; estimate from mined blocks
  // First 100 blocks have no spendable reward (coinbase maturity), each block after = 50 BTC
  const spendableBlocks = Math.max(0, blocks - 100);
  const balance = (spendableBlocks * 50).toFixed(8);

  return { address, balance, blocks };
}

export async function mineRegtestBlocks(numBlocks: number, address?: string): Promise<{ blocks: number }> {
  const containerName = getContainerName('regtest');

  let toAddress = address;
  if (!toAddress) {
    toAddress = await readSavedMiningAddress(containerName);
  }
  if (!toAddress) {
    throw new Error('No mining address available. Restart the regtest container to generate one.');
  }

  // Use generatetodescriptor instead of generatetoaddress — works without wallet module
  const descriptor = `addr(${toAddress})`;
  await execBitcoinCli(containerName, '-regtest', 'generatetodescriptor', String(numBlocks), descriptor);

  const blockCountRaw = await execBitcoinCli(containerName, '-regtest', 'getblockcount');
  const blocks = parseInt(blockCountRaw.match(/\d+/)?.[0] || '0', 10);

  return { blocks };
}

export async function getBlockchainInfo(
  network: BitcoinNetwork
): Promise<BitcoinStatusResponse['blockchainInfo']> {
  const containerName = getContainerName(network);
  const container = docker.getContainer(containerName);

  const networkFlag =
    network === 'regtest' ? '-regtest' :
    network === 'testnet4' ? '-testnet4' :
    undefined;

  const cmd = [
    'bitcoin-cli',
    '-rpcuser=stratum',
    '-rpcpassword=stratum123',
    ...(networkFlag ? [networkFlag] : []),
    'getblockchaininfo',
  ];

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ Detach: false, Tty: false });

  const output = await new Promise<string>((resolve, reject) => {
    let data = '';
    stream.on('data', (chunk: Buffer) => {
      // Docker exec stream has 8-byte header per frame
      // Strip header bytes to get raw output
      const raw = chunk.toString('utf8');
      data += raw;
    });
    stream.on('end', () => resolve(data));
    stream.on('error', reject);
  });

  // Extract JSON from output (skip Docker stream headers)
  const jsonMatch = output.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse getblockchaininfo output');
  }

  const info = JSON.parse(jsonMatch[0]);
  return {
    chain: info.chain,
    blocks: info.blocks,
    headers: info.headers,
    verificationprogress: info.verificationprogress,
    initialblockdownload: info.initialblockdownload,
  };
}

export async function getBitcoinLogs(
  network: BitcoinNetwork,
  tail: number = 100
): Promise<string> {
  const containerName = getContainerName(network);
  try {
    const container = docker.getContainer(containerName);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    });
    // logs can be a Buffer or string
    return typeof logs === 'string' ? logs : logs.toString('utf8');
  } catch {
    return '';
  }
}

export function getBuildState(network: BitcoinNetwork): BitcoinBuildStatus {
  return { ...buildState[network] };
}

export function getBuildLogs(network: BitcoinNetwork): string {
  return buildLogs[network].join('\n');
}

export function getIpcVolumeName(network: BitcoinNetwork): string {
  return BITCOIN_CORE.volumes.ipc[network];
}

export async function isBitcoinRunning(
  network: BitcoinNetwork
): Promise<boolean> {
  const containerName = getContainerName(network);
  const status = await getContainerStatus(containerName);
  return status.state === 'running';
}
