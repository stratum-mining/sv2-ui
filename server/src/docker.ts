/**
 * Docker orchestration using Dockerode
 */

import fs from 'fs';
import path from 'path'
import Docker from 'dockerode';
import os from 'os';
import { StringDecoder } from 'string_decoder';
import type { BitcoinNetwork, HealthStatus } from '@sv2-ui/shared';
import {
  BITCOIN_PROBE_IMAGE,
  CONTAINER_NAMES,
  DOCKER_SOCKET_PATHS,
  DEFAULT_BITCOIN_PATHS,
  SUPPORTED_NETWORKS,
  RPC_PORTS,
} from '@sv2-ui/shared';
import type { SetupData, ContainerStatus } from './types.js';
import type { ContainerLogLine, LogContainerRole, LogOutputStream } from './logs/types.js';
import {
  createDockerLogDemuxer,
  createLogLineFormatter,
  DOCKER_LOG_HEADER_SIZE,
  type ContainerLogExportStats,
  type ContainerLogLineSink,
  type DockerLogChunk,
  formatMergedLogLine,
} from './logs/export.js';
import { isMissingContainerError, DockerConnectionError } from './docker-errors.js';
import { getImageSelectionForSetup } from '@sv2-ui/shared';
import { bitcoinSocketValidatorScript } from './bitcoin-socket-validator.js';
import { bitcoinSocketExistsScript } from './bitcoin-socket-exists.js';
import { bitcoinRpcValidatorScript } from './bitcoin-rpc-validator.js';

export const DOCKER_CALL_TIMEOUT_MS = 10000;


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

const DEFAULT_DOCKER_SOCKET = DOCKER_SOCKET_PATHS[0];

type DockerConnectionConfig = {
  endpoint: string;
  options: Docker.DockerOptions;
  source: string;
};

