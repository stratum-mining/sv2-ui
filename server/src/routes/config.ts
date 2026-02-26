import { Router, type Request, type Response } from 'express';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseTOML, stringify as stringifyTOML } from 'smol-toml';
import { CONFIG_DIR, CONFIG_FILES } from '../constants.js';

const router = Router();

const SERVICE_MAP: Record<string, string> = {
  jdc: CONFIG_FILES.jd_client,
  tproxy: CONFIG_FILES.tproxy,
};

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const service = req.query['service'] as string;
  const format = req.query['format'] as string | undefined;
  const filename = SERVICE_MAP[service];
  if (!filename) {
    res.status(400).json({ error: 'Invalid service. Use jdc or tproxy.' });
    return;
  }

  try {
    const raw = await readFile(path.join(CONFIG_DIR, filename), 'utf-8');
    if (format === 'json') {
      try {
        const data = parseTOML(raw);
        res.json({ data });
      } catch (parseErr) {
        const message = parseErr instanceof Error ? parseErr.message : 'Unknown parse error';
        res.status(422).json({ error: `Failed to parse config: ${message}` });
      }
    } else {
      res.json({ content: raw });
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' && format === 'json') {
      res.json({ data: null });
      return;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(404).json({ error: `Config file not found: ${message}` });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const service = req.query['service'] as string;
  const format = req.query['format'] as string | undefined;
  const filename = SERVICE_MAP[service];
  if (!filename) {
    res.status(400).json({ error: 'Invalid service. Use jdc or tproxy.' });
    return;
  }

  try {
    await mkdir(CONFIG_DIR, { recursive: true });

    if (format === 'json') {
      const { data } = req.body as { data?: Record<string, unknown> };
      if (!data || typeof data !== 'object') {
        res.status(400).json({ error: 'Missing data object in request body.' });
        return;
      }
      const toml = stringifyTOML(data);
      await writeFile(path.join(CONFIG_DIR, filename), toml, 'utf-8');
    } else {
      const { content } = req.body as { content?: string };
      if (typeof content !== 'string') {
        res.status(400).json({ error: 'Missing content in request body.' });
        return;
      }
      await writeFile(path.join(CONFIG_DIR, filename), content, 'utf-8');
    }

    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Failed to write config: ${message}` });
  }
});

export default router;
