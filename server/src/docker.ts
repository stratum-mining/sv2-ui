/**
 * Docker orchestration using Dockerode
 */

import fs from 'fs';
import Docker from 'dockerode';
import os from 'os';
import path from 'path';
import type { SetupData, ContainerStatus, HealthStatus, BitcoinCoreVersion } from './types.js';
import type { ContainerLogLine, LogContainerRole, LogOutputStream } from './logs/types.js';
import { getImageSelectionForSetup, SV2_APP_IMAGES } from './compatibility.js';

/**
 * Expand ~ to home directory in a path.
 * Uses HOST_HOME env var (passed from docker run) if available,
 * otherwise falls back to os.homedir() (works in development).
 */
export function expandHomePath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    const home = process.env.HOST_HOME || os.homedir();
    return inputPath.replace('~', home);
  }
  return inputPath;
}

const DEFAULT_DOCKER_SOCKET = '/var/run/docker.sock';
const KNOWN_DOCKER_SOCKET_PATHS = [
  DEFAULT_DOCKER_SOCKET,
  '~/.docker/run/docker.sock',
  '~/Library/Containers/com.docker.docker/Data/docker-cli.sock',
  '~/.colima/default/docker.sock',
  '~/.orbstack/run/docker.sock',
];

type DockerConnectionConfig = {
  endpoint: string;
  options: Docker.DockerOptions;
  source: string;
};

function listAvailableDockerSockets(): string[] {
  return KNOWN_DOCKER_SOCKET_PATHS
    .map(expandHomePath)
    .filter((socketPath, index, paths) => paths.indexOf(socketPath) === index && fs.existsSync(socketPath));
}

function parseDockerHost(dockerHost: string): DockerConnectionConfig {
  if (dockerHost.startsWith('unix://')) {
    const socketPath = decodeURIComponent(dockerHost.slice('unix://'.length));
    return {
      endpoint: socketPath,
      options: { socketPath },
      source: `DOCKER_HOST=${dockerHost}`,
    };
  }

  const url = new URL(dockerHost);
  const protocol = url.protocol === 'tcp:' ? 'http' : url.protocol.replace(':', '');

  if (protocol !== 'http' && protocol !== 'https' && protocol !== 'ssh') {
    throw new Error(`Unsupported DOCKER_HOST protocol: ${url.protocol}`);
  }

  const defaultPort = protocol === 'https' ? 2376 : 2375;

  return {
    endpoint: dockerHost,
    options: {
      host: url.hostname,
      port: url.port ? Number(url.port) : defaultPort,
      protocol,
    },
    source: `DOCKER_HOST=${dockerHost}`,
  };
}

function resolveDockerConnection(): DockerConnectionConfig {
  const configuredSocketPath = process.env.DOCKER_SOCKET_PATH?.trim();
  if (configuredSocketPath) {
    const socketPath = expandHomePath(configuredSocketPath);
    return {
      endpoint: socketPath,
      options: { socketPath },
      source: `DOCKER_SOCKET_PATH=${configuredSocketPath}`,
    };
  }

  const dockerHost = process.env.DOCKER_HOST?.trim();
  if (dockerHost) {
    return parseDockerHost(dockerHost);
  }

  const detectedSocket = listAvailableDockerSockets()[0];
  if (detectedSocket) {
    return {
      endpoint: detectedSocket,
      options: { socketPath: detectedSocket },
      source: 'auto-detected local socket',
    };
  }

  return {
    endpoint: DEFAULT_DOCKER_SOCKET,
    options: { socketPath: DEFAULT_DOCKER_SOCKET },
    source: 'default socket fallback',
  };
}