function listAvailableDockerSockets(): string[] {
  return DOCKER_SOCKET_PATHS
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

  let url: URL;
  try {
    url = new URL(dockerHost);
  } catch {
    // ERR_INVALID_URL carries the raw input (credentials included) on its
    // `input` property, so the original error is never rethrown or echoed.
    throw new Error('Invalid DOCKER_HOST: expected a parseable URL, e.g. tcp://host:2375.');
  }
  const protocol = url.protocol === 'tcp:' ? 'http' : url.protocol.replace(':', '');

  if (protocol !== 'http' && protocol !== 'https' && protocol !== 'ssh') {
    throw new Error(`Unsupported DOCKER_HOST protocol: ${url.protocol}`);
  }

  const defaultPort = protocol === 'https' ? 2376 : 2375;
  const port = url.port ? Number(url.port) : defaultPort;
  // Echo the configured URL with only the password removed, so the startup
  // log and error messages show the endpoint the operator actually set.
  url.password = '';
  const redacted = url.href;

  return {
    endpoint: redacted,
    options: {
      host: url.hostname,
      port,
      protocol,
    },
    source: `DOCKER_HOST=${redacted}`,
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



export function normalizeDockerError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(String(error));
  }

  const code = (error as NodeJS.ErrnoException).code;
  const isTransportError = (typeof code === 'string' && !('statusCode' in error)) || ('level' in error);
  
  if (!isTransportError) {
    // Only intercept 404s that lack a Docker-shaped JSON body, to avoid swallowing missing image/container errors
    if (
      typeof error === 'object' && error !== null &&
      'statusCode' in error && (error as { statusCode?: unknown }).statusCode === 404 &&
      typeof (error as { json?: { message?: unknown } }).json?.message !== 'string'
    ) {
      return new DockerConnectionError(
        `The endpoint at ${dockerConnection.endpoint} (${dockerConnection.source}) is not a Docker daemon (HTTP 404).`,
        { cause: error }
      );
    }
    return error as Error;
  }

  const endpoint = dockerConnection.endpoint;
  const source = dockerConnection.source;

  if (code === 'ABORT_ERR') {
    return new DockerConnectionError(
      `Docker did not respond within ${DOCKER_CALL_TIMEOUT_MS / 1000} s at ${endpoint} (${source}). ` +
      `Ensure Docker Engine or Docker Desktop is running and responsive.`,
      { cause: error }
    );
  }

  let helpText = '';
  const isSSH = ('level' in error) || endpoint.startsWith('ssh://');
  const isSocket = 'socketPath' in dockerConnection.options;

  if (isSSH) {
    helpText = 'Ensure the SSH user, key, and host are correct and that the remote Docker daemon is accessible.';
  } else {
    helpText = 'Ensure Docker Engine or Docker Desktop is running.';
    const availableSockets = listAvailableDockerSockets().filter(s => s !== endpoint);
    
    if (isRunningInsideDocker()) {
      if (isSocket) {
        helpText += ' Also ensure the socket volume is mounted into this container.';
      } else {
        helpText += ' Also ensure the endpoint is accessible from within the container.';
      }
    } else if (availableSockets.length > 0) {
      helpText += ` Other available sockets found: ${availableSockets.join(', ')}. Try setting DOCKER_SOCKET_PATH to one of these.`;
    } else {
      helpText += ' Or check your DOCKER_SOCKET_PATH / DOCKER_HOST endpoint.';
    }
  }

  if (code === 'EACCES' || code === 'EPERM') {
    let permText = `Check file permissions or ensure your user is in the 'docker' group.`;
    if (isRunningInsideDocker()) {
      permText += ` If mounted as a volume, check mount permissions.`;
    }
    return new DockerConnectionError(
      `Permission denied when accessing Docker at ${endpoint} (${source}). ${permText}`,
      { cause: error }
    );
  }

  const reasonCode = code || (error as { level?: string }).level || 'unknown';
  return new DockerConnectionError(
    `Docker is not reachable at ${endpoint} (${source}) [${reasonCode}]. ${helpText}`,
    { cause: error }
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

const NETWORK_NAME = CONTAINER_NAMES.network;
const CONFIG_VOLUME = CONTAINER_NAMES.configVolume;
const TRANSLATOR_CONTAINER = CONTAINER_NAMES.translator;
const JDC_CONTAINER = CONTAINER_NAMES.jdc;

// Bound the retained log history of the mining containers at the source.
// Without it the json-file driver keeps every byte ever logged: the history
// the logs panel, diagnostics snapshots, and the download export all read
// from grows without limit (an attacker spamming the network-facing
// services can inflate it at will), and the host disk fills up. 3 x 10 MiB
// keeps a useful diagnostic window per container.
const CONTAINER_LOG_ROTATION = {
  'max-size': '10m',
  'max-file': '3',
} as const;

// The rotation options above are json-file specific, and naming the driver
// explicitly overrides whatever the host's daemon.json defaults to. On a
// journald, syslog, fluentd or local host that would silently pull the
// translator and JDC out of the operator's log pipeline, so the config is
// only applied when json-file is already the default. `undefined` leaves the
// daemon's own driver and its rotation settings in charge.
type MiningContainerLogConfig =
  | { Type: 'json-file'; Config: typeof CONTAINER_LOG_ROTATION }
  | undefined;

async function miningContainerLogConfig(): Promise<MiningContainerLogConfig> {
  const daemonLogDriver = await defaultLoggingDriver();
  if (daemonLogDriver !== 'json-file') {
    return undefined;
  }

  return {
    Type: 'json-file',
    Config: { ...CONTAINER_LOG_ROTATION },
  };
}

// Probed at container creation rather than cached: starts are rare, the
// daemon's default driver can be reconfigured under us, and a probe failure
// must not block creating the container at all.
async function defaultLoggingDriver(): Promise<string | null> {
  try {
    const info = await docker.info();
    return info.LoggingDriver ?? null;
  } catch (error) {
    console.error('Could not read the daemon logging driver:', error);
    return null;
  }
}

export function getDockerConnectionInfo(): DockerConnectionConfig {
  refreshDockerConnection();
  return dockerConnection;
}

export function isRunningInsideDocker(): boolean {
  return fs.existsSync('/.dockerenv');
}

export type BitcoinSocketValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export type BitcoinRpcValidationResult =
  | { valid: true; chain: string; version: number; initialBlockDownload: boolean }
  | { valid: false; error: string };

export type BitcoinRpcDiscoveryResult = {
  valid: boolean;
  dataDir: string;
  network: BitcoinNetwork;
  chain?: string;
  version?: number;
  initialBlockDownload?: boolean;
  error?: string;
};

export type BitcoinRpcProbeTransport = {
  name: string;
  host: string;
  networkMode: 'host' | 'bridge';
  extraHosts?: string[];
};

export function getBitcoinRpcProbeTransports(): BitcoinRpcProbeTransport[] {
  return [
    {
      name: 'host-loopback',
      host: '127.0.0.1',
      networkMode: 'host',
    },
    {
      name: 'docker-host-gateway',
      host: 'host.docker.internal',
      networkMode: 'bridge',
      extraHosts: ['host.docker.internal:host-gateway'],
    },
  ];
}

export async function autoDiscoverBitcoinRpc(): Promise<BitcoinRpcDiscoveryResult[]> {
  const osPaths = Object.values(DEFAULT_BITCOIN_PATHS).map(expandHomePath);

  for (const dataDir of osPaths) {
    const results: BitcoinRpcDiscoveryResult[] = [];
    let mountFailed = false;

    for (const network of SUPPORTED_NETWORKS) {
      try {
        const probeResult = await probeBitcoinRpcWithDocker(dataDir, network);
        results.push({
          valid: probeResult.valid,
          dataDir,
          network,
          ...(probeResult.valid ? {
            chain: probeResult.chain,
            version: probeResult.version,
            initialBlockDownload: probeResult.initialBlockDownload,
          } : { error: probeResult.error }),
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('bind source path does not exist')) {
          mountFailed = true;
          break;
        }
        throw error;
      }
    }

    if (mountFailed) {
      continue;
    }

    return results.filter(r => r.valid);
  }

  return [];
}


function getJdcContainerSocketPath(network: string): string {
  return network === 'mainnet'
    ? '/root/.bitcoin/node.sock'
    : `/root/.bitcoin/${network}/node.sock`;
}

/**
 * When sv2-ui runs in Docker, host paths such as ~/.bitcoin/node.sock are not
 * visible inside the sv2-ui container. Validate the socket through Docker by
 * bind-mounting the host socket into a short-lived helper container.
 *
 * Two-step approach:
 * 1. First: Check if socket file exists (mount parent directory)
 * 2. Second: Full socket connection validation (mount socket directly)
 */
export async function probeBitcoinSocketWithDocker(
  socketPath: string,
): Promise<BitcoinSocketValidationResult> {
  const containerSocketPath = "/tmp/bitcoin/node.sock";

  try {
    await pullImage(BITCOIN_PROBE_IMAGE);

    // Step 1: Check if socket file exists
    const existsResult = await checkSocketExists(socketPath, containerSocketPath);
    if (!existsResult) {
      return {
        valid: false,
        error: `Socket not found at ${socketPath}. Make sure Bitcoin Core is running with IPC enabled.`,
      };
    }

    // Step 2: Full socket validation
    return await validateSocketWithDocker(socketPath, containerSocketPath);
  } catch (error) {
    const normalizedError = normalizeDockerError(error);
    return {
      valid: false,
      error: `Failed to validate socket: ${normalizedError.message}`,
    };
  }
}

export async function probeBitcoinRpcWithDocker(
  dataDir: string,
  network: BitcoinNetwork,
): Promise<BitcoinRpcValidationResult> {
  const containerDataDir = "/tmp/bitcoin";
  const rpcPort = RPC_PORTS[network];

  try {
    await pullImage(BITCOIN_PROBE_IMAGE);

    const errors: string[] = [];

    for (const transport of getBitcoinRpcProbeTransports()) {
      try {
        const result = await runBitcoinRpcProbeContainer({
          dataDir,
          network,
          rpcPort,
          containerDataDir,
          transport,
        });

        if (result.valid) {
          return result;
        }

        errors.push(`${transport.name}: ${result.error}`);
      } catch (error) {
        if (error instanceof Error && error.message.includes('bind source path does not exist')) {
          throw error;
        }
        const normalizedError = normalizeDockerError(error);
        errors.push(`${transport.name}: ${normalizedError.message}`);
      }
    }

    return {
      valid: false,
      error: errors.join('\n') || `RPC validation failed for port ${rpcPort}`,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('bind source path does not exist')) {
      throw error;
    }
    const normalizedError = normalizeDockerError(error);
    return {
      valid: false,
      error: `Failed to validate RPC connection: ${normalizedError.message}`,
    };
  }
}

async function runBitcoinRpcProbeContainer({
  dataDir,
  network,
  rpcPort,
  containerDataDir,
  transport,
}: {
  dataDir: string;
  network: 'mainnet' | 'testnet4';
  rpcPort: number;
  containerDataDir: string;
  transport: BitcoinRpcProbeTransport;
}): Promise<BitcoinRpcValidationResult> {
  let container: Docker.Container | null = null;

  try {
    container = await docker.createContainer({
      Image: BITCOIN_PROBE_IMAGE,
      Entrypoint: ['node'],
      Cmd: ['-e', bitcoinRpcValidatorScript, containerDataDir, network, transport.host, String(rpcPort)],
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        Mounts: [
          {
            Type: "bind",
            Source: dataDir,
            Target: containerDataDir,
            ReadOnly: true
          }
        ],
        ...(transport.extraHosts ? { ExtraHosts: transport.extraHosts } : {}),
        NetworkMode: transport.networkMode,
        RestartPolicy: { Name: 'no' },
      },
    });

    await container.start();
    const result = await container.wait();

    if (result.StatusCode === 0) {
      const rawLogs = await container.logs({ stdout: true, stderr: false });
      const output = demuxDockerLogBuffer(Buffer.isBuffer(rawLogs) ? rawLogs : Buffer.from(rawLogs))
        .map((chunk) => chunk.payload.trim())
        .filter(Boolean)
        .join('\n');

      try {
        const parsed = JSON.parse(output);
        return {
          valid: true,
          chain: parsed.chain,
          version: parsed.version,
          initialBlockDownload: parsed.initialblockdownload,
        };
      } catch {
        return {
          valid: false,
          error: `Failed to parse RPC validation output: ${output}`,
        };
      }
    }

    const rawLogs = await container.logs({ stdout: true, stderr: true });
    const message = demuxDockerLogBuffer(Buffer.isBuffer(rawLogs) ? rawLogs : Buffer.from(rawLogs))
      .map((chunk) => chunk.payload.trim())
      .filter(Boolean)
      .join('\n');

    return {
      valid: false,
      error: message || `RPC validation failed for port ${rpcPort}`,
    };
  } finally {
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // cleanup failure is non-fatal
      }
    }
  }
}

