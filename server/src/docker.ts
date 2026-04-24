/**
 * Docker orchestration using Dockerode
 */

import fs from 'fs';
import Docker from 'dockerode';
import os from 'os';
import type { SetupData, ContainerStatus, HealthStatus } from './types.js';
import type { ContainerLogLine, LogContainerRole, LogOutputStream } from './logs/types.js';

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
const TRANSLATOR_IMAGE = 'stratumv2/translator_sv2:main';
const JDC_IMAGE = 'stratumv2/jd_client_sv2:main';
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
async function startTranslator(configPath: string): Promise<void> {
  await removeContainer(TRANSLATOR_CONTAINER);

  const binds = isRunningInDocker
    ? [`${CONFIG_VOLUME}:/config:ro`]
    : [`${configPath}:/config/translator.toml:ro`];

  const container = await docker.createContainer({
    Image: TRANSLATOR_IMAGE,
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
  network: string
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
    Image: JDC_IMAGE,
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

  // Pull latest images from Docker Hub
  await pullImage(TRANSLATOR_IMAGE);
  if (data.mode === 'jd') {
    await pullImage(JDC_IMAGE);
  }

  // Start JDC first if in JD mode (Translator connects to JDC)
  if (data.mode === 'jd' && data.bitcoin) {
    const socketPath = expandHomePath(data.bitcoin.socket_path);
    await startJdc(`${configDir}/jdc.toml`, socketPath, data.bitcoin.network);
    console.log('Waiting for JDC to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Start Translator
  await startTranslator(`${configDir}/translator.toml`);
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
