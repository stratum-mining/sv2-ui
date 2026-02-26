import { Router, type Request, type Response } from 'express';
import {
  getContainerStatus,
  networkExists,
} from '../services/docker.service.js';
import { CONTAINER_NAMES, NETWORK_NAME } from '../constants.js';
import type { StatusResponse } from '../types.js';

const router = Router();

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [tproxy, jdClient, netExists] = await Promise.all([
      getContainerStatus(CONTAINER_NAMES.tproxy),
      getContainerStatus(CONTAINER_NAMES.jd_client),
      networkExists(),
    ]);

    const response: StatusResponse = {
      tproxy,
      jd_client: jdClient,
      network: {
        name: NETWORK_NAME,
        exists: netExists,
      },
    };

    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Status check failed:', message);
    res.status(500).json({ error: `Status check failed: ${message}` });
  }
});

export default router;