async function checkSocketExists(
  socketPath: string,
  containerSocketPath: string,
): Promise<boolean> {
  let container: Docker.Container | null = null;
  try {
    container = await docker.createContainer({
      Image: BITCOIN_PROBE_IMAGE,
      Entrypoint: ['node'],
      Cmd: ['-e', bitcoinSocketExistsScript, containerSocketPath],
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        Mounts: [
          {
            Type: "bind",
            Source: path.dirname(socketPath),
            Target: path.dirname(containerSocketPath)
          }
        ],
        NetworkMode: 'none',
        RestartPolicy: { Name: 'no' },
      },
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
        // if the operation above failed we have bigger problems
      }
    }
  }
}

async function validateSocketWithDocker(
  socketPath: string,
  containerSocketPath: string,
): Promise<BitcoinSocketValidationResult> {
  let container: Docker.Container | null = null;

  try {
    container = await docker.createContainer({
      Image: BITCOIN_PROBE_IMAGE,
      Entrypoint: ['node'],
      Cmd: ['-e', bitcoinSocketValidatorScript, containerSocketPath, "1000", socketPath],
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        Binds: [`${socketPath}:${containerSocketPath}:ro`],
        NetworkMode: 'none',
        RestartPolicy: { Name: 'no' },
      },
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
  } catch {
    return {
      valid: false,
      error: `Socket not found at ${socketPath}. Make sure Bitcoin Core is running with IPC enabled.`
    };
  } finally {
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // if the operation above fais we have bigger problems
      }
    }
  }
}