function normalizeDockerError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error));
  }

  const code = (error as NodeJS.ErrnoException).code;
  if (code !== 'ENOENT' && code !== 'ECONNREFUSED' && code !== 'EACCES' && code !== 'EPERM') {
    return error;
  }

  const availableSockets = listAvailableDockerSockets();
  const socketSummary = availableSockets.length > 0
    ? `Detected local Docker sockets: ${availableSockets.join(', ')}.`
    : 'No known local Docker socket paths were found.';

  return new Error(
    `Docker is not reachable via ${dockerConnection.endpoint} (${dockerConnection.source}). ${socketSummary} ` +
    'Start Docker Desktop or Docker Engine, or set DOCKER_SOCKET_PATH/DOCKER_HOST to a reachable endpoint.'
  );
}

let dockerConnection = resolveDockerConnection();
let docker = new Docker(dockerConnection.options);

function refreshDockerConnection(): void {
  const nextConnection = resolveDockerConnection();
  if (
    nextConnection.endpoint === dockerConnection.endpoint &&
    nextConnection.source === dockerConnection.source
  ) {
    return;
  }

  dockerConnection = nextConnection;
  docker = new Docker(dockerConnection.options);
}

const NETWORK_NAME = 'sv2-network';
const CONFIG_VOLUME = 'sv2-config';
const TRANSLATOR_CONTAINER = 'sv2-translator';
const JDC_CONTAINER = 'sv2-jdc';
const DOCKER_LOG_HEADER_SIZE = 8;

/**
 * Detect if we're running inside a Docker container.
 * When in Docker, we use shared volumes instead of host bind mounts.
 */
const isRunningInDocker = fs.existsSync('/.dockerenv');

export function getDockerConnectionInfo(): DockerConnectionConfig {
  refreshDockerConnection();
  return dockerConnection;
}

export function isRunningInsideDocker(): boolean {
  return isRunningInDocker;
}

export type BitcoinSocketValidationResult =
  | { valid: true }
  | { valid: false; error: string };

type SocketValidatorBindMode = 'mounts' | 'binds';
type BitcoinSocketValidationOptions = {
  network?: 'mainnet' | 'testnet4';
  coreVersion?: BitcoinCoreVersion | null;
};

async function getCurrentContainerImage(): Promise<string> {
  const configuredImage = process.env.SV2_UI_VALIDATOR_IMAGE?.trim();
  if (configuredImage) {
    return configuredImage;
  }

  try {
    const self = await docker.getContainer(os.hostname()).inspect();
    if (self.Config?.Image) {
      return self.Config.Image;
    }
  } catch (error) {
    console.warn('Could not inspect sv2-ui container image for socket validation:', error);
  }

  return 'stratumv2/sv2-ui:latest';
}

const BITCOIN_SOCKET_VALIDATOR_SCRIPT = `
const net = require('net');

const socketPath = process.argv[1];
const timeoutMs = Number(process.argv[2] || 1000);
const displayPath = process.argv[3] || socketPath;
const socket = net.createConnection({ path: socketPath });
let settled = false;

function finish(ok, message) {
  if (settled) return;
  settled = true;
  socket.destroy();
  if (!ok && message) console.error(message);
  process.exit(ok ? 0 : 1);
}

socket.setTimeout(timeoutMs);
socket.once('connect', () => finish(true));
socket.once('timeout', () => finish(false, 'Socket did not respond within ' + timeoutMs + 'ms. Bitcoin Core may be unresponsive.'));
socket.once('error', (err) => {
  switch (err.code) {
    case 'ENOENT':
      finish(false, 'Socket not found at ' + displayPath + '. Make sure Bitcoin Core is running with IPC enabled.');
      break;
    case 'ECONNREFUSED':
      finish(false, 'Socket file exists at ' + displayPath + ' but nothing is listening. Bitcoin Core may have crashed or been stopped.');
      break;
    case 'EACCES':
      finish(false, 'Permission denied for ' + displayPath + '. Check that the sv2-ui process can read this file.');
      break;
    case 'ENOTSOCK':
      finish(false, 'Path ' + displayPath + ' is not a Unix socket.');
      break;
    case 'ENOTSUP':
      finish(false, 'connect ENOTSUP ' + displayPath);
      break;
    default:
      finish(false, err.message || 'Unknown error connecting to socket');
  }
});
`;

