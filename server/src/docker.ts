/**
 * Docker orchestration using Dockerode
 */

import fs from 'fs';
import Docker from 'dockerode';
import os from 'os';
import type { SetupData, ContainerStatus, HealthStatus } from './types.js';

/**
 * Expand ~ to home directory in a path
 */
function expandHomePath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return inputPath.replace('~', os.homedir());
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

export function getDockerConnectionInfo(): DockerConnectionConfig {
  refreshDockerConnection();
  return dockerConnection;
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
 * Ensure the sv2-config volume exists
 */
async function ensureConfigVolume(): Promise<void> {
  try {
    const volume = docker.getVolume(CONFIG_VOLUME);
    await volume.inspect();
  } catch {
    console.log(`Creating volume ${CONFIG_VOLUME}...`);
    await docker.createVolume({ Name: CONFIG_VOLUME });
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
 * Start the Translator container
 * Uses the shared sv2-config volume for config files
 */
async function startTranslator(configFileName: string): Promise<void> {
  await removeContainer(TRANSLATOR_CONTAINER);

  const container = await docker.createContainer({
    Image: TRANSLATOR_IMAGE,
    name: TRANSLATOR_CONTAINER,
    Entrypoint: ['/app/translator_sv2'],
    Cmd: ['-c', `/config/${configFileName}`],
    HostConfig: {
      Binds: [`${CONFIG_VOLUME}:/config:ro`],
      PortBindings: {
        '34255/tcp': [{ HostPort: '34255' }],
        '9092/tcp': [{ HostPort: '9092' }],
      },
      NetworkMode: NETWORK_NAME,
      RestartPolicy: { Name: 'unless-stopped' },
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
 * Start the JDC container
 * Uses the shared sv2-config volume for config files
 */
async function startJdc(
  configFileName: string,
  bitcoinSocketPath: string
): Promise<void> {
  await removeContainer(JDC_CONTAINER);

  const container = await docker.createContainer({
    Image: JDC_IMAGE,
    name: JDC_CONTAINER,
    Entrypoint: ['/app/jd_client_sv2'],
    Cmd: ['-c', `/config/${configFileName}`],
    HostConfig: {
      Binds: [
        `${CONFIG_VOLUME}:/config:ro`,
        `${bitcoinSocketPath}:/root/.bitcoin/node.sock:ro`,
      ],
      PortBindings: {
        '34265/tcp': [{ HostPort: '34265' }],
        '9091/tcp': [{ HostPort: '9091' }],
      },
      NetworkMode: NETWORK_NAME,
      RestartPolicy: { Name: 'unless-stopped' },
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
 * Config files should be written to the sv2-config volume before calling this
 */
export async function startStack(
  data: SetupData,
  _configDir: string
): Promise<void> {
  await ensureDockerAvailable();

  // Ensure network and config volume exist
  await ensureNetwork();
  await ensureConfigVolume();

  // Pull latest images from Docker Hub
  await pullImage(TRANSLATOR_IMAGE);
  if (data.mode === 'jd') {
    await pullImage(JDC_IMAGE);
  }

  // Start JDC first if in JD mode (Translator connects to JDC)
  if (data.mode === 'jd' && data.bitcoin) {
    const socketPath = expandHomePath(data.bitcoin.socket_path);
    await startJdc('jdc.toml', socketPath);
    // Wait for JDC to be ready before starting Translator
    console.log('Waiting for JDC to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Start Translator
  await startTranslator('translator.toml');
}

/**
 * Stop all containers
 */
export async function stopStack(): Promise<void> {
  await ensureDockerAvailable();

  // Stop Translator first (it depends on JDC)
  await removeContainer(TRANSLATOR_CONTAINER);
  await removeContainer(JDC_CONTAINER);
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