const LOG_CONTAINER_NAMES: Record<LogContainerRole, string> = {
  translator: TRANSLATOR_CONTAINER,
  jdc: JDC_CONTAINER,
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
  options: { tail?: number; since?: number } = {}
): Promise<ContainerLogLine[]> {
  refreshDockerConnection();

  try {
    const dockerContainer = docker.getContainer(LOG_CONTAINER_NAMES[container]);
    // Both calls are bounded. An abort on only one of them leaves a hung
    // request poisoning every caller that shares the resulting promise, long
    // after Docker became reachable again.
    const info = await dockerContainer.inspect({
      abortSignal: AbortSignal.timeout(DOCKER_CALL_TIMEOUT_MS),
    });
    const startTime = info.State?.StartedAt;

    const logOptions: Docker.ContainerLogsOptions & { follow: false } = {
      stdout: true,
      stderr: true,
      follow: false,
      timestamps: true,
      ...(options.tail !== undefined ? { tail: options.tail } : {}),
      abortSignal: AbortSignal.timeout(DOCKER_CALL_TIMEOUT_MS),
    };

    const containerStart = startTime
      ? Math.floor(new Date(startTime).getTime() / 1000)
      : null;
    if (options.since !== undefined || containerStart !== null) {
      logOptions.since = Math.max(options.since ?? 0, containerStart ?? 0);
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
 * Request path for a container's logs endpoint.
 *
 * The trailing '?' is load-bearing, not cosmetic: docker-modem appends the
 * dial `options` as a querystring only when the path already contains a '?'.
 * Without it the request goes out with no parameters and the daemon rejects it
 * with 400 "must specify at least one of 'stdout' or 'stderr'".
 * container.logs() builds its path the same way.
 */
export function containerLogsPath(containerId: string): string {
  return `/containers/${containerId}/logs?`;
}

/**
 * Open a container's log endpoint as a raw response stream.
 *
 * `container.logs()` cannot do this: dockerode sets `isStream` from `follow`,
 * so a non-following read is handed back as one fully buffered Buffer. Dialing
 * the endpoint directly keeps the body streaming while `follow: false` tells
 * the daemon to close the response once the backlog is delivered.
 *
 * `abortSignal` bounds the dial, and only the dial. docker-modem passes it to
 * `http.request` but never attaches it to the response stream on the
 * `isStream` path, so aborting it while the body is streaming tears down a
 * download mid-flight. The caller therefore aborts only when it has already
 * given up on the open.
 */
function openContainerLogStream(
  dockerContainer: Docker.Container,
  containerStart: number | null,
  abortSignal: AbortSignal
): Promise<NodeJS.ReadableStream> {
  return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    // Dialed through the container, exactly as container.logs() does, so the
    // same modem instance, auth and error mapping apply.
    dockerContainer.modem.dial(
      {
        path: containerLogsPath(dockerContainer.id),
        method: 'GET',
        isStream: true,
        // docker-modem only reads abortSignal from the top level of the dial
        // options; inside `options` it is deleted (to keep it out of the query
        // string) and otherwise ignored.
        abortSignal,
        // Same mapping container.logs() uses, so a missing container keeps
        // arriving as a recognizable 404 for isMissingContainerError.
        statusCodes: {
          200: true,
          404: 'no such container',
          500: 'server error',
        },
        options: {
          stdout: true,
          stderr: true,
          follow: false,
          timestamps: true,
          ...(containerStart !== null ? { since: containerStart } : {}),
        },
      },
      (error: Error | null, stream: unknown) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stream as NodeJS.ReadableStream);
      }
    );
  });
}

