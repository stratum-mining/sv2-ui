import { Router, type Request, type Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { CONFIG_DIR } from '../constants.js';

const router = Router();

// Wizard data is saved alongside configs in the parent data directory
const WIZARD_DATA_PATH = path.join(path.dirname(CONFIG_DIR), 'wizard-data.json');

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const raw = await fs.readFile(WIZARD_DATA_PATH, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'No saved wizard data' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to read wizard data:', message);
    res.status(500).json({ error: `Failed to read wizard data: ${message}` });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body;
    await fs.mkdir(path.dirname(WIZARD_DATA_PATH), { recursive: true });
    await fs.writeFile(WIZARD_DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ status: 'ok' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to save wizard data:', message);
    res.status(500).json({ error: `Failed to save wizard data: ${message}` });
  }
});

export default router;