const BITCOIN_SOCKET_EXISTS_SCRIPT = `
const fs = require('fs');
const path = require('path');
const socketPath = process.argv[1];

try {
  const stat = fs.statSync(socketPath);
  if (!stat.isSocket()) {
    console.error('Path ' + socketPath + ' is not a Unix socket.');
    process.exit(2);
  }
  process.exit(0);
} catch (err) {
  if (err && err.code === 'ENOENT') {
    process.exit(1);
  }

  // Docker Desktop for macOS can expose host Unix sockets enough for runtime
  // bind consumers while rejecting metadata operations with ENOTSUP/EINVAL.
  // In that case, fall back to checking that the mounted directory contains
  // the requested socket entry.
  if (err && (err.code === 'ENOTSUP' || err.code === 'EINVAL')) {
    try {
      const entries = fs.readdirSync(path.dirname(socketPath));
      process.exit(entries.includes(path.basename(socketPath)) ? 0 : 1);
    } catch {
      process.exit(2);
    }
  }

  console.error((err && err.message) || 'Unknown error checking socket path');
  process.exit(2);
}
`;

function getContainerSocketMountPaths(socketPath: string): {
  socketDir: string;
  socketName: string;
  containerDir: string;
  containerSocketPath: string;
} {
  const socketDir = path.dirname(socketPath);
  const socketName = path.basename(socketPath);
  const containerDir = '/tmp/sv2-bitcoin-socket-dir';

  return {
    socketDir,
    socketName,
    containerDir,
    containerSocketPath: `${containerDir}/${socketName}`,
  };
}

function getSocketValidatorHostConfig(
  socketDir: string,
  containerDir: string,
  bindMode: SocketValidatorBindMode
): Docker.HostConfig {
  return {
    NetworkMode: 'none',
    ...(bindMode === 'mounts'
      ? {
        Mounts: [
          {
            Type: 'bind' as const,
            Source: socketDir,
            Target: containerDir,
            ReadOnly: true,
          },
        ],
      }
      : {
        Binds: [`${socketDir}:${containerDir}:ro`],
      }),
    RestartPolicy: { Name: 'no' },
  };
}

/**
 * When sv2-ui runs in Docker, host paths such as ~/.bitcoin/node.sock are not
 * visible inside the sv2-ui container. Validate the socket through Docker by
 * bind-mounting the host socket into a short-lived helper container.
 */
export async function probeHostBitcoinSocketWithDocker(
  socketPath: string,
  timeoutMs = 1000,
  options: BitcoinSocketValidationOptions = {}
): Promise<BitcoinSocketValidationResult> {
  refreshDockerConnection();

  const result = await runBitcoinSocketValidatorContainer(
    socketPath,
    timeoutMs,
    'mounts'
  );

  // JDC uses Binds, so retry with the same mount style it will use whenever
  // the source path appears to exist. This avoids false negatives from API
  // Mounts while still validating the actual runtime behavior JDC depends on.
  const shouldRetryWithBinds = !result.valid && (
    !isMissingBindSourceError(result.error) ||
    await hostSocketExistsThroughParentMount(socketPath)
  );

  const finalResult = shouldRetryWithBinds
    ? await runBitcoinSocketValidatorContainer(socketPath, timeoutMs, 'binds')
    : result;

  if (!finalResult.valid && isSocketMountUnsupportedError(finalResult.error)) {
    // Docker Desktop for macOS can reject Node helper connect/stat calls
    // against host-mounted Unix sockets with ENOTSUP. Probe with the actual
    // JDC image before falling back, so stale socket files are still rejected.
    if (options.network && options.coreVersion) {
      return runJdcBitcoinSocketProbeContainer(socketPath, options.network, options.coreVersion);
    }
  }

  return finalResult;
}

function getJdcContainerSocketPath(network: 'mainnet' | 'testnet4'): string {
  return network === 'mainnet'
    ? '/root/.bitcoin/node.sock'
    : `/root/.bitcoin/${network}/node.sock`;
}

