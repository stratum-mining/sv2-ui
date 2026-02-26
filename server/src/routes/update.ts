import { Router, type Request, type Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import Docker from 'dockerode';
import {
  createTproxyContainer,
  createJdClientContainer,
  startContainer,
  getContainerStatus,
} from '../services/docker.service.js';
import {
  isBitcoinRunning,
  getIpcVolumeName,
} from '../services/bitcoin-docker.service.js';
import { IMAGES, CONTAINER_NAMES, CONFIG_DIR } from '../constants.js';

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
    } else {
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