/**
 * Stream a container's full retained log history as formatted text lines
 * through `sink.write`, without ever buffering the whole history. Chunks
 * are demuxed and formatted as they arrive; the byte cap stops the read by
 * destroying the docker stream mid-flight (the daemon stops pushing).
 *
 * The read is deliberately NOT a follow stream. `container.logs()` only
 * returns a stream while following, and a followed stream on a running
 * container stays open and silent forever after the backlog (verified with
 * `docker logs --follow --until`) — it never emits `end`. Detecting the end
 * by watching for silence is a guess: it truncates a slow client that pauses
 * the stream, it can expire before the daemon sends its first byte, and it
 * drops whatever the formatter still holds.
 *
 * Instead this dials the logs endpoint directly with `isStream` so the
 * response body arrives as a stream while `follow: false` lets the daemon
 * close it as soon as the backlog is delivered. `end` is then the daemon's
 * own signal, the buffered tail line is always flushed, and backpressure
 * only ever delays the transfer instead of ending the export.
 *
 * Unlike readContainerLogs there is no 2s abort: the export's lifetime is
 * bounded by the daemon closing the stream, the byte cap, and the consumer
 * going away instead.
 */
export async function streamContainerLogText(
  container: LogContainerRole,
  options: { maxBytes: number; sink: ContainerLogLineSink }
): Promise<ContainerLogExportStats> {
  refreshDockerConnection();

  const dockerContainer = docker.getContainer(LOG_CONTAINER_NAMES[container]);

  // Both halves of the open are bounded, and the client leaving is honoured
  // even before there is a stream to destroy. Neither `inspect()` nor the dial
  // carries a timeout of its own here (unlike readContainerLogs), and this is
  // the only reader of this stream, so a half-open Docker connection would
  // otherwise leave the download pending forever with nothing to release it.
  const openAbort = new AbortController();
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  const openTimeout = new Promise<never>((_, reject) => {
    openTimer = setTimeout(() => {
      openAbort.abort();
      reject(
        new Error(
          `Docker did not open the log stream for ${container} within ` +
            `${DOCKER_CALL_TIMEOUT_MS / 1000}s`
        )
      );
    }, DOCKER_CALL_TIMEOUT_MS);
  });
  // Only raced while opening. Past that point the timer is cleared and nothing
  // rejects, so these handlers exist to keep an abandoned promise from
  // surfacing as an unhandled rejection.
  openTimeout.catch(() => undefined);

  // Set once the stream exists; until then the consumer's close only has to
  // abandon the open.
  let stopStream: (() => void) | null = null;
  let abandonOpen: (error: Error) => void = () => undefined;
  const abandoned = new Promise<never>((_, reject) => {
    abandonOpen = reject;
  });
  abandoned.catch(() => undefined);

  options.sink.onClose(() => {
    abandonOpen(new Error(`Log export for ${container} was cancelled by the client`));
    openAbort.abort();
    stopStream?.();
  });

  let info: Docker.ContainerInspectInfo;
  let raw: NodeJS.ReadableStream & { destroy: (error?: Error) => void };
  try {
    // Not wrapped, so a 404 here stays recognizable to isMissingContainerError
    // exactly as it is for every other caller.
    info = await Promise.race([
      dockerContainer.inspect({ abortSignal: openAbort.signal }),
      openTimeout,
      abandoned,
    ]);

    const startTime = info.State?.StartedAt;
    const containerStart = startTime
      ? Math.floor(new Date(startTime).getTime() / 1000)
      : null;

    raw = (await Promise.race([
      openContainerLogStream(dockerContainer, containerStart, openAbort.signal),
      openTimeout,
      abandoned,
    ])) as NodeJS.ReadableStream & { destroy: (error?: Error) => void };
  } catch (error) {
    if (openTimer !== null) {
      clearTimeout(openTimer);
      openTimer = null;
    }
    // A container that cannot be read is reported, not fatal, so only the
    // failures that are about opening this stream get the wrapper.
    throw new Error(`Failed to open log stream for ${container} container`, {
      cause: error instanceof Error ? error : new Error(String(error)),
    });
  }

  // The open is done, so the dial's abort signal is no longer ours to fire:
  // dropping the timer is what keeps a long download from being torn down.
  if (openTimer !== null) {
    clearTimeout(openTimer);
    openTimer = null;
  }

  return await new Promise<ContainerLogExportStats>((resolve, reject) => {
    let bytes = 0;
    let truncated = false;
    let settled = false;

    function finish(error?: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      raw.destroy();
      if (error) {
        reject(error);
      } else {
        resolve({ bytes, truncated });
      }
    }

    stopStream = () => finish();

    const formatter = createLogLineFormatter(container, (line) => {
      if (truncated) {
        return;
      }

      const lineBytes = Buffer.byteLength(formatMergedLogLine(line), 'utf8') + 1;
      if (bytes + lineBytes > options.maxBytes) {
        truncated = true;
        // A marker, not a log line: it is this export's own text, and it
        // inherits the container's position in the merged stream.
        options.sink.write({
          kind: 'marker',
          container,
          message: `[log export for ${container} truncated at ${options.maxBytes} bytes]`,
        });
        finish();
        return;
      }

      bytes += lineBytes;
      if (!options.sink.write(line)) {
        raw.pause();
      }
    });

    // TTY containers carry no frame headers; everything is stdout payload. Each
    // network chunk is decoded on its own there, so a multi-byte character
    // split across two chunks needs a stateful decoder. The framed path is
    // already safe: the demuxer reassembles whole frames before decoding.
    let ttyDecoder: StringDecoder | null = null;
    const demux = info.Config?.Tty
      ? (chunk: Buffer) => {
          ttyDecoder ??= new StringDecoder('utf-8');
          formatter.consume({ stream: 'stdout', payload: ttyDecoder.write(chunk) });
        }
      : createDockerLogDemuxer((chunk) => formatter.consume(chunk));

    raw.on('data', (chunk: Buffer) => {
      try {
        demux(chunk);
      } catch (error) {
        finish(new Error(`Failed to demux log stream for ${container} container`, {
          cause: error instanceof Error ? error : new Error(String(error)),
        }));
      }
    });

    // The daemon closes the stream once the backlog is delivered, so `end` is
    // its own completion signal rather than something inferred from silence.
    // Flushing here covers a last line the daemon never terminated.
    raw.on('end', () => {
      if (ttyDecoder) {
        formatter.consume({ stream: 'stdout', payload: ttyDecoder.end() });
      }
      formatter.flush();
      finish();
    });

    raw.on('error', (error: Error) => {
      finish(new Error(`Failed to read log stream for ${container} container`, {
        cause: error,
      }));
    });

    raw.on('close', () => {
      if (ttyDecoder) {
        formatter.consume({ stream: 'stdout', payload: ttyDecoder.end() });
      }
      formatter.flush();
      finish();
    });

    options.sink.onDrain(() => raw.resume());
    // The close is handled above, before the stream was opened, so that a
    // client that goes away mid-open is released too.
  });
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
 * Ensure the selected image exists locally. This avoids registry checks on
 * every start/retry once the image has already been pulled.
 */
async function pullImage(imageName: string): Promise<void> {
  try {
    await docker.getImage(imageName).inspect();
    return;
  } catch {
    // Image not found locally, proceed to pull
  }

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
    const info = await container.inspect({ abortSignal: AbortSignal.timeout(DOCKER_CALL_TIMEOUT_MS) });

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
  } catch (error) {
    if (isMissingContainerError(error)) return null;
    throw normalizeDockerError(error);
  }
}