function getBitcoinSocketProbeJdcConfig(network: 'mainnet' | 'testnet4'): string {
  return `# Temporary sv2-ui Bitcoin Core IPC probe config.
listening_address = "127.0.0.1:34265"
max_supported_version = 2
min_supported_version = 2
authority_public_key = "9auqWEzQDVyd2oe1JVGFLMLHZtCo2FFqZwtKA5gd9xbuEu7PH72"
authority_secret_key = "mkDLTBBRxdBv998612qipDYoTK3YUrqLe8uWw7gu3iXbSrn2n"
cert_validity_sec = 3600
user_identity = "sv2-ui-ipc-probe"
shares_per_minute = 6.0
share_batch_size = 5
mode = "SOLOMINING"
jdc_signature = "sv2-ui-ipc-probe"
coinbase_reward_script = "${network === 'mainnet'
    ? 'addr(bc1q9f9vj7spn8h7qda6pn8d4g4j99f0mn9lhwz55j)'
    : 'addr(tb1q4x6hgr2zanp7ky4ucr93e2cz9aqklgw56guf6l)'}"
supported_extensions = []
required_extensions = []
upstreams = []

[template_provider_type.BitcoinCoreIpc]
network = "${network}"
fee_threshold = 1000
min_interval = 5
`;
}

async function runJdcBitcoinSocketProbeContainer(
  socketPath: string,
  network: 'mainnet' | 'testnet4',
  coreVersion: BitcoinCoreVersion
): Promise<BitcoinSocketValidationResult> {
  let container: Docker.Container | null = null;
  const image = SV2_APP_IMAGES.byBitcoinCore[coreVersion].jdc;
  const containerSocketPath = getJdcContainerSocketPath(network);
  const config = getBitcoinSocketProbeJdcConfig(network);
  const successPattern = 'IPC mining client successfully created';
  const graceMs = 12_000;

  try {
    await pullImage(image);

    container = await docker.createContainer({
      Image: image,
      Entrypoint: ['/bin/sh', '-c'],
      Cmd: ['printf "%s" "$JDC_PROBE_CONFIG" > /tmp/jdc-probe.toml && exec /app/jd_client_sv2 -c /tmp/jdc-probe.toml'],
      Env: [`JDC_PROBE_CONFIG=${config}`],
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        Binds: [`${socketPath}:${containerSocketPath}:ro`],
        NetworkMode: 'none',
        RestartPolicy: { Name: 'no' },
      },
    });

    await container.start();

    const startedAt = Date.now();
    while (Date.now() - startedAt < graceMs) {
      const logs = await readContainerLogText(container);
      if (logs.includes(successPattern)) {
        return { valid: true };
      }

      if (isJdcBitcoinSocketProbeFailure(logs)) {
        return {
          valid: false,
          error: getJdcBitcoinSocketProbeError(logs, socketPath),
        };
      }

      const state = await container.inspect().catch(() => null);
      if (state?.State?.Running === false) {
        return {
          valid: false,
          error: getJdcBitcoinSocketProbeError(logs, socketPath),
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // JDC is a long-running service. If it is still alive after the IPC
    // startup grace period and did not emit a Bitcoin Core IPC failure, the
    // socket is good enough for the real runtime container to proceed.
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      error: message.includes('bind source path does not exist')
        ? `Socket not found at ${socketPath}. Make sure Bitcoin Core is running with IPC enabled.`
        : message,
    };
  } finally {
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // Best effort cleanup for short-lived validation containers.
      }
    }
  }
}

async function readContainerLogText(container: Docker.Container): Promise<string> {
  const rawLogs = await container.logs({ stdout: true, stderr: true }).catch(() => Buffer.alloc(0));
  return demuxDockerLogBuffer(Buffer.isBuffer(rawLogs) ? rawLogs : Buffer.from(rawLogs))
    .map((chunk) => chunk.payload.trim())
    .filter(Boolean)
    .join('\n');
}

