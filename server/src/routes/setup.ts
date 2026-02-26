import { Router, type Request, type Response } from 'express';
import { generateConfigs } from '../services/config.service.js';
import {
  pullImage,
  ensureNetwork,
  createTproxyContainer,
  createJdClientContainer,
  startContainer,
  getContainerStatus,
} from '../services/docker.service.js';
import {
  isBitcoinRunning,
  getIpcVolumeName,
} from '../services/bitcoin-docker.service.js';
import { IMAGES, CONTAINER_NAMES } from '../constants.js';
import type { SetupRequest, SetupResponse } from '../types.js';

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body as SetupRequest;

    if (!data.userIdentity || !data.selectedPool || !data.selectedNetwork) {
      res
        .status(400)
        .json({ error: 'Missing required fields: userIdentity, selectedPool, selectedNetwork' });
      return;
    }

    const jdMode = data.constructTemplates;
    const skipTproxy = data.skipTproxy === true;

    // 1. Generate TOML configs
    await generateConfigs(data);

    // 2. Ensure Docker network exists
    await ensureNetwork();

    // 3. Pull images
    if (!skipTproxy) {
      await pullImage(IMAGES.tproxy);
    }
    if (jdMode) {
      await pullImage(IMAGES.jd_client);
    }

    // 4. Create and start containers
    if (jdMode) {
      // Check if integrated Bitcoin Core is running → use shared IPC volume
      let ipcVolumeName: string | undefined;
      const network = data.selectedNetwork;
      if (await isBitcoinRunning(network)) {
        ipcVolumeName = getIpcVolumeName(network);
      }

      // Start jd_client first, then tproxy
      await createJdClientContainer(data.socketPath, ipcVolumeName);
      await startContainer(CONTAINER_NAMES.jd_client);
    }

    if (!skipTproxy) {
      await createTproxyContainer(jdMode);
      await startContainer(CONTAINER_NAMES.tproxy);
    }

    // 5. Get final status
    const response: SetupResponse = {
      status: 'ok',
      mode: jdMode ? 'jd' : 'tproxy-only',
      containers: {},
    };

    if (!skipTproxy) {
      response.containers.tproxy = await getContainerStatus(CONTAINER_NAMES.tproxy);
    }

    if (jdMode) {
      response.containers.jd_client = await getContainerStatus(
        CONTAINER_NAMES.jd_client
      );
    }

    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Setup failed:', message);
    res.status(500).json({ error: `Setup failed: ${message}` });
  }
});

export default router;