/**
 * Start the Translator container.
 * - In Docker: uses shared volume (sv2-config) for config
 * - In dev: bind-mounts config file from host filesystem
 *
 * Exported for tests so the container creation options stay asserted.
 */
export async function startTranslator(configPath: string, image: string): Promise<void> {
  await removeContainer(TRANSLATOR_CONTAINER);

  const binds = isRunningInsideDocker()
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
      LogConfig: await miningContainerLogConfig(),
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
 *
 * Exported for tests so the container creation options stay asserted.
 */
export async function startJdc(
  configPath: string,
  bitcoinSocketPath: string,
  network: string,
  image: string
): Promise<void> {
  await removeContainer(JDC_CONTAINER);

  // JDC resolves the socket path from its `network` setting, so the bind mount
  // must target the path JDC actually opens.
  const containerSocketPath = getJdcContainerSocketPath(network);

  const binds = isRunningInsideDocker()
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
      LogConfig: await miningContainerLogConfig(),
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
    console.log(`Using JDC image ${imageSelection.jdc} and Translator image ${imageSelection.translator}`);
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

    const jdcStatus = await getContainerStatus(JDC_CONTAINER);
    if (!jdcStatus || jdcStatus.status === 'stopped') {
      throw new Error('Mining could not start. Review your setup and try again; check the logs if the problem continues.');
    }
  }

  // Start Translator
  await startTranslator(`${configDir}/translator.toml`, imageSelection.translator);
}

/**
 * Recreate only the Translator, leaving a running JDC untouched so it keeps
 * the upstream it failed over to.
 * Config files must already exist in configDir before calling this.
 */
export async function restartTranslator(
  data: SetupData,
  configDir: string
): Promise<void> {
  await ensureDockerAvailable();

  const { translator: image } = getImageSelectionForSetup(data);
  await pullImage(image);
  await startTranslator(`${configDir}/translator.toml`, image);
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
  refreshDockerConnection();
  const [translator, jdc] = await Promise.all([
    getContainerStatus(TRANSLATOR_CONTAINER),
    mode === 'jd' ? getContainerStatus(JDC_CONTAINER) : null,
  ]);

  return { translator, jdc };
}

function pingDocker(): Promise<void> {
  return (docker.ping as (opts: { abortSignal: AbortSignal }) => Promise<void>)({
    abortSignal: AbortSignal.timeout(DOCKER_CALL_TIMEOUT_MS),
  });
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    refreshDockerConnection();
    await pingDocker();
    return true;
  } catch {
    return false;
  }
}

export async function ensureDockerAvailable(): Promise<void> {
  try {
    refreshDockerConnection();
    await pingDocker();
  } catch (error) {
    throw normalizeDockerError(error);
  }
}