function isJdcBitcoinSocketProbeFailure(logs: string): boolean {
  return (
    logs.includes('Failed to create BitcoinCoreToSv2') ||
    logs.includes('CannotConnectToUnixSocket') ||
    logs.includes('Connection refused') ||
    logs.includes('No such file') ||
    logs.includes('Permission denied')
  );
}

function getJdcBitcoinSocketProbeError(logs: string, socketPath: string): string {
  if (logs.includes('CannotConnectToUnixSocket') || logs.includes('Connection refused')) {
    return `Socket file exists at ${socketPath} but nothing is listening. Bitcoin Core may have crashed or been stopped.`;
  }

  if (logs.includes('No such file') || logs.includes('ENOENT')) {
    return `Socket not found at ${socketPath}. Make sure Bitcoin Core is running with IPC enabled.`;
  }

  if (logs.includes('Permission denied')) {
    return `Permission denied for ${socketPath}. Check that the sv2-ui process can read this file.`;
  }

  return logs || `Socket validation failed for ${socketPath}`;
}

function isMissingBindSourceError(message: string): boolean {
  return (
    message.includes('bind source path does not exist') ||
    message.includes('Socket not found at')
  );
}

function isSocketMountUnsupportedError(message: string): boolean {
  return (
    message.includes('ENOTSUP') ||
    message.includes('Not supported') ||
    message.includes('not supported') ||
    message.includes('operation not supported')
  );
}

async function hostSocketExistsThroughParentMount(socketPath: string): Promise<boolean> {
  if (await runHostSocketExistsContainer(socketPath, 'mounts')) {
    return true;
  }

  return runHostSocketExistsContainer(socketPath, 'binds');
}

async function runHostSocketExistsContainer(
  socketPath: string,
  bindMode: SocketValidatorBindMode
): Promise<boolean> {
  const { socketDir, containerDir, containerSocketPath } = getContainerSocketMountPaths(socketPath);
  let container: Docker.Container | null = null;

  try {
    const image = await getCurrentContainerImage();
    container = await docker.createContainer({
      Image: image,
      Entrypoint: ['node'],
      Cmd: ['-e', BITCOIN_SOCKET_EXISTS_SCRIPT, containerSocketPath],
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: getSocketValidatorHostConfig(socketDir, containerDir, bindMode),
    });

    await container.start();
    const result = await container.wait();
    return result.StatusCode === 0;
  } catch {
    return false;
  } finally {
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // Best effort cleanup for short-lived validation containers.
      }
    }
  }
}

