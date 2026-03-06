/**
 * Docker orchestration using Dockerode
 */

import Docker from 'dockerode';
import os from 'os';
import type { SetupData, ContainerStatus, HealthStatus } from './types.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Expand ~ to home directory in a path
 */
function expandHomePath(inputPath: string): string {
  if (inputPath.startsWith('~')) {
    return inputPath.replace('~', os.homedir());
  }
  return inputPath;
}

const NETWORK_NAME = 'sv2-network';
const TRANSLATOR_CONTAINER = 'sv2-translator';
const JDC_CONTAINER = 'sv2-jdc';
const TRANSLATOR_IMAGE = 'stratumv2/translator_sv2:main';
const JDC_IMAGE = 'stratumv2/jd_client_sv2:main';

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
 */
async function startTranslator(configPath: string): Promise<void> {
  await removeContainer(TRANSLATOR_CONTAINER);

  const container = await docker.createContainer({
    Image: TRANSLATOR_IMAGE,
    name: TRANSLATOR_CONTAINER,
    Cmd: ['-c', '/app/translator-config.toml'],
    HostConfig: {
      Binds: [`${configPath}:/app/translator-config.toml:ro`],
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
 */
async function startJdc(
  configPath: string,
  bitcoinSocketPath: string
): Promise<void> {
  await removeContainer(JDC_CONTAINER);

  const container = await docker.createContainer({
    Image: JDC_IMAGE,
    name: JDC_CONTAINER,
    Cmd: ['-c', '/app/jdc-config.toml'],
    HostConfig: {
      Binds: [
        `${configPath}:/app/jdc-config.toml:ro`,
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
 */
export async function startStack(
  data: SetupData,
  configDir: string
): Promise<void> {
  // Ensure network exists
  await ensureNetwork();

  // Pull latest images from Docker Hub
  await pullImage(TRANSLATOR_IMAGE);
  if (data.mode === 'jd') {
    await pullImage(JDC_IMAGE);
  }

  // Start JDC first if in JD mode (Translator connects to JDC)
  if (data.mode === 'jd' && data.bitcoin) {
    const socketPath = expandHomePath(data.bitcoin.socket_path);
    await startJdc(`${configDir}/jdc.toml`, socketPath);
    // Wait for JDC to be ready before starting Translator
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
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}
