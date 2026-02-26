import { Router, type Request, type Response } from 'express';
import {
  stopContainer,
  restartContainer,
} from '../services/docker.service.js';
import { CONTAINER_NAMES } from '../constants.js';
import type { ControlRequest } from '../types.js';

const router = Router();

const ALL_CONTAINERS = [CONTAINER_NAMES.tproxy, CONTAINER_NAMES.jd_client];

function resolveContainers(body: ControlRequest): string[] {
  if (body.containers && body.containers.length > 0) {
    return body.containers.map((c) => CONTAINER_NAMES[c]);
  }
  return ALL_CONTAINERS;
}

async function runContainerAction(
  action: 'stop' | 'restart',
  containers: string[],
  res: Response,
): Promise<void> {
  try {
    const fn = action === 'stop' ? stopContainer : restartContainer;
    await Promise.all(containers.map(fn));
    const key = action === 'stop' ? 'stopped' : 'restarted';
    res.json({ status: 'ok', [key]: containers });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const label = action === 'stop' ? 'Stop' : 'Restart';
    console.error(`${label} failed:`, message);
    res.status(500).json({ error: `${label} failed: ${message}` });
  }
}

router.post('/stop', async (req: Request, res: Response): Promise<void> => {
  await runContainerAction('stop', resolveContainers(req.body as ControlRequest), res);
});

router.post('/restart', async (req: Request, res: Response): Promise<void> => {
  await runContainerAction('restart', resolveContainers(req.body as ControlRequest), res);
});

export default router;