async function runBitcoinSocketValidatorContainer(
  socketPath: string,
  timeoutMs: number,
  bindMode: SocketValidatorBindMode
): Promise<BitcoinSocketValidationResult> {
  let container: Docker.Container | null = null;
  const { socketDir, containerDir, containerSocketPath } = getContainerSocketMountPaths(socketPath);

  try {
    const image = await getCurrentContainerImage();
    container = await docker.createContainer({
      Image: image,
      Entrypoint: ['node'],
      Cmd: ['-e', BITCOIN_SOCKET_VALIDATOR_SCRIPT, containerSocketPath, String(timeoutMs), socketPath],
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: getSocketValidatorHostConfig(socketDir, containerDir, bindMode),
    });

    await container.start();
    const result = await container.wait();

    if (result.StatusCode === 0) {
      return { valid: true };
    }

    const rawLogs = await container.logs({ stdout: true, stderr: true });
    const message = demuxDockerLogBuffer(Buffer.isBuffer(rawLogs) ? rawLogs : Buffer.from(rawLogs))
      .map((chunk) => chunk.payload.trim())
      .filter(Boolean)
      .join('\n');

    return {
      valid: false,
      error: message || `Socket validation failed for ${socketPath}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      error: message.includes('bind source path does not exist')
        ? `Socket not found at ${socketPath}. Make sure Bitcoin Core is running with IPC enabled.`
        : message,
    };
  } finally {
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // Best effort cleanup for short-lived validation containers.
      }
    }
  }
}

const LOG_CONTAINER_NAMES: Record<LogContainerRole, string> = {
  translator: TRANSLATOR_CONTAINER,
  jdc: JDC_CONTAINER,
};

type DockerLogChunk = {
  stream: LogOutputStream;
  payload: string;
};

// Docker uses an 8-byte framing header for non-TTY stdout/stderr multiplexing.
// Reference: https://docs.docker.com/reference/api/engine/version/v1.45/#tag/Container/operation/ContainerAttach
function demuxDockerLogBuffer(buffer: Buffer): DockerLogChunk[] {
  const chunks: DockerLogChunk[] = [];
  let offset = 0;

  while (offset + DOCKER_LOG_HEADER_SIZE <= buffer.length) {
    const streamType = buffer.readUInt8(offset);
    const payloadLength = buffer.readUInt32BE(offset + 4);
    const payloadStart = offset + DOCKER_LOG_HEADER_SIZE;
    const payloadEnd = payloadStart + payloadLength;

    if (payloadEnd > buffer.length) {
      break;
    }

    chunks.push({
      stream: streamType === 2 ? 'stderr' : 'stdout',
      payload: buffer.subarray(payloadStart, payloadEnd).toString('utf-8'),
    });

    offset = payloadEnd;
  }

  if (chunks.length === 0 && buffer.length > 0) {
    return [{ stream: 'stdout', payload: buffer.toString('utf-8') }];
  }

  return chunks;
}

function splitLogLines(
  container: LogContainerRole,
  stream: LogOutputStream,
  payload: string
): ContainerLogLine[] {
  return payload
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((raw) => {
      // Dockerode prefixes lines with an RFC 3339 timestamp when
      // `timestamps: true` is enabled, so we split it from the log message.
      const match = raw.match(/^(\d{4}-\d{2}-\d{2}T\S+?)\s(.*)$/);

      return {
        container,
        stream,
        timestamp: match ? match[1] : null,
        message: match ? match[2] : raw,
        raw,
      };
    });
}

export async function readContainerLogs(
  container: LogContainerRole,
  options: { tail?: number } = {}
): Promise<ContainerLogLine[]> {
  refreshDockerConnection();

  try {
    const dockerContainer = docker.getContainer(LOG_CONTAINER_NAMES[container]);
    const info = await dockerContainer.inspect();
    const startTime = info.State?.StartedAt;

    const logOptions: Docker.ContainerLogsOptions & { follow: false } = {
      stdout: true,
      stderr: true,
      follow: false,
      timestamps: true,
      ...(options.tail !== undefined ? { tail: options.tail } : {}),
      abortSignal: AbortSignal.timeout(2000),
    };

    if (startTime) {
      logOptions.since = Math.floor(new Date(startTime).getTime() / 1000);
    }

    const logBuffer = await dockerContainer.logs(logOptions);

    const chunks = info.Config?.Tty
      ? [{ stream: 'stdout' as const, payload: logBuffer.toString('utf-8') }]
      : demuxDockerLogBuffer(logBuffer);

    return chunks.flatMap((chunk) => splitLogLines(container, chunk.stream, chunk.payload));
  } catch (error) {
    throw new Error(`Failed to read logs for ${container} container`, {
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }
}

/**
 * Ensure the sv2 network exists
 */
async function ensureNetwork(): Promise<void> {
  try {
    const network = docker.getNetwork(NETWORK_NAME);
    await network.inspect();
  } catch {
    console.log(`Creating network ${NETWORK_NAME}...`);
    await docker.createNetwork({
      Name: NETWORK_NAME,
      Driver: 'bridge',
    });
  }
}

/**
 * Connect sv2-ui container to the sv2-network so it can reach other containers.
 * This is needed for the proxy to communicate with Translator/JDC monitoring APIs.
 */
async function connectSv2UiToNetwork(): Promise<void> {
  try {
    // Find sv2-ui container (could be named sv2-ui or sv2-ui-test)
    const containers = await docker.listContainers({ all: true });
    const sv2UiContainer = containers.find(c =>
      c.Names.some(n => n === '/sv2-ui' || n === '/sv2-ui-test')
    );

    if (!sv2UiContainer) {
      // Not running in Docker (development mode)
      return;
    }

    const network = docker.getNetwork(NETWORK_NAME);
    const networkInfo = await network.inspect();

    // Check if already connected
    if (networkInfo.Containers && networkInfo.Containers[sv2UiContainer.Id]) {
      return;
    }

    console.log('Connecting sv2-ui to sv2-network...');
    await network.connect({ Container: sv2UiContainer.Id });
  } catch {
    // Non-fatal: sv2-ui stays on its default network (bridge).
    // The API proxy will still work via exposed ports on localhost.
    console.log('Note: Could not connect to sv2-network');
  }
}

/**
 * Pull the latest version of an image from Docker Hub.
 * Always pulls to ensure we have the most recent version.
 */
async function pullImage(imageName: string): Promise<void> {
  console.log(`Pulling latest ${imageName}...`);
  await new Promise<void>((resolve, reject) => {
    docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err) => {
        if (err) return reject(err);
        console.log(`Pulled ${imageName}`);
        resolve();
      });
    });
  });
}

/**
 * Remove a container if it exists
 */
async function removeContainer(name: string): Promise<void> {
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop();
    }
    await container.remove();
    console.log(`Removed container ${name}`);
  } catch {
    // Container doesn't exist, that's fine
  }
}

/**
 * Get container status
 */
async function getContainerStatus(name: string): Promise<ContainerStatus | null> {
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();

    let status: HealthStatus = 'stopped';
    if (info.State.Running) {
      status = info.State.Health?.Status === 'healthy' ? 'healthy' : 'starting';
    }

    const ports: Record<string, string> = {};
    if (info.NetworkSettings.Ports) {
      for (const [containerPort, bindings] of Object.entries(info.NetworkSettings.Ports)) {
        if (bindings && bindings[0]) {
          ports[containerPort] = bindings[0].HostPort || '';
        }
      }
    }

    return {
      id: info.Id,
      name,
      status,
      ports,
    };
  } catch {
    return null;
  }
}

/**
 * Start the Translator container.
 * - In Docker: uses shared volume (sv2-config) for config
 * - In dev: bind-mounts config file from host filesystem
 */
async function startTranslator(configPath: string, image: string): Promise<void> {
  await removeContainer(TRANSLATOR_CONTAINER);

  const binds = isRunningInDocker
    ? [`${CONFIG_VOLUME}:/config:ro`]
    : [`${configPath}:/config/translator.toml:ro`];

  const container = await docker.createContainer({
    Image: image,
    name: TRANSLATOR_CONTAINER,
    Entrypoint: ['/app/translator_sv2'],
    Cmd: ['-c', '/config/translator.toml'],
    StopSignal: 'SIGINT',
    HostConfig: {
      Binds: binds,
      PortBindings: {
        '34255/tcp': [{ HostPort: '34255' }],
        '9092/tcp': [{ HostPort: '9092' }],
      },
      NetworkMode: NETWORK_NAME,
      RestartPolicy: { Name: 'no' },
    },
    ExposedPorts: {
      '34255/tcp': {},
      '9092/tcp': {},
    },
  });

  await container.start();
  console.log('Translator container started');
}

/**
 * Start the JDC container.
 * - In Docker: uses shared volume (sv2-config) for config
 * - In dev: bind-mounts config file from host filesystem
 */
async function startJdc(
  configPath: string,
  bitcoinSocketPath: string,
  network: string,
  image: string
): Promise<void> {
  await removeContainer(JDC_CONTAINER);

  // JDC resolves the socket path from its `network` setting: /root/.bitcoin/node.sock
  // for mainnet, /root/.bitcoin/<network>/node.sock otherwise. Bind mount must match
  // the path JDC actually looks at, not a hardcoded mainnet path.
  const containerSocketPath = network === 'mainnet'
    ? '/root/.bitcoin/node.sock'
    : `/root/.bitcoin/${network}/node.sock`;

  const binds = isRunningInDocker
    ? [
      `${CONFIG_VOLUME}:/config:ro`,
      `${bitcoinSocketPath}:${containerSocketPath}:ro`,
    ]
    : [
      `${configPath}:/config/jdc.toml:ro`,
      `${bitcoinSocketPath}:${containerSocketPath}:ro`,
    ];

  const container = await docker.createContainer({
    Image: image,
    name: JDC_CONTAINER,
    Entrypoint: ['/app/jd_client_sv2'],
    Cmd: ['-c', '/config/jdc.toml'],
    StopSignal: 'SIGINT',
    HostConfig: {
      Binds: binds,
      PortBindings: {
        '34265/tcp': [{ HostPort: '34265' }],
        '9091/tcp': [{ HostPort: '9091' }],
      },
      NetworkMode: NETWORK_NAME,
      RestartPolicy: { Name: 'no' },
    },
    ExposedPorts: {
      '34265/tcp': {},
      '9091/tcp': {},
    },
  });

  await container.start();
  console.log('JDC container started');
}

/**
 * Start the mining stack
 * Config files must already exist in configDir before calling this.
 */
export async function startStack(
  data: SetupData,
  configDir: string
): Promise<void> {
  await ensureDockerAvailable();

  // Ensure network exists
  await ensureNetwork();
  // Connect sv2-ui to the network so it can proxy API requests
  await connectSv2UiToNetwork();

  const imageSelection = getImageSelectionForSetup(data);

  if (imageSelection.mode === 'jd') {
    console.log(
      `Using compatibility profile ${imageSelection.profile.id} for Bitcoin Core ${imageSelection.profile.bitcoinCoreVersion}`
    );
  } else {
    console.log(`Using Translator image ${imageSelection.translator} for no-JD mode`);
  }

  // Pull selected images from Docker Hub
  await pullImage(imageSelection.translator);
  if (imageSelection.mode === 'jd') {
    await pullImage(imageSelection.jdc);
  }

  // Start JDC first if in JD mode (Translator connects to JDC)
  if (imageSelection.mode === 'jd' && data.bitcoin) {
    const socketPath = expandHomePath(data.bitcoin.socket_path);
    await startJdc(`${configDir}/jdc.toml`, socketPath, data.bitcoin.network, imageSelection.jdc);
    console.log('Waiting for JDC to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Start Translator
  await startTranslator(`${configDir}/translator.toml`, imageSelection.translator);
}

/**
 * Stop all containers
 */
export async function stopStack(): Promise<void> {
  await ensureDockerAvailable();

  // Stop JDC first so it receives SIGINT and gracefully closes its IPC
  // connection to Bitcoin Core. If Translator is stopped first, JDC sees a
  // SocketClosed error and tears down via the error path, which doesn't
  // cleanly disconnect from Bitcoin Core and can crash it.
  await removeContainer(JDC_CONTAINER);
  await removeContainer(TRANSLATOR_CONTAINER);
}

/**
 * Get stack status
 */
export async function getStackStatus(mode: 'jd' | 'no-jd' | null): Promise<{
  translator: ContainerStatus | null;
  jdc: ContainerStatus | null;
}> {
  const translator = await getContainerStatus(TRANSLATOR_CONTAINER);
  const jdc = mode === 'jd' ? await getContainerStatus(JDC_CONTAINER) : null;

  return { translator, jdc };
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    refreshDockerConnection();
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

export async function ensureDockerAvailable(): Promise<void> {
  try {
    refreshDockerConnection();
    await docker.ping();
  } catch (error) {
    throw normalizeDockerError(error);
  }
}
