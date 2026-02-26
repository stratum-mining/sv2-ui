import Docker from 'dockerode';
import {
  CONTAINER_NAMES,
  IMAGES,
  NETWORK_NAME,
  PORTS,
  CONFIG_FILES,
  DATA_VOLUME_NAME,
} from '../constants.js';
import type { ContainerStatus } from '../types.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

/**
 * Resolve the Docker network to use for sibling containers.
 * When running inside Docker (sv2_ui container), detect the actual network
 * (docker-compose prefixes the name, e.g. "sv2" becomes "sv2-ui_sv2").
 * Falls back to the constant NETWORK_NAME for non-Docker environments.
 */
let resolvedNetworkName: string | null = null;

export async function resolveNetworkName(): Promise<string> {
  if (resolvedNetworkName) return resolvedNetworkName;

  const selfName = process.env.HOSTNAME || 'sv2_ui';
  try {
    const container = docker.getContainer(selfName);
    const info = await container.inspect();
    const networks = Object.keys(info.NetworkSettings.Networks);
    if (networks.length > 0) {
      resolvedNetworkName = networks[0];
      return resolvedNetworkName;
    }
  } catch {
    // Not running in Docker — use the constant
  }

  resolvedNetworkName = NETWORK_NAME;
  return resolvedNetworkName;
}

export async function pullImage(image: string): Promise<void> {
  const stream = await docker.pull(image);
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function ensureNetwork(): Promise<void> {
  const netName = await resolveNetworkName();
  try {
    const network = docker.getNetwork(netName);
    await network.inspect();
  } catch {
    await docker.createNetwork({
      Name: netName,
      Driver: 'bridge',
    });
  }
}

export async function removeExistingContainer(name: string): Promise<void> {
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop();
    }
    await container.remove();
  } catch {
    // Container doesn't exist, nothing to do
  }
}

export async function getContainerStatus(
  name: string
): Promise<ContainerStatus> {
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    return {
      exists: true,
      state: info.State.Running ? 'running' : 'stopped',
      image: info.Config.Image,
      ports: Object.fromEntries(
        Object.entries(info.NetworkSettings.Ports || {})
          .filter(([, bindings]) => bindings && bindings.length > 0)
          .map(([containerPort, bindings]) => [
            containerPort,
            parseInt(bindings![0].HostPort, 10),
          ])
      ),
    };
  } catch {
    return { exists: false, state: 'not_found' };
  }
}

export async function networkExists(): Promise<boolean> {
  const netName = await resolveNetworkName();
  try {
    const network = docker.getNetwork(netName);
    await network.inspect();
    return true;
  } catch {
    return false;
  }
}

export async function createTproxyContainer(
  jdMode: boolean
): Promise<void> {
  await removeExistingContainer(CONTAINER_NAMES.tproxy);

  const configFile = CONFIG_FILES.tproxy;
  const netName = await resolveNetworkName();

  await docker.createContainer({
    name: CONTAINER_NAMES.tproxy,
    Image: IMAGES.tproxy,
    Entrypoint: ['sh', '-c', `cp /data/configs/${configFile} /app/${configFile} && /app/translator_sv2 -c ${configFile}`],
    ExposedPorts: {
      [`${PORTS.tproxy.downstream}/tcp`]: {},
      [`${PORTS.tproxy.monitoring}/tcp`]: {},
    },
    HostConfig: {
      Binds: [`${DATA_VOLUME_NAME}:/data:ro`],
      PortBindings: {
        [`${PORTS.tproxy.downstream}/tcp`]: [
          { HostPort: String(PORTS.tproxy.downstream) },
        ],
        [`${PORTS.tproxy.monitoring}/tcp`]: [
          { HostPort: String(PORTS.tproxy.monitoring) },
        ],
      },
      NetworkMode: netName,
      RestartPolicy: { Name: 'unless-stopped' },
    },
  });
}

export async function createJdClientContainer(
  socketPath?: string,
  ipcVolumeName?: string
): Promise<void> {
  await removeExistingContainer(CONTAINER_NAMES.jd_client);

  const configFile = CONFIG_FILES.jd_client;
  const netName = await resolveNetworkName();
  const binds = [`${DATA_VOLUME_NAME}:/data:ro`];
  if (ipcVolumeName || socketPath) {
    // Detect the network from the JDC config so we mount at the path
    // where JDC expects the socket (e.g. /root/.bitcoin/regtest/node.sock)
    let ipcMountTarget = '/root/.bitcoin';
    try {
      const configPath = `${process.env.CONFIG_DIR || '/data/configs'}/${configFile}`;
      const fs = await import('fs');
      const configContent = fs.readFileSync(configPath, 'utf8');
      const networkMatch = configContent.match(/network\s*=\s*"(\w+)"/);
      if (networkMatch && networkMatch[1] !== 'mainnet') {
        ipcMountTarget = `/root/.bitcoin/${networkMatch[1]}`;
      }
    } catch { /* fallback to default */ }

    if (ipcVolumeName) {
      binds.push(`${ipcVolumeName}:${ipcMountTarget}`);
    } else if (socketPath) {
      // Bind-mount the host socket file to the exact path JDC will look for it
      binds.push(`${socketPath}:${ipcMountTarget}/node.sock`);
    }
  }

  await docker.createContainer({
    name: CONTAINER_NAMES.jd_client,
    Image: IMAGES.jd_client,
    Entrypoint: ['sh', '-c', `cp /data/configs/${configFile} /app/${configFile} && /app/jd_client_sv2 -c ${configFile}`],
    ExposedPorts: {
      [`${PORTS.jd_client.listening}/tcp`]: {},
      [`${PORTS.jd_client.monitoring}/tcp`]: {},
    },
    HostConfig: {
      Binds: binds,
      PortBindings: {
        [`${PORTS.jd_client.listening}/tcp`]: [
          { HostPort: String(PORTS.jd_client.listening) },
        ],
        [`${PORTS.jd_client.monitoring}/tcp`]: [
          { HostPort: String(PORTS.jd_client.monitoring) },
        ],
      },
      NetworkMode: netName,
      RestartPolicy: { Name: 'unless-stopped' },
    },
  });
}

export async function startContainer(name: string): Promise<void> {
  const container = docker.getContainer(name);
  await container.start();
}

export async function stopContainer(name: string): Promise<void> {
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop();
    }
  } catch {
    // Container doesn't exist
  }
}

export async function restartContainer(name: string): Promise<void> {
  try {
    const container = docker.getContainer(name);
    await container.restart();
  } catch {
    // Container doesn't exist
  }
}
