import { Router, type Request, type Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import Docker from 'dockerode';
import {
  createTproxyContainer,
  createJdClientContainer,
  startContainer,
  getContainerStatus,
  getContainerIp,
  removeExistingContainer,
} from '../services/docker.service.js';
import {
  isBitcoinRunning,
  getIpcVolumeName,
} from '../services/bitcoin-docker.service.js';
import { IMAGES, CONTAINER_NAMES, CONFIG_DIR, CONFIG_FILES } from '../constants.js';

const router = Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const WIZARD_DATA_PATH = path.join(path.dirname(CONFIG_DIR), 'wizard-data.json');

const UPDATABLE = {
  tproxy:    { image: IMAGES.tproxy,     name: CONTAINER_NAMES.tproxy },
  jd_client: { image: IMAGES.jd_client,  name: CONTAINER_NAMES.jd_client },
} as const;

/**
 * GET /api/update?container=tproxy|jd_client
 *
 * Server-Sent Events stream:
 *   data: {"type":"progress","message":"..."}
 *   data: {"type":"done","ok":true}
 *   data: {"type":"done","ok":false,"error":"..."}
 *
 * Pulls the latest image tag, then recreates and starts the container
 * using the configuration from the last wizard run.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const key = req.query['container'] as string;

  if (!key || !(key in UPDATABLE)) {
    res.status(400).json({ error: `Invalid container. Valid: ${Object.keys(UPDATABLE).join(', ')}` });
    return;
  }

  const { image, name } = UPDATABLE[key as keyof typeof UPDATABLE];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type: string, data: object = {}) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    // 1. Pull latest image, streaming layer progress
    send('progress', { message: `Pulling ${image} …` });

    const stream = await docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(
        stream,
        (err: Error | null) => { if (err) reject(err); else resolve(); },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (event: any) => {
          if (event.status) {
            const detail = event.progress ? ` ${event.progress}` : '';
            const id = event.id ? ` [${event.id}]` : '';
            send('progress', { message: `${event.status}${id}${detail}` });
          }
        }
      );
    });

    send('progress', { message: 'Pull complete. Recreating container …' });

    // 2. Load wizard data to reconstruct the container with the same config
    let wizardData: Record<string, unknown> = {};
    try {
      const raw = await fs.readFile(WIZARD_DATA_PATH, 'utf-8');
      wizardData = JSON.parse(raw);
    } catch { /* use safe defaults */ }

    const jdMode = wizardData.constructTemplates === true;

    // 3. Stop old container, create new one with updated image, start it
    if (key === 'jd_client') {
      let ipcVolumeName: string | undefined;
      const network = wizardData.selectedNetwork as string | undefined;
      if (network) {
        try {
          if (await isBitcoinRunning(network as Parameters<typeof isBitcoinRunning>[0])) {
            ipcVolumeName = getIpcVolumeName(network as Parameters<typeof getIpcVolumeName>[0]);
          }
        } catch { /* integrated Bitcoin not running */ }
      }
      await createJdClientContainer(wizardData.socketPath as string | undefined, ipcVolumeName);
      await startContainer(CONTAINER_NAMES.jd_client);

      // JDC may have a new IP — update the translator config so tProxy can reconnect.
      const jdcIp = await getContainerIp(CONTAINER_NAMES.jd_client);
      if (jdcIp) {
        const tproxyConfigPath = path.join(CONFIG_DIR, CONFIG_FILES.tproxy);
        try {
          const toml = await fs.readFile(tproxyConfigPath, 'utf-8');
          // Replace any IP-like address or the hostname in the upstream address field
          const patched = toml.replace(
            /(upstream_address\s*=\s*")[^"]+(")/,
            `$1${jdcIp}$2`,
          );
          if (patched !== toml) {
            await fs.writeFile(tproxyConfigPath, patched, 'utf-8');
            send('progress', { message: 'Updated translator config with new JDC address. Restarting tProxy …' });
            // Restart tProxy so it picks up the new config
            try {
              await removeExistingContainer(CONTAINER_NAMES.tproxy);
              await createTproxyContainer(true);
              await startContainer(CONTAINER_NAMES.tproxy);
            } catch { /* tProxy may not be running */ }
          }
        } catch { /* config not found or not in JD mode */ }
      }
    } else {
      // When in JD mode, ensure the translator config has JDC's current IP
      // (the Rust binary only accepts IPs, not Docker hostnames).
      if (jdMode) {
        const jdcIp = await getContainerIp(CONTAINER_NAMES.jd_client);
        if (jdcIp) {
          const tproxyConfigPath = path.join(CONFIG_DIR, CONFIG_FILES.tproxy);
          try {
            const toml = await fs.readFile(tproxyConfigPath, 'utf-8');
            const patched = toml.replace(
              new RegExp(`"${CONTAINER_NAMES.jd_client}"`, 'g'),
              `"${jdcIp}"`,
            );
            await fs.writeFile(tproxyConfigPath, patched, 'utf-8');
          } catch { /* config already has an IP */ }
        }
      }
      await createTproxyContainer(jdMode);
      await startContainer(CONTAINER_NAMES.tproxy);
    }

    const status = await getContainerStatus(name);
    send('done', { ok: true, image, state: status.state });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Update failed for ${key}:`, message);
    send('done', { ok: false, error: message });
  }

  res.end();
});

export default router;
